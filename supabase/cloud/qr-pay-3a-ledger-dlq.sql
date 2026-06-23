-- =============================================================================
-- qr-pay-3a-ledger-dlq.sql — Settlement ledger + dead-letter queue + recovery (PROPOSAL).
-- Additive. settlement_ledger = append-only trace of every settlement/recovery OUTCOME
-- (incl. per-step failures). settlement_dlq = recoverable failed steps. qr_recover_settlement
-- = owner/manager idempotent recovery (guarded: only orders with a captured payment).
-- Reuses qr_deduct_item (B5.3a) + enqueue_print_jobs (print-2) + two shared helpers that
-- M3b's settle will also use. No existing table/function altered.
-- =============================================================================
begin;

-- ============================ settlement_ledger (append-only trace) ============================
create table if not exists public.settlement_ledger (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid,
  received_at       timestamptz not null default now(),
  provider          text not null,
  provider_event_id text,
  amount            bigint,
  order_id          uuid,
  payment_id        uuid references public.payment (id) on delete set null,
  settlement_result text not null check (settlement_result in
    ('confirmed','duplicate_ignored','expired_rejected','amount_mismatch','auth_failed','needs_review','error','recovered',
     'queue_failed','inventory_failed','prep_failed','print_failed')),
  error_message     text,
  created_at        timestamptz not null default now()
);
comment on table public.settlement_ledger is
  'Append-only trace of every settlement/recovery outcome (result + error). One row per attempt/step outcome.';

create index settlement_ledger_order_idx on public.settlement_ledger (order_id);
create index settlement_ledger_event_idx on public.settlement_ledger (provider, provider_event_id);
create index settlement_ledger_received_idx on public.settlement_ledger (received_at);

create trigger settlement_ledger_append_only
  before update or delete on public.settlement_ledger
  for each row execute function app.reject_mutation();

alter table public.settlement_ledger enable row level security;
create policy settlement_ledger_owner_all on public.settlement_ledger
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy settlement_ledger_mgr_select on public.settlement_ledger
  for select to authenticated
  using (branch_id is not null and app.has_branch_role(branch_id, array['manager']));

revoke all on public.settlement_ledger from anon, authenticated;
grant select on public.settlement_ledger to authenticated;

-- ============================ settlement_dlq (recoverable failures) ============================
create table if not exists public.settlement_dlq (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid not null,
  order_id     uuid not null,
  payment_id   uuid references public.payment (id) on delete set null,
  failed_step  text not null check (failed_step in ('queue','inventory','prep','print')),
  reason       text,
  status       text not null default 'open' check (status in ('open','recovered','abandoned')),
  attempts     integer not null default 0 check (attempts >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  recovered_at timestamptz,
  recovered_by uuid references public.app_user (id) on delete set null,
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);
comment on table public.settlement_dlq is
  'Dead-letter queue: failed settlement steps (queue/inventory/prep/print). Recover via qr_recover_settlement.';

create unique index settlement_dlq_one_open on public.settlement_dlq (order_id, failed_step) where status = 'open';
create index settlement_dlq_order_idx on public.settlement_dlq (order_id);
create index settlement_dlq_open_idx on public.settlement_dlq (branch_id) where status = 'open';

create trigger settlement_dlq_set_updated_at
  before update on public.settlement_dlq
  for each row execute function app.set_updated_at();

alter table public.settlement_dlq enable row level security;
create policy settlement_dlq_owner_all on public.settlement_dlq
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy settlement_dlq_mgr_select on public.settlement_dlq
  for select to authenticated
  using (app.has_branch_role(branch_id, array['manager']));

revoke all on public.settlement_dlq from anon, authenticated;
grant select on public.settlement_dlq to authenticated;

-- ============================ shared settlement-tail helpers (idempotent) ============================
create or replace function app.qr_assign_queue(p_order_id uuid, p_tenant uuid, p_branch uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_existing int; v_qnum int; v_qday date;
begin
  select queue_number into v_existing from public.qr_order where order_id = p_order_id for update;
  if v_existing is not null then return v_existing; end if;
  v_qday := (now() at time zone 'Asia/Bangkok')::date;
  insert into public.qr_queue_counter (branch_id, queue_day, tenant_id, last_number)
       values (p_branch, v_qday, p_tenant, 1)
  on conflict (branch_id, queue_day) do update set last_number = qr_queue_counter.last_number + 1
  returning last_number into v_qnum;
  update public.qr_order set queue_number = v_qnum, queue_day = v_qday, paid_at = coalesce(paid_at, now())
   where order_id = p_order_id;
  return v_qnum;
end; $$;

create or replace function app.qr_ensure_prep_items(p_order_id uuid, p_tenant uuid, p_branch uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.prep_item (order_item_id, tenant_id, branch_id, order_id, station_type, prep_status)
  select oi.id, p_tenant, p_branch, p_order_id, w.type, 'waiting'
    from public.order_item oi join public.workstation w on w.id = oi.workstation_id
   where oi.order_id = p_order_id
  on conflict (order_item_id) do nothing;
end; $$;

-- ============================ qr_recover_settlement (owner/manager) ============================
create or replace function app.qr_recover_settlement(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_branch uuid; v_needs_deduct boolean; oi record; v_failed text := null;
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

  -- QUEUE
  begin
    perform app.qr_assign_queue(p_order_id, v_tenant, v_branch);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=app.current_user_id(), updated_at=now()
     where order_id=p_order_id and failed_step='queue' and status='open';
  exception when others then
    v_failed := 'queue';
    update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
     where order_id=p_order_id and failed_step='queue' and status='open';
  end;

  -- INVENTORY (only if not already deducted)
  v_needs_deduct := not exists (
    select 1 from public.inventory_movement im
     where im.reason='sell' and im.ref_type='order_item'
       and im.ref_id in (select id from public.order_item where order_id=p_order_id));
  if v_needs_deduct then
    begin
      for oi in select id from public.order_item where order_id=p_order_id loop
        perform app.qr_deduct_item(oi.id, v_tenant, v_branch);
      end loop;
      update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=app.current_user_id(), updated_at=now()
       where order_id=p_order_id and failed_step='inventory' and status='open';
    exception when others then
      v_failed := coalesce(v_failed,'inventory');
      update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
       where order_id=p_order_id and failed_step='inventory' and status='open';
    end;
  else
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=app.current_user_id(), updated_at=now()
     where order_id=p_order_id and failed_step='inventory' and status='open';
  end if;

  -- PREP
  begin
    perform app.qr_ensure_prep_items(p_order_id, v_tenant, v_branch);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=app.current_user_id(), updated_at=now()
     where order_id=p_order_id and failed_step='prep' and status='open';
  exception when others then
    v_failed := coalesce(v_failed,'prep');
    update public.settlement_dlq set attempts=attempts+1, reason=left(sqlerrm,500), updated_at=now()
     where order_id=p_order_id and failed_step='prep' and status='open';
  end;

  -- PRINT
  begin
    perform app.enqueue_print_jobs(p_order_id);
    update public.settlement_dlq set status='recovered', recovered_at=now(), recovered_by=app.current_user_id(), updated_at=now()
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

create or replace function public.qr_recover_settlement(p_order_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.qr_recover_settlement(p_order_id); $$;

grant execute on function app.qr_recover_settlement(uuid)    to authenticated;
revoke all on function public.qr_recover_settlement(uuid)    from public, anon;
grant execute on function public.qr_recover_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
