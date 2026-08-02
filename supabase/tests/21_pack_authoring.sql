begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

select * from finish();
rollback;
