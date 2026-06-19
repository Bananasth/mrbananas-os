-- 0013_production_core.sql — Production core (bakery traceability spine).
--
-- production_plan -> production_batch -> batch_stage (per-stage employee, B1) + batch_event
-- (append-only log). A batch pins the exact recipe_version + workstation; provenance is
-- PER STAGE (B1); failure/partial-yield are first-class (B2). Also closes the deferred link:
-- inventory_lot.batch_id -> production_batch. RLS-first least-privilege. No sales, no waste
-- workflows, no yield auto-calculation. No data, no secrets.

-- Workstation gains a (id, branch_id) unique target so a batch's workstation is branch-checked.
alter table public.workstation
  add constraint workstation_id_branch_key unique (id, branch_id);

-- ============================ production_plan ============================
create table public.production_plan (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid not null,
  plan_date  date not null,
  status     text not null default 'draft'
               check (status in ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  created_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (branch_id, plan_date)
);

comment on table public.production_plan is 'Daily production plan for a branch.';

create index production_plan_branch_id_idx on public.production_plan (branch_id);

create trigger production_plan_set_updated_at
  before update on public.production_plan
  for each row execute function app.set_updated_at();

alter table public.production_plan enable row level security;

create policy production_plan_owner_all on public.production_plan
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy production_plan_manager_all on public.production_plan
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy production_plan_branch_select on public.production_plan
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ production_batch (central hub) ============================
create table public.production_batch (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid not null,
  plan_id           uuid,
  recipe_version_id uuid not null,
  workstation_id    uuid not null,
  -- Optional lead/owner only; per-stage provenance lives on batch_stage (B1).
  lead_employee_id  uuid references public.employee (id) on delete set null,
  batch_code        text not null,
  planned_qty       numeric check (planned_qty is null or planned_qty > 0),
  -- Drives finished-lot quantity (B2).
  actual_yield      numeric check (actual_yield is null or actual_yield >= 0),
  status            text not null default 'planned'
                      check (status in ('planned', 'in_progress', 'completed', 'failed', 'scrapped', 'quarantined')),
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (plan_id, tenant_id) references public.production_plan (id, tenant_id),
  foreign key (recipe_version_id, tenant_id) references public.recipe_version (id, tenant_id) on delete restrict,
  foreign key (workstation_id, branch_id) references public.workstation (id, branch_id) on delete restrict,
  unique (id, tenant_id),
  unique (branch_id, batch_code)
);

comment on table public.production_batch is
  'A production run pinning recipe_version + workstation. Multi-day via batch_stage; failure/partial-yield first-class (B2).';

create index production_batch_branch_id_idx on public.production_batch (branch_id);
create index production_batch_plan_id_idx on public.production_batch (plan_id);
create index production_batch_recipe_version_idx on public.production_batch (recipe_version_id);

create trigger production_batch_set_updated_at
  before update on public.production_batch
  for each row execute function app.set_updated_at();

alter table public.production_batch enable row level security;

create policy production_batch_owner_all on public.production_batch
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager + Baker operate batches in their branch.
create policy production_batch_ops_all on public.production_batch
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'baker']))
  with check (app.has_branch_role(branch_id, array['manager', 'baker']));

create policy production_batch_branch_select on public.production_batch
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Resolve a batch's branch past RLS, for stage/event branch isolation.
create or replace function app.batch_branch(p_batch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select branch_id from public.production_batch where id = p_batch_id;
$$;

-- ============================ batch_stage (per-stage provenance, B1) ============================
create table public.batch_stage (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  batch_id     uuid not null,
  stage        text not null check (stage in ('mix', 'ferment', 'proof', 'bake', 'cool', 'pack')),
  seq          integer not null check (seq > 0),
  -- Who performed THIS stage (B1) — a multi-day batch spans shifts/bakers.
  employee_id  uuid references public.employee (id) on delete set null,
  planned_start timestamptz,
  planned_end   timestamptz,
  actual_start  timestamptz,
  actual_end    timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending', 'in_progress', 'done', 'skipped')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (batch_id, tenant_id) references public.production_batch (id, tenant_id) on delete cascade,
  unique (batch_id, seq)
);

comment on table public.batch_stage is
  'An ordered stage of a batch (mix/ferment/proof/bake/cool/pack); employee_id is per-stage provenance (B1).';

create index batch_stage_batch_id_idx on public.batch_stage (batch_id);

create trigger batch_stage_set_updated_at
  before update on public.batch_stage
  for each row execute function app.set_updated_at();

alter table public.batch_stage enable row level security;

create policy batch_stage_owner_all on public.batch_stage
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy batch_stage_ops_all on public.batch_stage
  for all to authenticated
  using (app.has_branch_role(app.batch_branch(batch_id), array['manager', 'baker']))
  with check (app.has_branch_role(app.batch_branch(batch_id), array['manager', 'baker']));

create policy batch_stage_branch_select on public.batch_stage
  for select to authenticated
  using (app.has_branch_role(app.batch_branch(batch_id), array['owner', 'manager', 'staff', 'baker']));

-- ============================ batch_event (append-only production log) ============================
create table public.batch_event (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  batch_id    uuid not null,
  stage_id    uuid references public.batch_stage (id) on delete set null,
  employee_id uuid references public.employee (id) on delete set null,
  event_type  text not null,
  payload     jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (batch_id, tenant_id) references public.production_batch (id, tenant_id) on delete cascade
);

comment on table public.batch_event is
  'Append-only production log (temperatures, checks, notes). Corrections are new events.';

create index batch_event_batch_id_idx on public.batch_event (batch_id, occurred_at);

-- Append-only: reuse the reject_mutation guard (0006).
create trigger batch_event_append_only
  before update or delete on public.batch_event
  for each row execute function app.reject_mutation();

alter table public.batch_event enable row level security;

create policy batch_event_owner_all on public.batch_event
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy batch_event_ops_all on public.batch_event
  for all to authenticated
  using (app.has_branch_role(app.batch_branch(batch_id), array['manager', 'baker']))
  with check (app.has_branch_role(app.batch_branch(batch_id), array['manager', 'baker']));

create policy batch_event_branch_select on public.batch_event
  for select to authenticated
  using (app.has_branch_role(app.batch_branch(batch_id), array['owner', 'manager', 'staff', 'baker']));

-- ============================ close the deferred link: inventory_lot.batch_id ============================
-- A produced finished lot references the batch it came from (tenant-safe). NO ACTION keeps a
-- batch with produced lots from being deleted (traceability).
alter table public.inventory_lot
  add constraint inventory_lot_batch_fk
  foreign key (batch_id, tenant_id) references public.production_batch (id, tenant_id);
