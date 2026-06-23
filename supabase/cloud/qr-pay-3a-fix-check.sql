-- =============================================================================
-- qr-pay-3a-fix-check.sql — Bring settlement_ledger's CHECK in line with the 12-value set.
-- Root cause: settlement_ledger was created (CREATE TABLE IF NOT EXISTS) with the original
-- 8-value check; the later extension never applied because the table already existed. This
-- drops and re-adds the constraint with all 12 outcomes. Existing rows (8-value subset) pass
-- validation. DDL is not blocked by the append-only row trigger. Additive in effect.
-- =============================================================================
begin;

alter table public.settlement_ledger
  drop constraint settlement_ledger_settlement_result_check;

alter table public.settlement_ledger
  add constraint settlement_ledger_settlement_result_check
  check (settlement_result in (
    'confirmed','duplicate_ignored','expired_rejected','amount_mismatch',
    'auth_failed','needs_review','error','recovered',
    'queue_failed','inventory_failed','prep_failed','print_failed'));

commit;
