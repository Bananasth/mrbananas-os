-- 0020_recall.sql — Recall & quarantine workflow (launch-required capstone).
--
-- A recall (supplier-based or lot-based) forward-traces the spine:
--   supplier -> purchase_order(_line) -> receive movement -> lot
--   lot -> consume movement -> batch -> produced lot (recursive)
--   lot -> sell movement -> order_item -> sales_order
-- Affected lots/batches/order_items/sales_orders are SNAPSHOTTED (immutable), implicated
-- lots are auto-QUARANTINED, and every step is logged to an append-only recall_action +
-- the audit_log. Lifecycle: initiated -> investigating -> completed -> closed. RLS-first.
-- No data, no secrets.

-- ============================ recall ============================
create table public.recall (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete restrict,
  scope_type   text not null check (scope_type in ('supplier', 'lot')),
  scope_ref_id uuid not null,
  reason       text not null,
  severity     text not null default 'high' check (severity in ('low', 'medium', 'high', 'critical')),
  status       text not null default 'initiated'
                 check (status in ('initiated', 'investigating', 'completed', 'closed')),
  initiated_by uuid references public.app_user (id) on delete set null,
  initiated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, tenant_id)
);

comment on table public.recall is 'A product recall (supplier- or lot-based). Lifecycle: initiated->investigating->completed->closed.';

create index recall_tenant_id_idx on public.recall (tenant_id);

create trigger recall_set_updated_at
  before update on public.recall
  for each row execute function app.set_updated_at();

-- Full audit trail: every recall change is recorded in the immutable audit_log.
create trigger recall_audit
  after insert or update or delete on public.recall
  for each row execute function app.audit_trigger();

alter table public.recall enable row level security;

create policy recall_owner_all on public.recall
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recall_manager_all on public.recall
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_any_role(array['manager']))
  with check (tenant_id = app.current_tenant_id() and app.has_any_role(array['manager']));

-- ============================ recall_action (append-only) ============================
create table public.recall_action (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  recall_id     uuid not null,
  action_type   text not null
                  check (action_type in ('initiate', 'identify', 'quarantine', 'notify', 'dispose', 'status_change', 'close')),
  actor_user_id uuid references public.app_user (id) on delete set null,
  payload       jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  foreign key (recall_id, tenant_id) references public.recall (id, tenant_id) on delete cascade
);

comment on table public.recall_action is 'Append-only audit of recall steps.';

create index recall_action_recall_idx on public.recall_action (recall_id, occurred_at);

create trigger recall_action_append_only
  before update or delete on public.recall_action
  for each row execute function app.reject_mutation();

alter table public.recall_action enable row level security;

create policy recall_action_owner_all on public.recall_action
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recall_action_manager_all on public.recall_action
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_any_role(array['manager']))
  with check (tenant_id = app.current_tenant_id() and app.has_any_role(array['manager']));

-- ============================ recall_affected (immutable snapshot) ============================
create table public.recall_affected (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  recall_id   uuid not null,
  entity_type text not null
                check (entity_type in ('inventory_lot', 'production_batch', 'order_item', 'sales_order')),
  entity_id   uuid not null,
  captured_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (recall_id, tenant_id) references public.recall (id, tenant_id) on delete cascade,
  unique (recall_id, entity_type, entity_id)
);

comment on table public.recall_affected is 'Immutable snapshot of everything a recall touched.';

create index recall_affected_recall_idx on public.recall_affected (recall_id, entity_type);
create index recall_affected_entity_idx on public.recall_affected (entity_type, entity_id);

create trigger recall_affected_append_only
  before update or delete on public.recall_affected
  for each row execute function app.reject_mutation();

alter table public.recall_affected enable row level security;

create policy recall_affected_owner_all on public.recall_affected
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recall_affected_manager_select on public.recall_affected
  for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_any_role(array['manager']));

