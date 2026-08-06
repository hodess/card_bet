begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : partie démarrée à 2 joueurs, enchère 1 forcée p1, temporisation en cours.
-- Délai explicite de 20 s, très au-dessus du défaut : les assertions sur la durée de
-- la temporisation prouvent alors qu'elle suit le réglage de la partie, là où un
-- seuil compatible avec le défaut passerait encore si le serveur retombait sur une
-- pause forfaitaire.
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select
  (create_game('Romain', p_close_delay_seconds => 20)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));
create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;
create temp table carte1 as select card_id from auctions where seq = 1;

-- 1. le veto est réservé à l'ouvreur désigné
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select use_joker(%L)$$, (select gid from t)),
  'P0001', 'NOT_FORCED_BIDDER', 'p2 n''ouvre pas l''enchère 1');

-- 1 bis. un tiers non assis n'a rien à vetoer, pas même pendant la pause
select test_login('00000000-0000-0000-0000-000000000009');
select throws_ok(format($$select use_joker(%L)$$, (select gid from t)),
  'P0001', 'NOT_A_PLAYER', 'un tiers non assis ne défausse rien');

-- 2. l'ouvreur défausse : la carte sort, personne ne paie, personne ne l'obtient
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select use_joker(%L)$$, (select gid from t)), 'p1 joue son joker');
select is((select status from auctions where seq = 1), 'discarded', 'enchère 1 défaussée');
select is((select bankroll from players where id = (select p1 from ids)), 1000,
  'aucune bankroll débitée');
select is((select count(*)::int from player_cards where game_id = (select gid from t)), 0,
  'aucune carte attribuée');
select ok((select joker_used from players where id = (select p1 from ids)),
  'le joker de p1 est consommé');

-- 3. la rotation avance et la carte suivante a sa temporisation
select is((select count(*)::int from auctions where seq = 2 and status = 'open'), 1,
  'enchère 2 ouverte');
select is((select forced_bidder from auctions where seq = 2), (select p2 from ids),
  'rotation : l''ouverture passe au voisin');
-- `now()` est constant dans la transaction : l'égalité au réglage de la partie est
-- exacte, et discrimine une pause forfaitaire comme une pause tronquée.
select is((select opened_at from auctions where seq = 2),
  now() + make_interval(secs => (select close_delay_seconds from games where id = (select gid from t))),
  'enchère 2 : temporisation au délai de la partie (20 s), même après une défausse');

-- 4. tirage sans remise : la carte défaussée ne ressort jamais
select is((select count(*)::int from auctions where card_id = (select card_id from carte1)), 1,
  'la carte défaussée ne repasse pas en enchère');

-- 5. un seul joker par joueur et par partie
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select use_joker(%L)$$, (select gid from t)), 'p2 joue le sien');
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select use_joker(%L)$$, (select gid from t)),
  'P0001', 'JOKER_ALREADY_USED', 'p1 n''a plus de joker sur l''enchère 3');

-- 6. la fenêtre se ferme avec la temporisation. On rend son joker à p1 d'abord :
--    sans ça l'assertion porterait sur un joueur qui n'en a plus, et ne prouverait
--    que l'ordre des gardes (JOKER_TOO_LATE avant JOKER_ALREADY_USED), pas la règle.
update players set joker_used = false where id = (select p1 from ids);
update auctions set opened_at = now() - interval '1 second',
                    last_bid_at = now() - interval '1 second' where seq = 3;
select throws_ok(format($$select use_joker(%L)$$, (select gid from t)),
  'P0001', 'JOKER_TOO_LATE', 'plus de veto une fois l''enchère vivante');

-- 7. le tirage prévoit une défausse par joueur : 4 joueurs × deck 10 tenaient
--    tout juste dans les 40 cartes du pack football, plus maintenant
select test_login('00000000-0000-0000-0000-000000000003');
create temp table marge as select
  (create_game('Marge', 10, null, null, null, null, 'private', 4)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000004');
select join_game((select code from games where id = (select gid from marge)), 'M2');
select test_login('00000000-0000-0000-0000-000000000005');
select join_game((select code from games where id = (select gid from marge)), 'M3');
select test_login('00000000-0000-0000-0000-000000000006');
select join_game((select code from games where id = (select gid from marge)), 'M4');
select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select start_game(%L)$$, (select gid from marge)),
  'P0001', 'NOT_ENOUGH_CARDS',
  '4 joueurs × (deck 10 + 1 défausse) dépassent les 40 cartes');
select throws_ok(
  $$select create_game('MargePublic', 10, null, null, null, null, 'public', 4)$$,
  'P0001', 'NOT_ENOUGH_CARDS',
  'une publique se voit refuser la même capacité dès la création');

-- 8. le plancher de la temporisation est une règle serveur, pas une préférence du
--    front : une pause trop courte ne couvrirait ni l'animation ni le veto
-- 5 s et non 2 s : 2 s était déjà refusé avant ce chantier, l'assertion ne disait
-- donc rien du plancher qu'il pose. 5 s est accepté sous l'ancienne borne, refusé
-- sous la nouvelle.
select throws_ok(
  $$select create_game('TropCourt', null, null, null, 5)$$,
  'P0001', 'INVALID_SETTINGS', 'un délai de 5 s est refusé à la création');
-- update_game_settings refuse d'abord une partie déjà démarrée (SETTINGS_LOCKED /
-- GAME_NOT_IN_LOBBY) : on isole cette assertion sur une partie neuve restée en salon.
create temp table salon as select
  (create_game('Salon')->>'game_id')::uuid as gid;
select throws_ok(
  format($$select update_game_settings(%L, p_close_delay_seconds => 5)$$, (select gid from salon)),
  'P0001', 'INVALID_SETTINGS', 'et refusé aussi depuis le salon');

select * from finish();
rollback;
