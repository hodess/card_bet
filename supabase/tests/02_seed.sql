begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is((select count(*)::int from cards), 40, '40 cartes seedées');
select is((select count(*)::int from cards where rating not between 83 and 91), 0, 'notes entre 83 et 91');
select is((select count(*)::int from cards where position not in ('GK','DEF','MID','ATT')), 0, 'positions valides');

select * from finish();
rollback;
