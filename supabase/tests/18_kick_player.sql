begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : partie de 4 places, 3 joueurs assis (sièges 0, 1, 2)
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select
  (create_game('Romain', null, null, null, null, null, 'private', 4)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games where id = (select gid from t)), 'Ami2');
select test_login('00000000-0000-0000-0000-000000000003');
select join_game((select code from games where id = (select gid from t)), 'Ami3');
create temp table ids as select
  (select id from players where game_id = (select gid from t) and seat = 0) as p0,
  (select id from players where game_id = (select gid from t) and seat = 1) as p1,
  (select id from players where game_id = (select gid from t) and seat = 2) as p2;

-- un non-hôte n'exclut personne
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t), (select p2 from ids)),
  'P0001', 'NOT_HOST', 'seul l''hôte exclut');

select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t), (select p0 from ids)),
  'P0001', 'CANNOT_KICK_SELF', 'l''hôte ne s''exclut pas lui-même');
select throws_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t),
    '00000000-0000-0000-0000-0000000000ff'),
  'P0001', 'NOT_A_PLAYER', 'cible hors de la partie refusée');

-- exclusion du siège 1 : les sièges se recompactent
select lives_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t), (select p1 from ids)),
  'l''hôte exclut le siège 1');
select is((select count(*)::int from players where game_id = (select gid from t)), 2,
  'il reste 2 joueurs');
select results_eq(
  format($$select seat from players where game_id = %L order by seat$$, (select gid from t)),
  array[0, 1],
  'sièges recompactés en 0, 1');
select is(
  (select seat from players where id = (select p2 from ids)), 1,
  'l''ancien siège 2 est descendu au siège 1');

-- exclusion du dernier siège : seul cas où « seat > cible.seat » ne matche
-- aucune ligne (chemin distinct de la recompaction ci-dessus) — seconde partie
-- pour ne pas perturber l'état déjà vérifié de `t`
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t2 as select
  (create_game('Romain', null, null, null, null, null, 'private', 3)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games where id = (select gid from t2)), 'Ami2');
select test_login('00000000-0000-0000-0000-000000000003');
select join_game((select code from games where id = (select gid from t2)), 'Ami3');
create temp table ids2 as select
  (select id from players where game_id = (select gid from t2) and seat = 2) as last;

select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t2), (select last from ids2)),
  'l''hôte exclut le dernier siège');
select is((select count(*)::int from players where game_id = (select gid from t2)), 2,
  'il reste 2 joueurs après exclusion du dernier siège');
select results_eq(
  format($$select seat from players where game_id = %L order by seat$$, (select gid from t2)),
  array[0, 1],
  'sièges 0 et 1 inchangés quand le siège exclu était le dernier');

-- plus d'exclusion une fois la partie lancée
select start_game((select gid from t));
select throws_ok(
  format($$select kick_player(%L, %L)$$, (select gid from t), (select p2 from ids)),
  'P0001', 'GAME_NOT_IN_LOBBY', 'pas d''exclusion en cours de partie');

select * from finish();
rollback;
