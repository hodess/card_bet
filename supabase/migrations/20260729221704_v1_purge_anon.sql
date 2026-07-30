select cron.schedule(
  'purge-anonymous-users',
  '30 4 * * *',
  $$delete from auth.users where is_anonymous and created_at < now() - interval '30 days'$$
);
