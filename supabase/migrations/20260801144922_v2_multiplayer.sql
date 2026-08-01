-- V2 : parties de 2 à 8 joueurs.
--
-- La boucle d'enchère est déjà générique en N joueurs (rotation modulaire dans
-- open_next_auction, passed[], has_challenger, auto-complétion) : elle n'est pas
-- touchée. Seuls les verrous « exactement 2 » et la capacité changent ici.

alter table games add column max_players int not null default 2
  check (max_players between 2 and 8);

-- create_game : + p_max_players. L'ancienne signature disparaît — une surcharge
-- serait ambiguë pour PostgREST.
drop function create_game(text, int, int, int, int, int, text);

create function create_game(
  nickname text,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null,
  p_visibility text default 'private',
  p_max_players int default null
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
  -- Les réglages d'une publique sont figés après création : une capacité que le
  -- pack ne peut pas servir enfermerait l'hôte dans une partie indémarrable.
  -- Sur une privée le même excès reste rattrapable par les réglages, et c'est
  -- start_game qui tranche sur l'effectif réel.
  if v_vis = 'public' and v_deck * v_players > (select count(*) from cards) then
    raise exception 'NOT_ENOUGH_CARDS';
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid,
                         close_delay_seconds, max_auction_seconds, visibility, max_players)
      values (new_code, v_deck, v_bank, v_min, v_delay, v_cap, v_vis, v_players)
      returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, v_nick, 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;

-- update_game_settings : + p_max_players, jamais sous l'effectif présent
drop function update_game_settings(uuid, int, int, int, int, int);

