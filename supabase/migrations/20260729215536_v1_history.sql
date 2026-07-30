create table matches (
  id uuid primary key default gen_random_uuid(),
  finished_at timestamptz not null default now(),
  deck_size int not null,
  start_bankroll int not null
);

create table match_players (
  match_id uuid not null references matches(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  nickname text not null,
  seat int not null,
  score int not null,
  money_left int not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  is_bot boolean not null default false,
  primary key (match_id, seat)
);

create table match_cards (
  match_id uuid not null references matches(id) on delete cascade,
  seat int not null,
  card_id int not null references cards(id),
  price_paid int not null,
  primary key (match_id, seat, card_id)
);

create index match_players_profile on match_players (profile_id, match_id);
create index matches_finished_at on matches (finished_at desc);

alter table matches enable row level security;
alter table match_players enable row level security;
alter table match_cards enable row level security;
create policy matches_read on matches for select to authenticated using (true);
create policy match_players_read on match_players for select to authenticated using (true);
create policy match_cards_read on match_cards for select to authenticated using (true);
grant select on matches, match_players, match_cards to authenticated;

create function record_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m_id uuid;
begin
  begin
    -- comptes uniquement : sans profil dans la partie, rien à écrire
    if not exists (
      select 1 from players p join profiles pr on pr.id = p.auth_uid
      where p.game_id = new.id
    ) then
      return new;
    end if;

    insert into matches (deck_size, start_bankroll)
    values (new.deck_size, new.start_bankroll)
    returning id into m_id;

    with scored as (
      select p.id as player_id, p.seat, p.nickname, p.bankroll, p.is_bot,
             pr.id as profile_id,
             coalesce((select sum(c.rating)
                       from player_cards pc join cards c on c.id = pc.card_id
                       where pc.player_id = p.id), 0)::int as score
      from players p
      left join profiles pr on pr.id = p.auth_uid
      where p.game_id = new.id
    ),
    ranked as (
      select *, rank() over (order by score desc, bankroll desc) as rk
      from scored
    )
    insert into match_players (match_id, profile_id, nickname, seat, score,
                               money_left, result, is_bot)
    select m_id, profile_id, nickname, seat, score, bankroll,
           case
             when rk > 1 then 'loss'
             when count(*) over (partition by rk) > 1 then 'draw'
             else 'win'
           end,
           is_bot
    from ranked;

    insert into match_cards (match_id, seat, card_id, price_paid)
    select m_id, p.seat, pc.card_id, pc.price_paid
    from player_cards pc
    join players p on p.id = pc.player_id
    where pc.game_id = new.id;
  exception when others then
    -- l'historique est un bonus : une fin de partie ne doit jamais casser
    raise warning 'record_match failed for game %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create trigger games_record_match
after update of status on games
for each row
when (new.status = 'finished' and old.status is distinct from 'finished')
execute function record_match();
