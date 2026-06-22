-- =============================================================================
-- qr-b1-core.sql — QR Walk-in Ordering, Phase B1 (QR core). PROPOSAL; review, then run.
-- Additive only. No existing table/constraint changed; no existing rows touched.
--   * public.qr_config        — per-branch enable/disable + public QR slug + timeouts
--   * public.qr_order         — QR lifecycle extension of sales_order (1:1)
--   * public.qr_queue_counter — atomic per-branch per-day queue sequence
--   * public.payment          — add nullable provider + paid_at columns
-- Customer-facing writes happen later via SECURITY DEFINER RPCs (B5); these tables
-- are created with staff/owner RLS now. No queue#, stock, or ticket is created here.
-- =============================================================================
begin;

-- ============================ qr_config (admin switch) ============================
create table if not exists public.qr_config (
  branch_id             uuid primary key,
  tenant_id             uuid not null,
  enabled               boolean not null default false,
  public_slug           text not null unique,           -- QR encodes /qr/<slug>; opaque
  pickup_instruction    text,
  prep_sla_minutes      integer not null default 10 check (prep_sla_minutes > 0),
  claim_timeout_minutes integer not null default 5  check (claim_timeout_minutes > 0), -- op rule 1
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);

create trigger qr_config_set_updated_at
  before update on public.qr_config
  for each row execute function app.set_updated_at();

alter table public.qr_config enable row level security;

create policy qr_config_owner_all on public.qr_config
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy qr_config_branch_select on public.qr_config
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

grant select, insert, update on public.qr_config to authenticated;

-- ============================ qr_order (lifecycle extension) ============================
create table if not exists public.qr_order (
  order_id       uuid primary key,
  tenant_id      uuid not null,
  branch_id      uuid not null,
  tracking_token uuid not null unique default gen_random_uuid(),  -- customer's opaque handle
  status         text not null default 'pending_payment'
                   check (status in ('pending_payment','order_received','in_progress',
                                     'ready_for_pickup','completed','expired','needs_review','cancelled')),
  queue_number   integer,                       -- NULL until paid
  queue_day      date,                          -- per-branch daily reset
  paid_at        timestamptz,                   -- queue ordering key
  expires_at     timestamptz not null,          -- created_at + 10 min (set by B5 RPC)
  needs_review   boolean not null default false,
  review_reason  text,
  customer_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete cascade,
  -- one queue number per branch per day (only applies once assigned)
  unique (branch_id, queue_day, queue_number)
);

create index qr_order_branch_status_idx on public.qr_order (branch_id, status);
create index qr_order_queue_idx on public.qr_order (branch_id, queue_day, queue_number);
create index qr_order_expires_idx on public.qr_order (expires_at) where status = 'pending_payment';

create trigger qr_order_set_updated_at
  before update on public.qr_order
  for each row execute function app.set_updated_at();

alter table public.qr_order enable row level security;

create policy qr_order_owner_all on public.qr_order
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy qr_order_branch_select on public.qr_order
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Customer-facing writes use SECURITY DEFINER RPCs (B5) which bypass RLS; staff read here.
grant select on public.qr_order to authenticated;

-- ============================ qr_queue_counter (atomic sequence) ============================
create table if not exists public.qr_queue_counter (
  branch_id   uuid not null,
  queue_day   date not null,
  tenant_id   uuid not null,
  last_number integer not null default 0,
  primary key (branch_id, queue_day),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);

alter table public.qr_queue_counter enable row level security;

create policy qr_queue_counter_owner_all on public.qr_queue_counter
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy qr_queue_counter_branch_select on public.qr_queue_counter
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

grant select on public.qr_queue_counter to authenticated;

-- ============================ payment: additive columns ============================
alter table public.payment add column if not exists provider text;
alter table public.payment add column if not exists paid_at  timestamptz;
alter table public.payment
  add constraint payment_provider_chk
  check (provider is null or provider in ('mock','promptpay','omise','2c2p','stripe','bank'));

notify pgrst, 'reload schema';
commit;
