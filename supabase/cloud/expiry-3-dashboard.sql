-- =============================================================================
-- expiry-3-dashboard.sql — Phase C: Expiry Dashboard data source. REVIEW ONLY.
-- expiry_dashboard(branch) returns one row of metrics for the Admin Expiry Dashboard:
--   expired today / expiring in 3d / expiring in 7d (count + value),
--   near-expiry value, expired-inventory (on-hand, awaiting disposal) value, waste value (MTD).
-- Read-only, SECURITY INVOKER → branch RLS applies (owner sees all). Money in satang.
-- Buckets are cumulative (3d ⊆ 7d). expired_inventory_value = still-on-hand status='expired'
-- (not yet disposed); waste_value_mtd = realized loss from waste + expired disposals this month.
-- =============================================================================
begin;

create or replace function public.expiry_dashboard(p_branch_id uuid default null)
returns table (
  expired_today_count     bigint,
  expired_today_value     bigint,
  expiring_3d_count       bigint,
  expiring_3d_value       bigint,
  expiring_7d_count       bigint,
  expiring_7d_value       bigint,
  near_expiry_value       bigint,
  expired_inventory_value bigint,
  waste_value_mtd         bigint
)
language sql stable security invoker set search_path = ''
as $$
  with lots as (
    select l.status, l.expires_at,
           (l.qty_on_hand * coalesce(l.unit_cost, 0))::bigint as val
      from public.inventory_lot l
     where l.qty_on_hand > 0
       and (p_branch_id is null or l.branch_id = p_branch_id)
  )
  select
    count(*) filter (where expires_at is not null and expires_at <= now()
                       and expires_at >= date_trunc('day', now())),
    coalesce(sum(val) filter (where expires_at is not null and expires_at <= now()
                       and expires_at >= date_trunc('day', now())), 0),
    count(*) filter (where status='available' and expires_at > now()
                       and expires_at <= now() + interval '3 days'),
    coalesce(sum(val) filter (where status='available' and expires_at > now()
                       and expires_at <= now() + interval '3 days'), 0),
    count(*) filter (where status='available' and expires_at > now()
                       and expires_at <= now() + interval '7 days'),
    coalesce(sum(val) filter (where status='available' and expires_at > now()
                       and expires_at <= now() + interval '7 days'), 0),
    coalesce(sum(val) filter (where status='available' and expires_at > now()
                       and expires_at <= now() + interval '7 days'), 0),   -- near_expiry_value (=7d)
    coalesce(sum(val) filter (where status='expired'), 0),                 -- on-hand, awaiting disposal
    (select coalesce(sum(m.total_cost), 0)::bigint
       from public.inventory_movement m
      where m.reason in ('waste','expired')
        and m.occurred_at >= date_trunc('month', now())
        and (p_branch_id is null or m.branch_id = p_branch_id))            -- waste_value_mtd
  from lots;
$$;

comment on function public.expiry_dashboard(uuid) is
  'Expiry Dashboard metrics for one branch (or all visible when NULL): expired today, expiring 3d/7d (count+value), near-expiry value, expired on-hand value, waste value MTD. Satang.';

grant execute on function public.expiry_dashboard(uuid) to authenticated;

commit;
