-- =============================================================================
-- qr-b5-4a-claim.sql — QR Ordering B5.4a: helpers + claim. PROPOSAL.
-- Shared helpers (qr_assert_actor, qr_emit_prep_event, qr_rollup_order_status) + qr_claim_item.
-- Staff RPCs: app.* SECURITY DEFINER logic + public.* SECURITY INVOKER wrappers, execute to
-- authenticated, revoked from anon. Additive; no existing data changed.
-- =============================================================================
begin;

-- caller gate + actor validation; returns the item's branch
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

-- append a prep_event (device + context in payload); attempt_no read from prep_item
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

-- recompute order-level status from its prep_items (op rule 2); never overrides terminal states
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

-- CLAIM: waiting -> claimed (atomic per-item lock). No prep_event (claimed lives on prep_item).
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

create or replace function public.qr_claim_item(
  p_order_item_id uuid, p_employee_id uuid,
  p_ip inet default null, p_device_id text default null,
  p_user_agent text default null, p_device_name text default null)
returns void language sql security invoker set search_path = '' as $$
  select app.qr_claim_item(p_order_item_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name);
$$;

grant execute on function app.qr_claim_item(uuid, uuid, inet, text, text, text) to authenticated;
revoke all on function public.qr_claim_item(uuid, uuid, inet, text, text, text) from public, anon;
grant execute on function public.qr_claim_item(uuid, uuid, inet, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
