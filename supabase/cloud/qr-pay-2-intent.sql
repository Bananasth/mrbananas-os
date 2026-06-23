-- =============================================================================
-- qr-pay-2-intent.sql — Locked-amount QR payment intent (Migration 2). APPLIED.
-- qr_create_payment_intent reuses qr_create_pending_order, then marks the payment a
-- channel='qr' intent (intent_expires_at + resolved provider). Retires the anon client
-- confirm (qr_confirm_payment). No existing function altered.
-- =============================================================================
begin;

create or replace function app.qr_create_payment_intent(p_slug text, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb; v_order uuid; v_client uuid; v_amount bigint; v_track uuid;
  v_tenant uuid; v_branch uuid; v_pp text; v_provider text; v_expires timestamptz;
begin
  v_res    := app.qr_create_pending_order(p_slug, p_items, p_note);
  v_order  := (v_res->>'order_id')::uuid;
  v_client := (v_res->>'client_uuid')::uuid;
  v_amount := (v_res->>'amount')::bigint;
  v_track  := (v_res->>'tracking_token')::uuid;

  select tenant_id, branch_id into v_tenant, v_branch from public.sales_order where id = v_order;

  select promptpay_target into v_pp
    from public.payment_provider_config
   where branch_id = v_branch and provider = 'promptpay' and is_active = true
   limit 1;
  v_provider := case when v_pp is not null then 'promptpay' else 'mock' end;

  update public.payment
     set sales_channel = 'qr', intent_expires_at = now() + interval '10 minutes', provider = v_provider
   where order_id = v_order and client_uuid = v_client
  returning intent_expires_at into v_expires;

  return jsonb_build_object(
    'tracking_token', v_track, 'order_id', v_order, 'amount', v_amount, 'client_uuid', v_client,
    'provider', v_provider, 'promptpay_target', v_pp, 'expires_at', v_expires);
end; $$;

comment on function app.qr_create_payment_intent(text, jsonb, text) is
  'Locked-amount QR intent: order pending_payment + payment(channel=qr, intent_expires_at, provider). No confirm.';

create or replace function public.qr_create_payment_intent(p_slug text, p_items jsonb, p_note text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select app.qr_create_payment_intent(p_slug, p_items, p_note); $$;

revoke all     on function public.qr_create_payment_intent(text, jsonb, text) from public;
grant  execute on function app.qr_create_payment_intent(text, jsonb, text)    to anon, authenticated;
grant  execute on function public.qr_create_payment_intent(text, jsonb, text) to anon, authenticated;

-- retire the anon client-side confirm (authenticated keeps it for dev/manual)
revoke execute on function public.qr_confirm_payment(uuid, uuid) from anon;

notify pgrst, 'reload schema';
commit;
