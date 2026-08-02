begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

-- payload de référence, décliné ensuite en variantes invalides
create function payload(patch jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$
  select '{
    "name": "Pokémon Gen 1",
    "emoji": "⚡",
    "description": "Les 151 originaux.",
    "positions": { "FEU": "Feu", "EAU": "Eau" },
    "cards": [
      { "name": "Dracaufeu", "position": "FEU", "rating": 92 },
      { "name": "Tortank",   "position": "EAU", "rating": 88 }
    ]
  }'::jsonb || patch;
$$;

-- 1. slugify
select is(slugify('Pokémon Gen 1 !!'), 'pokemon-gen-1', 'slugify déplie, minusculise et tire');

-- 2. un payload correct passe
select lives_ok($$select validate_pack_payload(payload())$$, 'un payload correct est accepté');

-- 3-9. chaque règle est gardée
select throws_ok($$select validate_pack_payload(payload('{"name": ""}'))$$,
  'P0001', 'INVALID_PACK', 'nom vide refusé');
select throws_ok($$select validate_pack_payload(payload('{"auteur": "moi"}'))$$,
  'P0001', 'INVALID_PACK', 'champ inconnu au niveau du pack refusé');
select throws_ok($$select validate_pack_payload(payload('{"positions": {}}'))$$,
  'P0001', 'INVALID_PACK', 'vocabulaire de positions vide refusé');
select throws_ok(
  $$select validate_pack_payload(payload('{"cards": [{"name":"A","position":"XXX","rating":50},{"name":"B","position":"FEU","rating":50}]}'))$$,
  'P0001', 'INVALID_PACK', 'position hors du vocabulaire refusée');
select throws_ok(
  $$select validate_pack_payload(payload('{"cards": [{"name":"A","position":"FEU","rating":100},{"name":"B","position":"FEU","rating":50}]}'))$$,
  'P0001', 'INVALID_PACK', 'note hors 1–99 refusée');
select throws_ok(
  $$select validate_pack_payload(payload('{"cards": [{"name":"A","position":"FEU","rating":50},{"name":"A","position":"FEU","rating":60}]}'))$$,
  'P0001', 'INVALID_PACK', 'deux cartes de même nom refusées');
select throws_ok(
  $$select validate_pack_payload(payload('{"cards": [{"name":"A","position":"FEU","rating":50}]}'))$$,
  'P0001', 'INVALID_PACK', 'un pack d''une seule carte refusé');

-- 10-12. installation d'un pack officiel
select install_official_pack(payload(), 'pokemon', 3);
select is((select name from packs where slug = 'pokemon'), 'Pokémon Gen 1',
  'le pack officiel est créé avec son nom');
select ok((select owner_id is null and visibility = 'public' from packs where slug = 'pokemon'),
  'un pack officiel n''a pas d''auteur et est public');
select is((select count(*)::int from cards where pack = 'pokemon' and not retired), 2,
  'les deux cartes sont insérées');

-- 13-14. réinstaller remplace sans laisser de trace quand rien ne référence
select install_official_pack(payload('{"cards": [{"name":"Pikachu","position":"FEU","rating":78},{"name":"Raichu","position":"FEU","rating":81}]}'),
  'pokemon', 3);
select is((select count(*)::int from cards where pack = 'pokemon'), 2,
  'les anciennes cartes non référencées sont supprimées, pas accumulées');
select is((select string_agg(name, ',' order by name) from cards where pack = 'pokemon' and not retired),
  'Pikachu,Raichu', 'le nouveau jeu de cartes a remplacé l''ancien');

-- 15-16. un champ obligatoire ABSENT, et pas seulement invalide. Sans garde de
-- présence, p->'cards' vaut NULL SQL et toutes les comparaisons qui suivent
-- s'évaluent à NULL, donc à faux : le pack passait avec zéro carte.
select throws_ok(
  $$select validate_pack_payload('{"name":"X","positions":{"A":"a"}}'::jsonb)$$,
  'P0001', 'INVALID_PACK', 'cards absent est refusé, pas seulement cards invalide');
select throws_ok(
  $$select validate_pack_payload('{"positions":{"A":"a"},"cards":[{"name":"X","position":"A","rating":50},{"name":"Y","position":"A","rating":50}]}'::jsonb)$$,
  'P0001', 'INVALID_PACK', 'name absent est refusé avec INVALID_PACK, pas par la contrainte not null');

