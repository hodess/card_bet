-- Niveau de difficulté d'un bot, connu du serveur pour être visible de tous les
-- joueurs et conservé dans l'historique des parties.

alter table players add column bot_level text
  check (bot_level in ('easy', 'medium', 'hard'));

-- Backfill AVANT la contrainte de cohérence : sans lui, la migration casse en prod
-- sur une partie en cours qui contient déjà des bots (colonne nulle, is_bot vrai).
update players set bot_level = 'medium' where is_bot and bot_level is null;

alter table players add constraint players_bot_level_coherent
  check ((is_bot and bot_level is not null) or (not is_bot and bot_level is null));

alter table match_players add column bot_level text;

-- L'ancienne signature doit disparaître : deux surcharges de join_game rendent
-- l'appel ambigu pour PostgREST (le précédent est documenté dans v1_identity).
drop function join_game(text, text, boolean);

create function join_game(game_code text, nickname text,
                          p_is_bot boolean default false,
                          p_bot_level text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  v_nick text;
  v_bot boolean := coalesce(p_is_bot, false);
  v_level text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_bot_level is not null and p_bot_level not in ('easy', 'medium', 'hard') then
    raise exception 'BOT_LEVEL_INVALID';
  end if;
  -- un humain n'a jamais de niveau, quoi qu'envoie le client ; un bot en a toujours un
  v_level := case when v_bot then coalesce(p_bot_level, 'medium') else null end;
  v_nick := effective_nickname(uid, nickname);
  if coalesce(v_nick, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  select * into g from games where code = upper(game_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if exists (select 1 from players where game_id = g.id and auth_uid = uid) then
    return json_build_object('game_id', g.id);  -- déjà dans la partie
  end if;
  if g.status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if (select count(*) from players where game_id = g.id) >= g.max_players then
    raise exception 'GAME_FULL';
  end if;
  insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot, bot_level)
  values (g.id, uid, v_nick,
          (select coalesce(max(seat), -1) + 1 from players where game_id = g.id),
          g.start_bankroll, v_bot, v_level);
  return json_build_object('game_id', g.id);
end $$;

-- Recopie du niveau dans l'historique persistant.
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
