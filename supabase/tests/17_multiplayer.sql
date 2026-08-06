begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- simule un utilisateur authentifié : auth.uid() lit le claim 'sub'
create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : une partie privée de 4 places
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select
  (create_game('Romain', null, null, null, null, null, 'private', 4)->>'game_id')::uuid as gid;

select is((select max_players from games where id = (select gid from t)), 4,
  'capacité 4 enregistrée à la création');

select throws_ok(
  $$select create_game('Trop', null, null, null, null, null, 'private', 9)$$,
  'P0001', 'INVALID_SETTINGS', 'capacité 9 refusée');
select throws_ok(
  $$select create_game('TropPeu', null, null, null, null, null, 'private', 1)$$,
  'P0001', 'INVALID_SETTINGS', 'capacité 1 refusée');

-- trois joueurs rejoignent : sièges 1, 2, 3
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games where id = (select gid from t)), 'Ami2');
select test_login('00000000-0000-0000-0000-000000000003');
select join_game((select code from games where id = (select gid from t)), 'Ami3');
select test_login('00000000-0000-0000-0000-000000000004');
select join_game((select code from games where id = (select gid from t)), 'Ami4');

select results_eq(
  format($$select seat from players where game_id = %L order by seat$$, (select gid from t)),
  array[0, 1, 2, 3],
  'sièges 0..3 attribués dans l''ordre d''arrivée');

select test_login('00000000-0000-0000-0000-000000000005');
select throws_ok(
  format($$select join_game(%L, 'Cinquieme')$$,
    (select code from games where id = (select gid from t))),
  'P0001', 'GAME_FULL', 'refuse au-delà de max_players');

-- l'hôte ne peut pas descendre la capacité sous l'effectif présent
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select update_game_settings(%L, null, null, null, null, null, 2)$$, (select gid from t)),
  'P0001', 'MAX_PLAYERS_TOO_LOW', 'capacité sous l''effectif refusée');
select lives_ok(
  format($$select update_game_settings(%L, null, null, null, null, null, 6)$$, (select gid from t)),
  'capacité portée à 6');
select is((select max_players from games where id = (select gid from t)), 6, 'capacité 6 enregistrée');

-- démarrage à 4 joueurs
select lives_ok(format($$select start_game(%L)$$, (select gid from t)), 'démarrage à 4 joueurs');
select is(
  (select forced_bidder from auctions where game_id = (select gid from t) and seq = 1),
  (select id from players where game_id = (select gid from t) and seat = 0),
  'enchère 1 : ouverture forcée par le siège 0');

-- rotation sur 4 sièges (le temps est simulé : délai et plafond dépassés)
update auctions set last_bid_at = now() - interval '90 seconds',
                    opened_at = now() - interval '90 seconds'
where game_id = (select gid from t) and seq = 1;
select close_auction((select gid from t));
select is(
  (select forced_bidder from auctions where game_id = (select gid from t) and seq = 2),
  (select id from players where game_id = (select gid from t) and seat = 1),
  'enchère 2 : ouverture forcée par le siège 1');

update auctions set last_bid_at = now() - interval '90 seconds',
                    opened_at = now() - interval '90 seconds'
where game_id = (select gid from t) and seq = 2;
select close_auction((select gid from t));
select is(
  (select forced_bidder from auctions where game_id = (select gid from t) and seq = 3),
  (select id from players where game_id = (select gid from t) and seat = 2),
  'enchère 3 : ouverture forcée par le siège 2');

-- le siège 3 complète son deck : la rotation doit le sauter et revenir au siège 0
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t),
       (select id from players where game_id = (select gid from t) and seat = 3),
       id, 0
from cards
where id not in (select card_id from player_cards where game_id = (select gid from t))
limit 3;
update auctions set last_bid_at = now() - interval '90 seconds',
                    opened_at = now() - interval '90 seconds'
where game_id = (select gid from t) and seq = 3;
select close_auction((select gid from t));
select is(
  (select forced_bidder from auctions where game_id = (select gid from t) and seq = 4),
  (select id from players where game_id = (select gid from t) and seat = 0),
  'enchère 4 : siège 3 (deck plein) sauté, retour au siège 0');

-- pack de 40 cartes : 5 joueurs × deck de 10 = 50, refusé au lancement
select test_login('00000000-0000-0000-0000-000000000001');
create temp table big as select
  (create_game('Gros', 10, null, null, null, null, 'private', 6)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games where id = (select gid from big)), 'B2');
