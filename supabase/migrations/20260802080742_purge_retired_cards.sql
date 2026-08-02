-- Troisième job de ménage, à côté de purge-old-games et purge-anonymous-users.
-- replace_pack_cards supprime déjà ce qu'il peut à chaud ; ce job ramasse ce
-- qui était encore référencé par une partie vivante à ce moment-là, une fois la
-- partie purgée. La fonction est extraite pour être testable sans pg_cron.
create function purge_retired_cards() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from cards c
  where c.retired
    and not exists (select 1 from game_cards   g  where g.card_id  = c.id)
    and not exists (select 1 from player_cards pc where pc.card_id = c.id)
    and not exists (select 1 from auctions     a  where a.card_id  = c.id);

  -- un pack supprimé ne part qu'une fois vidé de ses cartes et oublié des parties
  delete from packs p
  where p.deleted_at is not null
    and not exists (select 1 from cards c where c.pack = p.slug)
    and not exists (select 1 from games g where g.pack = p.slug);
end $$;

-- Fonction de ménage : appelée par pg_cron seul, jamais par un client.
revoke execute on function purge_retired_cards() from public, anon, authenticated;

select cron.schedule('purge-retired-cards', '15 4 * * *',
  $$select purge_retired_cards()$$);
