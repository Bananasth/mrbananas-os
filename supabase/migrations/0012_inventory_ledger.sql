-- 0012_inventory_ledger.sql — Inventory ledger: lots, movements, stock-on-hand, receiving.
--
-- inventory_movement is the APPEND-ONLY source of truth (N3); inventory_lot.qty_on_hand is
-- a cache maintained transactionally by a trigger as movements are inserted. expires_at is
-- the single source of shelf life (N2) and shelf_life is a VIEW. Receiving is a guarded
-- SECURITY DEFINER primitive that creates a lot + a 'receive' movement. RLS-first
-- least-privilege. No production batches, no sales, no waste workflows. No data, no secrets.

-- ============================ inventory_lot (stock; qty_on_hand cache) ============================
create table public.inventory_lot (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  item_id     uuid not null,
  -- FK to production_batch added in Phase 2 (production).
  batch_id    uuid,
  qty_on_hand numeric not null default 0 check (qty_on_hand >= 0),
  unit        text not null,
  received_at timestamptz not null default now(),
  expires_at  timestamptz,
  status      text not null default 'available'
                check (status in ('available', 'quarantined', 'expired', 'depleted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

comment on table public.inventory_lot is
  'A trackable stock lot. qty_on_hand is a cache maintained from inventory_movement (N3); expires_at is the single source of shelf life (N2).';
comment on column public.inventory_lot.qty_on_hand is
  'Cache of net movements for this lot; the inventory_movement ledger is the authority.';

create index inventory_lot_tenant_id_idx on public.inventory_lot (tenant_id);
create index inventory_lot_branch_item_idx on public.inventory_lot (branch_id, item_id);
-- FEFO scan: soonest-expiring available lots first (N2; replaces a stored fefo_rank).
create index inventory_lot_fefo_idx
  on public.inventory_lot (branch_id, item_id, expires_at) where status = 'available';

create trigger inventory_lot_set_updated_at
  before update on public.inventory_lot
  for each row execute function app.set_updated_at();

alter table public.inventory_lot enable row level security;

create policy inventory_lot_owner_all on public.inventory_lot
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy inventory_lot_manager_all on public.inventory_lot
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy inventory_lot_branch_select on public.inventory_lot
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ inventory_movement (append-only ledger; the authority) ============================
create table public.inventory_movement (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  lot_id      uuid not null,
  item_id     uuid not null,
  qty_delta   numeric not null check (qty_delta <> 0),
  reason      text not null
                check (reason in ('receive', 'consume', 'produce', 'sell', 'waste', 'adjust', 'transfer')),
  ref_type    text,
  ref_id      uuid,
  employee_id uuid references public.employee (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (lot_id, tenant_id) references public.inventory_lot (id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.inventory_movement is
  'Append-only inventory ledger (the source of truth). Corrections are new adjust rows.';

create index inventory_movement_lot_idx on public.inventory_movement (lot_id, occurred_at);
create index inventory_movement_ref_idx on public.inventory_movement (ref_type, ref_id);
create index inventory_movement_branch_idx on public.inventory_movement (branch_id);
create index inventory_movement_tenant_idx on public.inventory_movement (tenant_id);

-- Append-only: reuse the reject_mutation guard (0006). Blocks UPDATE/DELETE for every role.
create trigger inventory_movement_append_only
  before update or delete on public.inventory_movement
  for each row execute function app.reject_mutation();

alter table public.inventory_movement enable row level security;

create policy inventory_movement_owner_all on public.inventory_movement
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy inventory_movement_manager_all on public.inventory_movement
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy inventory_movement_branch_select on public.inventory_movement
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ stock-on-hand cache maintenance (N3) ============================
-- AFTER INSERT on a movement, apply qty_delta to the lot's cache. The lot's qty_on_hand >= 0
-- CHECK rejects any movement that would over-deplete a lot. SECURITY DEFINER so the cache is
-- maintained regardless of the poster's lot-update rights.
create or replace function app.apply_movement_to_lot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_lot
     set qty_on_hand = qty_on_hand + new.qty_delta,
         status = case
                    when qty_on_hand + new.qty_delta <= 0 and status <> 'quarantined' then 'depleted'
                    else status
                  end
   where id = new.lot_id;
  return null;
end;
$$;

create trigger inventory_movement_apply
  after insert on public.inventory_movement
  for each row execute function app.apply_movement_to_lot();

-- ============================ receiving primitive (guarded) ============================
-- Creates a lot + a 'receive' movement atomically. SECURITY DEFINER, so it validates the
-- caller's authorization internally: same tenant, and owner/manager/staff at the branch.
create or replace function app.receive_inventory(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_lot    uuid;
begin
  if p_qty <= 0 then
    raise exception 'receive qty must be positive';
  end if;
  if v_tenant is null then
    raise exception 'no tenant context';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['owner', 'manager', 'staff'])) then
    raise exception 'not authorized to receive at branch %', p_branch_id;
  end if;

  insert into public.inventory_lot (tenant_id, branch_id, item_id, unit, expires_at, status, qty_on_hand)
    values (v_tenant, p_branch_id, p_item_id, p_unit, p_expires_at, 'available', 0)
    returning id into v_lot;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
    values (v_tenant, p_branch_id, v_lot, p_item_id, p_qty, 'receive', p_ref_type, p_ref_id, p_employee_id);

  return v_lot;
end;
$$;

-- ============================ derived views (RLS via security_invoker) ============================
-- Shelf life is a VIEW over inventory_lot (N2) — no separate table, no stored fefo_rank.
create view public.shelf_life with (security_invoker = true) as
select
  l.id as lot_id,
  l.tenant_id,
  l.branch_id,
  l.item_id,
  l.received_at,
  l.expires_at,
  case
    when l.expires_at is null then 'fresh'
    when l.expires_at <= now() then 'expired'
    when l.expires_at <= now() + interval '24 hours' then 'expiring'
    else 'fresh'
  end as freshness
from public.inventory_lot l;

comment on view public.shelf_life is
  'Derived shelf-life over inventory_lot (N2). FEFO = order by expires_at. RLS via security_invoker.';

-- Stock on hand: available quantity per item per branch (cache rollup).
create view public.stock_on_hand with (security_invoker = true) as
select
  l.tenant_id,
  l.branch_id,
  l.item_id,
  sum(l.qty_on_hand) as qty_available
from public.inventory_lot l
where l.status = 'available'
group by l.tenant_id, l.branch_id, l.item_id;

comment on view public.stock_on_hand is
  'Available stock per item per branch, summed from the qty_on_hand cache. RLS via security_invoker.';
