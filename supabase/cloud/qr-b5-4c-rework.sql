-- =============================================================================
-- qr-b5-4c-rework.sql — QR Ordering B5.4c: qr_qc_fail (rework). PROPOSAL.
-- qc_required -> preparing; attempt_no+1, rework_count+1. Emits qc_failed (on the FAILED
-- attempt, before increment) then rework_started (on the new attempt). Reason required.
-- A new attempt requires a NEW completion photo (enforced by completion_photo unique + B5.4d).
-- Additive; no existing data changed.
-- =============================================================================
begin;

create or replace function app.qr_qc_fail(
  p_order_item_id uuid, p_employee_id uuid, p_reason text,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  if coalesce(btrim(p_reason),'') = '' then raise exception 'qc fail reason is required'; end if;
  if not exists (select 1 from public.prep_item where order_item_id=p_order_item_id and prep_status='qc_required') then
    raise exception 'item not in qc_required state';
  end if;

  -- qc_failed on the current (failing) attempt
  perform app.qr_emit_prep_event(p_order_item_id,'qc_failed',p_employee_id,
            p_ip,p_device_id,p_user_agent,p_device_name, jsonb_build_object('reason', p_reason));

  -- rework: bump attempt, back to preparing, reset qc timestamps
  update public.prep_item
     set prep_status='preparing', attempt_no=attempt_no+1, rework_count=rework_count+1,
         last_qc_result='fail', preparing_started_at=now(), qc_by=p_employee_id,
         qc_started_at=null, qc_passed_at=null
   where order_item_id=p_order_item_id;

  -- rework_started on the new attempt
  perform app.qr_emit_prep_event(p_order_item_id,'rework_started',p_employee_id,
            p_ip,p_device_id,p_user_agent,p_device_name);
end; $$;

create or replace function public.qr_qc_fail(p_order_item_id uuid, p_employee_id uuid, p_reason text, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_qc_fail(p_order_item_id,p_employee_id,p_reason,p_ip,p_device_id,p_user_agent,p_device_name); $$;

grant execute on function app.qr_qc_fail(uuid, uuid, text, inet, text, text, text) to authenticated;
revoke all on function public.qr_qc_fail(uuid, uuid, text, inet, text, text, text) from public, anon;
grant execute on function public.qr_qc_fail(uuid, uuid, text, inet, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
