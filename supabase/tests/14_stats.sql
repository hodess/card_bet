begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Alice');
select test_signup('00000000-0000-0000-0000-000000000003');
select claim_username('Carl');

-- 4 matchs fabriqués : Alice bat Carl, Alice-Carl nul, Alice bat un anonyme, Alice bat un bot
insert into matches (id, deck_size, start_bankroll) values
  ('10000000-0000-0000-0000-000000000001', 3, 1000),
  ('10000000-0000-0000-0000-000000000002', 3, 1000),
  ('10000000-0000-0000-0000-000000000003', 3, 1000),
  ('10000000-0000-0000-0000-000000000004', 3, 1000);
insert into match_players (match_id, profile_id, nickname, seat, score, money_left, result, is_bot) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Alice', 0, 250, 500, 'win', false),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Carl', 1, 240, 600, 'loss', false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Alice', 0, 200, 500, 'draw', false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Carl', 1, 200, 500, 'draw', false),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Alice', 0, 250, 500, 'win', false),
  ('10000000-0000-0000-0000-000000000003', null, 'Kevin', 1, 100, 500, 'loss', false),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Alice', 0, 250, 500, 'win', false),
  ('10000000-0000-0000-0000-000000000004', null, 'Botty', 1, 100, 500, 'loss', true);

-- appelé par Carl : stats d'Alice (seuls les 2 matchs entre profils comptent)
select test_signup('00000000-0000-0000-0000-000000000003');
create temp table res as select get_profile_stats('Alice') as j;
select is((select (j->'stats'->>'games')::int from res), 2, '2 matchs comptés');
select is((select (j->'stats'->>'wins')::int from res), 1, '1 victoire');
select is((select (j->'stats'->>'losses')::int from res), 0, '0 défaite');
select is((select (j->'stats'->>'draws')::int from res), 1, '1 nul');

-- face-à-face du point de vue de Carl
select is((select (j->'head_to_head'->>'games')::int from res), 2, 'h2h : 2 matchs');
select is((select (j->'head_to_head'->>'wins')::int from res), 0, 'h2h : 0 victoire pour Carl');
select is((select (j->'head_to_head'->>'losses')::int from res), 1, 'h2h : 1 défaite pour Carl');
select is((select (j->'head_to_head'->>'draws')::int from res), 1, 'h2h : 1 nul');

-- appelant sans profil : pas de face-à-face
select test_signup('00000000-0000-0000-0000-000000000005', true);
select ok((select get_profile_stats('Alice')->'head_to_head')::text = 'null',
  'h2h null sans profil appelant');

-- consulter son propre profil : pas de face-à-face
select test_signup('00000000-0000-0000-0000-000000000001');
select ok((select get_profile_stats('Alice')->'head_to_head')::text = 'null',
  'h2h null sur son propre profil');

-- insensible à la casse + inconnu
select is((select (get_profile_stats('alice')->'stats'->>'games')::int), 2, 'pseudo insensible à la casse');
select throws_ok($$select get_profile_stats('Inconnu')$$, 'P0001', 'PLAYER_NOT_FOUND', 'profil inconnu');

select * from finish();
rollback;
