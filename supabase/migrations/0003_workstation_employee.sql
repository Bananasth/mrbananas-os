-- 0003_workstation_employee.sql — Workstation (traceability anchor) + employee.
--
-- RLS enabled on every table immediately with explicit DENY-BY-DEFAULT policies; real
-- access policies arrive in W11 (0007_rls_policies.sql). No data, no secrets.

-- workstation --------------------------------------------------------------------------
-- A physical station within a branch. Anchors traceability (where an item was made/sold).
create table public.workstation (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branch (id) on delete cascade,
  name       text not null,
  type       text not null
               check (type in ('beverage', 'bakery_oven', 'prep', 'pos')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workstation is
  'A physical station within a branch; anchors traceability (employee x workstation).';

create index workstation_branch_id_idx on public.workstation (branch_id);

create trigger workstation_set_updated_at
  before update on public.workstation
  for each row execute function app.set_updated_at();

alter table public.workstation enable row level security;

create policy workstation_deny_all on public.workstation
  for all to public using (false) with check (false);

comment on policy workstation_deny_all on public.workstation is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';

-- employee -----------------------------------------------------------------------------
-- A staff member. Distinct from app_user: not every employee has a login, and not every
-- login is an employee. `user_id` is the optional link to a login account.
create table public.employee (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  branch_id  uuid not null references public.branch (id) on delete cascade,
  user_id    uuid references public.app_user (id) on delete set null,
  code       text not null,
  name       text not null,
  hire_date  date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Employee code is unique within a tenant.
  unique (tenant_id, code)
);

comment on table public.employee is
  'A staff member. Distinct from app_user; user_id optionally links to a login account.';
comment on column public.employee.user_id is
  'Optional link to a login account; null for employees without a login.';

create index employee_tenant_id_idx on public.employee (tenant_id);
create index employee_branch_id_idx on public.employee (branch_id);
create index employee_user_id_idx on public.employee (user_id);

create trigger employee_set_updated_at
  before update on public.employee
  for each row execute function app.set_updated_at();

alter table public.employee enable row level security;

create policy employee_deny_all on public.employee
  for all to public using (false) with check (false);

comment on policy employee_deny_all on public.employee is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';
