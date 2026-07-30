alter table players add column is_bot boolean not null default false;

-- pseudo effectif : le profil fait foi, sinon le pseudo saisi
create function effective_nickname(uid uuid, typed text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select username from profiles where id = uid), trim(typed))
$$;

create or replace function create_game(
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
  v_nick text;
  v_deck int := coalesce(p_deck_size, 3);
  v_bank int := coalesce(p_start_bankroll, 1000);
  v_min int := coalesce(p_min_bid, 10);
  v_delay int := coalesce(p_close_delay_seconds, 3);
  v_cap int := coalesce(p_max_auction_seconds, 60);
  v_vis text := coalesce(p_visibility, 'private');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_nick := effective_nickname(uid, nickname);
  if coalesce(v_nick, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
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
  values (g.id, uid, v_nick, 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;

-- signature étendue (p_is_bot) : l'ancienne doit disparaître (surcharge ambiguë pour PostgREST)
drop function join_game(text, text);

create function join_game(game_code text, nickname text, p_is_bot boolean default false)
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
  if (select count(*) from players where game_id = g.id) >= 2 then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot)
  values (g.id, uid, v_nick, 1, g.start_bankroll, coalesce(p_is_bot, false));
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
  if (select count(*) from players where game_id = g.id) >= 2 then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, v_nick, 1, g.start_bankroll);
  return json_build_object('game_id', g.id);
end $$;

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
                         close_delay_seconds, max_auction_seconds, visibility)
      values (new_code, old_g.deck_size, old_g.start_bankroll, old_g.min_bid,
              old_g.close_delay_seconds, old_g.max_auction_seconds, 'private')
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

create or replace function list_public_games() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select g.id as game_id,
           (select p.nickname from players p where p.game_id = g.id and p.seat = 0) as host_nickname,
           (select pr.username from players p join profiles pr on pr.id = p.auth_uid
            where p.game_id = g.id and p.seat = 0) as host_username,
           (select count(*)::int from players p where p.game_id = g.id) as player_count,
           g.deck_size, g.start_bankroll, g.min_bid, g.close_delay_seconds, g.created_at
    from games g
    where g.visibility = 'public' and g.status = 'lobby'
      and (select count(*) from players p where p.game_id = g.id) < 2
    order by g.created_at desc
    limit 20
  ) t;
$$;
