-- match_cards devient un VRAI snapshot. Jusqu'ici il ne mémorisait qu'une
-- référence vers cards : le résumé d'une partie passée réaffichait le nom et la
-- note ACTUELS de la carte. Tant que les packs étaient figés dans des
-- migrations ça ne se voyait pas ; dès qu'un joueur peut réécrire son pack, ça
-- réécrit l'historique de tous ceux qui ont joué avec, et retirer une carte
-- devient impossible.

-- 1. colonnes ajoutées en nullable, le temps du backfill
alter table match_cards
  add column card_name     text,
  add column card_position text,
  add column card_rating   int;

update match_cards mc
set card_name = c.name, card_position = c.position, card_rating = c.rating
from cards c
where c.id = mc.card_id;

-- 2. aucune ligne orpheline ne peut exister : la clé étrangère l'interdisait
--    jusqu'à la ligne suivante. On peut donc verrouiller.
alter table match_cards
  alter column card_name     set not null,
  alter column card_position set not null,
  alter column card_rating   set not null;

-- 3. card_id reste comme trace, sans contrainte : une carte retirée puis
--    nettoyée ne doit pas être retenue par l'historique.
alter table match_cards drop constraint match_cards_card_id_fkey;

-- 4. le trigger recopie désormais le contenu en même temps que la référence
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

    insert into match_cards (match_id, seat, card_id, price_paid,
                             card_name, card_position, card_rating)
    select m_id, p.seat, pc.card_id, pc.price_paid, c.name, c.position, c.rating
    from player_cards pc
    join players p on p.id = pc.player_id
    join cards c on c.id = pc.card_id
    where pc.game_id = new.id;
  exception when others then
    -- l'historique est un bonus : une fin de partie ne doit jamais casser
    raise warning 'record_match failed for game %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
