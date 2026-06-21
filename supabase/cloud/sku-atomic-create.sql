-- =============================================================================
-- sku-atomic-create.sql — fix SKU skipping (PROPOSAL; review, then run).
-- Additive only (one new function + public wrapper). Changes NO existing data.
--
-- Why: previewing a SKU must NOT consume a number. The number is allocated only
-- here, at create time, IN THE SAME TRANSACTION as the insert — so if the insert
-- fails (duplicate name/SKU) the counter increment rolls back too. No skips.
-- (Preview is a plain read of sku_counter.next_no — no function needed.)
-- =============================================================================
begin;

create or replace function app.create_inventory_item(
  p_item_type text,
  p_name      text,
  p_base_unit text,
  p_auto_sku  boolean,
  p_sku       text default null
)
returns public.inventory_item
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_sku  text;
  v_kind text;
  v_row  public.inventory_item;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  if not app.is_tenant_owner() then raise exception 'owner only'; end if;
  if p_item_type not in ('RM', 'SF', 'PK', 'FG', 'MD', 'SV') then
    raise exception 'invalid item_type %', p_item_type;
  end if;

  v_kind := case p_item_type
    when 'RM' then 'raw' when 'SF' then 'semi_finished' when 'FG' then 'finished'
    else null end;

  if p_auto_sku then
    v_sku := app.next_sku(p_item_type);        -- increments the counter...
  else
    v_sku := nullif(btrim(p_sku), '');
    if v_sku is null then raise exception 'sku required'; end if;
  end if;

  -- ...and if THIS insert fails (duplicate name/sku), the whole function rolls
  -- back — including the counter increment above. So a number is never skipped.
  insert into public.inventory_item (tenant_id, item_type, item_kind, base_unit, name, sku)
    values (v_tenant, p_item_type, v_kind, p_base_unit, p_name, v_sku)
    returning * into v_row;
  return v_row;
end; $$;

grant execute on function app.create_inventory_item(text, text, text, boolean, text) to authenticated;

create or replace function public.create_inventory_item(
  p_item_type text, p_name text, p_base_unit text, p_auto_sku boolean, p_sku text default null
) returns public.inventory_item
  language sql security invoker set search_path = '' as $$
    select app.create_inventory_item(p_item_type, p_name, p_base_unit, p_auto_sku, p_sku);
$$;
revoke all on function public.create_inventory_item(text, text, text, boolean, text) from public, anon;
grant execute on function public.create_inventory_item(text, text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;
