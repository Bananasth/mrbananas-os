-- =============================================================================
-- qr-pay-3a-recover-fix.sql — Fix: recovered_by must be FK-safe. APPLIED.
-- Original set recovered_by = app.current_user_id(); if the JWT sub is not a real app_user
-- (e.g. a simulated/unprovisioned identity) the recovered_by FK violation rolled back the
-- (successful) inventory deduct, leaving the order stuck in needs_review. Resolve v_actor to
-- a real app_user.id or NULL and use it for every recovered_by. Only change vs. ledger-dlq.
-- =============================================================================
begin;

create or replace function app.qr_recover_settlement(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_branch uuid; v_needs_deduct boolean; oi record; v_failed text := null; v_actor uuid;
begin
  select tenant_id, branch_id into v_tenant, v_branch from public.sales_order where id = p_order_id;
  if v_tenant is null then raise exception 'order % not found', p_order_id; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to recover settlement at this branch';
  end if;
  if not exists (select 1 from public.qr_order where order_id = p_order_id) then
    raise exception 'order % is not a QR order', p_order_id;
  end if;
  if not exists (select 1 from public.payment where order_id = p_order_id and status = 'captured') then
    raise exception 'order % has no captured payment; cannot recover', p_order_id;
  end if;

  -- FK-safe: only a real app_user, else NULL (recovered_by is ON DELETE SET NULL)
  v_actor := (select id from public.app_user where id = app.current_user_id());

  begin
    perform app.qr_assign_queue(p_order_id, v_tenant, v_branch);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=v_actor, updated_at=now()
     where order_id=p_order_id and failed_step='queue' and status='open';
  exception when others then
    v_failed := 'queue';
    update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
     where order_id=p_order_id and failed_step='queue' and status='open';
  end;

  v_needs_deduct := not exists (
    select 1 from public.inventory_movement im
     where im.reason='sell' and im.ref_type='order_item'
       and im.ref_id in (select id from public.order_item where order_id=p_order_id));
  if v_needs_deduct then
    begin
      for oi in select id from public.order_item where order_id=p_order_id loop
        perform app.qr_deduct_item(oi.id, v_tenant, v_branch);
      end loop;
      update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=v_actor, updated_at=now()
       where order_id=p_order_id and failed_step='inventory' and status='open';
    exception when others then
      v_failed := coalesce(v_failed,'inventory');
      update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
       where order_id=p_order_id and failed_step='inventory' and status='open';
    end;
  else
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=v_actor, updated_at=now()
     where order_id=p_order_id and failed_step='inventory' and status='open';
  end if;

  begin
    perform app.qr_ensure_prep_items(p_order_id, v_tenant, v_branch);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=v_actor, updated_at=now()
     where order_id=p_order_id and failed_step='prep' and status='open';
  exception when others then
    v_failed := coalesce(v_failed,'prep');
    update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
     where order_id=p_order_id and failed_step='prep' and status='open';
  end;

  begin
    perform app.enqueue_print_jobs(p_order_id);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=v_actor, updated_at=now()
     where order_id=p_order_id and failed_step='print' and status='open';
  exception when others then
    v_failed := coalesce(v_failed,'print');
    update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
     where order_id=p_order_id and failed_step='print' and status='open';
  end;

  if v_failed is null then
    update public.qr_order
       set status = case when status in ('needs_review','pending_payment','order_received') then 'order_received' else status end,
           needs_review = false, review_reason = null
     where order_id = p_order_id;
    update public.sales_order set status='confirmed' where id=p_order_id and status='open';
    insert into public.settlement_ledger (tenant_id, branch_id, order_id, provider, settlement_result)
      values (v_tenant, v_branch, p_order_id, 'recover', 'recovered');
    return jsonb_build_object('result','recovered','order_id',p_order_id);
  else
    update public.qr_order set needs_review=true, review_reason='recovery failed at '||v_failed where order_id=p_order_id;
    insert into public.settlement_ledger (tenant_id, branch_id, order_id, provider, settlement_result, error_message)
      values (v_tenant, v_branch, p_order_id, 'recover', 'needs_review', 'recovery failed at '||v_failed);
    return jsonb_build_object('result','needs_review','failed_step',v_failed,'order_id',p_order_id);
  end if;
end; $$;

notify pgrst, 'reload schema';
commit;
