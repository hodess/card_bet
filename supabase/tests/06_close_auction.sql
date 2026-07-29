begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

-- 2. après 4 s (simulées) : adjudication à p1 (mise forcée 10)
update auctions set last_bid_at = now() - interval '5 seconds',
                    opened_at  = now() - interval '6 seconds' where seq = 1;
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture après 4 s');
select is((select status from auctions where seq = 1), 'sold', 'enchère 1 vendue');
select is((select bankroll from players where id = (select p1 from ids)), 990, 'p1 débité de 10');
select is(deck_count((select p1 from ids)), 1, 'p1 a 1 carte');
select is((select count(*)::int from auctions where seq = 2 and status = 'open'), 1, 'enchère 2 ouverte');
select is((select forced_bidder from auctions where seq = 2), (select p2 from ids), 'rotation : forcée p2');

-- 3. idempotence : re-clôturer une enchère fraîche ne fait rien
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 're-clôture = no-op');
select is((select count(*)::int from auctions), 2, 'pas d''enchère fantôme');

-- 4. fin de partie avec auto-complétion :
--    p1 devient plein (2 cartes ajoutées directement), p2 gagne l'enchère 2
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t), (select p1 from ids), id, 0
from cards
where id not in (select card_id from player_cards where player_id = (select p1 from ids))
limit 2;
update auctions set last_bid_at = now() - interval '5 seconds',
                    opened_at  = now() - interval '6 seconds' where seq = 2;
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture enchère 2');
select is((select status from games), 'finished', 'partie terminée');
select is(deck_count((select p2 from ids)), 3, 'p2 auto-complété à 3 cartes');
select is((select bankroll from players where id = (select p2 from ids)), 970, 'p2 : 1000 − 10 − 2×10');
select is((select count(*)::int from auctions), 4, '2 enchères jouées + 2 auto (sold)');

select * from finish();
rollback;
