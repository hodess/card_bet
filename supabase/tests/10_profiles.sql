begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- simule un compte : ligne auth.users (FK de profiles) + claims JWT.
-- is_anonymous est le claim que Supabase met dans les vrais tokens.
create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, is_anonymous)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', anon)
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

-- un compte réclame un pseudo valide
select test_signup('00000000-0000-0000-0000-000000000001');
select lives_ok($$select claim_username('Romain_1')$$, 'claim valide');
select is((select username from profiles), 'Romain_1', 'profil créé');

-- un seul profil par compte
select throws_ok($$select claim_username('Autre')$$,
  'P0001', 'ALREADY_HAS_PROFILE', 'double claim interdit');

-- format
select test_signup('00000000-0000-0000-0000-000000000002');
select throws_ok($$select claim_username('ab')$$,
  'P0001', 'INVALID_USERNAME', 'trop court');
select throws_ok($$select claim_username('pseudo avec espaces')$$,
  'P0001', 'INVALID_USERNAME', 'caractères interdits');

-- unicité insensible à la casse
select throws_ok($$select claim_username('ROMAIN_1')$$,
  'P0001', 'USERNAME_TAKEN', 'unicité insensible à la casse');

-- les anonymes n'ont pas de profil
select test_signup('00000000-0000-0000-0000-000000000003', true);
select throws_ok($$select claim_username('Anonyme1')$$,
  'P0001', 'ANONYMOUS_NOT_ALLOWED', 'anonyme refusé');

-- lecture publique (RLS) : un autre authentifié voit le profil
select test_signup('00000000-0000-0000-0000-000000000004');
set local role authenticated;
select is((select count(*)::int from profiles), 1, 'profils lisibles par tout authentifié');
reset role;

select * from finish();
rollback;
