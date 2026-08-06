begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- consomme la temporisation de l'enchère ouverte : ce fichier teste le rythme
-- des enchères, pas l'attente d'ouverture
create function test_live(g uuid) returns void language plpgsql as $$
begin
  update auctions set opened_at = now() - interval '1 second',
                      last_bid_at = now() - interval '1 second'
  where game_id = g and status = 'open';
end $$;

-- setup : partie démarrée, enchère 1 forcée p1 à 10
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select (create_game('Romain')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));
create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;
select test_live((select gid from t));

-- 1. p2 passe → plus de challenger → adjugé immédiatement à p1
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select pass_auction(%L)$$, (select gid from t)), 'p2 passe');
select is((select status from auctions where seq = 1), 'sold', 'adjugé immédiatement');
select is((select bankroll from players where id = (select p1 from ids)), 990, 'p1 débité de 10');
select is((select count(*)::int from auctions where seq = 2 and status = 'open'), 1, 'enchère 2 ouverte');

-- 2. le meneur (ouverture forcée p2 sur seq 2) ne peut pas passer
select is((select current_bidder from auctions where seq = 2), (select p2 from ids), 'seq 2 forcée p2');
-- temporisation consommée : ce test-ci porte sur les règles, pas sur l'attente
update auctions set opened_at = now() - interval '1 second',
                    last_bid_at = now() - interval '1 second' where seq = 2;
select throws_ok(format($$select pass_auction(%L)$$, (select gid from t)),
  'P0001', 'LEADER_CANNOT_PASS', 'le meneur ne passe pas');

-- 3. mise qui assèche la réserve adverse → clôture immédiate
--    p1 : bankroll 990, deck 1/3 → max = 990 − 10 = 980 ; p2 : max 980, pas > 980
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select place_bid(%L, 980)$$, (select gid from t)), 'p1 all-in 980');
select is((select status from auctions where seq = 2), 'sold', 'clôture immédiate sans challenger');
select is((select bankroll from players where id = (select p1 from ids)), 10, 'p1 à 10');

-- 4. le chemin temporel marche toujours (seq 3 forcée p1, p2 challenger → reste ouverte)
select is((select count(*)::int from auctions where seq = 3 and status = 'open'), 1, 'enchère 3 ouverte');
-- p2 est challenger : la clôture attend le délai d'adjudication entier (8 s par
-- défaut). On simule 9 s pour le dépasser franchement — `now()` étant constant
-- dans la transaction, la marge d'une seconde est exacte, pas approximative.
update auctions set last_bid_at = now() - interval '9 seconds',
                    opened_at  = now() - interval '10 seconds' where seq = 3;
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture au timer');
select is((select status from games where id = (select gid from t)), 'playing',
  'p1 plein, p2 seul incomplet : la partie continue');
do $$
declare i int := 0;
begin
  while (select status from games where id = (select gid from t)) <> 'finished'
        and i < 50 loop
    update auctions set last_bid_at = now() - interval '90 seconds',
                        opened_at = now() - interval '90 seconds'
    where game_id = (select gid from t) and status = 'open';
    perform close_auction((select gid from t));
    i := i + 1;
  end loop;
end $$;
select is((select status from games where id = (select gid from t)), 'finished',
  'les cartes de p2 s''adjugent une par une');
select is((select bankroll from players where id = (select p2 from ids)), 970,
  'p2 : 1000 − 3 × 10, comme avant le chantier');

-- 5. create_game paramétrable + bornes
select test_login('00000000-0000-0000-0000-000000000004');
create temp table t2 as select
  (create_game('Solo', p_deck_size => 2, p_close_delay_seconds => 6)->>'game_id')::uuid as gid;
select is((select deck_size from games where id = (select gid from t2)), 2, 'deck_size custom');
select is((select close_delay_seconds from games where id = (select gid from t2)), 6, 'délai custom');
select throws_ok($$select create_game('X', p_deck_size => 0)$$,
  'P0001', 'INVALID_SETTINGS', 'bornes refusées');

select * from finish();
rollback;
