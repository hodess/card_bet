create function close_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  a auctions%rowtype;
  lone players%rowtype;
  incomplete int;
  next_seq int;
  next_card int;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then return; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;
  if not found then return; end if;

  -- l'horloge serveur décide ; un appel trop tôt est un no-op silencieux
  if now() < a.last_bid_at + interval '4 seconds'
     and now() < a.opened_at + interval '60 seconds' then
    return;
  end if;

  update auctions set status = 'sold' where id = a.id;
  update players set bankroll = bankroll - a.current_bid where id = a.current_bidder;
  insert into player_cards (game_id, player_id, card_id, price_paid)
  values (g_id, a.current_bidder, a.card_id, a.current_bid);

  select count(*) into incomplete from players p
  where p.game_id = g_id and deck_count(p.id) < g.deck_size;

  if incomplete = 1 then
    -- dernier joueur incomplet : auto-complétion à la mise minimale
    select p.* into lone from players p
    where p.game_id = g_id and deck_count(p.id) < g.deck_size;
    while deck_count(lone.id) < g.deck_size loop
      select coalesce(max(seq), 0) + 1 into next_seq from auctions where game_id = g_id;
      select card_id into next_card from game_cards where game_id = g_id and seq = next_seq;
      insert into auctions (game_id, card_id, seq, status, current_bid, current_bidder, forced_bidder)
      values (g_id, next_card, next_seq, 'sold', g.min_bid, lone.id, lone.id);
      insert into player_cards (game_id, player_id, card_id, price_paid)
      values (g_id, lone.id, next_card, g.min_bid);
      update players set bankroll = bankroll - g.min_bid where id = lone.id;
    end loop;
    incomplete := 0;
  end if;

  if incomplete = 0 then
    update games set status = 'finished' where id = g_id;
  else
    perform open_next_auction(g_id);
  end if;
end $$;
