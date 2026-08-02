begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Restreint aux packs OFFICIELS (owner_id is null) : cards/packs sont
-- désormais du contenu utilisateur, et le moindre pack créé par une session
-- de dev ferait échouer à tort un test dont le sujet est l'intégrité du seed.
select is((select count(*)::int from cards where not retired and pack in ('football', 'naruto')),
  80, '80 cartes seedées');
select is((select count(*)::int from cards
           where not retired and pack in ('football', 'naruto') and rating not between 82 and 91),
  0, 'notes entre 82 et 91');
select is((select count(*)::int from cards
           where not retired and pack in ('football', 'naruto')
             and position not in ('GK','DEF','MID','ATT','NIN','GEN','TAI','MED','INV')),
  0, 'positions valides');
select is((select count(*)::int from packs where deleted_at is null and owner_id is null), 2, 'deux packs');
select is((select sort_order from packs where slug = 'football'), 1, 'football en premier');
select is((select sort_order from packs where slug = 'naruto'), 2, 'naruto en second');
select is((select count(*)::int from cards where pack = 'football' and not retired), 40, '40 cartes football');
select is((select count(*)::int from cards where pack = 'naruto' and not retired), 40, '40 cartes naruto');

select * from finish();
rollback;
