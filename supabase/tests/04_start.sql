begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select
  (create_game('Romain')->>'game_id')::uuid as gid,
  (select create_game('Solo')->>'game_id')::uuid as gid_solo;

select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(
  format($$select join_game(%L, 'Ami')$$, (select code from games g, t where g.id = t.gid)),
  'setup : 2e joueur');

select throws_ok(
  format($$select start_game(%L)$$, (select gid from t)),
  'P0001', 'NOT_HOST', 'seul l''hôte démarre');

select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select start_game(%L)$$, (select gid_solo from t)),
  'P0001', 'NOT_ENOUGH_PLAYERS', 'il faut 2 joueurs');

select lives_ok(
  format($$select start_game(%L)$$, (select gid from t)),
  'l''hôte démarre');

select is((select status from games where id = (select gid from t)), 'playing', 'partie en cours');
select is((select count(*)::int from game_cards where game_id = (select gid from t)), 40, 'tirage complet mélangé');
select is((select count(*)::int from auctions where game_id = (select gid from t) and status = 'open' and seq = 1), 1, 'enchère 1 ouverte');
select is((select current_bid from auctions where game_id = (select gid from t)), 10, 'mise forcée à 10');
select is(
  (select current_bidder from auctions where game_id = (select gid from t)),
  (select id from players where game_id = (select gid from t) and seat = 0),
  'ouverture forcée par l''hôte (seat 0)');

select throws_ok(
  format($$select start_game(%L)$$, (select gid from t)),
  'P0001', 'GAME_NOT_IN_LOBBY', 'double démarrage refusé');

select * from finish();
rollback;
