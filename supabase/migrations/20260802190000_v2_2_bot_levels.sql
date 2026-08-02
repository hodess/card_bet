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

-- La recopie de bot_level dans match_players n'est PAS faite ici, mais dans la
-- migration v2_2_bot_level_record_match qui suit. Raison : le chantier « création
-- de packs » a redéfini record_match() entre-temps (private_pack, snapshot des
-- cartes). Une version de la fonction écrite ici écraserait la leur pendant le
-- déploiement, avant d'être elle-même corrigée par la migration suivante — une
-- fenêtre où l'historique serait écrit de travers. Une seule migration, la
-- dernière, fait autorité sur record_match().
