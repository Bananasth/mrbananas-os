-- =============================================================================
-- qr-b5-4-staff-full.sql — QR Ordering B5.4 (CONSOLIDATED, idempotent). PROPOSAL; run.
-- Full staff production state machine: helpers + claim + prep/QC + rework + photo/complete
-- + claim-timeout sweep, with app.* SECURITY DEFINER logic and public.* SECURITY INVOKER
-- wrappers (authenticated only; anon revoked). Re-creatable via create-or-replace. Additive.
-- =============================================================================
begin;

-- ---------- helpers ----------
create or replace function app.qr_assert_actor(p_order_item_id uuid, p_employee_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.prep_item where order_item_id = p_order_item_id;
  if v_branch is null then raise exception 'prep_item % not found', p_order_item_id; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  if not exists (select 1 from public.employee where id = p_employee_id and branch_id = v_branch) then
    raise exception 'employee % is not at this branch', p_employee_id;
  end if;
  return v_branch;
end; $$;

create or replace function app.qr_emit_prep_event(
  p_order_item_id uuid, p_event_type text, p_actor uuid,
  p_ip inet, p_device_id text, p_user_agent text, p_device_name text,
  p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pi record;
begin
  select tenant_id, branch_id, order_id, attempt_no into v_pi
    from public.prep_item where order_item_id = p_order_item_id;
  if not found then raise exception 'prep_item % not found', p_order_item_id; end if;
  insert into public.prep_event
    (tenant_id, branch_id, order_id, order_item_id, attempt_no, event_type, actor_employee_id, payload)
  values (v_pi.tenant_id, v_pi.branch_id, v_pi.order_id, p_order_item_id, v_pi.attempt_no,
          p_event_type, p_actor,
          coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
            'ip', p_ip, 'device_id', p_device_id, 'user_agent', p_user_agent, 'device_name', p_device_name));
end; $$;

create or replace function app.qr_rollup_order_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cur text; v_total int; v_completed int; v_active int;
begin
  select status into v_cur from public.qr_order where order_id = p_order_id for update;
  if v_cur is null or v_cur in ('needs_review','expired','cancelled','completed') then return; end if;
  select count(*), count(*) filter (where prep_status='completed'),
         count(*) filter (where prep_status <> 'waiting')
    into v_total, v_completed, v_active
    from public.prep_item where order_id = p_order_id;
  if v_total = 0 then return; end if;
  if v_completed = v_total then
    update public.qr_order set status='ready_for_pickup' where order_id = p_order_id;
  elsif v_active > 0 then
    update public.qr_order set status='in_progress' where order_id = p_order_id;
  else
    update public.qr_order set status='order_received' where order_id = p_order_id;
  end if;
end; $$;

-- ---------- claim ----------
create or replace function app.qr_claim_item(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_order uuid; v_training boolean; v_rows int;
begin
  v_branch := app.qr_assert_actor(p_order_item_id, p_employee_id);
  select training_mode into v_training from public.employee where id = p_employee_id;
  update public.prep_item
     set claimed_by = p_employee_id, claimed_at = now(), prep_status = 'claimed',
         made_in_training = coalesce(v_training, false)
   where order_item_id = p_order_item_id and claimed_by is null and prep_status = 'waiting';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'item already claimed or not in waiting state'; end if;
  select order_id into v_order from public.prep_item where order_item_id = p_order_item_id;
  perform app.qr_rollup_order_status(v_order);
end; $$;

-- ---------- preparing / QC ----------
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

-- ---------- rework ----------
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
  perform app.qr_emit_prep_event(p_order_item_id,'qc_failed',p_employee_id,
            p_ip,p_device_id,p_user_agent,p_device_name, jsonb_build_object('reason', p_reason));
  update public.prep_item
     set prep_status='preparing', attempt_no=attempt_no+1, rework_count=rework_count+1,
         last_qc_result='fail', preparing_started_at=now(), qc_by=p_employee_id,
         qc_started_at=null, qc_passed_at=null
   where order_item_id=p_order_item_id;
  perform app.qr_emit_prep_event(p_order_item_id,'rework_started',p_employee_id,
            p_ip,p_device_id,p_user_agent,p_device_name);
end; $$;

-- ---------- completion photo + complete ----------
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

-- ---------- claim-timeout sweep ----------
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
    select pi.order_item_id from public.prep_item pi
     where pi.branch_id = p_branch_id and pi.prep_status = 'claimed'
       and pi.claimed_at < now() - make_interval(mins => v_timeout)
       and not exists (select 1 from public.prep_event e
                        where e.order_item_id = pi.order_item_id and e.event_type='preparing_started'
                          and e.occurred_at >= pi.claimed_at)
       and not exists (select 1 from public.recipe_access ra
                        where ra.order_item_id = pi.order_item_id and ra.outcome='granted'
                          and ra.opened_at >= pi.claimed_at)
     for update
  loop
    update public.prep_item set prep_status='waiting', claimed_by=null, claimed_at=null
     where order_item_id = r.order_item_id;
    perform app.qr_emit_prep_event(r.order_item_id,'claim_released',null,null,null,null,null,jsonb_build_object('reason','timeout'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

-- ---------- public wrappers (invoker) ----------
create or replace function public.qr_claim_item(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_claim_item(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_start_preparing(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_start_preparing(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_start_qc(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_start_qc(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_pass_qc(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_pass_qc(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_qc_fail(p_order_item_id uuid, p_employee_id uuid, p_reason text, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_qc_fail(p_order_item_id,p_employee_id,p_reason,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_upload_completion_photo(p_order_item_id uuid, p_employee_id uuid, p_photo_url text, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_upload_completion_photo(p_order_item_id,p_employee_id,p_photo_url,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_complete_item(p_order_item_id uuid, p_employee_id uuid, p_ip inet default null, p_device_id text default null, p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$ select app.qr_complete_item(p_order_item_id,p_employee_id,p_ip,p_device_id,p_user_agent,p_device_name); $$;
create or replace function public.qr_release_stale_claims(p_branch_id uuid)
returns integer language sql security invoker set search_path = '' as $$ select app.qr_release_stale_claims(p_branch_id); $$;

-- ---------- grants (authenticated only; anon revoked) ----------
do $$
declare r record;
begin
  for r in
    select * from (values
      ('qr_claim_item','uuid, uuid, inet, text, text, text'),
      ('qr_start_preparing','uuid, uuid, inet, text, text, text'),
      ('qr_start_qc','uuid, uuid, inet, text, text, text'),
      ('qr_pass_qc','uuid, uuid, inet, text, text, text'),
      ('qr_qc_fail','uuid, uuid, text, inet, text, text, text'),
      ('qr_upload_completion_photo','uuid, uuid, text, inet, text, text, text'),
      ('qr_complete_item','uuid, uuid, inet, text, text, text'),
      ('qr_release_stale_claims','uuid')
    ) as t(fn, sig)
  loop
    execute format('grant execute on function app.%I(%s) to authenticated', r.fn, r.sig);
    execute format('revoke all on function public.%I(%s) from public, anon', r.fn, r.sig);
    execute format('grant execute on function public.%I(%s) to authenticated', r.fn, r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
