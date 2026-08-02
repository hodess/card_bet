-- RLS et règles d'hôte. Le point délicat : useGame lit les cartes en direct par
-- embed PostgREST (auctions.select('*, card:cards(*)')), donc la policy de
-- cards s'applique EN PARTIE, pas seulement sur la page des packs. D'où la
-- seconde clause : les invités voient les cartes d'un pack privé le temps de la
-- partie, sans que le pack devienne public.

drop policy cards_read on cards;
create policy cards_read on cards for select to authenticated using (
  exists (select 1 from packs p
          where p.slug = cards.pack and p.deleted_at is null
            and (p.visibility = 'public' or p.owner_id = auth.uid()))
  or exists (select 1 from players pl join games g on g.id = pl.game_id
             where g.pack = cards.pack and pl.auth_uid = auth.uid())
);

drop policy packs_read on packs;
create policy packs_read on packs for select to authenticated using (
  (deleted_at is null and (visibility = 'public' or owner_id = auth.uid()))
  or exists (select 1 from players pl join games g on g.id = pl.game_id
             where g.pack = packs.slug and pl.auth_uid = auth.uid())
);

-- Un pack privé n'est jouable que par son auteur, et seulement en tant qu'hôte.
create function may_host_pack(p_slug text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from packs p
    where p.slug = p_slug and p.deleted_at is null
      and (p.owner_id is null or p.visibility = 'public' or p.owner_id = uid)
  );
$$;

-- Fonction interne : aucun appelant client, donc pas d'exposition PostgREST.
revoke execute on function may_host_pack(text, uuid) from public, anon, authenticated;

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
  -- la clé étrangère rejetterait déjà un slug inconnu ; ce test produit un code
  -- lisible côté client plutôt qu'une violation de contrainte
  if not exists (select 1 from packs where slug = v_pack) then
    raise exception 'UNKNOWN_PACK';
  end if;
  if exists (select 1 from packs where slug = v_pack and deleted_at is not null) then
    raise exception 'PACK_DELETED';
  end if;
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
  if not exists (select 1 from packs where slug = v_pack) then
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

-- start_game : le tirage ignore les cartes retirées, et un pack supprimé entre
-- la création du salon et le démarrage donne un message explicite plutôt qu'un
-- NOT_ENOUGH_CARDS trompeur.
create or replace function start_game(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
  n_players int;
begin
  select * into g from games where id = g_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'lobby' then raise exception 'GAME_NOT_IN_LOBBY'; end if;
  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found or me.seat <> 0 then raise exception 'NOT_HOST'; end if;
  select count(*) into n_players from players where game_id = g_id;
  if n_players < 2 then raise exception 'NOT_ENOUGH_PLAYERS'; end if;
  if not exists (select 1 from packs where slug = g.pack and deleted_at is null) then
    raise exception 'PACK_DELETED';
  end if;
  -- le tirage est sans remise : sans ce garde-fou, open_next_auction lèverait
  -- NO_MORE_CARDS en pleine partie, laissant une partie morte
  if g.deck_size * n_players
     > (select count(*) from cards where pack = g.pack and not retired) then
    raise exception 'NOT_ENOUGH_CARDS';
  end if;

  insert into game_cards (game_id, card_id, seq)
  select g_id, id, row_number() over (order by random())
  from cards where pack = g.pack and not retired;

  update games set status = 'playing' where id = g_id;
  perform open_next_auction(g_id);
end $$;

-- rematch_game : le seul transfert d'hôte du jeu. Si le nouvel hôte n'a pas le
-- droit d'héberger le pack de l'ancienne partie (pack privé d'un autre, ou pack
-- supprimé depuis), la revanche repart sur le pack par défaut plutôt que
-- d'échouer.
create or replace function rematch_game(old_game_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  old_g games%rowtype;
  me players%rowtype;
  g games%rowtype;
  new_code text;
  v_pack text;
begin
  select * into old_g from games where id = old_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  select * into me from players where game_id = old_game_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if old_g.status <> 'finished' then raise exception 'GAME_NOT_FINISHED'; end if;
  if old_g.next_game_id is not null then
    return json_build_object('game_id', old_g.next_game_id);  -- idempotent
  end if;
  v_pack := case when may_host_pack(old_g.pack, uid) then old_g.pack else 'football' end;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid,
                         close_delay_seconds, max_auction_seconds, visibility,
                         max_players, pack)
      values (new_code, old_g.deck_size, old_g.start_bankroll, old_g.min_bid,
              old_g.close_delay_seconds, old_g.max_auction_seconds, 'private',
              old_g.max_players, v_pack)
      returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, effective_nickname(uid, me.nickname), 0, g.start_bankroll);
  update games set next_game_id = g.id where id = old_game_id;
  return json_build_object('game_id', g.id);
end $$;

-- L'historique détaillé (match_cards) n'est réservé aux joueurs du match que
-- pour les parties jouées sur un pack privé ; le résumé reste complet pour les
-- packs officiels et communautaires. Le défaut false couvre les matchs déjà en
-- base, tous antérieurs aux packs privés.
alter table matches add column private_pack boolean not null default false;

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
            coalesce((select p.owner_id is not null and p.visibility = 'private'
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

drop policy match_cards_read on match_cards;
-- Le snapshot recopie le contenu des cartes : sur un pack privé, laisser cette
-- table en lecture libre publierait le pack dès la première partie terminée, et
-- pour toujours puisque matches n'est jamais purgé. On s'appuie sur un booléen
-- figé à l'enregistrement, et non sur une jointure vers games : la partie
-- disparaît à 24 h, ce qui rendrait la policy passante après la purge.
create policy match_cards_read on match_cards for select to authenticated using (
  not coalesce((select m.private_pack from matches m where m.id = match_cards.match_id), true)
  or exists (select 1 from match_players mp
             where mp.match_id = match_cards.match_id and mp.profile_id = auth.uid())
);
