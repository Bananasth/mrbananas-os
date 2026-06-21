-- =============================================================================
-- item-types-sku.sql — Item Types + Auto SKU (PROPOSAL; review before applying).
-- Additive/relaxing only — NO data destroyed. Existing names/SKUs preserved; new
-- columns are backfilled from existing data. Idempotent.
--
-- ROLLBACK: it is wrapped in begin/commit; ROLLBACK before commit undoes all of it.
-- After commit, to fully revert you'd drop the added columns/objects (the original
-- data in raw_material/semi_finished is untouched throughout).
-- =============================================================================
begin;

-- 1) canonical item_type + name/sku on the inventory_item supertype
alter table public.inventory_item
  add column if not exists item_type text
    check (item_type in ('RM', 'SF', 'PK', 'FG', 'MD', 'SV')),
  add column if not exists name text,
  add column if not exists sku  text;

-- item_kind is only meaningful for raw/semi/finished (subtype-linked). The new types
-- (packaging/merchandise/service) have no subtype, so allow null.
alter table public.inventory_item alter column item_kind drop not null;

-- 2) backfill from existing data (data preserved; new columns derived)
update public.inventory_item i set
  name = coalesce(i.name,
                  (select name from public.raw_material  where id = i.id),
                  (select name from public.semi_finished where id = i.id)),
  sku  = coalesce(i.sku,
                  (select sku from public.raw_material  where id = i.id),
                  (select sku from public.semi_finished where id = i.id)),
  item_type = coalesce(i.item_type, case i.item_kind
                  when 'raw' then 'RM' when 'semi_finished' then 'SF'
                  when 'finished' then 'FG' end)
where i.name is null or i.sku is null or i.item_type is null;

-- 3) per-tenant SKU uniqueness (prevents duplicates; manual override still allowed)
create unique index if not exists inventory_item_tenant_sku_key
  on public.inventory_item (tenant_id, sku) where sku is not null;

-- 4) SKU counter — only ever increments, so deleted numbers are NEVER reused
create table if not exists public.sku_counter (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  prefix    text not null check (prefix in ('RM', 'SF', 'PK', 'FG', 'MD', 'SV')),
  next_no   integer not null default 1 check (next_no >= 1),
  primary key (tenant_id, prefix)
);
alter table public.sku_counter enable row level security;
create policy sku_counter_owner_all on public.sku_counter
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
grant select, insert, update on public.sku_counter to authenticated;

-- 5) next_sku(prefix): allocate the next number for the prefix under a row lock,
--    return e.g. RM0001. Owner only. Never reuses a number.
create or replace function app.next_sku(p_prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_no integer;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  if not app.is_tenant_owner() then raise exception 'owner only'; end if;
  if p_prefix not in ('RM', 'SF', 'PK', 'FG', 'MD', 'SV') then
    raise exception 'invalid prefix %', p_prefix;
  end if;
  insert into public.sku_counter (tenant_id, prefix, next_no)
    values (v_tenant, p_prefix, 1)
    on conflict (tenant_id, prefix) do nothing;
  update public.sku_counter set next_no = next_no + 1
    where tenant_id = v_tenant and prefix = p_prefix
    returning next_no - 1 into v_no;
  return p_prefix || lpad(v_no::text, 4, '0');
end; $$;

create or replace function public.next_sku(p_prefix text)
  returns text language sql security invoker set search_path = '' as $$
    select app.next_sku(p_prefix);
$$;
revoke all on function public.next_sku(text) from public, anon;
grant execute on function public.next_sku(text) to authenticated;

-- 6) seed each counter past any existing PREFIX#### SKUs, so generated SKUs never
--    collide with already-used ones (and still never reuse deleted numbers)
insert into public.sku_counter (tenant_id, prefix, next_no)
  select i.tenant_id, i.item_type,
         max((regexp_replace(i.sku, '^[A-Z]{2}', ''))::int) + 1
    from public.inventory_item i
   where i.item_type is not null
     and i.sku ~ ('^' || i.item_type || '[0-9]+$')
   group by i.tenant_id, i.item_type
  on conflict (tenant_id, prefix)
    do update set next_no = greatest(public.sku_counter.next_no, excluded.next_no);

notify pgrst, 'reload schema';

commit;   -- <-- ROLLBACK; to abort with zero changes
