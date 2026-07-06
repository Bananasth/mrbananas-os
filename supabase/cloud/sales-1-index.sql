-- =============================================================================
-- sales-1-index.sql — Phase E Sales: recognition-date index. REVIEW ONLY (DRAFT).
-- Sales are recognized at payment capture, and the read layer filters by
-- max(coalesce(payment.paid_at, payment.created_at)) → the useful index is on PAYMENT
-- (that is where paid_at lives), partial to captured rows (matches the "is a sale" rule).
--
--   IF payment.paid_at exists  ->  (branch_id, paid_at) where status='captured'   [this file]
--   ELSE fallback              ->  (branch_id, created_at) where status='captured'
--     (the views require payment.paid_at, so if it is absent both the views and this index
--      must switch to created_at together.)
--
-- PRODUCTION-SAFE: built CONCURRENTLY (no lock on the hot payment table). CONCURRENTLY CANNOT
-- run inside a transaction block — no begin/commit; run this statement on its own. If the SQL
-- editor wraps statements in a txn and errors, run this single line via psql.
-- =============================================================================
create index concurrently if not exists payment_branch_paid_captured_idx
  on public.payment (branch_id, paid_at)
  where status = 'captured';
