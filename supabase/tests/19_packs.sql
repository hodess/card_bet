begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- simule un utilisateur authentifié : auth.uid() lit le claim 'sub'
create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Un pack minuscule, créé dans la transaction du test : il prouve que les
-- comptages sont bien par pack et non globaux (3 cartes ici, 83 en tout).
insert into packs (slug, sort_order) values ('mini', 99);
insert into cards (name, position, rating, pack) values
  ('Mini Un', 'NIN', 80, 'mini'),
  ('Mini Deux', 'NIN', 70, 'mini'),
  ('Mini Trois', 'NIN', 60, 'mini');

-- 0a. create_game lève NOT_AUTHENTICATED avant toute autre vérification quand
-- auth.uid() est nul ; on remet le claim JWT à vide (aucun test_login n'a
-- encore tourné dans cette transaction, mais on le fait explicitement pour ne
-- pas dépendre de l'état de départ de la session). Vérifié à la main que
-- `select set_config('request.jwt.claims', '', true); select auth.uid();`
-- rend bien null avant d'écrire l'assertion ci-dessous.
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select create_game('SansIdentite')$$,
  'P0001', 'NOT_AUTHENTICATED', 'create_game refuse un appel sans identité');

-- 0b. NICKNAME_REQUIRED juste après la garde d'identité, pour un utilisateur
-- authentifié mais sans profil (effective_nickname retombe alors sur le
-- pseudo transmis, ici vide).
select test_login('00000000-0000-0000-0000-000000000009');
select throws_ok(
  $$select create_game('')$$,
  'P0001', 'NICKNAME_REQUIRED', 'create_game refuse un pseudo vide sans profil');

select test_login('00000000-0000-0000-0000-000000000001');

-- 1. défaut de colonne
create temp table def as select (create_game('Defaut')->>'game_id')::uuid as gid;
select is((select pack from games where id = (select gid from def)), 'football',
  'football par défaut quand p_pack est absent');

-- 2-3. slug inconnu
select throws_ok(
  $$select create_game('Inconnu', null, null, null, null, null, 'private', 2, 'pokemon')$$,
  'P0001', 'UNKNOWN_PACK', 'create_game refuse un slug inconnu');
select throws_ok(
  format($$select update_game_settings(%L, null, null, null, null, null, null, 'pokemon')$$,
    (select gid from def)),
  'P0001', 'UNKNOWN_PACK', 'update_game_settings refuse un slug inconnu');

-- 4-5. changement de pack en salon
select lives_ok(
  format($$select update_game_settings(%L, null, null, null, null, null, null, 'naruto')$$,
    (select gid from def)),
  'l’hôte change le pack tant que la partie est en salon');
select is((select pack from games where id = (select gid from def)), 'naruto',
  'le nouveau pack est enregistré');

-- 6-7. start_game ne verse que les cartes du pack choisi
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games where id = (select gid from def)), 'Ami2');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from def));
select is(
  (select count(*)::int from game_cards gc join cards c on c.id = gc.card_id
   where gc.game_id = (select gid from def) and c.pack <> 'naruto'),
  0, 'aucune carte hors du pack choisi n’est versée');
select is(
  (select count(*)::int from game_cards where game_id = (select gid from def)),
  40, 'les 40 cartes du pack naruto sont versées');

-- 8-9. NOT_ENOUGH_CARDS se compte dans le pack, pas sur toute la table
select test_login('00000000-0000-0000-0000-000000000003');
create temp table petit as select
  (create_game('Petit', 3, null, null, null, null, 'private', 2, 'mini')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000004');
select join_game((select code from games where id = (select gid from petit)), 'Ami4');
select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select start_game(%L)$$, (select gid from petit)),
  'P0001', 'NOT_ENOUGH_CARDS',
  '2 joueurs × deck 3 dépassent les 3 cartes du pack mini');
select throws_ok(
  $$select create_game('PetitPublic', 3, null, null, null, null, 'public', 2, 'mini')$$,
  'P0001', 'NOT_ENOUGH_CARDS',
  'une publique trop grande pour son pack est refusée dès la création');

-- 10. le board expose le pack
select test_login('00000000-0000-0000-0000-000000000005');
create temp table pub as select
  (create_game('Public', null, null, null, null, null, 'public', 4, 'naruto')->>'game_id')::uuid as gid;
select is(
  (select e->>'pack' from json_array_elements(list_public_games()) e
   where (e->>'game_id')::uuid = (select gid from pub)),
  'naruto', 'le board expose le pack de la partie');

-- 11. les réglages d'une publique restent figés, pack compris
select throws_ok(
  format($$select update_game_settings(%L, null, null, null, null, null, null, 'football')$$,
    (select gid from pub)),
  'P0001', 'SETTINGS_LOCKED', 'le pack d’une publique est figé comme le reste');

-- 12. la revanche conserve le pack
-- record_match est déclenché par le passage à 'finished' et avale ses propres
-- erreurs (raise warning) : forcer le statut est sans danger ici.
-- rematch_game insère dans games : appeler la fonction et relire son résultat
-- dans la même requête est invisible pour son propre scan (règle MVCC intra-
-- requête), d'où le passage par une table temporaire comme pour def/petit/pub.
update games set status = 'finished' where id = (select gid from def);
select test_login('00000000-0000-0000-0000-000000000001');
create temp table revanche as select
  (rematch_game((select gid from def))->>'game_id')::uuid as gid;
select is((select pack from games where id = (select gid from revanche)), 'naruto',
  'la revanche repart dans le même pack');

-- 13. la clé étrangère protège la colonne même hors des fonctions
-- (le cast sur le code d'erreur lève l'ambiguïté entre throws_ok(text, text)
-- et throws_ok(text, int) : un littéral seul est de type unknown)
select throws_ok(
  format($$update games set pack = 'pokemon' where id = %L$$, (select gid from pub)),
  '23503'::text, null::text, 'un pack inexistant est rejeté par la clé étrangère');

-- 14-18. list_packs : volumes, plages de notes, ordre
select is(
  (select (e->>'card_count')::int from json_array_elements(list_packs()) e
   where e->>'slug' = 'naruto'),
  40, 'list_packs compte les 40 cartes de naruto');
select is(
  (select (e->>'min_rating')::int from json_array_elements(list_packs()) e
   where e->>'slug' = 'naruto'),
  82, 'list_packs expose la note minimale du pack naruto');
select is(
  (select (e->>'card_count')::int from json_array_elements(list_packs()) e
   where e->>'slug' = 'mini'),
  3, 'list_packs compte les 3 cartes du pack mini');
select is(
  (select (e->>'max_rating')::int from json_array_elements(list_packs()) e
   where e->>'slug' = 'mini'),
  80, 'list_packs expose la note maximale du pack');
select results_eq(
  $$select e->>'slug' from json_array_elements(list_packs()) with ordinality as a(e, n) order by n$$,
  array['football', 'naruto', 'mini'],
  'list_packs trie par sort_order');

select * from finish();
rollback;
