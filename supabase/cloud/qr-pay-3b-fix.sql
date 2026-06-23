-- =============================================================================
-- qr-pay-3b-fix.sql — Fix: auth_failed / error must PERSIST their settlement_ledger row.
-- The original RAISEd after inserting the ledger row, which rolled the insert back. These
-- two paths now RETURN their result (ledger commits). Only change vs. qr-pay-3b-settle.sql:
-- the two RAISE statements -> RETURN. Everything else identical.
-- =============================================================================
begin;

create or replace function app.qr_settle_payment(
  p_provider text, p_event_id text, p_tracking_token uuid, p_amount bigint, p_settlement_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_qr record; v_order uuid; v_tenant uuid; v_branch uuid;
  v_secret text; v_pay record; v_fresh int; v_qnum int; v_failed text := null; v_tax bigint; oi record;
begin
  select order_id, tenant_id, branch_id, status, expires_at, queue_number
    into v_qr from public.qr_order where tracking_token = p_tracking_token for update;
  if v_qr.order_id is null then raise exception 'order not found for tracking token'; end if;
  v_order := v_qr.order_id; v_tenant := v_qr.tenant_id; v_branch := v_qr.branch_id;

  -- GATE B: settlement secret (RETURN so the ledger row persists)
  select settlement_secret into v_secret from public.payment_provider_config
   where branch_id = v_branch and provider = p_provider and is_active = true limit 1;
  if v_secret is null or p_settlement_secret is null or p_settlement_secret is distinct from v_secret then
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,p_provider,p_event_id,p_amount,'auth_failed','settlement secret invalid');
    return jsonb_build_object('result','auth_failed','order_id',v_order);
  end if;

  select id, amount from public.payment where order_id = v_order order by created_at desc limit 1 into v_pay;
  if v_pay.id is null then
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,p_provider,p_event_id,p_amount,'error','no payment intent');
    return jsonb_build_object('result','error','order_id',v_order);
  end if;

  insert into public.payment_event (tenant_id,branch_id,payment_id,order_id,provider,sales_channel,event_id,event_type,amount,signature_ok,processed,processed_at)
    values (v_tenant,v_branch,v_pay.id,v_order,p_provider,'qr',p_event_id,'payment.succeeded',p_amount,true,true,now())
  on conflict (provider,event_id) do nothing;
  get diagnostics v_fresh = row_count;
  if v_fresh = 0 then
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'duplicate_ignored','event already processed');
    return jsonb_build_object('result','duplicate_ignored','order_id',v_order,'queue_number',v_qr.queue_number);
  end if;

  if v_qr.status not in ('pending_payment','needs_review') then
    if v_qr.status in ('expired','cancelled') then
      update public.qr_order set needs_review=true, review_reason='paid after '||v_qr.status where order_id=v_order;
      insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
        values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'expired_rejected','order already '||v_qr.status);
      return jsonb_build_object('result','expired_rejected','order_id',v_order);
    end if;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'duplicate_ignored','order already '||v_qr.status);
    return jsonb_build_object('result','duplicate_ignored','order_id',v_order,'queue_number',v_qr.queue_number);
  end if;

  if v_qr.status='pending_payment' and now() >= v_qr.expires_at then
    update public.qr_order set status='expired', needs_review=true, review_reason='paid after expiry' where order_id=v_order;
    update public.sales_order set status='cancelled' where id=v_order;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'expired_rejected','paid after expiry');
    return jsonb_build_object('result','expired_rejected','order_id',v_order);
  end if;

  if p_amount is distinct from v_pay.amount then
    update public.qr_order set needs_review=true, review_reason='amount mismatch' where order_id=v_order;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'amount_mismatch','expected '||v_pay.amount||' got '||coalesce(p_amount,-1));
    return jsonb_build_object('result','amount_mismatch','order_id',v_order);
  end if;

  select tax_total into v_tax from public.sales_order where id=v_order;
  update public.payment
     set status='captured', paid_at=now(), provider=p_provider,
         gateway_ref=coalesce(gateway_ref, p_provider||':'||p_event_id),
         tax_amount=v_tax, net_amount = amount - platform_fee - payment_fee
   where id=v_pay.id and status in ('pending','authorized');

  begin v_qnum := app.qr_assign_queue(v_order, v_tenant, v_branch);
  exception when others then
    v_failed:='queue';
    insert into public.settlement_dlq (tenant_id,branch_id,order_id,payment_id,failed_step,reason)
      values (v_tenant,v_branch,v_order,v_pay.id,'queue',left(sqlerrm,500)) on conflict (order_id,failed_step) where status='open' do nothing;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'queue_failed',left(sqlerrm,500));
  end;

  begin
    for oi in select id from public.order_item where order_id=v_order loop
      perform app.qr_deduct_item(oi.id, v_tenant, v_branch);
    end loop;
  exception when others then
    v_failed:=coalesce(v_failed,'inventory');
    insert into public.settlement_dlq (tenant_id,branch_id,order_id,payment_id,failed_step,reason)
      values (v_tenant,v_branch,v_order,v_pay.id,'inventory',left(sqlerrm,500)) on conflict (order_id,failed_step) where status='open' do nothing;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'inventory_failed',left(sqlerrm,500));
  end;

  begin perform app.qr_ensure_prep_items(v_order, v_tenant, v_branch);
  exception when others then
    v_failed:=coalesce(v_failed,'prep');
    insert into public.settlement_dlq (tenant_id,branch_id,order_id,payment_id,failed_step,reason)
      values (v_tenant,v_branch,v_order,v_pay.id,'prep',left(sqlerrm,500)) on conflict (order_id,failed_step) where status='open' do nothing;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'prep_failed',left(sqlerrm,500));
  end;

  begin perform app.enqueue_print_jobs(v_order);
  exception when others then
    v_failed:=coalesce(v_failed,'print');
    insert into public.settlement_dlq (tenant_id,branch_id,order_id,payment_id,failed_step,reason)
      values (v_tenant,v_branch,v_order,v_pay.id,'print',left(sqlerrm,500)) on conflict (order_id,failed_step) where status='open' do nothing;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'print_failed',left(sqlerrm,500));
  end;

  if v_failed is null then
    update public.qr_order set status='order_received', needs_review=false, review_reason=null where order_id=v_order;
    update public.sales_order set status='confirmed' where id=v_order;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'confirmed');
    return jsonb_build_object('result','confirmed','order_id',v_order,'queue_number',v_qnum);
  else
    update public.qr_order set status='needs_review', needs_review=true, review_reason='settlement failed at '||v_failed where order_id=v_order;
    insert into public.settlement_ledger (tenant_id,branch_id,order_id,payment_id,provider,provider_event_id,amount,settlement_result,error_message)
      values (v_tenant,v_branch,v_order,v_pay.id,p_provider,p_event_id,p_amount,'needs_review','failed at '||v_failed);
    return jsonb_build_object('result','needs_review','order_id',v_order,'failed_step',v_failed,'queue_number',v_qnum);
  end if;
end; $$;

notify pgrst, 'reload schema';
commit;
