create function get_server_time() returns timestamptz
language sql stable as $$ select now() $$;

create function create_game(nickname text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  new_code text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code) values (new_code) returning * into g;
      exit;
    exception when unique_violation then
      -- collision de code : on retire
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;

create function join_game(game_code text, nickname text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  select * into g from games where code = upper(game_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if exists (select 1 from players where game_id = g.id and auth_uid = uid) then
    return json_build_object('game_id', g.id);  -- déjà dans la partie
  end if;
  if g.status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if (select count(*) from players where game_id = g.id) >= 2 then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 1, g.start_bankroll);
  return json_build_object('game_id', g.id);
end $$;
