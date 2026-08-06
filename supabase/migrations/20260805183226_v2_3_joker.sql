-- Temporisation systématique, fin de partie jouée, et marge de tirage pour le joker.
--
-- Avant : un sursis de 3 s en dur ne s'appliquait qu'après une adjudication
-- (migration `v1_3_reveal_grace`), et la fin de partie en solo était expédiée en
-- un lot d'enchères insérées directement en `sold` — invisible à l'écran.
--
-- Après : chaque carte est précédée d'une pause égale au délai d'adjudication de
-- la partie, première carte comprise. C'est ce qui rend la partie lisible, et
-- c'est la fenêtre dans laquelle le joker (tâche suivante) peut défausser.

-- 1. La pause remplace le sursis : plus de paramètre, plus de cas particulier.
drop function open_next_auction(uuid, boolean);

create function open_next_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  next_seq int;
  next_card int;
  prev_seat int;
  n_players int;
  fb players%rowtype;
  pause interval;
begin
  select * into g from games where id = g_id for update;
  -- une seule source de vérité pour la durée : le réglage de la partie. Le front
  -- la déduit de `opened_at`, il n'a rien à recalculer.
  pause := make_interval(secs => g.close_delay_seconds);
  select coalesce(max(seq), 0) + 1 into next_seq from auctions where game_id = g_id;
  select card_id into next_card from game_cards where game_id = g_id and seq = next_seq;
  if next_card is null then raise exception 'NO_MORE_CARDS'; end if;

  select count(*) into n_players from players where game_id = g_id;
  -- seat du dernier forced_bidder ; -1 s'il n'y a pas encore eu d'enchère → seat 0 commence
  select coalesce((
    select p.seat from players p
    join auctions a on a.forced_bidder = p.id
    where a.game_id = g_id
    order by a.seq desc limit 1
  ), -1) into prev_seat;

  -- prochain siège éligible dans l'ordre cyclique, decks pleins sautés
  select p.* into fb from players p
  where p.game_id = g_id and deck_count(p.id) < g.deck_size
  order by mod(p.seat - prev_seat - 1 + n_players, n_players)
  limit 1;
  if fb.id is null then raise exception 'NO_ELIGIBLE_BIDDER'; end if;

  insert into auctions (game_id, card_id, seq, current_bid, current_bidder, forced_bidder,
                        opened_at, last_bid_at)
  values (g_id, next_card, next_seq, g.min_bid, fb.id, fb.id,
          now() + pause, now() + pause);
end $$;

revoke execute on function open_next_auction(uuid) from public, anon, authenticated;

-- 2. close_auction : plus d'auto-complétion. Le dernier joueur incomplet ouvre les
-- cartes restantes comme n'importe quelle autre, faute de challenger elles
-- s'adjugent dès la fin de leur temporisation — et il garde la main sur son joker.
create or replace function close_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  a auctions%rowtype;
  incomplete int;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then return; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;
  if not found then return; end if;

  -- temporisation en cours : la carte n'est pas encore à l'écran
  if now() < a.opened_at then return; end if;

  -- on n'attend le délai QUE s'il reste un challenger
  if has_challenger(a.id)
     and now() < a.last_bid_at + make_interval(secs => g.close_delay_seconds)
     and now() < a.opened_at + make_interval(secs => g.max_auction_seconds) then
    return;
  end if;

  update auctions set status = 'sold' where id = a.id;
  update players set bankroll = bankroll - a.current_bid where id = a.current_bidder;
  insert into player_cards (game_id, player_id, card_id, price_paid)
  values (g_id, a.current_bidder, a.card_id, a.current_bid);

  select count(*) into incomplete from players p
  where p.game_id = g_id and deck_count(p.id) < g.deck_size;

  if incomplete = 0 then
    update games set status = 'finished' where id = g_id;
  else
    perform open_next_auction(g_id);
  end if;
end $$;

-- 3. start_game : le tirage doit prévoir une défausse par joueur, sinon
-- open_next_auction lèverait NO_MORE_CARDS en pleine partie.
--
-- Base reprise de `pack_authoring_rules` (20260802022546), qui fait autorité sur
-- start_game depuis — pas de la version antérieure à cette migration : elle a
-- perdu en route le garde-fou PACK_DELETED et le filtre `not retired`, que
-- `create_game` ci-dessous doit garder lui aussi.
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
  -- le tirage est sans remise, et chaque joueur peut faire disparaître une carte
  -- avec son joker : d'où la marge de n_players sur le besoin brut
  if n_players * (g.deck_size + 1)
     > (select count(*) from cards where pack = g.pack and not retired) then
    raise exception 'NOT_ENOUGH_CARDS';
  end if;

  insert into game_cards (game_id, card_id, seq)
  select g_id, id, row_number() over (order by random())
  from cards where pack = g.pack and not retired;

  update games set status = 'playing' where id = g_id;
  perform open_next_auction(g_id);
end $$;

