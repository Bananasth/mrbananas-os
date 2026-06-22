-- =============================================================================
-- qr-b5-7-complaints.sql — QR Ordering B5.7: complaint RPCs. PROPOSAL; review, then run.
--   file_complaint        — staff+: create with full snapshot linkage (attempt_no,
--                           recipe_version_id, assigned_barista, completion_photo_id, prep duration)
--   complaint_assign      — manager+: set handler; new -> triaged
--   complaint_set_status  — manager+: validated lifecycle transition (+ note, closed_at)
--   complaint_resolve     — manager+: resolution fields; -> resolved
-- Status history is captured by the complaint_audit trigger (audit_log). Additive.
-- =============================================================================
begin;

-- management gate: returns branch if caller is owner or branch manager
create or replace function app.qr_complaint_gate(p_complaint_id uuid, p_roles text[])
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.complaint where id = p_complaint_id;
  if v_branch is null then raise exception 'complaint not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, p_roles)) then
    raise exception 'not authorized for this complaint';
  end if;
  return v_branch;
end; $$;

-- FILE (staff/manager/baker or owner)
create or replace function app.file_complaint(
  p_order_item_id uuid, p_category text, p_severity text default 'medium',
  p_description text default null, p_attempt_no integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_oi record; v_pi record; v_attempt int; v_photo uuid; v_dur int; v_id uuid;
begin
  select tenant_id, branch_id, order_id, recipe_version_id into v_oi
    from public.order_item where id = p_order_item_id;
  if not found then raise exception 'order_item not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_oi.branch_id, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;

  select attempt_no, completed_by, claimed_by, preparing_started_at, completed_at into v_pi
    from public.prep_item where order_item_id = p_order_item_id;
  v_attempt := coalesce(p_attempt_no, v_pi.attempt_no, 1);

  select id into v_photo from public.completion_photo
   where order_item_id = p_order_item_id and attempt_no = v_attempt;

  if v_pi.preparing_started_at is not null and v_pi.completed_at is not null then
    v_dur := greatest(0, extract(epoch from (v_pi.completed_at - v_pi.preparing_started_at))::int);
  end if;

  insert into public.complaint
    (tenant_id, branch_id, order_id, order_item_id, attempt_no, recipe_version_id,
     assigned_barista, completion_photo_id, preparation_duration_seconds,
     category, severity, description, status, created_by)
  values (v_oi.tenant_id, v_oi.branch_id, v_oi.order_id, p_order_item_id, v_attempt, v_oi.recipe_version_id,
          coalesce(v_pi.completed_by, v_pi.claimed_by), v_photo, v_dur,
          p_category, coalesce(p_severity,'medium'), p_description, 'new', app.current_user_id())
  returning id into v_id;
  return v_id;
end; $$;

-- ASSIGN (manager+)
create or replace function app.complaint_assign(p_complaint_id uuid, p_assigned_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.qr_complaint_gate(p_complaint_id, array['manager']);
  update public.complaint
     set assigned_to = p_assigned_to,
         status = case when status = 'new' then 'triaged' else status end
   where id = p_complaint_id;
end; $$;

-- SET STATUS (manager+): validated lifecycle transition
create or replace function app.complaint_set_status(p_complaint_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cur text;
begin
  perform app.qr_complaint_gate(p_complaint_id, array['manager']);
  select status into v_cur from public.complaint where id = p_complaint_id;
  if not (
       (v_cur='new'           and p_status in ('triaged','rejected'))
    or (v_cur='triaged'       and p_status in ('investigating','rejected'))
    or (v_cur='investigating' and p_status in ('action_taken','rejected'))
    or (v_cur='action_taken'  and p_status = 'resolved')
    or (v_cur='resolved'      and p_status = 'closed')
  ) then
    raise exception 'invalid complaint transition % -> %', v_cur, p_status;
  end if;
  update public.complaint
     set status = p_status,
         resolution_note = case when p_note is not null
                                then coalesce(resolution_note || E'\n','') || p_note
                                else resolution_note end,
         closed_at = case when p_status in ('closed','rejected') then now() else closed_at end
   where id = p_complaint_id;
end; $$;

-- RESOLVE (manager+): set resolution fields; -> resolved
create or replace function app.complaint_resolve(
  p_complaint_id uuid, p_resolution_type text, p_resolution_note text default null,
  p_refund_payment_id uuid default null, p_remake_order_item_id uuid default null,
  p_customer_contacted boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cur text;
begin
  perform app.qr_complaint_gate(p_complaint_id, array['manager']);
  select status into v_cur from public.complaint where id = p_complaint_id;
  if v_cur not in ('investigating','action_taken') then
    raise exception 'cannot resolve from status %', v_cur;
  end if;
  update public.complaint
     set resolution_type = p_resolution_type,
         resolution_note = p_resolution_note,
         refund_payment_id = p_refund_payment_id,
         remake_order_item_id = p_remake_order_item_id,
         customer_contacted_at = case when p_customer_contacted then now() else customer_contacted_at end,
         status = 'resolved'
   where id = p_complaint_id;
end; $$;

-- wrappers (staff RPCs: invoker; execute to authenticated; revoked from anon)
create or replace function public.file_complaint(p_order_item_id uuid, p_category text, p_severity text default 'medium', p_description text default null, p_attempt_no integer default null)
returns uuid language sql security invoker set search_path = '' as $$ select app.file_complaint(p_order_item_id,p_category,p_severity,p_description,p_attempt_no); $$;
create or replace function public.complaint_assign(p_complaint_id uuid, p_assigned_to uuid)
returns void language sql security invoker set search_path = '' as $$ select app.complaint_assign(p_complaint_id,p_assigned_to); $$;
create or replace function public.complaint_set_status(p_complaint_id uuid, p_status text, p_note text default null)
returns void language sql security invoker set search_path = '' as $$ select app.complaint_set_status(p_complaint_id,p_status,p_note); $$;
create or replace function public.complaint_resolve(p_complaint_id uuid, p_resolution_type text, p_resolution_note text default null, p_refund_payment_id uuid default null, p_remake_order_item_id uuid default null, p_customer_contacted boolean default false)
returns void language sql security invoker set search_path = '' as $$ select app.complaint_resolve(p_complaint_id,p_resolution_type,p_resolution_note,p_refund_payment_id,p_remake_order_item_id,p_customer_contacted); $$;

grant execute on function app.file_complaint(uuid, text, text, text, integer) to authenticated;
revoke all on function public.file_complaint(uuid, text, text, text, integer) from public, anon;
grant execute on function public.file_complaint(uuid, text, text, text, integer) to authenticated;

grant execute on function app.complaint_assign(uuid, uuid) to authenticated;
revoke all on function public.complaint_assign(uuid, uuid) from public, anon;
grant execute on function public.complaint_assign(uuid, uuid) to authenticated;

grant execute on function app.complaint_set_status(uuid, text, text) to authenticated;
revoke all on function public.complaint_set_status(uuid, text, text) from public, anon;
grant execute on function public.complaint_set_status(uuid, text, text) to authenticated;

grant execute on function app.complaint_resolve(uuid, text, text, uuid, uuid, boolean) to authenticated;
revoke all on function public.complaint_resolve(uuid, text, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.complaint_resolve(uuid, text, text, uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
