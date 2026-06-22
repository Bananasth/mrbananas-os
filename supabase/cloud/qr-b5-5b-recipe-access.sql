-- =============================================================================
-- qr-b5-5b-recipe-access.sql — QR Ordering B5.5b: recipe/method one-time view. PROPOSAL.
-- qr_open_recipe: only the claiming barista may open; one grant per (item,kind) EVER (partial
-- unique); denied attempts are LOGGED and RETURNED (not raised) so the leak trail commits.
-- Granted opens return content (recipe -> ingredients; method -> recipe_version.method).
-- qr_close_recipe: stamps closed_at + duration_seconds. Staff-only. Additive.
-- =============================================================================
begin;

create or replace function app.qr_open_recipe(
  p_order_item_id uuid, p_employee_id uuid, p_kind text,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_branch uuid; v_claimed uuid; v_tenant uuid; v_order uuid; v_rv uuid;
  v_access uuid; v_content jsonb;
begin
  if p_kind not in ('recipe','method') then raise exception 'invalid kind %', p_kind; end if;
  v_branch := app.qr_assert_actor(p_order_item_id, p_employee_id);

  select pi.claimed_by, oi.tenant_id, oi.order_id, oi.recipe_version_id
    into v_claimed, v_tenant, v_order, v_rv
    from public.prep_item pi
    join public.order_item oi on oi.id = pi.order_item_id
   where pi.order_item_id = p_order_item_id;

  -- only the claiming barista may view (log denied_not_owner; do NOT raise -> row must persist)
  if v_claimed is null or v_claimed <> p_employee_id then
    insert into public.recipe_access
      (tenant_id, branch_id, order_id, order_item_id, employee_id, kind, outcome,
       ip_address, device_id, user_agent, device_name)
    values (v_tenant, v_branch, v_order, p_order_item_id, p_employee_id, p_kind, 'denied_not_owner',
            p_ip, p_device_id, p_user_agent, p_device_name);
    return jsonb_build_object('outcome','denied_not_owner','kind',p_kind,'access_id',null,'content',null);
  end if;

  -- one grant per (item, kind) EVER; on conflict log denied_already_used and return
  begin
    insert into public.recipe_access
      (tenant_id, branch_id, order_id, order_item_id, employee_id, kind, outcome,
       ip_address, device_id, user_agent, device_name, opened_at)
    values (v_tenant, v_branch, v_order, p_order_item_id, p_employee_id, p_kind, 'granted',
            p_ip, p_device_id, p_user_agent, p_device_name, now())
    returning id into v_access;
  exception when unique_violation then
    insert into public.recipe_access
      (tenant_id, branch_id, order_id, order_item_id, employee_id, kind, outcome,
       ip_address, device_id, user_agent, device_name)
    values (v_tenant, v_branch, v_order, p_order_item_id, p_employee_id, p_kind, 'denied_already_used',
            p_ip, p_device_id, p_user_agent, p_device_name);
    return jsonb_build_object('outcome','denied_already_used','kind',p_kind,'access_id',null,'content',null);
  end;

  -- granted: return content
  if p_kind = 'recipe' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', ri.item_id, 'name', ii.name, 'quantity', ri.quantity, 'unit', ri.unit)
             order by ii.name nulls last), '[]'::jsonb)
      into v_content
      from public.recipe_ingredient ri
      join public.inventory_item ii on ii.id = ri.item_id
     where ri.recipe_version_id = v_rv and ri.tenant_id = v_tenant;
  else
    select to_jsonb(coalesce(method, '')) into v_content
      from public.recipe_version where id = v_rv;
  end if;

  return jsonb_build_object('outcome','granted','access_id',v_access,'kind',p_kind,'content',v_content);
end; $$;

create or replace function app.qr_close_recipe(p_access_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_dur int;
begin
  select branch_id into v_branch from public.recipe_access where id = p_access_id;
  if v_branch is null then raise exception 'access record not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  update public.recipe_access
     set closed_at = now(),
         duration_seconds = greatest(0, extract(epoch from (now() - opened_at))::int)
   where id = p_access_id and outcome = 'granted' and closed_at is null
  returning duration_seconds into v_dur;
  if v_dur is null then raise exception 'access record not open or already closed'; end if;
  return v_dur;
end; $$;

create or replace function public.qr_open_recipe(p_order_item_id uuid, p_employee_id uuid, p_kind text, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns jsonb language sql security invoker set search_path = '' as $$ select app.qr_open_recipe(p_order_item_id,p_employee_id,p_kind,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_close_recipe(p_access_id uuid)
returns integer language sql security invoker set search_path = '' as $$ select app.qr_close_recipe(p_access_id); $$;

grant execute on function app.qr_open_recipe(uuid, uuid, text, inet, text, text, text) to authenticated;
revoke all on function public.qr_open_recipe(uuid, uuid, text, inet, text, text, text) from public, anon;
grant execute on function public.qr_open_recipe(uuid, uuid, text, inet, text, text, text) to authenticated;

grant execute on function app.qr_close_recipe(uuid) to authenticated;
revoke all on function public.qr_close_recipe(uuid) from public, anon;
grant execute on function public.qr_close_recipe(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
