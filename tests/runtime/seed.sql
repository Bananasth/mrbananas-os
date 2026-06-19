-- tests/runtime/seed.sql — minimal master data for runtime validation.
-- Runs as the DB owner (bypasses RLS). Triggers still fire, so recipe versions are inserted
-- as draft, given ingredients, then activated. Fixed UUIDs so the harness can reference them.

begin;

-- tenant + branch
insert into public.tenant (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Mr Bananas');
insert into public.branch (id, tenant_id, name, timezone) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Downtown', 'Asia/Bangkok');

-- users (one per role) + per-branch role assignments
insert into public.app_user (id, tenant_id, email) values
  ('33333333-3333-3333-3333-333333330001', '11111111-1111-1111-1111-111111111111', 'owner@x'),
  ('33333333-3333-3333-3333-333333330002', '11111111-1111-1111-1111-111111111111', 'manager@x'),
  ('33333333-3333-3333-3333-333333330003', '11111111-1111-1111-1111-111111111111', 'staff@x'),
  ('33333333-3333-3333-3333-333333330004', '11111111-1111-1111-1111-111111111111', 'baker@x'),
  ('33333333-3333-3333-3333-333333330005', '11111111-1111-1111-1111-111111111111', 'customer@x');

insert into public.user_branch_role (user_id, branch_id, role_id)
  select '33333333-3333-3333-3333-333333330001'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, id from public.role where key = 'owner'
  union all select '33333333-3333-3333-3333-333333330002'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, id from public.role where key = 'manager'
  union all select '33333333-3333-3333-3333-333333330003'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, id from public.role where key = 'staff'
  union all select '33333333-3333-3333-3333-333333330004'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, id from public.role where key = 'baker'
  union all select '33333333-3333-3333-3333-333333330005'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, id from public.role where key = 'customer';

-- workstations
insert into public.workstation (id, branch_id, name, type) values
  ('44444444-4444-4444-4444-444444440001', '22222222-2222-2222-2222-222222222222', 'POS 1', 'pos'),
  ('44444444-4444-4444-4444-444444440002', '22222222-2222-2222-2222-222222222222', 'Bar', 'beverage'),
  ('44444444-4444-4444-4444-444444440003', '22222222-2222-2222-2222-222222222222', 'Oven', 'bakery_oven');

-- supplier
insert into public.supplier (id, tenant_id, name) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Flour Co');

-- employees (linked to login users)
insert into public.employee (id, tenant_id, branch_id, user_id, code, name) values
  ('66666666-6666-6666-6666-666666660001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330004', 'E-BAKER', 'Baker Bob'),
  ('66666666-6666-6666-6666-666666660002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003', 'E-STAFF', 'Staff Sue');

-- inventory items (supertype) + subtypes
insert into public.inventory_item (id, tenant_id, item_kind, base_unit) values
  ('77777777-7777-7777-7777-777777770001', '11111111-1111-1111-1111-111111111111', 'raw', 'kg'),
  ('77777777-7777-7777-7777-777777770002', '11111111-1111-1111-1111-111111111111', 'raw', 'l'),
  ('77777777-7777-7777-7777-777777770003', '11111111-1111-1111-1111-111111111111', 'finished', 'loaf');
insert into public.raw_material (id, tenant_id, sku, name) values
  ('77777777-7777-7777-7777-777777770001', '11111111-1111-1111-1111-111111111111', 'RM-FLOUR', 'Flour'),
  ('77777777-7777-7777-7777-777777770002', '11111111-1111-1111-1111-111111111111', 'RM-MILK', 'Milk');

-- products: bread (batch, stocked) + latte (made-to-order)
insert into public.product (id, tenant_id, inventory_item_id, sku, name, category, type) values
  ('88888888-8888-8888-8888-888888880001', '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777770003', 'P-BREAD', 'Sourdough', 'bakery', 'batch'),
  ('88888888-8888-8888-8888-888888880002', '11111111-1111-1111-1111-111111111111', null, 'P-LATTE', 'Latte', 'beverage', 'made_to_order');

-- recipes -> versions (draft) -> ingredients -> activate
insert into public.recipe (id, tenant_id, product_id, name) values
  ('99999999-9999-9999-9999-999999990001', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888880001', 'Sourdough recipe'),
  ('99999999-9999-9999-9999-999999990002', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888880002', 'Latte recipe');
insert into public.recipe_version (id, tenant_id, recipe_id, version_no, status, shelf_life_hours, yield_qty) values
  ('99999999-9999-9999-9999-9999999900a1', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999990001', 1, 'draft', 48, 10),
  ('99999999-9999-9999-9999-9999999900a2', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999990002', 1, 'draft', null, 1);
insert into public.recipe_ingredient (tenant_id, recipe_version_id, item_id, quantity, unit) values
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-9999999900a1', '77777777-7777-7777-7777-777777770001', 5, 'kg'),
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-9999999900a2', '77777777-7777-7777-7777-777777770002', 0.2, 'l');
update public.recipe_version set status = 'active', effective_from = now()
  where id in ('99999999-9999-9999-9999-9999999900a1', '99999999-9999-9999-9999-9999999900a2');

-- production plan + batch (bread)
insert into public.production_plan (id, tenant_id, branch_id, plan_date, status, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', current_date, 'scheduled', '33333333-3333-3333-3333-333333330002');
insert into public.production_batch
  (id, tenant_id, branch_id, plan_id, recipe_version_id, workstation_id, lead_employee_id, batch_code, planned_qty, status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', '99999999-9999-9999-9999-9999999900a1', '44444444-4444-4444-4444-444444440003',
   '66666666-6666-6666-6666-666666660001', 'B-001', 10, 'in_progress');

commit;