create function update_game_settings(
  g_id uuid,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null,
  p_max_players int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
  v_deck int; v_bank int; v_min int; v_delay int; v_cap int; v_players int;
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
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300
     or v_players not between 2 and 8 then
    raise exception 'INVALID_SETTINGS';
  end if;
  -- personne n'est éjecté par un réglage : on refuse plutôt que de faire de la place
  if v_players < (select count(*) from players where game_id = g_id) then
    raise exception 'MAX_PLAYERS_TOO_LOW';
  end if;
  update games
  set deck_size = v_deck, start_bankroll = v_bank, min_bid = v_min,
      close_delay_seconds = v_delay, max_auction_seconds = v_cap,
      max_players = v_players
  where id = g_id;
  -- en lobby personne n'a dépensé : on resynchronise
  update players set bankroll = v_bank where game_id = g_id;
end $$;

-- join_game / join_game_by_id : plein à max_players, siège = premier libre
create or replace function join_game(game_code text, nickname text, p_is_bot boolean default false)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  v_nick text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_nick := effective_nickname(uid, nickname);
  if coalesce(v_nick, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  select * into g from games where code = upper(game_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if exists (select 1 from players where game_id = g.id and auth_uid = uid) then
    return json_build_object('game_id', g.id);  -- déjà dans la partie
  end if;
  if g.status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if (select count(*) from players where game_id = g.id) >= g.max_players then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot)
  values (g.id, uid, v_nick,
          (select coalesce(max(seat), -1) + 1 from players where game_id = g.id),
          g.start_bankroll, coalesce(p_is_bot, false));
  return json_build_object('game_id', g.id);
end $$;

create or replace function join_game_by_id(g_id uuid, nickname text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  v_nick text;
  is_rematch_guest boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_nick := effective_nickname(uid, nickname);
  if coalesce(v_nick, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  select * into g from games where id = g_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if exists (select 1 from players where game_id = g.id and auth_uid = uid) then
    return json_build_object('game_id', g.id);  -- déjà dedans (idempotent)
  end if;
  select exists (
    select 1 from games old
    join players p on p.game_id = old.id and p.auth_uid = uid
    where old.next_game_id = g.id
  ) into is_rematch_guest;
  if g.visibility <> 'public' and not is_rematch_guest then
    raise exception 'GAME_NOT_FOUND';  -- une privée reste indevinable
  end if;
  if g.status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if (select count(*) from players where game_id = g.id) >= g.max_players then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, v_nick,
          (select coalesce(max(seat), -1) + 1 from players where game_id = g.id),
          g.start_bankroll);
  return json_build_object('game_id', g.id);
end $$;

-- start_game : au moins 2 joueurs, et un pack assez grand pour tous les decks
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
  -- le tirage est sans remise : sans ce garde-fou, open_next_auction lèverait
  -- NO_MORE_CARDS en pleine partie, laissant une partie morte
  if g.deck_size * n_players > (select count(*) from cards) then
    raise exception 'NOT_ENOUGH_CARDS';
  end if;

  insert into game_cards (game_id, card_id, seq)
  select g_id, id, row_number() over (order by random()) from cards;

  update games set status = 'playing' where id = g_id;
  perform open_next_auction(g_id);
end $$;

-- le board : capacité exposée, parties pleines masquées
create or replace function list_public_games() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select g.id as game_id,
           (select p.nickname from players p where p.game_id = g.id and p.seat = 0) as host_nickname,
           (select pr.username from players p join profiles pr on pr.id = p.auth_uid
            where p.game_id = g.id and p.seat = 0) as host_username,
           (select count(*)::int from players p where p.game_id = g.id) as player_count,
           g.max_players,
           g.deck_size, g.start_bankroll, g.min_bid, g.close_delay_seconds, g.created_at
    from games g
    where g.visibility = 'public' and g.status = 'lobby'
      and (select count(*) from players p where p.game_id = g.id) < g.max_players
    order by g.created_at desc
    limit 20
  ) t;
$$;

-- la revanche reprend la capacité de la partie précédente
create or replace function rematch_game(old_game_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  old_g games%rowtype;
  me players%rowtype;
  g games%rowtype;
  new_code text;
begin
  select * into old_g from games where id = old_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  select * into me from players where game_id = old_game_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if old_g.status <> 'finished' then raise exception 'GAME_NOT_FINISHED'; end if;
  if old_g.next_game_id is not null then
    return json_build_object('game_id', old_g.next_game_id);  -- idempotent
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid,
                         close_delay_seconds, max_auction_seconds, visibility, max_players)
      values (new_code, old_g.deck_size, old_g.start_bankroll, old_g.min_bid,
              old_g.close_delay_seconds, old_g.max_auction_seconds, 'private', old_g.max_players)
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

-- Exclusion d'un joueur par l'hôte, depuis le salon.
--
-- Les sièges doivent rester contigus (0..n-1) : la rotation de open_next_auction
-- (mod(seat - prev_seat - 1 + n_players, n_players)), l'attribution max(seat) + 1
-- à l'arrivée, playerColor(seat) et la clé (match_id, seat) de l'historique en
-- dépendent tous. On recompacte donc les sièges après un départ — ce qui viole
-- transitoirement l'unicité, vérifiée ligne à ligne : la contrainte devient différable
-- (et la vérification est remise à immediate avant la fin de la fonction, sans
-- fuite du report vers la transaction de l'appelant).
alter table players
  drop constraint players_game_id_seat_key,
  add constraint players_game_id_seat_key unique (game_id, seat) deferrable initially immediate;

create function kick_player(g_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
  cible players%rowtype;
begin
  select * into g from games where id = g_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found or me.seat <> 0 then raise exception 'NOT_HOST'; end if;
  if g.status <> 'lobby' then raise exception 'GAME_NOT_IN_LOBBY'; end if;
  select * into cible from players where game_id = g_id and id = p_player_id;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if cible.id = me.id then raise exception 'CANNOT_KICK_SELF'; end if;

  delete from players where id = cible.id;
  set constraints players_game_id_seat_key deferred;
  update players set seat = seat - 1 where game_id = g_id and seat > cible.seat;
  -- la vérification revient dans la fonction : une recompaction fautive y lève
  -- une erreur attribuable, au lieu d'un 23505 anonyme au commit de l'appelant
  set constraints players_game_id_seat_key immediate;
end $$;
