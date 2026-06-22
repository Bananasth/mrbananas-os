-- =============================================================================
-- qr-b5-4b-prep-qc.sql — QR Ordering B5.4b: start_preparing, start_qc, pass_qc. PROPOSAL.
-- Two-step QC; four-eyes enforced only when prep_item.made_in_training. Additive.
-- =============================================================================
begin;

-- claimed -> preparing (only the claimer)
create or replace function app.qr_start_preparing(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  update public.prep_item set prep_status='preparing', preparing_started_at=now()
   where order_item_id=p_order_item_id and prep_status='claimed' and claimed_by=p_employee_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'item not claimed by you or not in claimed state'; end if;
  perform app.qr_emit_prep_event(p_order_item_id,'preparing_started',p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name);
end; $$;

-- preparing -> qc_required (QC may be a different employee)
create or replace function app.qr_start_qc(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  update public.prep_item set prep_status='qc_required', qc_by=p_employee_id, qc_started_at=now()
   where order_item_id=p_order_item_id and prep_status='preparing';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'item not in preparing state'; end if;
  perform app.qr_emit_prep_event(p_order_item_id,'qc_started',p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name);
end; $$;

-- qc_required -> qc_passed (four-eyes when made_in_training)
create or replace function app.qr_pass_qc(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pi record; v_rows int;
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  select claimed_by, made_in_training into v_pi from public.prep_item where order_item_id=p_order_item_id;
  if v_pi.made_in_training and p_employee_id = v_pi.claimed_by then
    raise exception 'training items require QC by a different employee (four-eyes)';
  end if;
  update public.prep_item set prep_status='qc_passed', qc_passed_at=now(), last_qc_result='pass', qc_by=p_employee_id
   where order_item_id=p_order_item_id and prep_status='qc_required';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'item not in qc_required state'; end if;
  perform app.qr_emit_prep_event(p_order_item_id,'qc_passed',p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name);
end; $$;

-- wrappers + grants
create or replace function public.qr_start_preparing(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_start_preparing(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_start_qc(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_start_qc(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_pass_qc(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_pass_qc(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;

do $$
declare s text;
begin
  foreach s in array array['qr_start_preparing','qr_start_qc','qr_pass_qc'] loop
    execute format('grant execute on function app.%I(uuid, uuid, inet, text, text, text) to authenticated', s);
    execute format('revoke all on function public.%I(uuid, uuid, inet, text, text, text) from public, anon', s);
    execute format('grant execute on function public.%I(uuid, uuid, inet, text, text, text) to authenticated', s);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
