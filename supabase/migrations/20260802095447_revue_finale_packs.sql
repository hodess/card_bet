-- Revue finale de la branche packs de joueurs : quatre correctifs SQL avant
-- merge. Chacun est un `create or replace` (ou un `revoke`) sur une fonction
-- déjà migrée ; aucun changement de schéma.

-- 1. delete_pack ne retirait jamais les cartes du pack qu'il marque supprimé.
-- purge_retired_cards ne s'intéresse qu'aux cartes `retired`, et seule
-- replace_pack_cards en posait jusqu'ici : un pack supprimé sans jamais être
-- réédité gardait donc ses cartes pour toujours, et purge_retired_cards ne
-- pouvait jamais vider `packs` de sa ligne (elle attend `not exists (select 1
-- from cards where pack = p.slug)`). Avec un quota de 20 packs × 300 cartes
-- par compte, `cards` — du contenu utilisateur désormais — n'avait donc aucune
-- reprise d'espace, et le slug restait réservé à vie.
create or replace function delete_pack(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update packs set deleted_at = now()
  where slug = p_slug and owner_id = uid and deleted_at is null;
  if not found then raise exception 'NOT_PACK_OWNER'; end if;
  -- Même geste que replace_pack_cards : retirer, pas supprimer à chaud. Sans
  -- risque pour une partie en cours, qui garde ses lignes game_cards ; et
  -- start_game lève déjà PACK_DELETED sur un salon dont le pack a disparu.
  update cards set retired = true where pack = p_slug and not retired;
end $$;

-- 2. record_match posait matches.private_pack sur `owner_id is not null and
-- visibility = 'private'`, alors que cards_read cache les cartes sur le seul
-- critère `visibility <> 'public'`. Les deux frontières doivent coïncider :
-- sinon un hypothétique pack officiel privé verrait ses cartes cachées par
-- cards_read mais son historique publié en clair par le snapshot. Le reste du
-- corps est recopié à l'identique depuis pack_authoring_rules.sql.
create or replace function record_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m_id uuid;
begin
  begin
    -- comptes uniquement : sans profil dans la partie, rien à écrire
    if not exists (
      select 1 from players p join profiles pr on pr.id = p.auth_uid
      where p.game_id = new.id
    ) then
      return new;
    end if;

    insert into matches (game_id, deck_size, start_bankroll, private_pack)
    values (new.id, new.deck_size, new.start_bankroll,
            coalesce((select p.visibility <> 'public'
                      from packs p where p.slug = new.pack), false))
    returning id into m_id;

    with scored as (
      select p.id as player_id, p.seat, p.nickname, p.bankroll, p.is_bot,
             pr.id as profile_id,
             coalesce((select sum(c.rating)
                       from player_cards pc join cards c on c.id = pc.card_id
                       where pc.player_id = p.id), 0)::int as score
      from players p
      left join profiles pr on pr.id = p.auth_uid
      where p.game_id = new.id
    ),
    ranked as (
      select *, rank() over (order by score desc, bankroll desc) as rk
      from scored
    )
    insert into match_players (match_id, profile_id, nickname, seat, score,
                               money_left, result, is_bot)
    select m_id, profile_id, nickname, seat, score, bankroll,
           case
             when rk > 1 then 'loss'
             when count(*) over (partition by rk) > 1 then 'draw'
             else 'win'
           end,
           is_bot
    from ranked;

    insert into match_cards (match_id, seat, card_id, price_paid,
                             card_name, card_position, card_rating)
    select m_id, p.seat, pc.card_id, pc.price_paid, c.name, c.position, c.rating
    from player_cards pc
    join players p on p.id = pc.player_id
    join cards c on c.id = pc.card_id
    where pc.game_id = new.id;
  exception when others then
    -- l'historique est un bonus : une fin de partie ne doit jamais casser
    raise warning 'record_match failed for game %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- 3. create_game / update_game_settings distinguaient UNKNOWN_PACK,
-- PACK_DELETED et PACK_NOT_OWNED_BY_HOST sur un même slug, ce qui permet à un
-- tiers de confirmer l'existence du pack privé d'un autre (trois réponses
-- différentes selon que le pack n'existe pas, est supprimé, ou est privé).
-- La spec veut qu'un pack invisible pour l'appelant — le privé d'un autre —
-- soit indistinguable d'un slug inexistant. Le filtre de visibilité ci-dessous
-- reprend exactement celui de packs_read/cards_read : public, ou à moi.
create or replace function create_game(
  nickname text,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null,
  p_visibility text default 'private',
  p_max_players int default null,
  p_pack text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  new_code text;
  v_nick text;
  v_deck int := coalesce(p_deck_size, 3);
  v_bank int := coalesce(p_start_bankroll, 1000);
  v_min int := coalesce(p_min_bid, 10);
  v_delay int := coalesce(p_close_delay_seconds, 3);
  v_cap int := coalesce(p_max_auction_seconds, 60);
  v_vis text := coalesce(p_visibility, 'private');
  v_players int := coalesce(p_max_players, 2);
  v_pack text := coalesce(p_pack, 'football');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_nick := effective_nickname(uid, nickname);
  if coalesce(v_nick, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300
     or v_players not between 2 and 8
     or v_vis not in ('private', 'public') then
    raise exception 'INVALID_SETTINGS';
  end if;
  -- invisible pour moi (inexistant, ou privé d'un autre) : même réponse dans
  -- les deux cas, pour qu'un tiers ne puisse rien en déduire.
  if not exists (select 1 from packs where slug = v_pack
                 and (visibility = 'public' or owner_id = uid)) then
    raise exception 'UNKNOWN_PACK';
  end if;
  -- visible (public, ou à moi) mais supprimé
  if exists (select 1 from packs where slug = v_pack and deleted_at is not null) then
    raise exception 'PACK_DELETED';
  end if;
  -- visible et actif, mais que je n'ai pas le droit d'héberger
  if not may_host_pack(v_pack, uid) then
    raise exception 'PACK_NOT_OWNED_BY_HOST';
  end if;
  -- Les réglages d'une publique sont figés après création : une capacité que le
  -- pack ne peut pas servir enfermerait l'hôte dans une partie indémarrable.
  -- Sur une privée le même excès reste rattrapable par les réglages, et c'est
  -- start_game qui tranche sur l'effectif réel.
  if v_vis = 'public'
     and v_deck * v_players > (select count(*) from cards where pack = v_pack and not retired) then
    raise exception 'NOT_ENOUGH_CARDS';
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid,
                         close_delay_seconds, max_auction_seconds, visibility,
                         max_players, pack)
      values (new_code, v_deck, v_bank, v_min, v_delay, v_cap, v_vis, v_players, v_pack)
      returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, v_nick, 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;

create or replace function update_game_settings(
  g_id uuid,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null,
  p_max_players int default null,
  p_pack text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
  v_deck int; v_bank int; v_min int; v_delay int; v_cap int; v_players int;
  v_pack text;
begin
  select * into g from games where id = g_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found or me.seat <> 0 then raise exception 'NOT_HOST'; end if;
  if g.status <> 'lobby' then raise exception 'GAME_NOT_IN_LOBBY'; end if;
  if g.visibility <> 'private' then raise exception 'SETTINGS_LOCKED'; end if;
  v_deck := coalesce(p_deck_size, g.deck_size);
  v_bank := coalesce(p_start_bankroll, g.start_bankroll);
  v_min := coalesce(p_min_bid, g.min_bid);
  v_delay := coalesce(p_close_delay_seconds, g.close_delay_seconds);
  v_cap := coalesce(p_max_auction_seconds, g.max_auction_seconds);
  v_players := coalesce(p_max_players, g.max_players);
  v_pack := coalesce(p_pack, g.pack);
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300
     or v_players not between 2 and 8 then
    raise exception 'INVALID_SETTINGS';
  end if;
  if not exists (select 1 from packs where slug = v_pack
                 and (visibility = 'public' or owner_id = uid)) then
    raise exception 'UNKNOWN_PACK';
  end if;
  if exists (select 1 from packs where slug = v_pack and deleted_at is not null) then
    raise exception 'PACK_DELETED';
  end if;
  if not may_host_pack(v_pack, uid) then
    raise exception 'PACK_NOT_OWNED_BY_HOST';
  end if;
  -- personne n'est éjecté par un réglage : on refuse plutôt que de faire de la place
  if v_players < (select count(*) from players where game_id = g_id) then
    raise exception 'MAX_PLAYERS_TOO_LOW';
  end if;
  update games
  set deck_size = v_deck, start_bankroll = v_bank, min_bid = v_min,
      close_delay_seconds = v_delay, max_auction_seconds = v_cap,
      max_players = v_players, pack = v_pack
  where id = g_id;
  -- en lobby personne n'a dépensé : on resynchronise
  update players set bankroll = v_bank where game_id = g_id;
end $$;

-- 4. slugify n'a pas d'appelant client non plus (le commentaire au-dessus des
-- trois revoke de pack_authoring_core.sql décrit un inventaire qui l'oubliait) :
-- même verrou que validate_pack_payload / replace_pack_cards /
-- install_official_pack, pour que l'inventaire des fonctions internes sans
-- exposition PostgREST soit complet. Sans conséquence en pratique — slugify
-- est pure et immutable — mais l'omission restait une faute d'inventaire.
revoke execute on function slugify(text) from public, anon, authenticated;
