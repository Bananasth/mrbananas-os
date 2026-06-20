-- =============================================================================
-- public-rpc-wrappers.sql
-- -----------------------------------------------------------------------------
-- The app calls three primitives that live in the PRIVATE `app` schema:
--   app.receive_inventory, app.fulfil_order_item, app.issue_tax_invoice
-- PostgREST only serves schemas in its "Exposed schemas" list (default: public),
-- so calling them as app.* over the API fails with: "invalid schema: app".
--
-- Rather than expose the whole private `app` schema to the API, this adds thin
-- PUBLIC wrappers that delegate to the existing app.* primitives. Each app.*
-- function is SECURITY DEFINER and does its own tenant/role checks, so the
-- wrappers add no privilege — only a reachable entry point.
--
-- ADDITIVE ONLY: no tables, policies, or existing functions are changed. Apply
-- in the Supabase SQL Editor (runs as postgres). Idempotent (create or replace).
-- =============================================================================

create or replace function public.receive_inventory(
  p_branch_id   uuid,
  p_item_id     uuid,
  p_qty         numeric,
  p_unit        text,
  p_expires_at  timestamptz default null,
  p_employee_id uuid default null,
  p_ref_type    text default null,
  p_ref_id      uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.receive_inventory(
    p_branch_id, p_item_id, p_qty, p_unit,
    p_expires_at, p_employee_id, p_ref_type, p_ref_id);
$$;

create or replace function public.fulfil_order_item(
  p_order_item_id uuid,
  p_employee_id   uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.fulfil_order_item(p_order_item_id, p_employee_id);
$$;

create or replace function public.issue_tax_invoice(
  p_order_id         uuid,
  p_sale_occurred_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.issue_tax_invoice(p_order_id, p_sale_occurred_at);
$$;

-- Only authenticated users may call them (the app.* primitives still enforce
-- owner/manager/staff role checks inside).
revoke all on function public.receive_inventory(uuid, uuid, numeric, text, timestamptz, uuid, text, uuid) from public, anon;
revoke all on function public.fulfil_order_item(uuid, uuid) from public, anon;
revoke all on function public.issue_tax_invoice(uuid, timestamptz) from public, anon;
grant execute on function public.receive_inventory(uuid, uuid, numeric, text, timestamptz, uuid, text, uuid) to authenticated;
grant execute on function public.fulfil_order_item(uuid, uuid) to authenticated;
grant execute on function public.issue_tax_invoice(uuid, timestamptz) to authenticated;

-- Refresh the PostgREST schema cache so the new functions are reachable immediately.
notify pgrst, 'reload schema';
