begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : partie démarrée (enchère 1 : forcée p1 à 10)
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select (create_game('Romain')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));
create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;

-- 1. clôture prématurée : silencieuse et sans effet
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture prématurée = no-op');
select is((select status from auctions where seq = 1), 'open', 'enchère 1 toujours ouverte');

-- 2. délai d'adjudication dépassé (9 s simulées contre 8 s de délai par défaut, et
--    p2 est encore challenger : la clôture attend donc ce délai entier) →
--    adjudication à p1 (mise forcée 10)
update auctions set last_bid_at = now() - interval '9 seconds',
                    opened_at  = now() - interval '10 seconds' where seq = 1;
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture après le délai');
select is((select status from auctions where seq = 1), 'sold', 'enchère 1 vendue');
select is((select bankroll from players where id = (select p1 from ids)), 990, 'p1 débité de 10');
select is(deck_count((select p1 from ids)), 1, 'p1 a 1 carte');
select is((select count(*)::int from auctions where seq = 2 and status = 'open'), 1, 'enchère 2 ouverte');
select is((select forced_bidder from auctions where seq = 2), (select p2 from ids), 'rotation : forcée p2');

-- 3. idempotence : re-clôturer une enchère fraîche ne fait rien
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 're-clôture = no-op');
select is((select count(*)::int from auctions), 2, 'pas d''enchère fantôme');

-- 4. fin de partie déroulée : p1 devient plein (2 cartes ajoutées directement),
--    p2 gagne l'enchère 2, puis ses cartes manquantes s'adjugent une par une —
--    plus de lot d'enchères insérées en `sold` derrière le dos du joueur
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t), (select p1 from ids), id, 0
from cards
where id not in (select card_id from player_cards where player_id = (select p1 from ids))
limit 2;
update auctions set last_bid_at = now() - interval '9 seconds',
                    opened_at  = now() - interval '10 seconds' where seq = 2;
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture enchère 2');
select is((select status from games), 'playing', 'p2 seul incomplet : la partie continue');
select is((select count(*)::int from auctions where seq = 3 and status = 'open'), 1,
  'enchère 3 ouverte pour p2 seul');
do $$
declare i int := 0;
begin
  while (select status from games) <> 'finished' and i < 50 loop
    update auctions set last_bid_at = now() - interval '90 seconds',
                        opened_at = now() - interval '90 seconds'
    where game_id = (select gid from t) and status = 'open';
    perform close_auction((select gid from t));
    i := i + 1;
  end loop;
end $$;
select is((select status from games), 'finished', 'partie terminée');
select is(deck_count((select p2 from ids)), 3, 'p2 a rempli son deck carte par carte');
select is((select bankroll from players where id = (select p2 from ids)), 970, 'p2 : 1000 − 10 − 2×10');
select is((select count(*)::int from auctions), 4, '4 enchères jouées, aucune en lot');

select * from finish();
rollback;
