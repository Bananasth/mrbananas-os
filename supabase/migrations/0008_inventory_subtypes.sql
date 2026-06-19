-- 0008_inventory_subtypes.sql — Inventory subtypes on the inventory_item supertype (N1).
--
-- raw_material and semi_finished are SHARED-PK subtypes of inventory_item (every one IS a
-- stockable item; the composite FK guarantees the linked supertype row has the right tenant
-- AND item_kind). product is a catalog entity that OPTIONALLY links to an inventory_item
-- (batch/finished goods are stocked; made-to-order beverages are not). unit_conversion holds
-- UoM factors. RLS-first least-privilege, reusing the W11 helpers. No movements, lots,
-- ledger, pricing logic, or workflows. No data, no secrets.

-- Composite unique targets on the supertype for subtype foreign keys (id is already PK).
alter table public.inventory_item
  add constraint inventory_item_id_tenant_key unique (id, tenant_id);
alter table public.inventory_item
  add constraint inventory_item_id_tenant_kind_key unique (id, tenant_id, item_kind);

-- ============================ raw_material (shared PK, kind = raw) ============================
create table public.raw_material (
  id            uuid primary key,
  tenant_id     uuid not null,
  item_kind     text not null default 'raw' check (item_kind = 'raw'),
  sku           text not null,
  name          text not null,
  reorder_point numeric not null default 0 check (reorder_point >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (id, tenant_id, item_kind)
    references public.inventory_item (id, tenant_id, item_kind) on delete cascade,
  unique (tenant_id, sku)
);

comment on table public.raw_material is
  'Shared-PK subtype of inventory_item (item_kind = raw); tenant + kind enforced by composite FK.';

create index raw_material_tenant_id_idx on public.raw_material (tenant_id);

create trigger raw_material_set_updated_at
  before update on public.raw_material
  for each row execute function app.set_updated_at();

alter table public.raw_material enable row level security;

create policy raw_material_owner_all on public.raw_material
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy raw_material_staff_select on public.raw_material
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ semi_finished (shared PK, kind = semi_finished) ============================
create table public.semi_finished (
  id         uuid primary key,
  tenant_id  uuid not null,
  item_kind  text not null default 'semi_finished' check (item_kind = 'semi_finished'),
  sku        text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (id, tenant_id, item_kind)
    references public.inventory_item (id, tenant_id, item_kind) on delete cascade,
  unique (tenant_id, sku)
);

comment on table public.semi_finished is
  'Shared-PK subtype of inventory_item (item_kind = semi_finished); tenant + kind enforced by composite FK.';

create index semi_finished_tenant_id_idx on public.semi_finished (tenant_id);

create trigger semi_finished_set_updated_at
  before update on public.semi_finished
  for each row execute function app.set_updated_at();

alter table public.semi_finished enable row level security;

create policy semi_finished_owner_all on public.semi_finished
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy semi_finished_staff_select on public.semi_finished
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ product (catalog; optional stock link) ============================
create table public.product (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete restrict,
  -- Set for batch/finished goods (stocked); null for made-to-order. Tenant-match for the
  -- optional link is enforced at the service layer (documented Phase-1 follow-up).
  inventory_item_id uuid references public.inventory_item (id) on delete set null,
  sku               text not null,
  name              text not null,
  category          text not null check (category in ('beverage', 'bakery')),
  type              text not null check (type in ('made_to_order', 'batch')),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, sku)
);

comment on table public.product is
  'Sellable product. Optionally links to an inventory_item (batch/finished goods are stocked).';

create index product_tenant_id_idx on public.product (tenant_id);

create trigger product_set_updated_at
  before update on public.product
  for each row execute function app.set_updated_at();

alter table public.product enable row level security;

create policy product_owner_all on public.product
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy product_staff_select on public.product
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ unit_conversion (UoM) ============================
create table public.unit_conversion (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  -- null item_id = a tenant-global conversion (e.g. kg <-> g); otherwise item-specific.
  item_id    uuid references public.inventory_item (id) on delete cascade,
  from_unit  text not null,
  to_unit    text not null,
  factor     numeric not null check (factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_unit <> to_unit),
  unique (tenant_id, item_id, from_unit, to_unit)
);

comment on table public.unit_conversion is
  'Unit-of-measure conversion factors; item-specific or tenant-global (null item_id).';

create index unit_conversion_tenant_id_idx on public.unit_conversion (tenant_id);

create trigger unit_conversion_set_updated_at
  before update on public.unit_conversion
  for each row execute function app.set_updated_at();

alter table public.unit_conversion enable row level security;

create policy unit_conversion_owner_all on public.unit_conversion
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy unit_conversion_staff_select on public.unit_conversion
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );
