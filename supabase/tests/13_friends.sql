begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
select test_signup('00000000-0000-0000-0000-000000000004');
select claim_username('Dave');

-- cycle demande → statut pending, renvoi idempotent
select test_signup('00000000-0000-0000-0000-000000000001');
select lives_ok($$select send_friend_request('Carl')$$, 'demande envoyée');
select is((select status from friendships), 'pending', 'statut pending');
select lives_ok($$select send_friend_request('Carl')$$, 'renvoi idempotent');
select is((select count(*)::int from friendships), 1, 'toujours une seule ligne');

-- demande croisée : auto-acceptation
select test_signup('00000000-0000-0000-0000-000000000003');
select lives_ok($$select send_friend_request('Alice')$$, 'demande croisée acceptée');
select is((select status from friendships), 'accepted', 'amitié établie');

-- suppression (unfriend)
select lives_ok($$select remove_friendship('Alice')$$, 'suppression');
select is((select count(*)::int from friendships), 0, 'ligne supprimée');

-- erreurs
select test_signup('00000000-0000-0000-0000-000000000001');
select throws_ok($$select send_friend_request('Alice')$$, 'P0001', 'SELF_FRIENDSHIP', 'auto-demande');
select throws_ok($$select send_friend_request('Inconnu')$$, 'P0001', 'PLAYER_NOT_FOUND', 'cible inconnue');
select test_signup('00000000-0000-0000-0000-000000000005', true);
select throws_ok($$select send_friend_request('Alice')$$, 'P0001', 'PROFILE_REQUIRED', 'sans profil');

-- acceptation : seul le destinataire peut accepter
select test_signup('00000000-0000-0000-0000-000000000004');
select send_friend_request('Alice');
select test_signup('00000000-0000-0000-0000-000000000003');
select throws_ok($$select accept_friend_request('Dave')$$, 'P0001', 'REQUEST_NOT_FOUND',
  'un tiers ne peut pas accepter');
select test_signup('00000000-0000-0000-0000-000000000001');
select lives_ok($$select accept_friend_request('Dave')$$, 'le destinataire accepte');
select is((select status from friendships where requester = '00000000-0000-0000-0000-000000000004'),
  'accepted', 'amitié Dave–Alice');
select throws_ok($$select send_friend_request('Dave')$$, 'P0001', 'ALREADY_FRIENDS', 'déjà amis');

-- RLS : un tiers ne voit pas la ligne Dave–Alice
select test_signup('00000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select count(*)::int from friendships), 0, 'invisible pour un tiers');
reset role;

select * from finish();
rollback;
