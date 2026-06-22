-- =============================================================================
-- qr-b3-1-prep-item.sql — QR Ordering B3.1: prep_item. PROPOSAL; review, then run.
-- Per-order_item production state for QR (1:1 with order_item). QR-ONLY: rows are
-- created at payment success (B5); POS orders never get a prep_item, so POS is
-- untouched. Additive; no existing table/constraint/data changed. Mirrors batch_stage.
-- Writes happen later via SECURITY DEFINER RPCs (B5); authenticated gets SELECT only.
-- =============================================================================
begin;

create table if not exists public.prep_item (
  order_item_id        uuid primary key references public.order_item (id) on delete cascade,
  tenant_id            uuid not null,
  branch_id            uuid not null,
  order_id             uuid not null,
  -- Snapshot of workstation.type at queue time (board filter; intentionally point-in-time).
  station_type         text not null,
  prep_status          text not null default 'waiting'
                         check (prep_status in ('waiting','claimed','preparing',
                                                'qc_required','qc_passed','completed','cancelled')),
  attempt_no           integer not null default 1 check (attempt_no >= 1),
  rework_count         integer not null default 0 check (rework_count >= 0),
  last_qc_result       text check (last_qc_result is null or last_qc_result in ('pass','fail')),
  claimed_by           uuid references public.employee (id) on delete set null,
  claimed_at           timestamptz,
  preparing_started_at timestamptz,
  qc_by                uuid references public.employee (id) on delete set null,
  qc_started_at        timestamptz,
  qc_passed_at         timestamptz,
  completed_by         uuid references public.employee (id) on delete set null,
  completed_at         timestamptz,
  made_in_training     boolean not null default false,  -- snapshot of claimer's training_mode
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.prep_item is
  'QR per-order_item production state (1:1 order_item). Created at payment success; QR-only.';

-- board: items for a branch by status
create index prep_item_branch_status_idx on public.prep_item (branch_id, prep_status);
-- station board: items for a station by status
create index prep_item_station_idx on public.prep_item (station_type, prep_status);
-- order roll-up (ready_for_pickup when all items completed)
create index prep_item_order_idx on public.prep_item (order_id);
-- "my items"
create index prep_item_claimed_by_idx on public.prep_item (claimed_by);
-- claim-timeout sweep (op rule 1): only claimed rows, by claim time
create index prep_item_claim_sweep_idx on public.prep_item (claimed_at) where prep_status = 'claimed';

create trigger prep_item_set_updated_at
  before update on public.prep_item
  for each row execute function app.set_updated_at();

alter table public.prep_item enable row level security;

create policy prep_item_owner_all on public.prep_item
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy prep_item_branch_select on public.prep_item
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Writes use SECURITY DEFINER RPCs (B5) which bypass RLS; staff read here.
grant select on public.prep_item to authenticated;

notify pgrst, 'reload schema';
commit;
