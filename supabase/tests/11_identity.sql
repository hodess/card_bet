begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

-- Alice a un profil : il fait foi sur le pseudo saisi
select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Alice');
create temp table priv as select create_game('Tricheur') as res;
select is((select nickname from players where seat = 0), 'Alice',
  'le pseudo du profil remplace le pseudo saisi');

-- Bob anonyme garde son pseudo libre
select test_signup('00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  format($$select join_game(%L, 'Bob')$$, (select res->>'code' from priv)),
  'join anonyme sans p_is_bot');
select is((select nickname from players where seat = 1), 'Bob', 'pseudo libre pour un anonyme');
select is((select is_bot from players where seat = 1), false, 'is_bot false par défaut');

-- board : host_username exposé (Carol a un profil, pseudo saisi vide accepté)
select test_signup('00000000-0000-0000-0000-000000000003');
select claim_username('Carol');
create temp table pub as select create_game('', p_visibility => 'public') as res;
select is(
  (select t->>'host_username' from json_array_elements(list_public_games()) t
   where t->>'game_id' = (select res->>'game_id' from pub)),
  'Carol', 'host_username = pseudo du profil');

-- hôte anonyme : host_username null
select test_signup('00000000-0000-0000-0000-000000000004', true);
create temp table pub2 as select create_game('Dave', p_visibility => 'public') as res;
select ok(
  (select t->>'host_username' from json_array_elements(list_public_games()) t
   where t->>'game_id' = (select res->>'game_id' from pub2)) is null,
  'hôte anonyme : host_username null');

-- le flag bot est enregistré
select test_signup('00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  format($$select join_game(%L, 'Botty', true)$$, (select res->>'code' from pub)),
  'join avec p_is_bot');
select is((select is_bot from players where nickname = 'Botty'), true, 'is_bot enregistré');

select * from finish();
rollback;
