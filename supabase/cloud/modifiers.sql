-- =============================================================================
-- modifiers.sql — POS Modifier System (drinks). Paste into the Supabase SQL Editor.
--
-- ADDITIVE ONLY: new tables + a NEW resolved-deduction function + its public
-- wrapper. The frozen app.fulfil_order_item is NOT changed. The new
-- app.fulfil_order_item_resolved deducts from the per-line resolved BoM
-- (order_item_ingredient) when present, else FALLS BACK to recipe_ingredient —
-- so current recipe-based deduction is byte-for-byte identical for items with no
-- modifiers.
-- =============================================================================

-- ---------- config tables (tenant-scoped) ----------
create table if not exists public.modifier_group (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  name       text not null,
  min_select integer not null default 1 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.modifier_option (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  group_id   uuid not null,
  name       text not null,
  is_default boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, tenant_id) references public.modifier_group (id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create table if not exists public.product_modifier_group (
  tenant_id        uuid not null,
  product_id       uuid not null,
  modifier_group_id uuid not null,
  sort             integer not null default 0,
  primary key (product_id, modifier_group_id),
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete cascade,
  foreign key (modifier_group_id, tenant_id) references public.modifier_group (id, tenant_id) on delete cascade
);

-- How an option changes the BoM:
--   set_qty : set target_item_id's quantity to `quantity` (sweetness -> Sugar Syrup)
--   replace : remove target_item_id, add new_item_id at `quantity` (Milk -> Oat Milk)
create table if not exists public.modifier_inventory_effect (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  modifier_option_id uuid not null,
  effect_type        text not null check (effect_type in ('set_qty', 'replace')),
  target_item_id     uuid not null,
  new_item_id        uuid,
  quantity           numeric not null check (quantity >= 0),
  unit               text not null,
  created_at         timestamptz not null default now(),
  foreign key (modifier_option_id, tenant_id) references public.modifier_option (id, tenant_id) on delete cascade,
  foreign key (target_item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict,
  foreign key (new_item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict,
  check (effect_type <> 'replace' or new_item_id is not null)
);

-- ---------- per-order tables (branch-scoped, written at checkout) ----------
create table if not exists public.order_item_modifier (
  tenant_id          uuid not null,
  branch_id          uuid not null,
  order_item_id      uuid not null,
  modifier_option_id uuid not null,
  created_at         timestamptz not null default now(),
  primary key (order_item_id, modifier_option_id),
  foreign key (order_item_id) references public.order_item (id) on delete cascade,
  foreign key (modifier_option_id, tenant_id) references public.modifier_option (id, tenant_id) on delete restrict
);

create table if not exists public.order_item_ingredient (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  branch_id     uuid not null,
  order_item_id uuid not null,
  item_id       uuid not null,
  quantity      numeric not null check (quantity >= 0),
  unit          text not null,
  created_at    timestamptz not null default now(),
  foreign key (order_item_id) references public.order_item (id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict
);

-- ---------- RLS ----------
alter table public.modifier_group enable row level security;
alter table public.modifier_option enable row level security;
alter table public.product_modifier_group enable row level security;
alter table public.modifier_inventory_effect enable row level security;
alter table public.order_item_modifier enable row level security;
alter table public.order_item_ingredient enable row level security;

-- config: owner writes, any role in the tenant reads (POS needs to read)
do $$
declare t text;
begin
  foreach t in array array['modifier_group','modifier_option','product_modifier_group','modifier_inventory_effect']
  loop
    execute format('create policy %1$s_owner_all on public.%1$s for all to authenticated using (tenant_id = app.current_tenant_id() and app.is_tenant_owner()) with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (tenant_id = app.current_tenant_id() and app.has_any_role(array[''owner'',''manager'',''staff'',''baker'']));', t);
  end loop;
end $$;

-- per-order: owner + branch manager/staff write; all branch roles read
do $$
declare t text;
begin
  foreach t in array array['order_item_modifier','order_item_ingredient']
  loop
    execute format('create policy %1$s_owner_all on public.%1$s for all to authenticated using (tenant_id = app.current_tenant_id() and app.is_tenant_owner()) with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());', t);
    execute format('create policy %1$s_staff_write on public.%1$s for all to authenticated using (app.has_branch_role(branch_id, array[''manager'',''staff''])) with check (app.has_branch_role(branch_id, array[''manager'',''staff'']));', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (app.has_branch_role(branch_id, array[''owner'',''manager'',''staff'',''baker'']));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.modifier_group, public.modifier_option, public.product_modifier_group,
  public.modifier_inventory_effect, public.order_item_modifier, public.order_item_ingredient
  to authenticated;

-- ---------- resolved deduction (NEW; frozen app.fulfil_order_item is untouched) ----------
create or replace function app.fulfil_order_item_resolved(
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
  v_has_resolved boolean;
begin
  select branch_id, product_id, recipe_version_id, qty, batch_id
    into v_oi from public.order_item where id = p_order_item_id and tenant_id = v_tenant;
  if not found then raise exception 'order_item not found'; end if;

  if not (app.is_tenant_owner() or app.has_branch_role(v_oi.branch_id, array['manager', 'staff', 'baker'])) then
    raise exception 'not authorized to fulfil order_item %', p_order_item_id;
  end if;

  select type, inventory_item_id into v_prod from public.product where id = v_oi.product_id;

  if v_prod.type = 'batch' then
    if v_prod.inventory_item_id is null then
      raise exception 'batch product has no stockable inventory_item; cannot deduct';
    end if;
    v_batch := app.deduct_fefo(v_tenant, v_oi.branch_id, v_prod.inventory_item_id, v_oi.qty,
      'sell', 'order_item', p_order_item_id, p_employee_id);
    if v_oi.batch_id is null and v_batch is not null then
      update public.order_item set batch_id = v_batch where id = p_order_item_id;
    end if;
    return;
  end if;

  select exists(
    select 1 from public.order_item_ingredient where order_item_id = p_order_item_id and tenant_id = v_tenant
  ) into v_has_resolved;

  if v_has_resolved then
    -- modifier-resolved BoM (skip zero quantities, e.g. "no sweet")
    for ing in
      select item_id, quantity from public.order_item_ingredient
       where order_item_id = p_order_item_id and tenant_id = v_tenant and quantity > 0
    loop
      perform app.deduct_fefo(v_tenant, v_oi.branch_id, ing.item_id, ing.quantity * v_oi.qty,
        'sell', 'order_item', p_order_item_id, p_employee_id);
    end loop;
  else
    -- fallback: identical to app.fulfil_order_item (recipe ingredients)
    for ing in
      select item_id, quantity from public.recipe_ingredient
       where recipe_version_id = v_oi.recipe_version_id and tenant_id = v_tenant
    loop
      perform app.deduct_fefo(v_tenant, v_oi.branch_id, ing.item_id, ing.quantity * v_oi.qty,
        'sell', 'order_item', p_order_item_id, p_employee_id);
    end loop;
  end if;
end;
$$;

-- public wrapper (PostgREST doesn't expose the app schema)
create or replace function public.fulfil_order_item_resolved(
  p_order_item_id uuid, p_employee_id uuid default null
) returns void language sql security invoker set search_path = '' as $$
  select app.fulfil_order_item_resolved(p_order_item_id, p_employee_id);
$$;
revoke all on function public.fulfil_order_item_resolved(uuid, uuid) from public, anon;
grant execute on function public.fulfil_order_item_resolved(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
