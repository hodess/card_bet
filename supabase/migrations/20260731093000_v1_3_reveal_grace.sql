-- Sursis de révélation.
--
-- Le client joue une séquence d'adjudication (tampon « Adjugé », vol vers le
-- deck, entrée de la carte suivante) qui dure 3 000 ms — la somme des durées de
-- `config.ui.auction`, verrouillée par `auctionPhase.test.ts`. Jusqu'ici
-- l'enchère suivante était ouverte à `now()` : ses 3 s de `close_delay`
-- s'écoulaient pendant l'animation et la carte arrivait déjà expirée.
--
-- L'enchère suivante est donc désormais datée dans le futur : elle ne démarre
-- qu'une fois la carte posée. Tant qu'elle n'a pas démarré, on ne peut ni miser,
-- ni passer, ni la clôturer — on n'enchérit pas sur une carte qu'on ne voit pas.

drop function open_next_auction(uuid);

create function open_next_auction(g_id uuid, p_grace boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  next_seq int;
  next_card int;
  prev_seat int;
  n_players int;
  fb players%rowtype;
  -- séquence d'adjudication côté client ; nulle à l'ouverture de la partie,
  -- où il n'y a pas d'adjudication à regarder avant la première carte
  grace interval := case when p_grace then interval '3 seconds' else interval '0' end;
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

  insert into auctions (game_id, card_id, seq, current_bid, current_bidder, forced_bidder,
                        opened_at, last_bid_at)
  values (g_id, next_card, next_seq, g.min_bid, fb.id, fb.id,
          now() + grace, now() + grace);
end $$;

revoke execute on function open_next_auction(uuid, boolean) from public, anon, authenticated;

-- close_auction : ne clôture pas une enchère pas encore démarrée, et laisse son
-- sursis à celle qu'elle ouvre
create or replace function close_auction(g_id uuid) returns void
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

  -- sursis de révélation en cours : la carte n'est pas encore à l'écran
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
    perform open_next_auction(g_id, true);
  end if;
end $$;

-- place_bid / pass_auction : aucune action avant le début de l'enchère
create or replace function place_bid(g_id uuid, amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  a auctions%rowtype;
  me players%rowtype;
  missing int;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;                        -- sérialise mises et clôtures concurrentes
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

  if now() < a.opened_at then raise exception 'AUCTION_NOT_STARTED'; end if;
  missing := g.deck_size - deck_count(me.id);
  if missing <= 0 then raise exception 'DECK_FULL'; end if;
  if a.current_bidder = me.id then raise exception 'SELF_OVERBID'; end if;
  -- unreachable at 2 players (pass closes the auction synchronously) ; required at >2 : pass is final
  if me.id = any (a.passed) then raise exception 'ALREADY_PASSED'; end if;
  if amount <= a.current_bid then raise exception 'BID_TOO_LOW'; end if;
  if amount > me.bankroll - (missing - 1) * g.min_bid then
    raise exception 'RESERVE_EXCEEDED';
  end if;

  update auctions
  set current_bid = amount, current_bidder = me.id, last_bid_at = now()
  where id = a.id;

  -- clôture immédiate si plus personne ne peut suivre (no-op sinon)
  perform close_auction(g_id);
end $$;

create or replace function pass_auction(g_id uuid) returns void
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
  for update;
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

  if now() < a.opened_at then raise exception 'AUCTION_NOT_STARTED'; end if;
  if a.current_bidder = me.id then raise exception 'LEADER_CANNOT_PASS'; end if;

  if not (me.id = any (a.passed)) then
    update auctions set passed = array_append(passed, me.id) where id = a.id;
  end if;

  perform close_auction(g_id);
end $$;
