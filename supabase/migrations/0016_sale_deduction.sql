-- 0016_sale_deduction.sql — Inventory deduction at sale (I1 atomic fix).
--
-- app.fulfil_order_item deducts stock for a sold line, atomically:
--   * bakery (product.type = 'batch')        -> deduct the finished-product lots, and stamp
--                                                the consumed batch onto order_item (trace)
--   * beverage (product.type = 'made_to_order') -> deduct each recipe ingredient
-- Deduction is FIFO (oldest received first), locks the lots it draws from (FOR UPDATE), and
-- rejects the sale if stock is insufficient. The lot qty_on_hand >= 0 CHECK is the final
-- backstop. 'sell' movements reference the order_item, preserving traceability. No new
-- tables, no data, no secrets.

-- Internal FIFO deduction helper. SECURITY DEFINER and revoked from public so only the
-- fulfil primitive (running in the definer context) may call it.
create or replace function app.deduct_fifo(
  p_tenant      uuid,
  p_branch      uuid,
  p_item_id     uuid,
  p_qty         numeric,
  p_reason      text,
  p_ref_type    text,
  p_ref_id      uuid,
  p_employee_id uuid
)
returns uuid -- batch_id of the first lot consumed (for traceability), or null
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining   numeric := p_qty;
  v_take        numeric;
  v_first_batch uuid;
  v_seen        boolean := false;
  r             record;
begin
  if p_qty <= 0 then
    raise exception 'deduct qty must be positive';
  end if;

  for r in
    select id, qty_on_hand, batch_id
      from public.inventory_lot
     where tenant_id = p_tenant and branch_id = p_branch and item_id = p_item_id
       and status = 'available' and qty_on_hand > 0
     order by received_at, id -- FIFO
     for update
  loop
    exit when v_remaining <= 0;
    if not v_seen then
      v_first_batch := r.batch_id;
      v_seen := true;
    end if;
    v_take := least(v_remaining, r.qty_on_hand);
    insert into public.inventory_movement
      (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
      values (p_tenant, p_branch, r.id, p_item_id, -v_take, p_reason, p_ref_type, p_ref_id, p_employee_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient stock for item % at branch %: short by %',
      p_item_id, p_branch, v_remaining;
  end if;

  return v_first_batch;
end;
$$;

revoke all on function app.deduct_fifo(uuid, uuid, uuid, numeric, text, text, uuid, uuid) from public;

-- Deduct inventory for a sold order line. SECURITY DEFINER with internal authorization.
create or replace function app.fulfil_order_item(
  p_order_item_id uuid,
  p_employee_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_oi     record;
  v_prod   record;
  v_batch  uuid;
  ing      record;
begin
  select branch_id, product_id, recipe_version_id, qty, batch_id
    into v_oi
    from public.order_item
   where id = p_order_item_id and tenant_id = v_tenant;
  if not found then
    raise exception 'order_item not found';
  end if;

  if not (app.is_tenant_owner() or app.has_branch_role(v_oi.branch_id, array['manager', 'staff', 'baker'])) then
    raise exception 'not authorized to fulfil order_item %', p_order_item_id;
  end if;

  select type, inventory_item_id into v_prod
    from public.product where id = v_oi.product_id;

  if v_prod.type = 'batch' then
    -- Bakery: deduct the finished-product lots.
    if v_prod.inventory_item_id is null then
      raise exception 'batch product has no stockable inventory_item; cannot deduct';
    end if;
    v_batch := app.deduct_fifo(
      v_tenant, v_oi.branch_id, v_prod.inventory_item_id, v_oi.qty,
      'sell', 'order_item', p_order_item_id, p_employee_id);
    -- Stamp the batch the sold item came from (traceability) when not already pinned.
    if v_oi.batch_id is null and v_batch is not null then
      update public.order_item set batch_id = v_batch where id = p_order_item_id;
    end if;
  else
    -- Made-to-order beverage: deduct each recipe ingredient (qty x line qty).
    for ing in
      select item_id, quantity
        from public.recipe_ingredient
       where recipe_version_id = v_oi.recipe_version_id and tenant_id = v_tenant
    loop
      perform app.deduct_fifo(
        v_tenant, v_oi.branch_id, ing.item_id, ing.quantity * v_oi.qty,
        'sell', 'order_item', p_order_item_id, p_employee_id);
    end loop;
  end if;
end;
$$;
