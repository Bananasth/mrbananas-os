-- 0009_branch_product.sql — Per-branch product price override + availability (F2).
--
-- A franchise overrides price/availability/menu per branch; single-store can ignore it.
-- Orders/invoices still snapshot the EFFECTIVE price, so history stays correct regardless.
-- Money is stored in integer minor units (e.g. satang). RLS-first least-privilege. No
-- pricing logic, no workflows. No data, no secrets.

-- Composite unique targets so branch_product can prove branch + product share one tenant.
alter table public.branch
  add constraint branch_id_tenant_key unique (id, tenant_id);
alter table public.product
  add constraint product_id_tenant_key unique (id, tenant_id);

create table public.branch_product (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  branch_id      uuid not null,
  product_id     uuid not null,
  -- Integer minor units (e.g. satang). Null = use the product's base price.
  price_override bigint check (price_override is null or price_override >= 0),
  is_available   boolean not null default true,
  menu_section   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Composite FKs force branch and product to belong to branch_product.tenant_id.
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete cascade,
  unique (branch_id, product_id)
);

comment on table public.branch_product is
  'Per-branch price override / availability / menu placement for a product (F2).';
comment on column public.branch_product.price_override is
  'Integer minor units (e.g. satang); null means use the product base price.';

create index branch_product_branch_id_idx on public.branch_product (branch_id);
create index branch_product_product_id_idx on public.branch_product (product_id);
create index branch_product_tenant_id_idx on public.branch_product (tenant_id);

create trigger branch_product_set_updated_at
  before update on public.branch_product
  for each row execute function app.set_updated_at();

alter table public.branch_product enable row level security;

-- Owner: full access within tenant.
create policy branch_product_owner_all on public.branch_product
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager: manages price/availability/menu for their own branches.
create policy branch_product_manager_all on public.branch_product
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

-- Staff/Baker (and Owner/Manager): read their own branch's menu.
create policy branch_product_branch_select on public.branch_product
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));