-- 17. le cas le plus sensible de replace_pack_cards : une carte qu'une partie
-- vivante référence encore ne peut pas être supprimée, elle survit en retired.
insert into games (code, status, pack) values ('CORE01', 'playing', 'pokemon');
insert into game_cards (game_id, card_id, seq)
select g.id, c.id, 1 from games g, cards c
where g.code = 'CORE01' and c.pack = 'pokemon' and c.name = 'Pikachu';
select install_official_pack(payload(), 'pokemon', 3);
select is(
  (select count(*)::int from cards where pack = 'pokemon' and retired), 1,
  'la carte retenue par une partie en cours survit en retired');

-- ---------- packs de joueurs ----------
select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Hodess');
select test_signup('00000000-0000-0000-0000-000000000002');
select claim_username('Autre');

-- 18-20. création
select test_signup('00000000-0000-0000-0000-000000000001');
create temp table p1 as select save_pack(null, payload(), 'private')->>'slug' as slug;
select is((select slug from p1), 'hodess~pokemon-gen-1',
  'le slug est namespacé par le pseudo');
select is((select owner_id from packs where slug = (select slug from p1)),
  '00000000-0000-0000-0000-000000000001'::uuid, 'l''auteur est enregistré');
select is((select count(*)::int from cards where pack = (select slug from p1) and not retired), 2,
  'les cartes du pack sont insérées');

-- 21. p_visibility explicitement NULL (pas seulement absent) : `NULL not in (...)`
-- s'évalue à NULL, pas à vrai, et laisserait passer une contrainte de colonne
-- brute sans ce garde-fou.
select throws_ok(
  $$select save_pack(null, payload(), null)$$,
  'P0001', 'INVALID_SETTINGS', 'save_pack refuse une visibilité explicitement NULL');

-- 22. collision de slug : suffixe numérique
create temp table p2 as select save_pack(null, payload(), 'public')->>'slug' as slug;
select is((select slug from p2), 'hodess~pokemon-gen-1-2',
  'un second pack de même nom est suffixé');

-- 23-24. mise à jour par le propriétaire, refus pour un tiers
select lives_ok(
  format($$select save_pack(%L, payload('{"name": "Pokémon renommé"}'), 'private')$$,
    (select slug from p1)),
  'le propriétaire met son pack à jour');
select is((select name from packs where slug = (select slug from p1)), 'Pokémon renommé',
  'le nouveau nom est enregistré, le slug ne bouge pas');

-- 25. un tiers ne peut pas écrire dans le pack d'un autre
select test_signup('00000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select save_pack(%L, payload(), 'public')$$, (select slug from p1)),
  'P0001', 'NOT_PACK_OWNER', 'un tiers ne peut pas modifier le pack d''un autre');

-- 26. même garde sur set_pack_visibility, jusqu'ici non couverte
select throws_ok(
  format($$select set_pack_visibility(%L, 'public')$$, (select slug from p1)),
  'P0001', 'NOT_PACK_OWNER', 'un tiers ne peut pas changer la visibilité du pack d''un autre');

-- 27. même garde sur delete_pack, jusqu'ici non couverte
select throws_ok(
  format($$select delete_pack(%L)$$, (select slug from p1)),
  'P0001', 'NOT_PACK_OWNER', 'un tiers ne peut pas supprimer le pack d''un autre');

-- 28. payload invalide refusé même si le client l'a laissé passer
select test_signup('00000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select save_pack(null, payload('{"cards": [{"name":"A","position":"NOPE","rating":50},{"name":"B","position":"FEU","rating":50}]}'), 'public')$$,
  'P0001', 'INVALID_PACK', 'le serveur revalide le payload');

-- 29. quota
insert into packs (slug, owner_id, name, positions, visibility)
select 'hodess~bourrage-' || i, '00000000-0000-0000-0000-000000000001',
       'Bourrage ' || i, '{"X":"X"}'::jsonb, 'private'
from generate_series(1, 18) i;
select throws_ok(
  $$select save_pack(null, payload('{"name": "De trop"}'), 'private')$$,
  'P0001', 'TOO_MANY_PACKS', 'le quota de packs par compte est appliqué');
delete from packs where slug like 'hodess~bourrage-%';

