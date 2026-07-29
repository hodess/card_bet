-- Tables --------------------------------------------------------------------
create table cards (
  id int generated always as identity primary key,
  name text not null,
  position text not null,
  rating int not null check (rating between 1 and 99)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  deck_size int not null default 3,
  start_bankroll int not null default 1000,
  min_bid int not null default 10,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  auth_uid uuid not null,
  nickname text not null,
  seat int not null,
  bankroll int not null,
  unique (game_id, seat),
  unique (game_id, auth_uid)
);

create table game_cards (
  game_id uuid not null references games(id) on delete cascade,
  card_id int not null references cards(id),
  seq int not null,
  primary key (game_id, seq)
);

create table auctions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  card_id int not null references cards(id),
  seq int not null,
  status text not null default 'open' check (status in ('open', 'sold')),
  opened_at timestamptz not null default now(),
  last_bid_at timestamptz not null default now(),
  current_bid int not null,
  current_bidder uuid not null references players(id) on delete cascade,
  forced_bidder uuid not null references players(id) on delete cascade,
  unique (game_id, seq)
);

create table player_cards (
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  card_id int not null references cards(id),
  price_paid int not null,
  primary key (player_id, card_id)
);

-- RLS -------------------------------------------------------------------------
-- security definer : évite la récursion de policy sur players
create function is_player(g_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players where game_id = g_id and auth_uid = auth.uid()
  );
$$;

alter table cards enable row level security;
alter table games enable row level security;
alter table players enable row level security;
alter table game_cards enable row level security;   -- aucune policy : illisible par design
alter table auctions enable row level security;
alter table player_cards enable row level security;

create policy cards_read on cards for select to authenticated using (true);
create policy games_read on games for select to authenticated using (is_player(id));
create policy players_read on players for select to authenticated using (is_player(game_id));
create policy auctions_read on auctions for select to authenticated using (is_player(game_id));
create policy player_cards_read on player_cards for select to authenticated using (is_player(game_id));

-- Grants ------------------------------------------------------------------------
-- Ce projet Supabase local ne grante plus automatiquement les nouvelles tables aux
-- rôles anon/authenticated (auto_expose_new_tables non défini = comportement
-- désactivé). Sans ce GRANT SELECT, une lecture sur une table RLS sans policy
-- (game_cards) échoue avec "permission denied" au lieu de renvoyer 0 ligne comme
-- prévu par la conception ("illisible par design" via RLS, pas via absence de droit).
grant select on cards, games, players, auctions, player_cards, game_cards to authenticated;

-- Realtime ----------------------------------------------------------------------
alter publication supabase_realtime add table games, players, auctions, player_cards;
