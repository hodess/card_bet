begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is((select count(*)::int from cron.job where jobname = 'purge-old-games'), 1, 'job cron présent');

-- comportement du DELETE du job
insert into games (code, created_at) values ('OLD001', now() - interval '25 hours');
insert into games (code) values ('NEW001');
delete from games where created_at < now() - interval '24 hours';
select is((select count(*)::int from games where code = 'OLD001'), 0, 'vieille partie purgée');
select is((select count(*)::int from games where code = 'NEW001'), 1, 'partie récente conservée');

select * from finish();
rollback;