-- 30. set_pack_visibility refuse aussi une visibilité explicitement NULL
select throws_ok(
  format($$select set_pack_visibility(%L, null)$$, (select slug from p1)),
  'P0001', 'INVALID_SETTINGS', 'set_pack_visibility refuse une visibilité explicitement NULL');

-- 31. bascule de visibilité
select set_pack_visibility((select slug from p1), 'public');
select is((select visibility from packs where slug = (select slug from p1)), 'public',
  'la visibilité bascule sans re-sauver le JSON');

-- 32. suppression logique
select delete_pack((select slug from p1));
select ok((select deleted_at is not null from packs where slug = (select slug from p1)),
  'delete_pack pose deleted_at au lieu de supprimer la ligne');

-- 33. le rattrapage de collision fonctionne même quand le while exists voit une
-- ligne posée directement en base (simule la fenêtre de course entre lecture
-- et écriture d'un double-clic) : on obtient un slug suffixé, jamais une erreur
-- brute de contrainte unique.
insert into packs (slug, owner_id, name, positions, visibility)
values ('hodess~pack-de-course', '00000000-0000-0000-0000-000000000001',
        'Pack de course', '{"X":"X"}'::jsonb, 'private');
create temp table p4 as
  select save_pack(null, payload('{"name": "Pack de course"}'), 'private')->>'slug' as slug;
select isnt((select slug from p4), 'hodess~pack-de-course',
  'une collision de slug déjà en base est rattrapée par un suffixe, pas par une erreur');

-- 34. list_packs : les officiels, les publics et les miens ; pas ceux des autres
select test_signup('00000000-0000-0000-0000-000000000002');
create temp table p3 as select save_pack(null, payload('{"name": "Secret"}'), 'private')->>'slug' as slug;
select test_signup('00000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from json_array_elements(list_packs()) e
   where e->>'slug' = (select slug from p3)),
  0, 'le pack privé d''un autre n''apparaît pas dans list_packs');

-- 35. et, positivement, les officiels et le pack public de l'appelant y sont bien
select is(
  (select count(*)::int from json_array_elements(list_packs()) e
   where e->>'slug' in ('football', 'naruto', (select slug from p2))),
  3, 'les packs officiels et le pack public de l''appelant apparaissent dans list_packs');

-- ---------- RLS et règles d'hôte ----------
-- p3 est le pack PRIVÉ du joueur 2, créé au test 34. Son slug est déterministe
-- (pseudo « Autre » + nom « Secret »), et le test 15 a déjà épinglé la règle de
-- génération : on l'écrit donc en clair plutôt que de lire une table temporaire.
-- C'est nécessaire, pas cosmétique : sous `set local role authenticated`, le
-- rôle n'a aucun droit sur les tables temporaires de la session.

-- 36-37. un tiers ne voit ni le pack privé ni ses cartes
select test_signup('00000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from packs where slug = 'autre~secret'), 0,
  'le pack privé d''un autre est invisible');
select is((select count(*)::int from cards where pack = 'autre~secret'), 0,
  'les cartes d''un pack privé sont invisibles');
reset role;

-- 38. l'auteur, lui, voit ses cartes
select test_signup('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select is((select count(*)::int from cards where pack = 'autre~secret'), 2,
  'l''auteur voit les cartes de son pack privé');
reset role;

-- 39. un pack privé d'autrui est refusé à la création de partie
select test_signup('00000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select create_game('Hodess', null, null, null, null, null, 'private', 2, 'autre~secret')$$,
  'P0001', 'PACK_NOT_OWNED_BY_HOST',
  'on ne peut pas héberger une partie dans le pack privé d''un autre');

-- 40. l'auteur peut, lui
select test_signup('00000000-0000-0000-0000-000000000002');
create temp table gpriv as select
  (create_game('Autre', 1, null, null, null, null, 'private', 2,
               'autre~secret')->>'game_id')::uuid as gid;
select is((select pack from games where id = (select gid from gpriv)), 'autre~secret',
  'l''auteur héberge dans son propre pack privé');

-- 41. la revanche lancée par un autre retombe sur le pack par défaut
select test_signup('00000000-0000-0000-0000-000000000001');
select join_game((select code from games where id = (select gid from gpriv)), 'Hodess');
update games set status = 'finished' where id = (select gid from gpriv);
create temp table revanche as select
  (rematch_game((select gid from gpriv))->>'game_id')::uuid as gid;
