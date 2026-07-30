-- Relie l'historique persistant à l'id de partie, pour servir un résumé public
-- sur les liens /game/:id après la fin (et après la purge des 24 h).
-- PAS de FK vers games : la purge supprime la partie, le résumé doit survivre.
alter table matches add column game_id uuid;
create unique index matches_game_id on matches (game_id);

create or replace function record_match() returns trigger
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

    insert into matches (game_id, deck_size, start_bankroll)
    values (new.id, new.deck_size, new.start_bankroll)
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
