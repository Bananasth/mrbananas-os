-- 0011_purchasing.sql — Minimal suppliers & purchasing.
--
-- supplier (tenant master) -> purchase_order (per branch) -> purchase_order_line (what was
-- ordered, referencing inventory_item via a single FK). This is the MINIMAL purchasing
-- scope: no receiving, no inventory movements, no lots, no ledger — those arrive with the
-- inventory-ledger module. RLS-first least-privilege. No data, no secrets.

-- ============================ supplier ============================
create table public.supplier (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  name       text not null,
  contact    text,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

comment on table public.supplier is 'Minimal supplier master (tenant-level).';

create index supplier_tenant_id_idx on public.supplier (tenant_id);

create trigger supplier_set_updated_at
  before update on public.supplier
  for each row execute function app.set_updated_at();

alter table public.supplier enable row level security;

create policy supplier_owner_all on public.supplier
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy supplier_staff_select on public.supplier
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ purchase_order (per branch) ============================
create table public.purchase_order (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  supplier_id uuid not null,
  status      text not null default 'draft'
                check (status in ('draft', 'ordered', 'received', 'cancelled')),
  ordered_at  timestamptz,
  expected_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (supplier_id, tenant_id) references public.supplier (id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

comment on table public.purchase_order is 'Minimal purchase-order header (per branch).';

create index purchase_order_branch_id_idx on public.purchase_order (branch_id);
create index purchase_order_supplier_id_idx on public.purchase_order (supplier_id);
create index purchase_order_tenant_id_idx on public.purchase_order (tenant_id);

create trigger purchase_order_set_updated_at
  before update on public.purchase_order
  for each row execute function app.set_updated_at();

alter table public.purchase_order enable row level security;

create policy purchase_order_owner_all on public.purchase_order
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy purchase_order_manager_all on public.purchase_order
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy purchase_order_branch_select on public.purchase_order
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Resolve a PO's branch past RLS, for line-level branch isolation.
create or replace function app.purchase_order_branch(p_po_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select branch_id from public.purchase_order where id = p_po_id;
$$;

-- ============================ purchase_order_line ============================
create table public.purchase_order_line (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  po_id      uuid not null,
  item_id    uuid not null,
  qty        numeric not null check (qty > 0),
  unit       text not null,
  -- Integer minor units (e.g. satang); null when not priced yet.
  unit_cost  bigint check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (po_id, tenant_id) references public.purchase_order (id, tenant_id) on delete cascade,
  -- Single FK to the inventory_item supertype (N1).
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.purchase_order_line is
  'A purchase-order line referencing an inventory_item (single FK, N1). No receiving logic yet.';

create index purchase_order_line_po_idx on public.purchase_order_line (po_id);
create index purchase_order_line_item_idx on public.purchase_order_line (item_id);

create trigger purchase_order_line_set_updated_at
  before update on public.purchase_order_line
  for each row execute function app.set_updated_at();

alter table public.purchase_order_line enable row level security;

create policy purchase_order_line_owner_all on public.purchase_order_line
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy purchase_order_line_manager_all on public.purchase_order_line
  for all to authenticated
  using (app.has_branch_role(app.purchase_order_branch(po_id), array['manager']))
  with check (app.has_branch_role(app.purchase_order_branch(po_id), array['manager']));

create policy purchase_order_line_branch_select on public.purchase_order_line
  for select to authenticated
  using (
    app.has_branch_role(app.purchase_order_branch(po_id), array['owner', 'manager', 'staff', 'baker'])
  );
