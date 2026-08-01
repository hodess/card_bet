begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::int from cards), 80, '80 cartes seedées');
select is((select count(*)::int from cards where rating not between 82 and 91), 0, 'notes entre 82 et 91');
select is((select count(*)::int from cards where position not in ('GK','DEF','MID','ATT','NIN','GEN','TAI','MED','INV')), 0, 'positions valides');
select is((select count(*)::int from packs), 2, 'deux packs');
select is((select sort_order from packs where slug = 'football'), 1, 'football en premier');
select is((select sort_order from packs where slug = 'naruto'), 2, 'naruto en second');
select is((select count(*)::int from cards where pack = 'football'), 40, '40 cartes football');
select is((select count(*)::int from cards where pack = 'naruto'), 40, '40 cartes naruto');
select is((select count(*)::int from cards where id between 1000 and 1999 and pack <> 'naruto'), 0,
  'la plage 1000-1999 est réservée à naruto');

select * from finish();
rollback;
