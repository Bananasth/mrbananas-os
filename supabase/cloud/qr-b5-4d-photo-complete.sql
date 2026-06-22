-- =============================================================================
-- qr-b5-4d-photo-complete.sql — QR Ordering B5.4d: completion photo + complete. PROPOSAL.
-- qr_upload_completion_photo: one photo per (order_item, attempt_no); retake = update.
-- qr_complete_item: qc_passed -> completed, GATED on a photo existing for the current attempt;
-- rolls the order up to ready_for_pickup when all items complete (op rule 2). Additive.
-- =============================================================================
begin;

-- upload / retake the completion photo for the CURRENT attempt (no prep_event; lives on completion_photo)
create or replace function app.qr_upload_completion_photo(
  p_order_item_id uuid, p_employee_id uuid, p_photo_url text,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pi record;
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  if coalesce(btrim(p_photo_url),'') = '' then raise exception 'photo_url is required'; end if;
  select tenant_id, branch_id, order_id, attempt_no, prep_status into v_pi
    from public.prep_item where order_item_id = p_order_item_id;
  if v_pi.prep_status not in ('preparing','qc_required','qc_passed') then
    raise exception 'photo can only be uploaded while preparing/QC (status %)', v_pi.prep_status;
  end if;
  insert into public.completion_photo
    (tenant_id, branch_id, order_id, order_item_id, attempt_no, employee_id, photo_url,
     ip_address, device_id, user_agent, device_name)
  values (v_pi.tenant_id, v_pi.branch_id, v_pi.order_id, p_order_item_id, v_pi.attempt_no, p_employee_id, p_photo_url,
          p_ip, p_device_id, p_user_agent, p_device_name)
  on conflict (order_item_id, attempt_no) do update
    set photo_url = excluded.photo_url, employee_id = excluded.employee_id,
        ip_address = excluded.ip_address, device_id = excluded.device_id,
        user_agent = excluded.user_agent, device_name = excluded.device_name, created_at = now();
end; $$;

-- qc_passed -> completed (requires a photo for the current attempt); roll up the order
create or replace function app.qr_complete_item(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pi record; v_rows int;
begin
  perform app.qr_assert_actor(p_order_item_id, p_employee_id);
  select order_id, attempt_no, prep_status into v_pi from public.prep_item where order_item_id = p_order_item_id;
  if v_pi.prep_status <> 'qc_passed' then raise exception 'item must pass QC before completion (status %)', v_pi.prep_status; end if;
  if not exists (
    select 1 from public.completion_photo where order_item_id = p_order_item_id and attempt_no = v_pi.attempt_no
  ) then
    raise exception 'a completion photo is required for attempt % before completion', v_pi.attempt_no;
  end if;
  update public.prep_item set prep_status='completed', completed_by=p_employee_id, completed_at=now()
   where order_item_id=p_order_item_id and prep_status='qc_passed';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'item not in qc_passed state'; end if;
  perform app.qr_rollup_order_status(v_pi.order_id);
end; $$;

create or replace function public.qr_upload_completion_photo(p_order_item_id uuid, p_employee_id uuid, p_photo_url text, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_upload_completion_photo(p_order_item_id,p_employee_id,p_photo_url,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_complete_item(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_complete_item(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;

grant execute on function app.qr_upload_completion_photo(uuid, uuid, text, inet, text, text, text) to authenticated;
revoke all on function public.qr_upload_completion_photo(uuid, uuid, text, inet, text, text, text) from public, anon;
grant execute on function public.qr_upload_completion_photo(uuid, uuid, text, inet, text, text, text) to authenticated;

grant execute on function app.qr_complete_item(uuid, uuid, inet, text, text, text) to authenticated;
revoke all on function public.qr_complete_item(uuid, uuid, inet, text, text, text) from public, anon;
grant execute on function public.qr_complete_item(uuid, uuid, inet, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
