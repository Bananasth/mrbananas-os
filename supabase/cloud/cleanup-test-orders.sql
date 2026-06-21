-- =============================================================================
-- cleanup-test-orders.sql  — PROPOSAL. Review, then run in the Supabase SQL Editor.
-- Deletes ALL current sale/order data for the seeded tenant (everything to date is
-- test data). Does NOT touch products, recipes, recipe versions, inventory items,
-- modifier groups/options, received stock, owner, branch, or workstation.
--
-- Transaction-wrapped: review the row counts, then COMMIT (or ROLLBACK to abort
-- with ZERO changes). Append-only guards are disabled only inside the txn and
-- re-enabled before commit.
--
-- ROLLBACK: while the transaction is open, `ROLLBACK;` undoes everything (no rows
-- deleted, triggers back on). After COMMIT the deletes are permanent — the orders
-- are gone (they were test data); products/recipes/stock are untouched, so the
-- shop config is intact and you can ring up fresh orders immediately.
-- =============================================================================
begin;

-- scope: the seeded tenant. (Add an AND created_at < '...' filter to keep recent orders.)
-- \set tenant '11111111-1111-1111-1111-111111111111'

-- 1) temporarily lift append-only guards so test invoices/gaps can be removed
alter table public.tax_invoice        disable trigger tax_invoice_append_only;
alter table public.invoice_number_gap disable trigger invoice_number_gap_append_only;

-- 2) invoices first (tax_invoice -> sales_order is RESTRICT; sales_order.invoice_id
--    -> tax_invoice is SET NULL, so removing invoices clears the link)
delete from public.invoice_number_gap where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from public.tax_invoice        where tenant_id = '11111111-1111-1111-1111-111111111111';

-- 3) the orders. CASCADE removes order_item -> (order_item_modifier,
--    order_item_ingredient) and payment automatically.
delete from public.sales_order where tenant_id = '11111111-1111-1111-1111-111111111111';

-- 4) (optional) reset the per-branch invoice counter so the next invoice is #1
update public.invoice_counter set next_no = 1
  where tenant_id = '11111111-1111-1111-1111-111111111111';

-- 5) restore the guards
alter table public.tax_invoice        enable trigger tax_invoice_append_only;
alter table public.invoice_number_gap enable trigger invoice_number_gap_append_only;

-- 6) sanity: everything below should now be 0 for the tenant
select
  (select count(*) from public.sales_order          where tenant_id = '11111111-1111-1111-1111-111111111111') as sales_orders,
  (select count(*) from public.order_item           where tenant_id = '11111111-1111-1111-1111-111111111111') as order_items,
  (select count(*) from public.payment              where tenant_id = '11111111-1111-1111-1111-111111111111') as payments,
  (select count(*) from public.tax_invoice          where tenant_id = '11111111-1111-1111-1111-111111111111') as tax_invoices,
  (select count(*) from public.order_item_modifier  where tenant_id = '11111111-1111-1111-1111-111111111111') as order_item_modifiers,
  (select count(*) from public.order_item_ingredient where tenant_id = '11111111-1111-1111-1111-111111111111') as order_item_ingredients;

commit;   -- <-- change to ROLLBACK; to abort

-- =============================================================================
-- OPTIONAL stock reversal — run SEPARATELY only if you want test deductions undone.
-- inventory_movement is an IMMUTABLE append-only ledger, so we do NOT delete the
-- 'sell' rows; instead we ADD compensating 'adjust' entries that put the stock back
-- (audit trail preserved). Alternative: just re-receive stock in /admin.
-- -----------------------------------------------------------------------------
-- begin;
--   insert into public.inventory_movement
--     (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id)
--   select tenant_id, branch_id, lot_id, item_id, -qty_delta, 'adjust',
--          'cleanup_reverse_sell', id
--   from public.inventory_movement
--   where tenant_id = '11111111-1111-1111-1111-111111111111'
--     and reason = 'sell' and ref_type = 'order_item';
--   -- review stock_on_hand, then:
-- commit;  -- or ROLLBACK;
-- =============================================================================
