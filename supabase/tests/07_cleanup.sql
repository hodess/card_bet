begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is((select count(*)::int from cron.job where jobname = 'purge-old-games'), 1, 'job cron présent');

-- comportement du DELETE du job
insert into games (code, created_at) values ('OLD001', now() - interval '25 hours');
insert into games (code) values ('NEW001');
delete from games where created_at < now() - interval '24 hours';
select is((select count(*)::int from games where code = 'OLD001'), 0, 'vieille partie purgée');
select is((select count(*)::int from games where code = 'NEW001'), 1, 'partie récente conservée');

-- purge_retired_cards : chemin de PRODUCTION complet, save_pack -> delete_pack
-- -> purge_retired_cards. Fabriquer des cartes `retired = true` à la main (ce
-- que faisait cette suite avant) masquait le vrai bug : delete_pack ne posait
-- `retired` sur aucune carte, donc un pack supprimé par le chemin réel ne
-- perdait jamais ses cartes, et packs ne perdait jamais sa ligne.
create function test_signup(uid uuid) returns void language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select test_signup('00000000-0000-0000-0000-000000000001');
select claim_username('Agonie');
create temp table pck as select save_pack(null, '{
  "name": "Agonie",
  "positions": { "NIN": "Ninja" },
  "cards": [
    { "name": "Libre",    "position": "NIN", "rating": 50 },
    { "name": "Retenue",  "position": "NIN", "rating": 50 }
  ]
}'::jsonb, 'private')->>'slug' as slug;

-- une partie vivante retient une des deux cartes
insert into games (code, status, pack) values ('PURG01', 'playing', (select slug from pck));
insert into game_cards (game_id, card_id, seq)
select g.id, c.id, 1 from games g, cards c
where g.code = 'PURG01' and c.pack = (select slug from pck) and c.name = 'Retenue';

select delete_pack((select slug from pck));

select purge_retired_cards();
select is((select count(*)::int from cards where pack = (select slug from pck)), 1,
  'la carte que plus rien ne référence est supprimée, celle que la partie retient survit');
select ok((select retired from cards where pack = (select slug from pck)),
  'la carte survivante est bien retirée (retired), pas laissée active');
select is((select count(*)::int from packs where slug = (select slug from pck)), 1,
  'le pack supprimé survit tant qu''il lui reste une carte retenue par une partie vivante');

delete from game_cards where game_id = (select id from games where code = 'PURG01');
delete from games where code = 'PURG01';
select purge_retired_cards();
select is((select count(*)::int from cards where pack = (select slug from pck)), 0,
  'plus aucune carte du pack supprimé une fois la partie oubliée');
select is((select count(*)::int from packs where slug = (select slug from pck)), 0,
  'le pack supprimé part une fois vidé et oublié des parties');

select * from finish();
rollback;
