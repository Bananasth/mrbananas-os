-- 0010_catalog_recipes.sql — Catalog recipes with version control.
--
-- recipe (per product) -> recipe_version (immutable once active) -> recipe_ingredient
-- (bill of materials; SINGLE FK to inventory_item, N1). Version control is enforced in the
-- database: an active version's content cannot change (only active -> retired), a retired
-- version is fully immutable, and at most one version per recipe is active. Ingredients of
-- an active/retired version cannot change. RLS-first least-privilege. No data, no secrets.

-- ============================ helpers / guards ============================

-- Read a recipe_version's status past RLS (used by the ingredient guard).
create or replace function app.recipe_version_status(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.recipe_version where id = p_id;
$$;

-- BEFORE UPDATE guard: an active version is immutable except an active -> retired
-- transition (no other column change); a retired version is fully immutable.
create or replace function app.guard_active_recipe_version()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'retired' then
    raise exception 'recipe_version % is retired and immutable', old.id;
  elsif old.status = 'active' then
    if new.status = 'retired'
       and new.tenant_id = old.tenant_id
       and new.recipe_id = old.recipe_id
       and new.version_no = old.version_no
       and new.shelf_life_hours is not distinct from old.shelf_life_hours
       and new.yield_qty is not distinct from old.yield_qty
       and new.effective_from is not distinct from old.effective_from then
      return new;
    end if;
    raise exception 'recipe_version % is active and immutable; create a new version (only retire is allowed)', old.id;
  end if;
  return new;
end;
$$;

-- BEFORE INSERT/UPDATE/DELETE guard: ingredients of an active/retired version are frozen.
create or replace function app.guard_recipe_ingredient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid := coalesce(new.recipe_version_id, old.recipe_version_id);
  v_status  text := app.recipe_version_status(v_version);
begin
  if v_status in ('active', 'retired') then
    raise exception 'recipe_version % is % and immutable; its ingredients cannot change',
      v_version, v_status;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ============================ recipe ============================
create table public.recipe (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  product_id uuid not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (product_id, name)
);

comment on table public.recipe is 'A recipe for a product. Versioned via recipe_version.';

create index recipe_product_id_idx on public.recipe (product_id);

create trigger recipe_set_updated_at
  before update on public.recipe
  for each row execute function app.set_updated_at();

alter table public.recipe enable row level security;

create policy recipe_owner_all on public.recipe
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_staff_select on public.recipe
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ recipe_version ============================
create table public.recipe_version (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  recipe_id        uuid not null,
  version_no       integer not null check (version_no > 0),
  status           text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  shelf_life_hours integer check (shelf_life_hours is null or shelf_life_hours >= 0),
  yield_qty        numeric check (yield_qty is null or yield_qty > 0),
  effective_from   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (recipe_id, tenant_id) references public.recipe (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (recipe_id, version_no)
);

comment on table public.recipe_version is
  'A versioned recipe. Immutable once active (content frozen; only active -> retired).';

create index recipe_version_recipe_id_idx on public.recipe_version (recipe_id);
-- At most one active version per recipe.
create unique index recipe_version_one_active_idx
  on public.recipe_version (recipe_id) where status = 'active';

create trigger recipe_version_set_updated_at
  before update on public.recipe_version
  for each row execute function app.set_updated_at();

create trigger recipe_version_immutable
  before update on public.recipe_version
  for each row execute function app.guard_active_recipe_version();

alter table public.recipe_version enable row level security;

create policy recipe_version_owner_all on public.recipe_version
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_version_staff_select on public.recipe_version
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ recipe_ingredient (BoM; single FK to inventory_item) ============================
create table public.recipe_ingredient (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  recipe_version_id uuid not null,
  item_id           uuid not null,
  quantity          numeric not null check (quantity > 0),
  unit              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (recipe_version_id, tenant_id)
    references public.recipe_version (id, tenant_id) on delete cascade,
  -- Single FK to the inventory_item supertype (N1); raw or semi-finished in practice.
  foreign key (item_id, tenant_id)
    references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.recipe_ingredient is
  'Bill of materials. Single FK to inventory_item (N1). Frozen once its version is active.';

create index recipe_ingredient_version_idx on public.recipe_ingredient (recipe_version_id);
create index recipe_ingredient_item_idx on public.recipe_ingredient (item_id);

create trigger recipe_ingredient_set_updated_at
  before update on public.recipe_ingredient
  for each row execute function app.set_updated_at();

create trigger recipe_ingredient_immutable
  before insert or update or delete on public.recipe_ingredient
  for each row execute function app.guard_recipe_ingredient();

alter table public.recipe_ingredient enable row level security;

create policy recipe_ingredient_owner_all on public.recipe_ingredient
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_ingredient_staff_select on public.recipe_ingredient
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );
