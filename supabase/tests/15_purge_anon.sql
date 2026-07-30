begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is((select count(*)::int from cron.job where jobname = 'purge-anonymous-users'), 1,
  'job de purge des anonymes planifié');
select ok((select command from cron.job where jobname = 'purge-anonymous-users')
  like '%is_anonymous%', 'la purge cible bien les anonymes');

select * from finish();
rollback;
