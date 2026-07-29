alter table games
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  add column next_game_id uuid references games(id) on delete set null;

-- les parties publiques en attente sont visibles de tous (policies OR-ées avec games_read)
create policy games_public_read on games for select to authenticated
  using (visibility = 'public' and status = 'lobby');

-- create_game gagne p_visibility ; l'ancienne signature disparaît
drop function create_game(text, int, int, int, int, int);

create function create_game(
  nickname text,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null,
  p_visibility text default 'private'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  new_code text;
  v_deck int := coalesce(p_deck_size, 3);
  v_bank int := coalesce(p_start_bankroll, 1000);
  v_min int := coalesce(p_min_bid, 10);
  v_delay int := coalesce(p_close_delay_seconds, 3);
  v_cap int := coalesce(p_max_auction_seconds, 60);
  v_vis text := coalesce(p_visibility, 'private');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300
     or v_vis not in ('private', 'public') then
    raise exception 'INVALID_SETTINGS';
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid,
                         close_delay_seconds, max_auction_seconds, visibility)
      values (new_code, v_deck, v_bank, v_min, v_delay, v_cap, v_vis)
      returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;

-- le board : pseudo de l'hôte + réglages, sans ouvrir la RLS de players
create function list_public_games() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select g.id as game_id,
           (select p.nickname from players p where p.game_id = g.id and p.seat = 0) as host_nickname,
           (select count(*)::int from players p where p.game_id = g.id) as player_count,
           g.deck_size, g.start_bankroll, g.min_bid, g.close_delay_seconds, g.created_at
    from games g
    where g.visibility = 'public' and g.status = 'lobby'
      and (select count(*) from players p where p.game_id = g.id) < 2
    order by g.created_at desc
    limit 20
  ) t;
$$;

create function join_game_by_id(g_id uuid, nickname text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  is_rematch_guest boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
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
  if (select count(*) from players where game_id = g.id) >= 2 then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 1, g.start_bankroll);
  return json_build_object('game_id', g.id);
end $$;

create function update_game_settings(
  g_id uuid,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
  v_deck int; v_bank int; v_min int; v_delay int; v_cap int;
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
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300 then
    raise exception 'INVALID_SETTINGS';
  end if;
  update games
  set deck_size = v_deck, start_bankroll = v_bank, min_bid = v_min,
      close_delay_seconds = v_delay, max_auction_seconds = v_cap
  where id = g_id;
  -- en lobby personne n'a dépensé : on resynchronise
  update players set bankroll = v_bank where game_id = g_id;
end $$;

create function rematch_game(old_game_id uuid) returns json
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
                         close_delay_seconds, max_auction_seconds, visibility)
      values (new_code, old_g.deck_size, old_g.start_bankroll, old_g.min_bid,
              old_g.close_delay_seconds, old_g.max_auction_seconds, 'private')
      returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, me.nickname, 0, g.start_bankroll);
  update games set next_game_id = g.id where id = old_game_id;
  return json_build_object('game_id', g.id);
end $$;
