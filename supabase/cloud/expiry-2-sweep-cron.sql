-- =============================================================================
-- expiry-2-sweep-cron.sql — Phase C: schedule the expiry sweep every 5 minutes. REVIEW ONLY.
-- Apply AFTER expiry-2-sweep.sql. Requires pg_cron. Separate file so it rolls back independently.
-- =============================================================================
create extension if not exists pg_cron;

select cron.unschedule('inventory-expiry-sweep')
 where exists (select 1 from cron.job where jobname = 'inventory-expiry-sweep');

select cron.schedule(
  'inventory-expiry-sweep',
  '*/5 * * * *',                                -- every 5 minutes
  $$ select app.expire_inventory_lots(1000); $$
);

-- Rollback: select cron.unschedule('inventory-expiry-sweep');
