-- =============================================================================
-- qr-b5-2b-create-pending-order.sql — QR Ordering B5.2b: qr_create_pending_order. PROPOSAL.
-- Anon, server-authoritative. Creates sales_order(channel='qr',status='open') + order_item
-- (re-priced from branch_product + modifier price_adjustment; active recipe_version snapshot;
-- workstation routed by category) + order_item_modifier + resolved order_item_ingredient (via
-- B5.2a) + qr_order(pending_payment, expires now+10min) + payment(pending,'qr','mock').
-- NO queue, NO stock, NO prep_item (that is B5.3). public wrapper is SECURITY DEFINER so anon
-- (no app-schema usage) can call it. Additive; no existing data changed.
-- =============================================================================
begin;

create or replace function app.qr_create_pending_order(p_slug text, p_items jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_branch   uuid;
  v_order_id uuid;
  v_tracking uuid;
  v_client   uuid := gen_random_uuid();
  v_total    bigint := 0;
  v_tax      bigint := 0;
  it         jsonb;
  v_pid      uuid;
  v_qty      numeric;
  v_options  uuid[];
  v_price    bigint;
  v_cat      text;
  v_ptype    text;
  v_adj      bigint;
  v_unit_price bigint;
  v_gross    bigint;
  v_line_tax bigint;
  v_rv       uuid;
  v_ws       uuid;
  v_oi       uuid;
  v_ws_type  text;
begin
  -- 1. resolve + gate
  select tenant_id, branch_id into v_tenant, v_branch
    from public.qr_config where public_slug = p_slug and enabled = true;
  if v_tenant is null then raise exception 'ordering is not available'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  insert into public.sales_order (tenant_id, branch_id, channel, status, subtotal, tax_total, total)
    values (v_tenant, v_branch, 'qr', 'open', 0, 0, 0)
    returning id into v_order_id;

  -- 2. per item (server-authoritative)
  for it in select value from jsonb_array_elements(p_items)
  loop
    v_pid := (it->>'product_id')::uuid;
    v_qty := coalesce((it->>'qty')::numeric, 0);
    if v_qty <= 0 then raise exception 'invalid qty for product %', v_pid; end if;

    -- product orderable + price + category + type
    select bp.price_override, pr.category, pr.type
      into v_price, v_cat, v_ptype
      from public.product pr
      join public.branch_product bp on bp.product_id = pr.id and bp.tenant_id = pr.tenant_id
     where pr.id = v_pid and pr.tenant_id = v_tenant and bp.branch_id = v_branch
       and pr.is_active = true and bp.is_available = true and bp.price_override is not null;
    if v_price is null then raise exception 'product % is not orderable', v_pid; end if;

    -- distinct option ids
    select coalesce(array_agg(distinct o::uuid), '{}') into v_options
      from jsonb_array_elements_text(coalesce(it->'option_ids', '[]'::jsonb)) o;

    -- every option must belong to an active group of THIS product and be active (security)
    if v_options <> '{}' and exists (
      select 1 from unnest(v_options) as oid
       where not exists (
         select 1
           from public.modifier_option mo
           join public.modifier_group mg on mg.id = mo.group_id and mg.is_active = true
           join public.product_modifier_group pmg on pmg.modifier_group_id = mg.id and pmg.product_id = v_pid
          where mo.id = oid and mo.is_active = true and mo.tenant_id = v_tenant
       )
    ) then
      raise exception 'invalid modifier option for product %', v_pid;
    end if;

    -- required / min_select / max_select per product group (correctness)
    if exists (
      select 1
        from public.product_modifier_group pmg
        join public.modifier_group mg on mg.id = pmg.modifier_group_id and mg.is_active = true
        left join (
          select mo.group_id, count(*) cnt
            from public.modifier_option mo
           where mo.id = any(v_options)
           group by mo.group_id
        ) sel on sel.group_id = mg.id
       where pmg.product_id = v_pid
         and ( coalesce(sel.cnt, 0) < (case when mg.is_required then greatest(mg.min_select, 1) else mg.min_select end)
            or coalesce(sel.cnt, 0) > mg.max_select )
    ) then
      raise exception 'modifier selection invalid (required/min/max) for product %', v_pid;
    end if;

    -- active recipe version (snapshot)
    select rv.id into v_rv
      from public.recipe rc
      join public.recipe_version rv on rv.recipe_id = rc.id and rv.status = 'active'
     where rc.product_id = v_pid and rc.tenant_id = v_tenant
     limit 1;
    if v_rv is null then raise exception 'no active recipe for product %', v_pid; end if;

    -- route workstation by category
    v_ws_type := case when v_cat = 'beverage' then 'beverage'
                      when v_cat = 'bakery'   then 'bakery_oven' end;
    if v_ws_type is null then raise exception 'product % category % cannot be routed', v_pid, v_cat; end if;
    select w.id into v_ws
      from public.workstation w
     where w.branch_id = v_branch and w.type = v_ws_type
     limit 1;
    if v_ws is null then raise exception 'no % station at this branch', v_ws_type; end if;

    -- price = base + sum(option adjustments); fold into unit_price (VAT-inclusive)
    select coalesce(sum(mo.price_adjustment), 0) into v_adj
      from public.modifier_option mo where mo.id = any(v_options);
    v_unit_price := greatest(v_price + v_adj, 0);
    v_gross    := round(v_unit_price * v_qty)::bigint;
    v_line_tax := v_gross - round(v_gross / 1.07)::bigint;   -- VAT extracted from inclusive gross

    insert into public.order_item
      (tenant_id, branch_id, order_id, product_id, recipe_version_id, workstation_id, employee_id, qty, unit_price, line_tax)
      values (v_tenant, v_branch, v_order_id, v_pid, v_rv, v_ws, null, v_qty, v_unit_price, v_line_tax)
      returning id into v_oi;

    insert into public.order_item_modifier
      (tenant_id, branch_id, order_item_id, modifier_option_id, option_name, price_adjustment)
      select v_tenant, v_branch, v_oi, mo.id, mo.name, mo.price_adjustment
        from public.modifier_option mo where mo.id = any(v_options);

    perform app.resolve_order_item_bom(v_oi);

    v_total := v_total + v_gross;
    v_tax   := v_tax + v_line_tax;
  end loop;

  if v_total <= 0 then raise exception 'order total must be positive'; end if;

  update public.sales_order
     set subtotal = v_total - v_tax, tax_total = v_tax, total = v_total
   where id = v_order_id;

  insert into public.qr_order (order_id, tenant_id, branch_id, status, expires_at, customer_note)
    values (v_order_id, v_tenant, v_branch, 'pending_payment', now() + interval '10 minutes', p_note)
    returning tracking_token into v_tracking;

  insert into public.payment (tenant_id, branch_id, order_id, method, amount, status, provider, client_uuid)
    values (v_tenant, v_branch, v_order_id, 'qr', v_total, 'pending', 'mock', v_client);

  return jsonb_build_object(
    'tracking_token', v_tracking,
    'order_id',       v_order_id,
    'amount',         v_total,
    'client_uuid',    v_client);
end;
$$;

comment on function app.qr_create_pending_order(text, jsonb, text) is
  'Anon: create a pending_payment QR order (re-priced server-side). No queue/stock/prep_item yet.';

-- public wrapper: SECURITY DEFINER so anon (no app-schema usage) can reach app.*
create or replace function public.qr_create_pending_order(p_slug text, p_items jsonb, p_note text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select app.qr_create_pending_order(p_slug, p_items, p_note); $$;

revoke all on function public.qr_create_pending_order(text, jsonb, text) from public;
grant execute on function public.qr_create_pending_order(text, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
