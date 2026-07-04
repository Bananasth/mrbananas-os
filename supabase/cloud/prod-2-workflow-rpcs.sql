-- =============================================================================
-- prod-2-workflow-rpcs.sql — Phase D: production workflow RPCs. REVIEW ONLY.
-- Requires prod-1 (recipe_stage). Drives the EXISTING plan/batch/stage state machines within
-- their existing status enums. REUSES existing consume_for_batch + complete_batch (unchanged).
-- All SECURITY DEFINER with branch-role auth (mirrors consume_for_batch/complete_batch).
--   create_production_plan · add_production_batch · start_batch (generates stages from template)
--   · start_stage · complete_stage · scrap_batch
-- =============================================================================
begin;

-- ---- plan header (idempotent per branch+date) ----
create or replace function app.create_production_plan(p_branch_id uuid, p_plan_date date)
returns public.production_plan language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_row public.production_plan;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['manager'])) then
    raise exception 'not authorized to plan production'; end if;
  insert into public.production_plan (tenant_id, branch_id, plan_date, status, created_by)
    values (v_tenant, p_branch_id, p_plan_date, 'scheduled', app.current_user_id())
  on conflict (branch_id, plan_date) do update set updated_at = now()   -- no-op to return the existing plan
  returning * into v_row;
  return v_row;
end; $$;

-- ---- add a planned batch to a plan ----
create or replace function app.add_production_batch(
  p_plan_id uuid, p_recipe_version_id uuid, p_planned_qty numeric,
  p_workstation_id uuid, p_batch_code text, p_lead_employee_id uuid default null)
returns public.production_batch language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_branch uuid; v_row public.production_batch;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select branch_id into v_branch from public.production_plan where id = p_plan_id and tenant_id = v_tenant;
  if v_branch is null then raise exception 'plan not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized'; end if;
  if p_planned_qty is not null and p_planned_qty <= 0 then raise exception 'planned_qty must be > 0'; end if;
  if not exists (select 1 from public.recipe_version rv
                  where rv.id = p_recipe_version_id and rv.tenant_id = v_tenant and rv.status = 'active') then
    raise exception 'recipe_version is not active';
  end if;
  insert into public.production_batch
    (tenant_id, branch_id, plan_id, recipe_version_id, workstation_id, lead_employee_id, batch_code, planned_qty, status)
    values (v_tenant, v_branch, p_plan_id, p_recipe_version_id, p_workstation_id, p_lead_employee_id, p_batch_code, p_planned_qty, 'planned')
    returning * into v_row;
  return v_row;
end; $$;

-- ---- start a batch: planned -> in_progress, generate stages from the recipe template ----
create or replace function app.start_batch(p_batch_id uuid, p_employee_id uuid default null)
returns public.production_batch language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_b record; v_row public.production_batch; v_now timestamptz := now();
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select branch_id, recipe_version_id, status, plan_id into v_b
    from public.production_batch where id = p_batch_id and tenant_id = v_tenant for update;
  if v_b.branch_id is null then raise exception 'batch not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_b.branch_id, array['manager','staff','baker'])) then
    raise exception 'not authorized'; end if;
  if v_b.status <> 'planned' then raise exception 'batch is not in planned status (is %)', v_b.status; end if;

  -- generate batch_stage rows from the recipe template (idempotent: only if none exist yet)
  if not exists (select 1 from public.batch_stage where batch_id = p_batch_id) then
    insert into public.batch_stage (tenant_id, batch_id, stage, seq, planned_start, planned_end, status)
    select v_tenant, p_batch_id, rs.stage, rs.seq,
           v_now + make_interval(hours => rs.offset_hours),
           v_now + make_interval(hours => rs.offset_hours) + (coalesce(rs.duration_minutes, 0) * interval '1 minute'),
           'pending'
      from public.recipe_stage rs
     where rs.recipe_version_id = v_b.recipe_version_id and rs.tenant_id = v_tenant
     order by rs.seq;
  end if;

  update public.production_batch set status = 'in_progress', started_at = coalesce(started_at, v_now)
   where id = p_batch_id returning * into v_row;
  update public.production_plan set status = 'in_progress'
   where id = v_b.plan_id and status in ('draft','scheduled');
  return v_row;
end; $$;

