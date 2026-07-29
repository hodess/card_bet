begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- simule un utilisateur authentifié : auth.uid() lit le claim 'sub'
create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select test_login('00000000-0000-0000-0000-000000000001');
create temp table created as select create_game('Romain') as res;

select is((select count(*)::int from games), 1, 'partie créée');
select is((select status from games), 'lobby', 'partie en lobby');
select is((select count(*)::int from players where seat = 0), 1, 'créateur en seat 0');
select is((select bankroll from players), 1000, 'bankroll initiale 1000');

select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(
  format($$select join_game(%L, 'Ami')$$, (select res->>'code' from created)),
  'un 2e joueur peut rejoindre');
select is((select count(*)::int from players), 2, '2 joueurs');

-- rejoin idempotent
select lives_ok(
  format($$select join_game(%L, 'Ami')$$, (select res->>'code' from created)),
  'rejoin idempotent');
select is((select count(*)::int from players), 2, 'toujours 2 joueurs');

select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select join_game(%L, 'Intrus')$$, (select res->>'code' from created)),
  'P0001', 'GAME_FULL', 'refuse un 3e joueur');
select throws_ok(
  $$select join_game('ZZZZZZ', 'Personne')$$,
  'P0001', 'GAME_NOT_FOUND', 'code inconnu');

select * from finish();
rollback;
