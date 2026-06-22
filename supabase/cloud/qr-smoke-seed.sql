-- =============================================================================
-- qr-smoke-seed.sql — QR ordering end-to-end smoke-test seed. PROPOSAL; review, then run.
-- IDEMPOTENT (re-runnable). Reuses the existing tenant + first branch; adds only clearly
-- labeled SMOKE_TEST entities and enables qr_config(public_slug='smoke-test'). No existing
-- catalog/inventory rows are modified. Stock is set directly on a test lot for simplicity.
-- Remove later by deleting rows named/sku'd 'SMOKE_TEST%' / 'SMOKE-%' and the qr_config row.
-- =============================================================================
begin;

do $$
declare
  v_tenant uuid; v_branch uuid; v_ws uuid; v_item uuid; v_lot uuid;
  v_product uuid; v_recipe uuid; v_rv uuid;
  v_group uuid; v_opt_reg uuid; v_opt_large uuid; v_emp uuid;
begin
  -- tenant (single-store): first tenant
  select id into v_tenant from public.tenant order by created_at limit 1;
  if v_tenant is null then raise exception 'no tenant found; cannot seed'; end if;

  -- branch: reuse existing (first), else create a test branch
  select id into v_branch from public.branch where tenant_id = v_tenant order by created_at limit 1;
  if v_branch is null then
    insert into public.branch (tenant_id, name) values (v_tenant, 'SMOKE_TEST Branch') returning id into v_branch;
  end if;

  -- beverage workstation (QR routing target for category='beverage')
  select id into v_ws from public.workstation where branch_id = v_branch and type = 'beverage' limit 1;
  if v_ws is null then
    insert into public.workstation (branch_id, name, type) values (v_branch, 'SMOKE_TEST Bar', 'beverage') returning id into v_ws;
  end if;

  -- raw inventory item (milk)
  select id into v_item from public.inventory_item where tenant_id = v_tenant and sku = 'SMOKE-RM-001' limit 1;
  if v_item is null then
    insert into public.inventory_item (tenant_id, item_kind, item_type, base_unit, name, sku)
      values (v_tenant, 'raw', 'RM', 'ml', 'SMOKE_TEST Milk', 'SMOKE-RM-001') returning id into v_item;
  end if;

  -- stock lot (qty set directly for the test)
  select id into v_lot from public.inventory_lot
   where tenant_id = v_tenant and branch_id = v_branch and item_id = v_item and status = 'available' limit 1;
  if v_lot is null then
    insert into public.inventory_lot (tenant_id, branch_id, item_id, qty_on_hand, unit, status)
      values (v_tenant, v_branch, v_item, 100000, 'ml', 'available') returning id into v_lot;
  end if;

  -- product (beverage, made_to_order)
  select id into v_product from public.product where tenant_id = v_tenant and sku = 'SMOKE-FG-001' limit 1;
  if v_product is null then
    insert into public.product (tenant_id, sku, name, category, type, is_active)
      values (v_tenant, 'SMOKE-FG-001', 'SMOKE_TEST Latte', 'beverage', 'made_to_order', true) returning id into v_product;
  end if;

  -- branch_product (price 65.00 THB inclusive; available)
  if not exists (select 1 from public.branch_product where branch_id = v_branch and product_id = v_product) then
    insert into public.branch_product (tenant_id, branch_id, product_id, price_override, is_available, menu_section)
      values (v_tenant, v_branch, v_product, 6500, true, 'Smoke Test');
  end if;

  -- recipe + active version + ingredient (200 ml milk per drink)
  select id into v_recipe from public.recipe where tenant_id = v_tenant and product_id = v_product limit 1;
  if v_recipe is null then
    insert into public.recipe (tenant_id, product_id, name) values (v_tenant, v_product, 'SMOKE_TEST Latte Recipe') returning id into v_recipe;
  end if;

  select id into v_rv from public.recipe_version where recipe_id = v_recipe and status = 'active' limit 1;
  if v_rv is null then
    insert into public.recipe_version (tenant_id, recipe_id, version_no, status, yield_qty, method)
      values (v_tenant, v_recipe, 1, 'active', 1, 'Steam milk; pull shot; combine. (SMOKE_TEST method)') returning id into v_rv;
  end if;

  if not exists (select 1 from public.recipe_ingredient where recipe_version_id = v_rv and item_id = v_item) then
    insert into public.recipe_ingredient (tenant_id, recipe_version_id, item_id, quantity, unit)
      values (v_tenant, v_rv, v_item, 200, 'ml');
  end if;

  -- optional modifier: Size (single, optional). Large adds 15.00 THB and set_qty milk -> 300 ml.
  select id into v_group from public.modifier_group where tenant_id = v_tenant and name = 'SMOKE_TEST Size' limit 1;
  if v_group is null then
    insert into public.modifier_group (tenant_id, name, is_required, selection_type, min_select, max_select)
      values (v_tenant, 'SMOKE_TEST Size', false, 'single', 0, 1) returning id into v_group;
  end if;

  select id into v_opt_reg from public.modifier_option where tenant_id = v_tenant and group_id = v_group and name = 'Regular' limit 1;
  if v_opt_reg is null then
    insert into public.modifier_option (tenant_id, group_id, name, price_adjustment, is_default)
      values (v_tenant, v_group, 'Regular', 0, true) returning id into v_opt_reg;
  end if;

  select id into v_opt_large from public.modifier_option where tenant_id = v_tenant and group_id = v_group and name = 'Large' limit 1;
  if v_opt_large is null then
    insert into public.modifier_option (tenant_id, group_id, name, price_adjustment, is_default)
      values (v_tenant, v_group, 'Large', 1500, false) returning id into v_opt_large;
    insert into public.modifier_inventory_effect (tenant_id, modifier_option_id, effect_type, target_item_id, quantity, unit)
      values (v_tenant, v_opt_large, 'set_qty', v_item, 300, 'ml');
  end if;

  if not exists (select 1 from public.product_modifier_group where product_id = v_product and modifier_group_id = v_group) then
    insert into public.product_modifier_group (tenant_id, product_id, modifier_group_id, sort_order)
      values (v_tenant, v_product, v_group, 0);
  end if;

  -- employee at the branch (for the staff production RPCs)
  select id into v_emp from public.employee where tenant_id = v_tenant and code = 'SMOKE-EMP' limit 1;
  if v_emp is null then
    insert into public.employee (tenant_id, branch_id, code, name)
      values (v_tenant, v_branch, 'SMOKE-EMP', 'SMOKE_TEST Barista') returning id into v_emp;
  end if;

  -- enable QR ordering for the branch
  if not exists (select 1 from public.qr_config where branch_id = v_branch) then
    insert into public.qr_config (branch_id, tenant_id, enabled, public_slug, pickup_instruction, prep_sla_minutes, claim_timeout_minutes)
      values (v_branch, v_tenant, true, 'smoke-test', 'Pick up at the bar · รับที่บาร์', 10, 5);
  else
    update public.qr_config set enabled = true, public_slug = 'smoke-test' where branch_id = v_branch;
  end if;

  raise notice 'SMOKE seed OK: tenant=% branch=% ws=% product=% recipe_version=% employee=% slug=smoke-test',
    v_tenant, v_branch, v_ws, v_product, v_rv, v_emp;
end $$;

commit;

-- Seeded IDs for the smoke test (copy these):
select c.public_slug, c.enabled, c.branch_id,
       p.id as product_id, p.name as product_name, bp.price_override as price_satang,
       (select id from public.employee e where e.tenant_id = b.tenant_id and e.code = 'SMOKE-EMP') as employee_id
  from public.qr_config c
  join public.branch b on b.id = c.branch_id
  join public.product p on p.tenant_id = b.tenant_id and p.sku = 'SMOKE-FG-001'
  join public.branch_product bp on bp.product_id = p.id and bp.branch_id = c.branch_id
 where c.public_slug = 'smoke-test';
