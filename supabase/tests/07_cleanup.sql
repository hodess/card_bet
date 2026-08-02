begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::int from cron.job where jobname = 'purge-old-games'), 1, 'job cron présent');

-- comportement du DELETE du job
insert into games (code, created_at) values ('OLD001', now() - interval '25 hours');
insert into games (code) values ('NEW001');
delete from games where created_at < now() - interval '24 hours';
select is((select count(*)::int from games where code = 'OLD001'), 0, 'vieille partie purgée');
select is((select count(*)::int from games where code = 'NEW001'), 1, 'partie récente conservée');

-- purge_retired_cards : ce qui est encore référencé survit, le reste part
insert into packs (slug, sort_order, name, deleted_at)
values ('agonie', 97, 'Agonie', now());
insert into cards (name, position, rating, pack, retired) values
  ('Libre', 'NIN', 50, 'agonie', true),
  ('Retenue', 'NIN', 50, 'agonie', true);
insert into games (code, status, pack) values ('PURG01', 'playing', 'agonie');
insert into game_cards (game_id, card_id, seq)
select g.id, c.id, 1 from games g, cards c
where g.code = 'PURG01' and c.name = 'Retenue';

select purge_retired_cards();
select is((select count(*)::int from cards where pack = 'agonie'), 1,
  'la carte retirée que plus rien ne référence est supprimée');
select is((select count(*)::int from packs where slug = 'agonie'), 1,
  'le pack supprimé survit tant qu''il lui reste une carte');

delete from game_cards where game_id = (select id from games where code = 'PURG01');
delete from games where code = 'PURG01';
select purge_retired_cards();
select is((select count(*)::int from packs where slug = 'agonie'), 0,
  'le pack supprimé part une fois vidé et oublié des parties');

select * from finish();
rollback;
