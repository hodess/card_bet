begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : partie démarrée
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select (create_game('Romain')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));

create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;

-- un tiers ne peut pas miser
select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'NOT_A_PLAYER', 'tiers refusé');

-- surenchère normale par p2
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select place_bid(%L, 60)$$, (select gid from t)), 'p2 mise 60');
select is((select current_bid from auctions), 60, 'mise à 60');
select is((select current_bidder from auctions), (select p2 from ids), 'p2 mène');

-- mise égale refusée
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'BID_TOO_LOW', 'mise égale refusée');

-- surenchère sur soi-même refusée
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 70)$$, (select gid from t)),
  'P0001', 'SELF_OVERBID', 'p2 mène déjà');

-- règle de réserve : bankroll 1000, deck vide (3 manquants) → max 980
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 981)$$, (select gid from t)),
  'P0001', 'RESERVE_EXCEEDED', '981 > max 980');
select lives_ok(format($$select place_bid(%L, 980)$$, (select gid from t)), '980 = max autorisé');

-- deck plein : p2 reçoit 3 cartes (directement, en tant que postgres)
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t), (select p2 from ids), id, 0 from cards limit 3;
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 990)$$, (select gid from t)),
  'P0001', 'DECK_FULL', 'deck plein ne mise plus');

-- enchère close
update auctions set status = 'sold';
select throws_ok(format($$select place_bid(%L, 995)$$, (select gid from t)),
  'P0001', 'AUCTION_CLOSED', 'pas de mise sur enchère close');

-- partie terminée : plus aucune mise possible
update games set status = 'finished';
select throws_ok(format($$select place_bid(%L, 1000)$$, (select gid from t)),
  'P0001', 'GAME_NOT_PLAYING', 'partie terminée refuse toute mise');

select * from finish();
rollback;
