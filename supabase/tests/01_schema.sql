begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public', 'cards', 'table cards');
select has_table('public', 'games', 'table games');
select has_table('public', 'players', 'table players');
select has_table('public', 'game_cards', 'table game_cards');
select has_table('public', 'auctions', 'table auctions');
select has_table('public', 'player_cards', 'table player_cards');

-- game_cards doit être illisible pour un client authentifié (secret du tirage)
insert into games (id, code) values ('aaaaaaaa-0000-0000-0000-000000000000', 'TEST01');
insert into cards (name, position, rating) values ('Testeur', 'BU', 80);
insert into game_cards (game_id, card_id, seq)
select 'aaaaaaaa-0000-0000-0000-000000000000', id, 1 from cards limit 1;

set local role authenticated;
select is((select count(*)::int from game_cards), 0, 'game_cards illisible par le client');
select throws_ok(
  $$insert into games (code) values ('HACK01')$$,
  '42501', null,
  'écriture directe interdite sur games'
);
reset role;

select * from finish();
rollback;
