-- =============================================================================
-- stock-adjustment.sql — Stock Adjustment + Waste (PROPOSAL; review, then run).
-- Additive only. NO existing quantities changed. All stock changes still go through
-- inventory_movement (the immutable ledger); qty is never edited directly.
--
--   ADJUSTMENT: set a lot to a target qty -> movement reason='adjust'
--   WASTE:      remove qty from a lot      -> movement reason='waste'
-- Both also write a stock_adjustment audit row recording before/after/difference/
-- reason/user/timestamp. (RECEIVE/SALE/PRODUCTION already write movements.)
-- =============================================================================
begin;

-- audit detail for adjust/waste (the movement does the actual stock change)
create table if not exists public.stock_adjustment (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  lot_id      uuid not null references public.inventory_lot (id) on delete cascade,
  item_id     uuid not null,
  movement_id uuid not null references public.inventory_movement (id) on delete restrict,
  kind        text not null check (kind in ('adjust', 'waste')),
  before_qty  numeric not null,
  after_qty   numeric not null check (after_qty >= 0),
  difference  numeric not null,
  reason      text not null,
  adjusted_by uuid,                                  -- app_user who did it
  created_at  timestamptz not null default now()
);
alter table public.stock_adjustment enable row level security;
create policy stock_adjustment_owner_all on public.stock_adjustment
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy stock_adjustment_mgr_write on public.stock_adjustment
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));
create policy stock_adjustment_read on public.stock_adjustment
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));
grant select, insert on public.stock_adjustment to authenticated;

-- ADJUSTMENT: set a lot to p_new_qty (owner/manager). Atomic: movement + audit.
create or replace function app.adjust_stock(
  p_lot_id uuid, p_new_qty numeric, p_reason text, p_employee_id uuid default null
)
returns public.stock_adjustment language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_lot record; v_before numeric; v_delta numeric; v_mid uuid; v_row public.stock_adjustment;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select branch_id, item_id, qty_on_hand into v_lot
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant for update;
  if not found then raise exception 'lot not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_lot.branch_id, array['manager'])) then
    raise exception 'not authorized to adjust stock';
  end if;
  if p_new_qty < 0 then raise exception 'quantity must be >= 0'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason is required'; end if;
  v_before := v_lot.qty_on_hand;
  v_delta  := p_new_qty - v_before;
  if v_delta = 0 then raise exception 'no change (before = after)'; end if;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, employee_id)
    values (v_tenant, v_lot.branch_id, p_lot_id, v_lot.item_id, v_delta, 'adjust', 'stock_adjustment', p_employee_id)
    returning id into v_mid;
  insert into public.stock_adjustment
    (tenant_id, branch_id, lot_id, item_id, movement_id, kind, before_qty, after_qty, difference, reason, adjusted_by)
    values (v_tenant, v_lot.branch_id, p_lot_id, v_lot.item_id, v_mid, 'adjust', v_before, p_new_qty, v_delta, p_reason, app.current_user_id())
    returning * into v_row;
  return v_row;
end; $$;

-- WASTE: remove p_qty from a lot (owner/manager). Atomic: movement + audit.
create or replace function app.record_waste(
  p_lot_id uuid, p_qty numeric, p_reason text, p_employee_id uuid default null
)
returns public.stock_adjustment language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_lot record; v_before numeric; v_after numeric; v_mid uuid; v_row public.stock_adjustment;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select branch_id, item_id, qty_on_hand into v_lot
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant for update;
  if not found then raise exception 'lot not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_lot.branch_id, array['manager'])) then
    raise exception 'not authorized to record waste';
  end if;
  if p_qty <= 0 then raise exception 'quantity must be > 0'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason is required'; end if;
  v_before := v_lot.qty_on_hand;
  if p_qty > v_before then raise exception 'cannot waste more than on hand (%.0f)', v_before; end if;
  v_after := v_before - p_qty;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, employee_id)
    values (v_tenant, v_lot.branch_id, p_lot_id, v_lot.item_id, -p_qty, 'waste', 'stock_adjustment', p_employee_id)
    returning id into v_mid;
  insert into public.stock_adjustment
    (tenant_id, branch_id, lot_id, item_id, movement_id, kind, before_qty, after_qty, difference, reason, adjusted_by)
    values (v_tenant, v_lot.branch_id, p_lot_id, v_lot.item_id, v_mid, 'waste', v_before, v_after, -p_qty, p_reason, app.current_user_id())
    returning * into v_row;
  return v_row;
end; $$;

grant execute on function app.adjust_stock(uuid, numeric, text, uuid) to authenticated;
grant execute on function app.record_waste(uuid, numeric, text, uuid) to authenticated;

-- public wrappers (app schema isn't exposed to PostgREST)
create or replace function public.adjust_stock(p_lot_id uuid, p_new_qty numeric, p_reason text, p_employee_id uuid default null)
  returns public.stock_adjustment language sql security invoker set search_path = '' as $$
    select app.adjust_stock(p_lot_id, p_new_qty, p_reason, p_employee_id);
$$;
create or replace function public.record_waste(p_lot_id uuid, p_qty numeric, p_reason text, p_employee_id uuid default null)
  returns public.stock_adjustment language sql security invoker set search_path = '' as $$
    select app.record_waste(p_lot_id, p_qty, p_reason, p_employee_id);
$$;
revoke all on function public.adjust_stock(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.record_waste(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.record_waste(uuid, numeric, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
