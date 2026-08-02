begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Hote');
create temp table t as
  select create_game('Hote', null, null, null, null, null, 'private', 8) as res;

-- un humain n'a jamais de niveau
select is((select bot_level from players where seat = 0), null,
  'l''hote humain a bot_level nul');

-- un bot avec un niveau explicite
select test_signup('00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  format($$select join_game(%L, 'Bot Pep', true, 'hard')$$, (select res->>'code' from t)),
  'join d''un bot difficile');
select is((select bot_level from players where nickname = 'Bot Pep'), 'hard',
  'le niveau du bot est enregistre');

-- un bot sans niveau retombe sur medium
select test_signup('00000000-0000-0000-0000-000000000003', true);
select join_game((select res->>'code' from t), 'Bot Zizou', true);
select is((select bot_level from players where nickname = 'Bot Zizou'), 'medium',
  'un bot sans niveau retombe sur medium');

-- un humain qui envoie un niveau se le voit ignorer
select test_signup('00000000-0000-0000-0000-000000000004', true);
select join_game((select res->>'code' from t), 'Tricheur', false, 'hard');
select is((select bot_level from players where nickname = 'Tricheur'), null,
  'un humain ne recoit jamais de niveau, meme s''il en envoie');

-- niveau inconnu refuse
select test_signup('00000000-0000-0000-0000-000000000005', true);
select throws_ok(
  format($$select join_game(%L, 'Bot Bielsa', true, 'impossible')$$,
         (select res->>'code' from t)),
  'P0001', 'BOT_LEVEL_INVALID', 'un niveau inconnu leve BOT_LEVEL_INVALID');

-- la contrainte players_bot_level_coherent, atteinte directement (hors join_game,
-- qui ne peut jamais la violer puisqu'il calcule le niveau lui-meme)
select throws_ok(
  format($$insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot, bot_level)
           values (%L, gen_random_uuid(), 'Bot sans niveau', 10, 1000, true, null)$$,
         (select (res->>'game_id')::uuid from t)),
  '23514', 'new row for relation "players" violates check constraint "players_bot_level_coherent"',
  'un bot sans bot_level viole players_bot_level_coherent');

select throws_ok(
  format($$insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot, bot_level)
           values (%L, gen_random_uuid(), 'Humain avec niveau', 11, 1000, false, 'hard')$$,
         (select (res->>'game_id')::uuid from t)),
  '23514', 'new row for relation "players" violates check constraint "players_bot_level_coherent"',
  'un humain avec bot_level viole players_bot_level_coherent');

-- recopie dans l'historique : on termine la partie et on relit match_players
select test_signup('00000000-0000-0000-0000-000000000001');
select start_game((select (res->>'game_id')::uuid from t));
update games set status = 'finished' where id = (select (res->>'game_id')::uuid from t);
select is(
  (select bot_level from match_players mp
   join matches m on m.id = mp.match_id
   where m.game_id = (select (res->>'game_id')::uuid from t) and mp.nickname = 'Bot Pep'),
  'hard', 'le niveau est recopie dans match_players');

select * from finish();
rollback;