select test_login('00000000-0000-0000-0000-000000000003');
select join_game((select code from games where id = (select gid from big)), 'B3');
select test_login('00000000-0000-0000-0000-000000000004');
select join_game((select code from games where id = (select gid from big)), 'B4');
select test_login('00000000-0000-0000-0000-000000000005');
select join_game((select code from games where id = (select gid from big)), 'B5');
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select start_game(%L)$$, (select gid from big)),
  'P0001', 'NOT_ENOUGH_CARDS',
  '5 joueurs × deck 10 dépassent les 40 cartes du pack football');

-- un joueur seul ne lance pas
create temp table solo as select (create_game('Seul')->>'game_id')::uuid as gid;
select throws_ok(
  format($$select start_game(%L)$$, (select gid from solo)),
  'P0001', 'NOT_ENOUGH_PLAYERS', 'il faut au moins 2 joueurs');

-- board public : capacité exposée, partie pleine masquée
create temp table pub as select
  (create_game('Public', null, null, null, null, null, 'public', 4)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game_by_id((select gid from pub), 'P2');
select is(
  (select (e->>'max_players')::int from json_array_elements(list_public_games()) e
   where (e->>'game_id')::uuid = (select gid from pub)),
  4, 'le board expose la capacité');
select is(
  (select (e->>'player_count')::int from json_array_elements(list_public_games()) e
   where (e->>'game_id')::uuid = (select gid from pub)),
  2, 'le board compte 2 joueurs sur 4');
select test_login('00000000-0000-0000-0000-000000000003');
select join_game_by_id((select gid from pub), 'P3');
select test_login('00000000-0000-0000-0000-000000000004');
select join_game_by_id((select gid from pub), 'P4');
select is(
  (select count(*)::int from json_array_elements(list_public_games()) e
   where (e->>'game_id')::uuid = (select gid from pub)),
  0, 'une partie pleine disparaît du board');

-- une publique fige ses réglages après création : une capacité que le pack ne
-- peut pas servir l'enfermerait dans une partie indémarrable. Sur une privée le
-- même excès reste rattrapable par update_game_settings, start_game tranchant
-- sur l'effectif réel.
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select create_game('GrosPublic', 6, null, null, null, null, 'public', 8)$$,
  'P0001', 'NOT_ENOUGH_CARDS',
  'publique deck 6 / 8 places refusée à la création (football n''a que 40 cartes)');
select lives_ok(
  $$select create_game('GrosPrive', 6, null, null, null, null, 'private', 8)$$,
  'privée avec les mêmes réglages acceptée (rattrapable par start_game)');

-- fin de partie à 3 joueurs : les cartes du dernier joueur incomplet s'adjugent
-- une par une jusqu'à finished, et
-- record_match sur un match à 3. Un profil est nécessaire pour que record_match
-- écrive (cf. 12_history.sql) : on reprend son motif test_signup + claim_username
-- pour le siège 0.
select test_login('00000000-0000-0000-0000-000000000010');
insert into auth.users (id, instance_id, aud, role)
values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated')
on conflict (id) do nothing;
select claim_username('Trois1');
create temp table trois as select
  (create_game('Trois1', 2, null, null, null, null, 'private', 3)->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000011');
select join_game((select code from games where id = (select gid from trois)), 'Trois2');
select test_login('00000000-0000-0000-0000-000000000012');
select join_game((select code from games where id = (select gid from trois)), 'Trois3');
select test_login('00000000-0000-0000-0000-000000000010');
select start_game((select gid from trois));

-- déroule la partie jusqu'à sa fin ; borné pour qu'un bug de rotation ne fasse
-- pas tourner le test à l'infini
do $$
declare
  i int := 0;
begin
  while (select status from games where id = (select gid from trois)) <> 'finished'
        and i < 50 loop
    update auctions set last_bid_at = now() - interval '90 seconds',
                        opened_at = now() - interval '90 seconds'
    where game_id = (select gid from trois) and status = 'open';
    perform close_auction((select gid from trois));
    i := i + 1;
  end loop;
end $$;

select is((select status from games where id = (select gid from trois)), 'finished',
  'partie à 3 joueurs terminée en déroulant les cartes du dernier joueur incomplet');
select is(
  (select count(*)::int from players p where p.game_id = (select gid from trois)
     and (select count(*) from player_cards pc where pc.player_id = p.id) = 2),
  3, 'les trois joueurs ont un deck plein (2 cartes chacun)');
select is(
  (select count(*)::int from match_players mp
     join matches m on m.id = mp.match_id
     where m.game_id = (select gid from trois)),
  3, 'match_players compte 3 lignes pour ce match à 3');

select * from finish();
rollback;