select is((select pack from games where id = (select gid from revanche)), 'football',
  'la revanche d''un non-auteur repart sur le pack par défaut');

-- 42. démarrer un salon dont le pack a été supprimé
select test_signup('00000000-0000-0000-0000-000000000002');
create temp table gsup as select
  (create_game('Autre', 1, null, null, null, null, 'private', 2,
               'autre~secret')->>'game_id')::uuid as gid;
select test_signup('00000000-0000-0000-0000-000000000001');
select join_game((select code from games where id = (select gid from gsup)), 'Hodess');
select test_signup('00000000-0000-0000-0000-000000000002');
select delete_pack('autre~secret');
select throws_ok(
  format($$select start_game(%L)$$, (select gid from gsup)),
  'P0001', 'PACK_DELETED', 'un salon dont le pack a été supprimé ne démarre pas');

-- 43. la seule raison d'être de la seconde clause de cards_read : un co-joueur
-- d'une partie en cours sur un pack privé lit ses cartes. Le pack 'autre~secret'
-- a déjà été supprimé au test 42 : ça montre au passage que cette clause ne
-- conditionne pas la présence en partie à deleted_at is null (cf. packs_read).
insert into games (code, status, pack) values ('PRIVCO', 'playing', 'autre~secret');
insert into players (game_id, auth_uid, nickname, seat, bankroll)
select id, '00000000-0000-0000-0000-000000000001'::uuid, 'Hodess', 1, 1000
from games where code = 'PRIVCO';
select test_signup('00000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from cards where pack = 'autre~secret'), 2,
  'un co-joueur d''une partie en cours sur pack privé voit les cartes de ce pack');
reset role;

-- 44. la branche positive de rematch_game, jusqu'ici non couverte : une
-- revanche relancée par l'auteur garde son pack privé. On en crée un nouveau,
-- actif, plutôt que de réutiliser 'autre~secret' déjà supprimé au test 42.
select test_signup('00000000-0000-0000-0000-000000000002');
create temp table p5 as
  select save_pack(null, payload('{"name": "Secret Bis"}'), 'private')->>'slug' as slug;
create temp table gpriv2 as select
  (create_game('Autre', 1, null, null, null, null, 'private', 2,
               (select slug from p5))->>'game_id')::uuid as gid;
update games set status = 'finished' where id = (select gid from gpriv2);
create temp table revanche2 as select
  (rematch_game((select gid from gpriv2))->>'game_id')::uuid as gid;
select is((select pack from games where id = (select gid from revanche2)), (select slug from p5),
  'la revanche relancée par l''auteur garde son pack privé');

-- 45-46. le snapshot d'un match joué sur pack privé (match_cards) n'est
-- lisible que par ses joueurs. deck_size = 7 est une sentinelle unique dans ce
-- fichier : elle permet de retrouver le match sous `set local role
-- authenticated` sans passer par games (RLS restrictive, cf. is_player) ni par
-- une table temporaire (inaccessible sous ce rôle).
insert into games (code, status, pack, deck_size)
values ('PRIVM1', 'playing', (select slug from p5), 7);
insert into players (game_id, auth_uid, nickname, seat, bankroll)
select id, '00000000-0000-0000-0000-000000000002'::uuid, 'Autre', 0, 990 from games where code = 'PRIVM1'
union all
select id, '00000000-0000-0000-0000-000000000001'::uuid, 'Hodess', 1, 990 from games where code = 'PRIVM1';
insert into player_cards (game_id, player_id, card_id, price_paid)
select p.game_id, p.id, c.id, 10
from players p
join games g on g.id = p.game_id
join cards c on c.pack = g.pack
where g.code = 'PRIVM1'
  and ((p.seat = 0 and c.name = 'Dracaufeu') or (p.seat = 1 and c.name = 'Tortank'));
update games set status = 'finished' where code = 'PRIVM1';

select test_signup('00000000-0000-0000-0000-000000000003');
set local role authenticated;
select is(
  (select count(*)::int from match_cards where match_id = (select id from matches where deck_size = 7)),
  0, 'un tiers ne voit aucune carte du snapshot d''un match joué sur pack privé');
reset role;

select test_signup('00000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(
  (select count(*)::int from match_cards where match_id = (select id from matches where deck_size = 7)),
  2, 'un participant voit les cartes du snapshot d''un match joué sur pack privé');
reset role;

select * from finish();
rollback;
