-- 0015_sales_orders.sql — Sales orders + order items (the traceability anchor).
--
-- NOTE: `order` is a SQL reserved word, so the header table is `sales_order` (identical
-- semantics to the ERD's `order`). order_item is THE traceability anchor: each line pins
-- employee + workstation + recipe_version + (for bakery) production_batch, giving the chain
--   order_item -> batch -> recipe_version -> production_batch.
-- Money is stored in integer minor units; order/line totals are intentional snapshots.
-- Inventory deduction at sale (I1), payment, and tax invoice are separate WPs. No data,
-- no secrets.

-- ============================ sales_order (header) ============================
create table public.sales_order (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  employee_id uuid references public.employee (id) on delete set null,
  channel     text not null check (channel in ('pos', 'qr')),
  status      text not null default 'open'
                check (status in ('open', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  subtotal    bigint not null default 0 check (subtotal >= 0),
  tax_total   bigint not null default 0 check (tax_total >= 0),
  total       bigint not null default 0 check (total >= 0),
  -- FK to tax_invoice added with the tax-invoice WP; unique prevents double-invoicing.
  invoice_id  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (id, tenant_id, branch_id),
  unique (invoice_id)
);

comment on table public.sales_order is
  'Sales order header (ERD `order`; renamed to avoid the SQL reserved word). Money in minor units.';

create index sales_order_branch_id_idx on public.sales_order (branch_id);
create index sales_order_employee_id_idx on public.sales_order (employee_id);

create trigger sales_order_set_updated_at
  before update on public.sales_order
  for each row execute function app.set_updated_at();

alter table public.sales_order enable row level security;

create policy sales_order_owner_all on public.sales_order
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy sales_order_ops_all on public.sales_order
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'staff']))
  with check (app.has_branch_role(branch_id, array['manager', 'staff']));

create policy sales_order_branch_select on public.sales_order
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ order_item (traceability anchor) ============================
create table public.order_item (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid not null,
  order_id          uuid not null,
  product_id        uuid not null,
  -- Traceability anchors:
  recipe_version_id uuid not null,                                   -- exact formula
  workstation_id    uuid not null,                                   -- where
  employee_id       uuid references public.employee (id) on delete set null, -- who made it
  batch_id          uuid,                                            -- bakery: which batch (null = made-to-order)
  qty               numeric not null check (qty > 0),
  unit_price        bigint not null check (unit_price >= 0),         -- snapshot, minor units
  line_tax          bigint not null default 0 check (line_tax >= 0), -- snapshot
  status            text not null default 'queued'
                      check (status in ('queued', 'making', 'ready', 'served')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete restrict,
  foreign key (recipe_version_id, tenant_id)
    references public.recipe_version (id, tenant_id) on delete restrict,
  foreign key (workstation_id, branch_id)
    references public.workstation (id, branch_id) on delete restrict,
  foreign key (batch_id, tenant_id)
    references public.production_batch (id, tenant_id)
);

comment on table public.order_item is
  'The traceability anchor: pins employee + workstation + recipe_version + batch per sold line.';

create index order_item_order_id_idx on public.order_item (order_id);
create index order_item_batch_id_idx on public.order_item (batch_id);
create index order_item_recipe_version_idx on public.order_item (recipe_version_id);
create index order_item_workstation_idx on public.order_item (workstation_id);
create index order_item_branch_id_idx on public.order_item (branch_id);

create trigger order_item_set_updated_at
  before update on public.order_item
  for each row execute function app.set_updated_at();

alter table public.order_item enable row level security;

create policy order_item_owner_all on public.order_item
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager/Staff take orders; Staff/Baker fulfil items at stations (KDS).
create policy order_item_ops_all on public.order_item
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'staff', 'baker']))
  with check (app.has_branch_role(branch_id, array['manager', 'staff', 'baker']));

create policy order_item_branch_select on public.order_item
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));