-- 4. create_game : même marge que start_game. Les réglages d'une publique sont
-- figés à la création, donc son garde-fou doit compter les défausses lui aussi —
-- sinon on recrée une publique acceptée ici et refusée au démarrage.
--
-- Base reprise de `revue_finale_packs` (20260802095447), qui fait autorité sur
-- create_game depuis (distinction UNKNOWN_PACK/PACK_DELETED/PACK_NOT_OWNED_BY_HOST,
-- filtre `not retired`) — pas de la version antérieure : la recopier aurait
-- réintroduit en silence le tiers pouvant distinguer un pack privé d'autrui
-- d'un slug inconnu, exactement le piège que `revue_finale_packs` corrigeait.
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
  -- même défaut que `game.closeDelaySeconds` de config.json et que la colonne :
  -- un défaut sous le plancher rendrait INVALID_SETTINGS systématique pour tout
  -- appelant qui ne précise rien (c'est le cas de presque tous les tests pgTAP).
  v_delay int := coalesce(p_close_delay_seconds, 8);
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
     or v_delay not between 6 and 60
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
     and v_players * (v_deck + 1) > (select count(*) from cards where pack = v_pack and not retired) then
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

-- 5. Le joker : un veto par joueur et par partie. Il défausse la carte — personne
-- ne l'achète — et n'est jouable que par l'ouvreur forcé, pendant la
-- temporisation. Passé ce délai l'ouverture est jouée et la carte est en jeu.
alter table players add column joker_used boolean not null default false;

-- Une enchère peut désormais mourir sans vendre. Tout le reste du SQL filtre sur
-- `status = 'open'`, donc has_challenger et close_auction ignorent une défausse
-- sans un mot de code ; open_next_auction compte max(seq) + 1 sur toutes les
-- enchères, donc la carte défaussée est consommée sans remise.
alter table auctions drop constraint auctions_status_check;
alter table auctions add constraint auctions_status_check
  check (status in ('open', 'sold', 'discarded'));

create function use_joker(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  a auctions%rowtype;
  me players%rowtype;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;                        -- sérialise veto, mises et clôtures concurrentes
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

  -- la fenêtre est la temporisation, exactement l'inverse du garde-fou
  -- AUCTION_NOT_STARTED de place_bid : on ne vetoe que ce qui n'a pas commencé
  if now() >= a.opened_at then raise exception 'JOKER_TOO_LATE'; end if;
  if a.forced_bidder <> me.id then raise exception 'NOT_FORCED_BIDDER'; end if;
  if me.joker_used then raise exception 'JOKER_ALREADY_USED'; end if;

  update players set joker_used = true where id = me.id;
  update auctions set status = 'discarded' where id = a.id;
  -- la rotation avance : open_next_auction lit le forced_bidder de la dernière
  -- enchère, défaussée comprise, donc le voisin ouvre la carte suivante. Pas
  -- d'appel à close_auction : il n'y a plus rien à clôturer.
  perform open_next_auction(g_id);
end $$;

-- 6. Le plancher de la temporisation vit en SQL, pas dans config.json : la pause
-- doit couvrir la séquence d'adjudication animée du client ET laisser à l'ouvreur
-- de quoi décider de son joker. La séquence animée dure 3 000 ms (`SEQUENCE_MS`,
-- src/lib/auctionPhase.ts) et se déroule PENDANT la temporisation : à 3 s de
-- plancher il ne restait rien à l'humain pour vetoer, alors que les bots — qui
-- n'animent rien — gardaient leur fenêtre entière. D'où 6 s : 3 000 ms d'animation,
-- puis 3 000 ms pour décider (`ui.auction.minJokerWindowMs`, verrouillé par un test).
--
-- `add constraint ... check` VALIDE les lignes déjà en table : l'ancienne borne
-- descendait à 1 s et le curseur du salon l'exposait, donc une seule partie créée
-- sous le nouveau plancher ferait échouer `supabase db push` en prod — après le
-- merge, et invisible en CI qui part d'une base vide. On met donc les lignes en
-- conformité AVANT de poser la contrainte. Les parties sont éphémères (purge à
-- 24 h) : au pire une partie en cours voit sa temporisation s'allonger.
update games set close_delay_seconds = 6 where close_delay_seconds < 6;

alter table games drop constraint games_close_delay_seconds_check;
alter table games add constraint games_close_delay_seconds_check
  check (close_delay_seconds between 6 and 60);
-- Le défaut de la colonne valait 3 s, sous le nouveau plancher : toute insertion
-- qui ne précise rien aurait violé la contrainte. Il s'aligne sur le défaut du
-- front (`game.closeDelaySeconds` de config.json), qui vaut 8 s depuis longtemps —
-- la divergence 3-contre-8 a déjà induit deux erreurs sur ce chantier.
alter table games alter column close_delay_seconds set default 8;

-- update_game_settings : même plancher que create_game. Un hôte pourrait sinon
-- ramener sa partie à 1 s depuis le salon, après coup.
--
-- Base reprise de `revue_finale_packs` (20260802095447), qui fait autorité sur
-- update_game_settings depuis.
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
     or v_delay not between 6 and 60
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
