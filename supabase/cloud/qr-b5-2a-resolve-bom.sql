-- =============================================================================
-- qr-b5-2a-resolve-bom.sql — QR Ordering B5.2a: app.resolve_order_item_bom. PROPOSAL.
-- Reproduces modifier-bom.ts::resolveBoM in SQL. Given an order_item, builds the base BoM
-- from the active recipe's recipe_ingredient, applies each selected option's
-- modifier_inventory_effect (set_qty/add/replace/none) in (group.sort_order, option.sort_order)
-- order, and persists the positive-quantity result to order_item_ingredient (what FEFO deducts).
-- Batch products self-skip (they deduct finished lots, not ingredients). Internal helper:
-- called by qr_create_pending_order (B5.2b) within its definer context; no public wrapper.
-- Additive; no existing data changed.
-- =============================================================================
begin;

create or replace function app.resolve_order_item_bom(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_branch uuid;
  v_rv     uuid;
  v_ptype  text;
  v_bom    jsonb := '{}'::jsonb;   -- map: item_id::text -> {"q": qty, "u": unit}
  r        record;
  eff      record;
  v_key    text;
  v_existing numeric;
begin
  select oi.tenant_id, oi.branch_id, oi.recipe_version_id, p.type
    into v_tenant, v_branch, v_rv, v_ptype
    from public.order_item oi
    join public.product p on p.id = oi.product_id
   where oi.id = p_order_item_id;
  if not found then raise exception 'order_item % not found', p_order_item_id; end if;

  -- Batch (finished-goods) products deduct finished lots; no ingredient BoM.
  if v_ptype = 'batch' then return; end if;

  -- Seed base BoM from the active recipe version's ingredients.
  for r in
    select item_id, quantity, unit
      from public.recipe_ingredient
     where recipe_version_id = v_rv and tenant_id = v_tenant
  loop
    v_bom := v_bom || jsonb_build_object(
      r.item_id::text, jsonb_build_object('q', r.quantity, 'u', r.unit));
  end loop;

  -- Apply each selected option's effects, in deterministic order.
  for eff in
    select e.effect_type, e.target_item_id, e.new_item_id, e.quantity, e.unit
      from public.order_item_modifier oim
      join public.modifier_option mo on mo.id = oim.modifier_option_id
      join public.modifier_group  mg on mg.id = mo.group_id
      left join public.product_modifier_group pmg
        on pmg.modifier_group_id = mg.id
      join public.modifier_inventory_effect e
        on e.modifier_option_id = oim.modifier_option_id
     where oim.order_item_id = p_order_item_id
       and oim.tenant_id = v_tenant
       and e.effect_type <> 'none'
       and e.quantity is not null
     order by pmg.sort_order nulls last, mo.sort_order
  loop
    if eff.effect_type = 'set_qty' then
      v_key := eff.target_item_id::text;
      v_bom := v_bom || jsonb_build_object(v_key, jsonb_build_object(
        'q', eff.quantity,
        'u', coalesce(eff.unit, v_bom->v_key->>'u', '')));
    elsif eff.effect_type = 'add' then
      v_key := eff.target_item_id::text;
      v_existing := coalesce((v_bom->v_key->>'q')::numeric, 0);
      v_bom := v_bom || jsonb_build_object(v_key, jsonb_build_object(
        'q', v_existing + eff.quantity,
        'u', coalesce(eff.unit, v_bom->v_key->>'u', '')));
    elsif eff.effect_type = 'replace' then
      v_bom := v_bom - eff.target_item_id::text;            -- remove the replaced item
      v_key := eff.new_item_id::text;
      v_bom := v_bom || jsonb_build_object(v_key, jsonb_build_object(
        'q', eff.quantity,
        'u', coalesce(eff.unit, v_bom->v_key->>'u', '')));
    end if;
  end loop;

  -- Persist positive-quantity lines (drop "no sweet" etc.).
  insert into public.order_item_ingredient (tenant_id, branch_id, order_item_id, item_id, quantity, unit)
  select v_tenant, v_branch, p_order_item_id,
         (kv.key)::uuid,
         (kv.value->>'q')::numeric,
         coalesce(nullif(kv.value->>'u', ''), 'unit')
    from jsonb_each(v_bom) as kv
   where (kv.value->>'q')::numeric > 0;
end;
$$;

comment on function app.resolve_order_item_bom(uuid) is
  'Resolve modifier-adjusted BoM for an order_item into order_item_ingredient (modifier-bom.ts parity).';

notify pgrst, 'reload schema';
commit;
