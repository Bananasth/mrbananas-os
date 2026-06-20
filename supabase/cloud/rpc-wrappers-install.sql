-- =============================================================================
-- rpc-wrappers-install.sql  —  paste into the Supabase SQL Editor, Run once.
-- Creates the public RPC wrappers, VERIFIES they exist (pg_proc), reloads the
-- PostgREST cache, and PROVES receive_inventory executes under a simulated owner
-- JWT. Idempotent and side-effect-free (the proof call is rolled back).
-- =============================================================================

-- ---------- A. Create the wrappers (delegate to the SECURITY DEFINER app.* primitives) ----------
create or replace function public.receive_inventory(
  p_branch_id uuid, p_item_id uuid, p_qty numeric, p_unit text,
  p_expires_at timestamptz default null, p_employee_id uuid default null,
  p_ref_type text default null, p_ref_id uuid default null
) returns uuid language sql security invoker set search_path = '' as $$
  select app.receive_inventory(p_branch_id, p_item_id, p_qty, p_unit,
    p_expires_at, p_employee_id, p_ref_type, p_ref_id);
$$;

create or replace function public.fulfil_order_item(
  p_order_item_id uuid, p_employee_id uuid default null
) returns void language sql security invoker set search_path = '' as $$
  select app.fulfil_order_item(p_order_item_id, p_employee_id);
$$;

create or replace function public.issue_tax_invoice(
  p_order_id uuid, p_sale_occurred_at timestamptz default null
) returns uuid language sql security invoker set search_path = '' as $$
  select app.issue_tax_invoice(p_order_id, p_sale_occurred_at);
$$;

revoke all on function public.receive_inventory(uuid, uuid, numeric, text, timestamptz, uuid, text, uuid) from public, anon;
revoke all on function public.fulfil_order_item(uuid, uuid) from public, anon;
revoke all on function public.issue_tax_invoice(uuid, timestamptz) from public, anon;
grant execute on function public.receive_inventory(uuid, uuid, numeric, text, timestamptz, uuid, text, uuid) to authenticated;
grant execute on function public.fulfil_order_item(uuid, uuid) to authenticated;
grant execute on function public.issue_tax_invoice(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- ---------- B. VERIFY the functions now exist (your pg_proc check) ----------
select n.nspname as schema,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('receive_inventory', 'fulfil_order_item', 'issue_tax_invoice')
order by p.proname;

-- ---------- C. PROVE public.receive_inventory(...) executes (simulated owner JWT; rolled back) ----------
begin;
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-000000000000',
    'tenant_id', '11111111-1111-1111-1111-111111111111',
    'branch_roles', json_build_array(
      json_build_object('branch_id', '22222222-2222-2222-2222-222222222222', 'role', 'owner')),
    'session_version', 1
  )::text, true);
  set local role authenticated;

  select public.receive_inventory(
    '22222222-2222-2222-2222-222222222222'::uuid,                       -- seeded branch
    (select id from public.inventory_item where item_kind = 'raw' limit 1), -- a real raw item
    5, 'ml'
  ) as proof_new_lot_id;
rollback;  -- proof only: no stock actually added