-- ============================ initiate_recall (trace + snapshot + quarantine) ============================
create or replace function app.initiate_recall(
  p_scope_type   text,
  p_scope_ref_id uuid,
  p_reason       text,
  p_severity     text default 'high'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_recall uuid;
  v_seed   uuid[];
  v_lots   uuid[];
begin
  if p_scope_type not in ('supplier', 'lot') then
    raise exception 'invalid scope_type %', p_scope_type;
  end if;
  if not (app.is_tenant_owner() or app.has_any_role(array['manager'])) then
    raise exception 'not authorized to initiate a recall';
  end if;

  insert into public.recall (tenant_id, scope_type, scope_ref_id, reason, severity, status, initiated_by)
    values (v_tenant, p_scope_type, p_scope_ref_id, p_reason, p_severity, 'initiated', app.current_user_id())
    returning id into v_recall;

  -- Seed lots: the lot itself, or every lot received from the supplier.
  if p_scope_type = 'lot' then
    v_seed := array[p_scope_ref_id];
  else
    select array_agg(distinct m.lot_id) into v_seed
      from public.inventory_movement m
      join public.purchase_order_line pol on pol.id = m.ref_id and m.ref_type = 'purchase_order_line'
      join public.purchase_order po on po.id = pol.po_id
     where po.supplier_id = p_scope_ref_id and m.tenant_id = v_tenant and m.reason = 'receive';
  end if;
  v_seed := coalesce(v_seed, array[]::uuid[]);

  -- Forward-trace: seed lots, plus lots produced by batches that consumed an affected lot.
  with recursive affected as (
    select unnest(v_seed) as lot_id
    union
    select il.id as lot_id
      from affected a
      join public.inventory_movement cm
        on cm.lot_id = a.lot_id and cm.reason = 'consume' and cm.ref_type = 'production_batch'
      join public.production_batch b on b.id = cm.ref_id
      join public.inventory_lot il on il.batch_id = b.id
  )
  select array_agg(distinct lot_id) into v_lots from affected where lot_id is not null;
  v_lots := coalesce(v_lots, array[]::uuid[]);

  -- Snapshot affected lots.
  insert into public.recall_affected (tenant_id, recall_id, entity_type, entity_id)
    select v_tenant, v_recall, 'inventory_lot', x from unnest(v_lots) x
    on conflict do nothing;

  -- Snapshot affected batches (produced affected lots, or consumed affected lots).
  insert into public.recall_affected (tenant_id, recall_id, entity_type, entity_id)
    select distinct v_tenant, v_recall, 'production_batch', b from (
      select il.batch_id as b from public.inventory_lot il
        where il.id = any(v_lots) and il.batch_id is not null
      union
      select cm.ref_id from public.inventory_movement cm
        where cm.lot_id = any(v_lots) and cm.reason = 'consume' and cm.ref_type = 'production_batch'
    ) s
    on conflict do nothing;

  -- Snapshot affected order_items (lines that drew from an affected lot via a 'sell' movement).
  insert into public.recall_affected (tenant_id, recall_id, entity_type, entity_id)
    select distinct v_tenant, v_recall, 'order_item', cm.ref_id
      from public.inventory_movement cm
     where cm.lot_id = any(v_lots) and cm.reason = 'sell' and cm.ref_type = 'order_item'
       and cm.ref_id is not null
    on conflict do nothing;

  -- Snapshot affected sales_orders.
  insert into public.recall_affected (tenant_id, recall_id, entity_type, entity_id)
    select distinct v_tenant, v_recall, 'sales_order', oi.order_id
      from public.order_item oi
     where oi.id in (
       select cm.ref_id from public.inventory_movement cm
        where cm.lot_id = any(v_lots) and cm.reason = 'sell' and cm.ref_type = 'order_item'
     )
    on conflict do nothing;

  -- Auto-quarantine implicated lots that are still sellable.
  update public.inventory_lot
     set status = 'quarantined',
         quarantine_reason = 'recall:' || v_recall::text,
         quarantined_at = now(),
         quarantined_by = app.current_user_id()
   where id = any(v_lots) and status in ('available', 'expired');

  -- Log the steps.
  insert into public.recall_action (tenant_id, recall_id, action_type, actor_user_id, payload)
    values (v_tenant, v_recall, 'initiate', app.current_user_id(),
            jsonb_build_object('scope_type', p_scope_type, 'scope_ref_id', p_scope_ref_id));
  insert into public.recall_action (tenant_id, recall_id, action_type, actor_user_id, payload)
    values (v_tenant, v_recall, 'identify', app.current_user_id(),
            jsonb_build_object('affected_lots', array_length(v_lots, 1)));
  insert into public.recall_action (tenant_id, recall_id, action_type, actor_user_id, payload)
    values (v_tenant, v_recall, 'quarantine', app.current_user_id(), null);

  return v_recall;
end;
$$;

-- ============================ advance_recall (lifecycle) ============================
create or replace function app.advance_recall(p_recall_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_cur    text;
begin
  if p_new_status not in ('investigating', 'completed', 'closed') then
    raise exception 'invalid target status %', p_new_status;
  end if;
  select status into v_cur from public.recall where id = p_recall_id and tenant_id = v_tenant;
  if v_cur is null then
    raise exception 'recall not found';
  end if;
  if not (app.is_tenant_owner() or app.has_any_role(array['manager'])) then
    raise exception 'not authorized to advance recall %', p_recall_id;
  end if;
  -- Forward-only lifecycle (any state may go straight to closed).
  if not (
    (v_cur = 'initiated' and p_new_status in ('investigating', 'closed')) or
    (v_cur = 'investigating' and p_new_status in ('completed', 'closed')) or
    (v_cur = 'completed' and p_new_status = 'closed')
  ) then
    raise exception 'invalid recall transition % -> %', v_cur, p_new_status;
  end if;

  update public.recall set status = p_new_status where id = p_recall_id;

  insert into public.recall_action (tenant_id, recall_id, action_type, actor_user_id, payload)
    values (v_tenant, p_recall_id, 'status_change', app.current_user_id(),
            jsonb_build_object('from', v_cur, 'to', p_new_status));
end;
$$;
