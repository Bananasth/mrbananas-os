-- 0019_quarantine.sql — Lot quarantine + sale/consume block.
--
-- Quarantine an inventory_lot so it cannot be sold or consumed. Two layers of blocking:
--   * deduct_fefo / consume_for_batch already draw only from status='available' lots, so a
--     quarantined lot is excluded from FEFO automatically; and
--   * a BEFORE INSERT guard on inventory_movement rejects any 'sell'/'consume' against a
--     quarantined lot, regardless of code path.
-- Status changes are audited (the audit trigger is attached to inventory_lot here). RLS is
-- unchanged. No new tables, no data, no secrets.

-- Quarantine metadata on the lot (status='quarantined' already exists from 0012).
alter table public.inventory_lot
  add column quarantine_reason text,
  add column quarantined_at    timestamptz,
  add column quarantined_by    uuid references public.app_user (id) on delete set null;

-- Audit trail: record every inventory_lot mutation (incl. quarantine/release).
create trigger inventory_lot_audit
  after insert or update or delete on public.inventory_lot
  for each row execute function app.audit_trigger();

-- DB-level block: no selling/consuming a quarantined lot.
create or replace function app.guard_quarantined_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.reason in ('sell', 'consume') then
    select status into v_status from public.inventory_lot where id = new.lot_id;
    if v_status = 'quarantined' then
      raise exception 'lot % is quarantined and cannot be sold or consumed', new.lot_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger inventory_movement_quarantine_guard
  before insert on public.inventory_movement
  for each row execute function app.guard_quarantined_movement();

-- Quarantine a lot (Owner or branch Manager).
create or replace function app.quarantine_lot(p_lot_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
begin
  select branch_id, status into v_branch, v_status
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'lot not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to quarantine lot %', p_lot_id;
  end if;
  if v_status = 'depleted' then
    raise exception 'cannot quarantine a depleted lot';
  end if;
  update public.inventory_lot
     set status = 'quarantined',
         quarantine_reason = p_reason,
         quarantined_at = now(),
         quarantined_by = app.current_user_id()
   where id = p_lot_id;
end;
$$;

-- Release a quarantined lot back to available (or depleted if empty).
create or replace function app.release_lot(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
  v_qty    numeric;
begin
  select branch_id, status, qty_on_hand into v_branch, v_status, v_qty
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'lot not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to release lot %', p_lot_id;
  end if;
  if v_status <> 'quarantined' then
    raise exception 'lot % is not quarantined', p_lot_id;
  end if;
  update public.inventory_lot
     set status = case when v_qty > 0 then 'available' else 'depleted' end,
         quarantine_reason = null,
         quarantined_at = null,
         quarantined_by = null
   where id = p_lot_id;
end;
$$;
