create function deck_count(p_id uuid) returns int
language sql stable as $$
  select count(*)::int from player_cards where player_id = p_id
$$;

create function open_next_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  next_seq int;
  next_card int;
  prev_seat int;
  n_players int;
  fb players%rowtype;
begin
  select * into g from games where id = g_id for update;
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

  insert into auctions (game_id, card_id, seq, current_bid, current_bidder, forced_bidder)
  values (g_id, next_card, next_seq, g.min_bid, fb.id, fb.id);
end $$;

revoke execute on function deck_count(uuid) from public, anon, authenticated;
revoke execute on function open_next_auction(uuid) from public, anon, authenticated;

create function start_game(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  me players%rowtype;
begin
  select * into g from games where id = g_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'lobby' then raise exception 'GAME_NOT_IN_LOBBY'; end if;
  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found or me.seat <> 0 then raise exception 'NOT_HOST'; end if;
  if (select count(*) from players where game_id = g_id) <> 2 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  insert into game_cards (game_id, card_id, seq)
  select g_id, id, row_number() over (order by random()) from cards;

  update games set status = 'playing' where id = g_id;
  perform open_next_auction(g_id);
end $$;
