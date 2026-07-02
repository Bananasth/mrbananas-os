-- =============================================================================
-- expiry-4-sweep-index.sql — Phase C F1: performance index for the expiry sweep. REVIEW ONLY.
-- Partial index matching app.expire_inventory_lots' predicate/order:
--   WHERE status='available' ... ORDER BY expires_at
-- Turns the every-5-min sweep from a partial-scan + sort into an index range scan.
-- Additive only — no functions, no schema, no Phase C file changed.
--
-- PRODUCTION-SAFE: built CONCURRENTLY so it does NOT lock reads/writes on the hot
-- inventory_lot table. CONCURRENTLY CANNOT run inside a transaction block — this file has
-- NO begin/commit; run the statement on its own. If the SQL editor wraps statements in a
-- transaction and errors, run this single line via psql / a direct connection instead.
-- =============================================================================
create index concurrently if not exists inventory_lot_expires_available_idx
  on public.inventory_lot (expires_at)
  where status = 'available';
