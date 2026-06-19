-- 0014_batch_execution.sql — Batch-execution primitives (production <-> inventory loop).
--
-- Guarded SECURITY DEFINER functions that connect production to the inventory ledger:
--   * consume_for_batch — FEFO-consume raw/semi stock into 'consume' movements
--   * complete_batch     — set actual_yield + produce a finished lot ('produce' movement)
-- Each validates the caller's authorization internally (tenant context + owner/manager/baker
-- at the batch's branch). Plus a yield-reconciliation view. No new tables, no data, no
-- secrets.

-- ============================ consume_for_batch (FEFO) ============================
-- Consume p_qty of an item at the batch's branch, oldest-expiring first (FEFO), posting
-- negative 'consume' movements that reference the batch. Locks the lots it draws from and
-- raises if stock is insufficient. The lot qty_on_hand >= 0 CHECK is the final backstop.
create or replace function app.consume_for_batch(
  p_batch_id   uuid,
  p_item_id    uuid,
  p_qty        numeric,
  p_employee_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_branch    uuid;
  v_remaining numeric := p_qty;
  v_take      numeric;
  r           record;
begin
  if p_qty <= 0 then
    raise exception 'consume qty must be positive';
  end if;
  select branch_id into v_branch
    from public.production_batch where id = p_batch_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'batch not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager', 'baker'])) then
    raise exception 'not authorized to consume for batch %', p_batch_id;
  end if;

  for r in
    select id, qty_on_hand
      from public.inventory_lot
     where tenant_id = v_tenant and branch_id = v_branch and item_id = p_item_id
       and status = 'available' and qty_on_hand > 0
     order by expires_at nulls last, received_at
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, r.qty_on_hand);
    insert into public.inventory_movement
      (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
      values (v_tenant, v_branch, r.id, p_item_id, -v_take, 'consume', 'production_batch', p_batch_id, p_employee_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient stock for item % at branch %: short by %',
      p_item_id, v_branch, v_remaining;
  end if;
end;
$$;

-- ============================ complete_batch (produce + reconcile yield) ============================
-- Record actual_yield, mark the batch completed, and produce a finished lot of the batch's
-- product (qty = actual_yield) via a 'produce' movement. The finished item is resolved from
-- recipe_version -> recipe -> product.inventory_item_id.
create or replace function app.complete_batch(
  p_batch_id    uuid,
  p_actual_yield numeric,
  p_unit        text,
  p_expires_at  timestamptz default null,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
  v_item   uuid;
  v_lot    uuid;
begin
  if p_actual_yield <= 0 then
    raise exception 'actual_yield must be positive';
  end if;
  select branch_id, status into v_branch, v_status
    from public.production_batch where id = p_batch_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'batch not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager', 'baker'])) then
    raise exception 'not authorized to complete batch %', p_batch_id;
  end if;
  if v_status not in ('planned', 'in_progress') then
    raise exception 'batch % cannot be completed from status %', p_batch_id, v_status;
  end if;

  select p.inventory_item_id into v_item
    from public.production_batch b
    join public.recipe_version rv on rv.id = b.recipe_version_id
    join public.recipe rc on rc.id = rv.recipe_id
    join public.product p on p.id = rc.product_id
   where b.id = p_batch_id;
  if v_item is null then
    raise exception 'batch product has no stockable inventory_item; cannot produce a finished lot';
  end if;

  insert into public.inventory_lot
    (tenant_id, branch_id, item_id, batch_id, unit, expires_at, status, qty_on_hand)
    values (v_tenant, v_branch, v_item, p_batch_id, p_unit, p_expires_at, 'available', 0)
    returning id into v_lot;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
    values (v_tenant, v_branch, v_lot, v_item, p_actual_yield, 'produce', 'production_batch', p_batch_id, p_employee_id);

  update public.production_batch
     set actual_yield = p_actual_yield,
         status = 'completed',
         completed_at = now()
   where id = p_batch_id;

  return v_lot;
end;
$$;

-- ============================ yield reconciliation (view) ============================
create view public.production_batch_yield with (security_invoker = true) as
select
  b.id as batch_id,
  b.tenant_id,
  b.branch_id,
  b.planned_qty,
  b.actual_yield,
  (b.actual_yield - b.planned_qty) as yield_variance
from public.production_batch b;

comment on view public.production_batch_yield is
  'Planned vs actual yield per batch (B2 reconciliation). RLS via security_invoker.';
