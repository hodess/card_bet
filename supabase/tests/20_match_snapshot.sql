begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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

-- un pack jetable, pour pouvoir le réécrire sans toucher au seed.
-- packs.name n'existe qu'à partir de la tâche 2, qui reprendra cette ligne.
insert into packs (slug, sort_order) values ('jetable', 98);
insert into cards (name, position, rating, pack) values
  ('Avant', 'NIN', 70, 'jetable'),
  ('Autre', 'NIN', 60, 'jetable');

create temp table carte as select id from cards where pack = 'jetable' and name = 'Avant';

-- une partie prête à finir, sur le patron de 12_history.sql
insert into games (code, status, deck_size, pack) values ('SNAP01', 'playing', 1, 'jetable');
insert into players (game_id, auth_uid, nickname, seat, bankroll)
select id, '00000000-0000-0000-0000-000000000001', 'Alice', 0, 990 from games where code = 'SNAP01';
insert into players (game_id, auth_uid, nickname, seat, bankroll)
select id, '00000000-0000-0000-0000-000000000002', 'Bob', 1, 990 from games where code = 'SNAP01';
insert into player_cards (game_id, player_id, card_id, price_paid)
select g.id, p.id, (select id from carte), 10
from games g join players p on p.game_id = g.id
where g.code = 'SNAP01' and p.seat = 0;

update games set status = 'finished' where code = 'SNAP01';

-- 1-3. le contenu de la carte est recopié au moment de la partie
select is((select card_name from match_cards limit 1), 'Avant',
  'le nom de la carte est recopié dans match_cards');
select is((select card_position from match_cards limit 1), 'NIN',
  'la position est recopiée');
select is((select card_rating from match_cards limit 1), 70,
  'la note est recopiée');

-- 4-5. le pack est réécrit de fond en comble : l'historique ne bouge pas
update cards set name = 'Après', rating = 10 where id = (select id from carte);
select is((select card_name from match_cards limit 1), 'Avant',
  'renommer la carte ne réécrit pas l''historique');
select is((select card_rating from match_cards limit 1), 70,
  'changer la note ne réécrit pas l''historique');

-- 6. la carte peut disparaître : plus aucune clé étrangère ne la retient
delete from player_cards where card_id = (select id from carte);
delete from game_cards where card_id = (select id from carte);
select lives_ok(
  format($$delete from cards where id = %L$$, (select id from carte)),
  'une carte citée par l''historique peut être supprimée');

select * from finish();
rollback;
