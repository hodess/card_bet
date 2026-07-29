-- Délais configurables par partie
alter table games
  add column close_delay_seconds int not null default 3
    check (close_delay_seconds between 1 and 60),
  add column max_auction_seconds int not null default 60
    check (max_auction_seconds between 5 and 300);

-- Joueurs ayant passé sur l'enchère courante
alter table auctions add column passed uuid[] not null default '{}';

-- Un challenger : non-meneur, deck incomplet, n'a pas passé, réserve permettant de surenchérir
create function has_challenger(p_auction_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from auctions a
    join games g on g.id = a.game_id
    join players p on p.game_id = g.id
    where a.id = p_auction_id
      and p.id <> a.current_bidder
      and not (p.id = any (a.passed))
      and deck_count(p.id) < g.deck_size
      and p.bankroll - (g.deck_size - deck_count(p.id) - 1) * g.min_bid > a.current_bid
  );
$$;
revoke execute on function has_challenger(uuid) from public, anon, authenticated;

-- close_auction : délais lus dans games + clôture immédiate sans challenger
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

-- place_bid : verrouille désormais games PUIS auctions (même ordre que close_auction,
-- sinon deadlock), et déclenche la clôture immédiate après la mise
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
  for update;
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

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

-- pass_auction : se retirer définitivement de l'enchère courante
create function pass_auction(g_id uuid) returns void
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
  if a.current_bidder = me.id then raise exception 'LEADER_CANNOT_PASS'; end if;

  if not (me.id = any (a.passed)) then
    update auctions set passed = array_append(passed, me.id) where id = a.id;
  end if;

  perform close_auction(g_id);
end $$;

-- create_game paramétrable ; l'ancienne signature disparaît (pas d'overload ambigu)
drop function create_game(text);

create function create_game(
  nickname text,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null
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
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300 then
    raise exception 'INVALID_SETTINGS';
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid, close_delay_seconds, max_auction_seconds)
      values (new_code, v_deck, v_bank, v_min, v_delay, v_cap) returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;
