-- =============================================================================
-- qr-b5-6-tracking-pickup.sql — QR Ordering B5.6: tracking read + pickup. PROPOSAL.
--   * app.qr_order_status(tracking_token)  — ANON, read-only live tracking for one order
--       (token-gated; reports 'expired' for unpaid orders past expiry WITHOUT mutating).
--   * app.qr_mark_picked_up(order_id)       — STAFF, ready_for_pickup -> completed (handoff),
--       also sets sales_order='completed' so tax-invoice issuance stays valid.
-- Additive; no existing data changed.
-- =============================================================================
begin;

-- ---- ANON: customer tracking read ----
create or replace function app.qr_order_status(p_tracking_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select qo.order_id, qo.branch_id, qo.status, qo.queue_number, qo.expires_at, qo.paid_at, so.total
      from public.qr_order qo
      join public.sales_order so on so.id = qo.order_id
     where qo.tracking_token = p_tracking_token
  )
  select case
    when not exists (select 1 from o) then jsonb_build_object('found', false)
    else (
      select jsonb_build_object(
        'found', true,
        'status', case when o.status = 'pending_payment' and now() >= o.expires_at
                       then 'expired' else o.status end,
        'queue_number', o.queue_number,
        'paid_at', o.paid_at,
        'total', o.total,
        'pickup_instruction', (select pickup_instruction from public.qr_config c where c.branch_id = o.branch_id),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'name', pr.name, 'qty', oi.qty,
                   'status', coalesce(pi.prep_status, 'pending')) order by pr.name)
            from public.order_item oi
            join public.product pr on pr.id = oi.product_id
            left join public.prep_item pi on pi.order_item_id = oi.id
           where oi.order_id = o.order_id
        ), '[]'::jsonb)
      )
      from o
    )
  end;
$$;

comment on function app.qr_order_status(uuid) is
  'Anon token-gated live tracking for one QR order. Read-only; reports expired for stale unpaid orders.';

create or replace function public.qr_order_status(p_tracking_token uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select app.qr_order_status(p_tracking_token); $$;

revoke all on function public.qr_order_status(uuid) from public;
grant execute on function app.qr_order_status(uuid)    to anon, authenticated;
grant execute on function public.qr_order_status(uuid) to anon, authenticated;

-- ---- STAFF: pickup handoff ----
create or replace function app.qr_mark_picked_up(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_branch uuid; v_status text;
begin
  select branch_id, status into v_branch, v_status
    from public.qr_order where order_id = p_order_id for update;
  if v_branch is null then raise exception 'order not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  if v_status <> 'ready_for_pickup' then
    raise exception 'order is not ready for pickup (status %)', v_status;
  end if;
  update public.qr_order   set status = 'completed' where order_id = p_order_id;
  update public.sales_order set status = 'completed' where id = p_order_id;
end;
$$;

comment on function app.qr_mark_picked_up(uuid) is
  'Staff: ready_for_pickup -> completed (customer handoff). Also completes sales_order for invoicing.';

create or replace function public.qr_mark_picked_up(p_order_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select app.qr_mark_picked_up(p_order_id); $$;

grant execute on function app.qr_mark_picked_up(uuid) to authenticated;
revoke all on function public.qr_mark_picked_up(uuid) from public, anon;
grant execute on function public.qr_mark_picked_up(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
