-- =============================================================================
-- qr-print-1-foundation.sql — Production print foundation (PROPOSAL; review, do not run yet).
-- Additive only. Adds production zones, a printer registry, and the print-job queue, plus two
-- nullable routing columns (product.zone_code, prep_item.zone_code). No functions yet (enqueue
-- + agent-claim RPCs are the next block); no payment changes (separate block). Hardened grants:
-- anon locked out; print_job writes happen via SECURITY DEFINER RPCs later (SELECT only here).
-- =============================================================================
begin;

-- ============================ production_zone ============================
create table if not exists public.production_zone (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid not null,
  code       text not null check (code in ('drink_bar', 'kitchen', 'dessert', 'packaging')),
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (branch_id, code),
  unique (id, tenant_id)
);

create trigger production_zone_set_updated_at
  before update on public.production_zone
  for each row execute function app.set_updated_at();

alter table public.production_zone enable row level security;
create policy production_zone_owner_all on public.production_zone
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy production_zone_branch_select on public.production_zone
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

revoke all on public.production_zone from anon, authenticated;
grant select, insert, update on public.production_zone to authenticated;

-- Seed the four zones for every existing branch (idempotent).
insert into public.production_zone (tenant_id, branch_id, code, name)
select b.tenant_id, b.id, z.code, z.name
  from public.branch b
  cross join (values
    ('drink_bar', 'Drink Bar'), ('kitchen', 'Kitchen'),
    ('dessert', 'Dessert'), ('packaging', 'Packaging')
  ) as z(code, name)
on conflict (branch_id, code) do nothing;

-- ============================ routing columns (additive, nullable) ============================
-- Explicit per-product zone (else settlement falls back to product.category -> zone).
alter table public.product
  add column if not exists zone_code text
  check (zone_code is null or zone_code in ('drink_bar', 'kitchen', 'dessert', 'packaging'));

-- Snapshot of the resolved zone on each prepared item (set at settlement; routes the board + stickers).
alter table public.prep_item
  add column if not exists zone_code text;

-- ============================ printer (registry) ============================
create table if not exists public.printer (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  branch_id      uuid not null,
  zone_id        uuid references public.production_zone (id) on delete set null,  -- null = branch-level (receipt)
  kind           text not null check (kind in ('receipt', 'cup_sticker', 'zone_ticket')),
  name           text not null,
  connection_ref text,                       -- local print-agent / device identifier
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create index printer_branch_kind_idx on public.printer (branch_id, kind);
create index printer_zone_idx on public.printer (zone_id);

create trigger printer_set_updated_at
  before update on public.printer
  for each row execute function app.set_updated_at();

alter table public.printer enable row level security;
create policy printer_owner_all on public.printer
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy printer_branch_select on public.printer
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

revoke all on public.printer from anon, authenticated;
grant select, insert, update on public.printer to authenticated;

-- ============================ print_job (the queue) ============================
create table if not exists public.print_job (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  job_type         text not null check (job_type in ('receipt', 'cup_sticker', 'zone_ticket')),
  target_zone_code text,                       -- null for receipt (branch-level)
  printer_id       uuid references public.printer (id) on delete set null,  -- bound at enqueue or claim time
  ref_type         text not null check (ref_type in ('sales_order', 'order_item')),
  ref_id           uuid not null,
  payload          jsonb not null,             -- label/PDF-ready snapshot (queue#, item, modifiers, timestamp, seller…)
  status           text not null default 'queued'
                     check (status in ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 3 check (max_attempts >= 1),
  error            text,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  printed_at       timestamptz,
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);

comment on table public.print_job is
  'Print queue: receipt (1/order), cup_sticker (1/cup), zone_ticket. Agent claims queued jobs by zone+kind.';

-- exactly one receipt per order
create unique index print_job_one_receipt_per_order on public.print_job (ref_id) where job_type = 'receipt';
create index print_job_branch_status_idx on public.print_job (branch_id, status);
-- agent polling: queued jobs for a zone + kind
create index print_job_dispatch_idx on public.print_job (target_zone_code, job_type) where status = 'queued';
create index print_job_ref_idx on public.print_job (ref_type, ref_id);

alter table public.print_job enable row level security;
create policy print_job_owner_all on public.print_job
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy print_job_branch_select on public.print_job
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Writes (enqueue + agent claim/printed/failed) go through SECURITY DEFINER RPCs (next block).
revoke all on public.print_job from anon, authenticated;
grant select on public.print_job to authenticated;

notify pgrst, 'reload schema';
commit;