-- ---- advance a stage: pending -> in_progress ----
create or replace function app.start_stage(p_stage_id uuid, p_employee_id uuid default null)
returns public.batch_stage language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_branch uuid; v_row public.batch_stage;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select b.branch_id into v_branch
    from public.batch_stage s join public.production_batch b on b.id = s.batch_id and b.tenant_id = s.tenant_id
   where s.id = p_stage_id and s.tenant_id = v_tenant;
  if v_branch is null then raise exception 'stage not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized'; end if;
  update public.batch_stage
     set status = 'in_progress', actual_start = now(), employee_id = coalesce(p_employee_id, employee_id)
   where id = p_stage_id and status = 'pending'
   returning * into v_row;
  if v_row.id is null then raise exception 'stage is not pending'; end if;
  return v_row;
end; $$;

-- ---- advance a stage: in_progress -> done ----
create or replace function app.complete_stage(p_stage_id uuid)
returns public.batch_stage language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_branch uuid; v_row public.batch_stage;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select b.branch_id into v_branch
    from public.batch_stage s join public.production_batch b on b.id = s.batch_id and b.tenant_id = s.tenant_id
   where s.id = p_stage_id and s.tenant_id = v_tenant;
  if v_branch is null then raise exception 'stage not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized'; end if;
  update public.batch_stage set status = 'done', actual_end = now()
   where id = p_stage_id and status = 'in_progress'
   returning * into v_row;
  if v_row.id is null then raise exception 'stage is not in progress'; end if;
  return v_row;
end; $$;

-- ---- scrap a batch: planned/in_progress -> scrapped ----
create or replace function app.scrap_batch(p_batch_id uuid)
returns public.production_batch language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.current_tenant_id(); v_branch uuid; v_row public.production_batch;
begin
  if v_tenant is null then raise exception 'no tenant context'; end if;
  select branch_id into v_branch from public.production_batch where id = p_batch_id and tenant_id = v_tenant for update;
  if v_branch is null then raise exception 'batch not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized'; end if;
  update public.production_batch set status = 'scrapped', completed_at = now()
   where id = p_batch_id and status in ('planned','in_progress')
   returning * into v_row;
  if v_row.id is null then raise exception 'batch cannot be scrapped from its current status'; end if;
  return v_row;
end; $$;

-- ---- public wrappers (app schema not on PostgREST) + grants ----
create or replace function public.create_production_plan(p_branch_id uuid, p_plan_date date)
  returns public.production_plan language sql security invoker set search_path = ''
  as $$ select app.create_production_plan(p_branch_id, p_plan_date); $$;
create or replace function public.add_production_batch(p_plan_id uuid, p_recipe_version_id uuid, p_planned_qty numeric,
  p_workstation_id uuid, p_batch_code text, p_lead_employee_id uuid default null)
  returns public.production_batch language sql security invoker set search_path = ''
  as $$ select app.add_production_batch(p_plan_id, p_recipe_version_id, p_planned_qty, p_workstation_id, p_batch_code, p_lead_employee_id); $$;
create or replace function public.start_batch(p_batch_id uuid, p_employee_id uuid default null)
  returns public.production_batch language sql security invoker set search_path = ''
  as $$ select app.start_batch(p_batch_id, p_employee_id); $$;
create or replace function public.start_stage(p_stage_id uuid, p_employee_id uuid default null)
  returns public.batch_stage language sql security invoker set search_path = ''
  as $$ select app.start_stage(p_stage_id, p_employee_id); $$;
create or replace function public.complete_stage(p_stage_id uuid)
  returns public.batch_stage language sql security invoker set search_path = ''
  as $$ select app.complete_stage(p_stage_id); $$;
create or replace function public.scrap_batch(p_batch_id uuid)
  returns public.production_batch language sql security invoker set search_path = ''
  as $$ select app.scrap_batch(p_batch_id); $$;

grant execute on function public.create_production_plan(uuid, date)                               to authenticated;
grant execute on function public.add_production_batch(uuid, uuid, numeric, uuid, text, uuid)      to authenticated;
grant execute on function public.start_batch(uuid, uuid)                                          to authenticated;
grant execute on function public.start_stage(uuid, uuid)                                          to authenticated;
grant execute on function public.complete_stage(uuid)                                             to authenticated;
grant execute on function public.scrap_batch(uuid)                                                to authenticated;

commit;
