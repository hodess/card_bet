create extension if not exists pg_cron;

select cron.schedule(
  'purge-old-games',
  '0 4 * * *',
  $$delete from games where created_at < now() - interval '24 hours'$$
);
