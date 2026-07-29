create function place_bid(g_id uuid, amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  a auctions%rowtype;
  me players%rowtype;
  missing int;
begin
  select * into g from games where id = g_id;
  if not found or g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;                        -- sérialise mises et clôtures concurrentes
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

  missing := g.deck_size - deck_count(me.id);
  if missing <= 0 then raise exception 'DECK_FULL'; end if;
  if a.current_bidder = me.id then raise exception 'SELF_OVERBID'; end if;
  if amount <= a.current_bid then raise exception 'BID_TOO_LOW'; end if;
  if amount > me.bankroll - (missing - 1) * g.min_bid then
    raise exception 'RESERVE_EXCEEDED';
  end if;

  update auctions
  set current_bid = amount, current_bidder = me.id, last_bid_at = now()
  where id = a.id;
end $$;
