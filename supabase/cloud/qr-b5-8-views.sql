-- =============================================================================
-- qr-b5-8-views.sql — QR Ordering B5.8: KPI / leak VIEWS (final block). PROPOSAL.
-- All security_invoker=true -> each caller sees only their tenant/branch rows via the
-- underlying tables' RLS (same pattern as production_batch_yield). No tables; read-only.
--   qr_production_timeline         — unified per-item chronological feed (4 sources)
--   qr_recipe_version_performance  — KPIs by recipe_version
--   qr_employee_skill_matrix       — KPIs by employee x recipe_version (training slice separated)
--   qr_recipe_access_anomaly       — recipe-leak signals
-- Additive; no existing data changed.
-- =============================================================================
begin;

-- 1) Unified production timeline: prep_event + recipe_access + completion_photo + prep_item
create or replace view public.qr_production_timeline with (security_invoker = true) as
  select order_item_id, order_id, branch_id, occurred_at,
         event_type as event, actor_employee_id as actor, payload as detail, 'prep_event'::text as source
    from public.prep_event
  union all
  select order_item_id, order_id, branch_id, opened_at,
         case when kind='recipe' then 'recipe_viewed' else 'method_viewed' end,
         employee_id, jsonb_build_object('outcome',outcome,'duration_seconds',duration_seconds), 'recipe_access'
    from public.recipe_access
  union all
  select order_item_id, order_id, branch_id, created_at,
         'photo_uploaded', employee_id, jsonb_build_object('attempt_no',attempt_no,'photo_url',photo_url), 'completion_photo'
    from public.completion_photo
  union all
  select order_item_id, order_id, branch_id, claimed_at,
         'claimed', claimed_by, jsonb_build_object('attempt_no',attempt_no), 'prep_item'
    from public.prep_item where claimed_at is not null
  union all
  select order_item_id, order_id, branch_id, completed_at,
         'completed', completed_by, jsonb_build_object('attempt_no',attempt_no), 'prep_item'
    from public.prep_item where completed_at is not null;

-- 2) Recipe-version performance
create or replace view public.qr_recipe_version_performance with (security_invoker = true) as
with items as (
  select oi.tenant_id, oi.recipe_version_id, pi.order_item_id, pi.rework_count, pi.prep_status,
         pi.preparing_started_at, pi.completed_at
    from public.prep_item pi join public.order_item oi on oi.id = pi.order_item_id
),
ra as (
  select oi.recipe_version_id, ra.kind, ra.duration_seconds
    from public.recipe_access ra join public.order_item oi on oi.id = ra.order_item_id
   where ra.outcome = 'granted'
)
select
  i.recipe_version_id,
  count(*)                                                              as items,
  count(*) filter (where i.prep_status='completed')                    as completed_items,
  count(*) filter (where i.rework_count=0 and i.prep_status='completed') as first_pass_items,
  count(*) filter (where i.rework_count>0)                             as reworked_items,
  round(avg(extract(epoch from (i.completed_at - i.preparing_started_at)))
        filter (where i.completed_at is not null and i.preparing_started_at is not null))::int as avg_prep_seconds,
  (select round(avg(duration_seconds))::int from ra where ra.recipe_version_id=i.recipe_version_id and ra.kind='recipe') as avg_recipe_view_seconds,
  (select round(avg(duration_seconds))::int from ra where ra.recipe_version_id=i.recipe_version_id and ra.kind='method') as avg_method_view_seconds,
  (select count(*) from public.complaint c where c.recipe_version_id=i.recipe_version_id) as complaints
from items i
group by i.recipe_version_id;

-- 3) Employee skill matrix (training slice separated via made_in_training)
create or replace view public.qr_employee_skill_matrix with (security_invoker = true) as
select
  pi.completed_by                                                       as employee_id,
  oi.recipe_version_id,
  pi.made_in_training,
  count(*) filter (where pi.prep_status='completed')                    as completed_items,
  count(*) filter (where pi.rework_count=0 and pi.prep_status='completed') as first_pass_items,
  count(*) filter (where pi.rework_count>0)                             as reworked_items,
  round(avg(extract(epoch from (pi.completed_at - pi.preparing_started_at)))
        filter (where pi.completed_at is not null and pi.preparing_started_at is not null))::int as avg_prep_seconds,
  (select count(*) from public.complaint c
     where c.assigned_barista=pi.completed_by and c.recipe_version_id=oi.recipe_version_id) as complaints
from public.prep_item pi
join public.order_item oi on oi.id = pi.order_item_id
where pi.completed_by is not null
group by pi.completed_by, oi.recipe_version_id, pi.made_in_training;

-- 4) Recipe-leak anomalies (denied re-opens, opened-not-closed, abnormally long views)
create or replace view public.qr_recipe_access_anomaly with (security_invoker = true) as
select
  ra.id, ra.order_item_id, ra.branch_id, ra.employee_id, ra.kind, ra.outcome,
  ra.device_id, ra.ip_address, ra.opened_at, ra.closed_at, ra.duration_seconds,
  (ra.outcome <> 'granted')                                                                  as denied,
  (ra.outcome='granted' and ra.closed_at is null and ra.opened_at < now() - interval '15 minutes') as opened_not_closed,
  (ra.duration_seconds is not null and ra.duration_seconds > 600)                            as long_view
from public.recipe_access ra
where ra.outcome <> 'granted'
   or (ra.outcome='granted' and ra.closed_at is null and ra.opened_at < now() - interval '15 minutes')
   or (ra.duration_seconds is not null and ra.duration_seconds > 600);

-- Hardened: anon locked out; authenticated reads (RLS on base tables still applies via invoker).
do $$
declare v text;
begin
  foreach v in array array['qr_production_timeline','qr_recipe_version_performance',
                           'qr_employee_skill_matrix','qr_recipe_access_anomaly'] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
