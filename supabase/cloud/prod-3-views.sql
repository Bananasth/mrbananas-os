-- =============================================================================
-- prod-3-views.sql — Phase D: production read views. REVIEW ONLY.
-- Read-only (security_invoker → branch RLS applies). Additive; no writes, no schema change.
--   finished_goods       — finished lots on hand per product/branch (+ expiry).
--   production_board      — plan -> batches -> stage progress (day view / Kanban source).
--   base_stock_available  — semi_finished base lots ready to decorate (cake base -> decorate).
-- =============================================================================
begin;

-- Finished goods on hand (item_kind='finished'); excludes soft-deleted items.
create or replace view public.finished_goods with (security_invoker = true) as
select
  l.tenant_id, l.branch_id, l.item_id, l.batch_id,
  l.qty_on_hand, l.unit, l.unit_cost, l.status, l.expires_at,
  (l.expires_at::date - current_date) as days_to_expiry
from public.inventory_lot l
join public.inventory_item i
  on i.id = l.item_id and i.tenant_id = l.tenant_id and i.is_deleted = false
where i.item_kind = 'finished' and l.qty_on_hand > 0;
comment on view public.finished_goods is
  'Finished goods on hand per product/branch with expiry. Leftover disposal via record_waste/record_expired (Phase C).';

-- Day board: plan -> batches -> stage progress.
create or replace view public.production_board with (security_invoker = true) as
select
  p.tenant_id, p.branch_id, p.plan_date, p.status as plan_status,
  b.id as batch_id, b.batch_code, b.recipe_version_id, b.workstation_id,
  b.planned_qty, b.actual_yield, b.status as batch_status, b.started_at, b.completed_at,
  count(s.id)                                as stage_count,
  count(s.id) filter (where s.status='done') as stages_done,
  min(s.planned_start)                       as first_stage_start,
  max(s.planned_end)                         as last_stage_end
from public.production_plan p
join public.production_batch b on b.plan_id = p.id and b.tenant_id = p.tenant_id
left join public.batch_stage s on s.batch_id = b.id and s.tenant_id = b.tenant_id
group by p.tenant_id, p.branch_id, p.plan_date, p.status,
         b.id, b.batch_code, b.recipe_version_id, b.workstation_id,
         b.planned_qty, b.actual_yield, b.status, b.started_at, b.completed_at;
comment on view public.production_board is
  'Production day board: plan + batches + stage progress (stage_count / stages_done). Multi-day via stage planned times.';

-- Semi-finished base stock available to decorate (cake base weekly -> decorate daily).
create or replace view public.base_stock_available with (security_invoker = true) as
select
  l.tenant_id, l.branch_id, l.item_id,
  sum(l.qty_on_hand)       as qty_available,
  min(l.expires_at)        as earliest_expiry,
  sum((l.qty_on_hand * coalesce(l.unit_cost,0))::bigint) as value_on_hand   -- satang
from public.inventory_lot l
join public.inventory_item i
  on i.id = l.item_id and i.tenant_id = l.tenant_id and i.is_deleted = false
where i.item_kind = 'semi_finished' and l.status = 'available' and l.qty_on_hand > 0
group by l.tenant_id, l.branch_id, l.item_id;
comment on view public.base_stock_available is
  'Available semi_finished base lots (e.g. cake base) ready to decorate. status=available only (expired/quarantined excluded).';

commit;
