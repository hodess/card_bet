begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
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

-- 1. la temporisation s'applique dès la première carte : ce n'est plus seulement
--    une pause d'après-adjudication, c'est le rythme de toutes les cartes.
--    Assertion exacte et non « supérieure à un seuil » : `now()` est constant dans
--    la transaction, donc `opened_at` vaut au centième près `now()` + le délai de
--    la partie. Un seuil laisserait passer une temporisation forfaitaire.
select is((select opened_at from auctions where seq = 1),
  now() + make_interval(secs => (select close_delay_seconds from games where id = (select gid from t))),
  'enchère 1 : temporisation = délai de la partie, dès l''ouverture');

-- 2. après une adjudication, l'enchère suivante est datée dans le futur elle aussi
update auctions set opened_at = now() - interval '1 second',
                    last_bid_at = now() - interval '1 second' where seq = 1;
select test_login('00000000-0000-0000-0000-000000000002');
select pass_auction((select gid from t));               -- plus de challenger → adjugé à p1
select is((select status from auctions where seq = 1), 'sold', 'enchère 1 adjugée');
select is((select opened_at from auctions where seq = 2),
  now() + make_interval(secs => (select close_delay_seconds from games where id = (select gid from t))),
  'enchère 2 : temporisation au délai de la partie (8 s par défaut)');
select is((select opened_at from auctions where seq = 2),
          (select last_bid_at from auctions where seq = 2),
  'le délai de clôture part du même instant que l''ouverture');

-- 3. pendant la temporisation, personne n'agit sur l'enchère (p2 mène, p1 est challenger)
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 100)$$, (select gid from t)),
  'P0001', 'AUCTION_NOT_STARTED', 'pas de mise avant la révélation');
select throws_ok(format($$select pass_auction(%L)$$, (select gid from t)),
  'P0001', 'AUCTION_NOT_STARTED', 'pas de passe avant la révélation');
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)),
  'clôture pendant la temporisation = no-op');
select is((select status from auctions where seq = 2), 'open', 'enchère 2 toujours ouverte');

-- 4. temporisation écoulée : la mise repasse
update auctions set opened_at = now() - interval '1 second',
                    last_bid_at = now() - interval '1 second' where seq = 2;
select lives_ok(format($$select place_bid(%L, 100)$$, (select gid from t)),
  'mise acceptée une fois la carte révélée');

select * from finish();
rollback;
