begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function test_signup(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
end $$;

-- profils
select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Alice');
select test_signup('00000000-0000-0000-0000-000000000003');
select claim_username('Carl');

-- deux cartes de notes différentes, choisies déterministiquement dans le seed
create temp table best as select id, rating from cards order by rating desc, id limit 1;
create temp table worst as select id, rating from cards order by rating asc, id limit 1;
select ok((select rating from best) > (select rating from worst), 'le seed a des notes distinctes');

-- fabrique une partie "jouée" prête à finir : 2 joueurs, 1 carte chacun
create function make_game(p_code text, n0 text, uid0 uuid, bank0 int, card0 int,
                          n1 text, uid1 uuid, bank1 int, card1 int, bot1 boolean) returns uuid
language plpgsql as $$
declare g_id uuid;
begin
  insert into games (code, status, deck_size) values (p_code, 'playing', 1) returning id into g_id;
  insert into players (game_id, auth_uid, nickname, seat, bankroll, is_bot)
  values (g_id, uid0, n0, 0, bank0, false), (g_id, uid1, n1, 1, bank1, bot1);
  insert into player_cards (game_id, player_id, card_id, price_paid)
  select g_id, p.id, case p.seat when 0 then card0 else card1 end, 10
  from players p where p.game_id = g_id;
  return g_id;
end $$;

-- A. Alice (profil, meilleure carte) bat Bob (anonyme) aux notes
select make_game('HISTA1', 'Alice_A', '00000000-0000-0000-0000-000000000001', 990, (select id from best),
                 'Bob_A', '00000000-0000-0000-0000-000000000002', 990, (select id from worst), false);
update games set status = 'finished' where code = 'HISTA1';
select is((select count(*)::int from matches), 1, 'A : un match enregistré');
select is((select count(*)::int from match_players), 2, 'A : deux lignes joueur');
select is((select result from match_players where nickname = 'Alice_A'), 'win', 'A : victoire aux notes');
select is((select result from match_players where nickname = 'Bob_A'), 'loss', 'A : défaite');
select ok((select profile_id from match_players where nickname = 'Bob_A') is null, 'A : anonyme sans profil');
select is((select profile_id from match_players where nickname = 'Alice_A'),
  '00000000-0000-0000-0000-000000000001'::uuid, 'A : profil relié');
select is((select count(*)::int from match_cards), 2, 'A : deck final copié');

-- transition uniquement : re-poser finished ne duplique pas
update games set status = 'finished' where code = 'HISTA1';
select is((select count(*)::int from matches), 1, 'trigger sur transition uniquement');

-- B. égalité parfaite entre deux profils
select make_game('HISTB1', 'Alice_B', '00000000-0000-0000-0000-000000000001', 990, (select id from best),
                 'Carl_B', '00000000-0000-0000-0000-000000000003', 990, (select id from best), false);
update games set status = 'finished' where code = 'HISTB1';
select is((select count(*)::int from match_players
           where result = 'draw' and nickname in ('Alice_B', 'Carl_B')), 2, 'B : draw des deux côtés');

-- C. départage à l'argent restant
select make_game('HISTC1', 'Alice_C', '00000000-0000-0000-0000-000000000001', 990, (select id from best),
                 'Carl_C', '00000000-0000-0000-0000-000000000003', 800, (select id from best), false);
update games set status = 'finished' where code = 'HISTC1';
select is((select result from match_players where nickname = 'Alice_C'), 'win', 'C : départage à l''argent');

-- D. aucun profil : rien d'écrit
select make_game('HISTD1', 'Zoe_D', '00000000-0000-0000-0000-000000000006', 990, (select id from best),
                 'Bob_D', '00000000-0000-0000-0000-000000000002', 990, (select id from worst), false);
update games set status = 'finished' where code = 'HISTD1';
select is((select count(*)::int from matches), 3, 'D : partie entre anonymes non enregistrée');

-- E. le flag bot est recopié
select make_game('HISTE1', 'Alice_E', '00000000-0000-0000-0000-000000000001', 990, (select id from best),
                 'Bot_E', '00000000-0000-0000-0000-000000000007', 990, (select id from worst), true);
update games set status = 'finished' where code = 'HISTE1';
select is((select is_bot from match_players where nickname = 'Bot_E'), true, 'E : is_bot recopié');
select is((select count(*)::int from matches), 4, 'E : match avec bot enregistré (Alice a un profil)');

select * from finish();
rollback;
