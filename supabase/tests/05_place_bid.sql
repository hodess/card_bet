begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- consomme la temporisation de l'enchère ouverte : ce fichier teste les règles de
-- mise, pas l'attente
create function test_live(g uuid) returns void language plpgsql as $$
begin
  update auctions set opened_at = now() - interval '1 second',
                      last_bid_at = now() - interval '1 second'
  where game_id = g and status = 'open';
end $$;

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

select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'NOT_A_PLAYER', 'tiers refusé');

select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select place_bid(%L, 60)$$, (select gid from t)), 'p2 mise 60');
select is((select current_bid from auctions where seq = 1), 60, 'mise à 60');
select is((select current_bidder from auctions where seq = 1), (select p2 from ids), 'p2 mène');

select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'BID_TOO_LOW', 'mise égale refusée');
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 70)$$, (select gid from t)),
  'P0001', 'SELF_OVERBID', 'p2 mène déjà');
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 981)$$, (select gid from t)),
  'P0001', 'RESERVE_EXCEEDED', '981 > max 980');

-- deck plein : p2 reçoit 3 cartes (en tant que postgres), il ne peut plus miser
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t), (select p2 from ids), id, 0 from cards limit 3;
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 990)$$, (select gid from t)),
  'P0001', 'DECK_FULL', 'deck plein ne mise plus');

-- p1 mise 980 : p2 (deck plein) n'est plus challenger → clôture immédiate. p1
-- reste seul incomplet, et la partie ne saute plus au classement : elle déroule
-- ses cartes restantes une par une, chacune adjugée à la mise minimale.
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select place_bid(%L, 980)$$, (select gid from t)), 'p1 mise 980');
select is((select status from games where id = (select gid from t)), 'playing',
  'un seul joueur incomplet : la partie continue carte par carte');
do $$
declare i int := 0;
begin
  while (select status from games where id = (select gid from t)) <> 'finished'
        and i < 50 loop
    perform test_live((select gid from t));
    perform close_auction((select gid from t));
    i := i + 1;
  end loop;
end $$;
select is((select status from games where id = (select gid from t)), 'finished',
  'les cartes restantes déroulent jusqu''à la fin');
select throws_ok(format($$select place_bid(%L, 990)$$, (select gid from t)),
  'P0001', 'GAME_NOT_PLAYING', 'plus de mise après la fin');

select * from finish();
rollback;
