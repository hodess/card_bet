-- Rétablit la recopie de players.bot_level dans match_players, perdue par
-- collision de chantiers : v2_2_bot_levels avait ajouté cette recopie à
-- record_match(), mais deux migrations du chantier « création de packs »
-- (pack_authoring_rules puis revue_finale_packs) ont redéfini la fonction
-- ENSUITE, sans la connaître. La colonne existait donc, le front la lisait,
-- et elle restait éternellement nulle.
--
-- Cette version part de la dernière définition en date (revue_finale_packs) et
-- n'y ajoute que bot_level. Aucun autre changement.

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

    insert into matches (game_id, deck_size, start_bankroll, private_pack)
    values (new.id, new.deck_size, new.start_bankroll,
            coalesce((select p.visibility <> 'public'
                      from packs p where p.slug = new.pack), false))
    returning id into m_id;

    with scored as (
      select p.id as player_id, p.seat, p.nickname, p.bankroll, p.is_bot, p.bot_level,
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
                               money_left, result, is_bot, bot_level)
    select m_id, profile_id, nickname, seat, score, bankroll,
           case
             when rk > 1 then 'loss'
             when count(*) over (partition by rk) > 1 then 'draw'
             else 'win'
           end,
           is_bot, bot_level
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
