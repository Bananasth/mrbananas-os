-- =============================================================================
-- qr-b5-4e-claim-sweep.sql — QR Ordering B5.4e: qr_release_stale_claims (op rule 1). PROPOSAL.
-- Releases a 'claimed' item back to 'waiting' if claimed longer than
-- qr_config.claim_timeout_minutes (default 5) AND it has no preparing_started prep_event and
-- no granted recipe_access since claimed_at. Emits claim_released (actor null = system).
-- Returns count released. Call lazily on board load + from a scheduled job. Additive.
-- =============================================================================
begin;

create or replace function app.qr_release_stale_claims(p_branch_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_timeout int; v_count int := 0; r record;
begin
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  select coalesce(claim_timeout_minutes, 5) into v_timeout from public.qr_config where branch_id = p_branch_id;
  v_timeout := coalesce(v_timeout, 5);

  for r in
    select pi.order_item_id
      from public.prep_item pi
     where pi.branch_id = p_branch_id
       and pi.prep_status = 'claimed'
       and pi.claimed_at < now() - make_interval(mins => v_timeout)
       and not exists (
         select 1 from public.prep_event e
          where e.order_item_id = pi.order_item_id and e.event_type = 'preparing_started'
            and e.occurred_at >= pi.claimed_at)
       and not exists (
         select 1 from public.recipe_access ra
          where ra.order_item_id = pi.order_item_id and ra.outcome = 'granted'
            and ra.opened_at >= pi.claimed_at)
     for update
  loop
    update public.prep_item set prep_status='waiting', claimed_by=null, claimed_at=null
     where order_item_id = r.order_item_id;
    perform app.qr_emit_prep_event(r.order_item_id, 'claim_released', null,
              null, null, null, null, jsonb_build_object('reason','timeout'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

create or replace function public.qr_release_stale_claims(p_branch_id uuid)
returns integer language sql security invoker set search_path = '' as $$
  select app.qr_release_stale_claims(p_branch_id);
$$;

grant execute on function app.qr_release_stale_claims(uuid) to authenticated;
revoke all on function public.qr_release_stale_claims(uuid) from public, anon;
grant execute on function public.qr_release_stale_claims(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
