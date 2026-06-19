-- 0002_identity.sql — Identity foundation: app_user, role, user_branch_role.
--
-- RLS enabled on every table immediately with explicit DENY-BY-DEFAULT policies; real
-- access policies arrive in W11 (0007_rls_policies.sql). No Supabase Auth integration,
-- no external IdP, no data beyond the fixed role seed. `employee` is intentionally NOT
-- created here — it is out of the W6 scope.

-- app_user -----------------------------------------------------------------------------
-- Mirrors a Supabase Auth user. `id` equals the Supabase Auth user id (set at signup in
-- real integration); a FK to auth.users is added when Auth is wired in.
create table public.app_user (
  id         uuid primary key,
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  email      text not null,
  status     text not null default 'active'
               check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_user is
  'A login account. id equals the Supabase Auth user id (FK added when Auth is wired in).';

-- Case-insensitive unique email.
create unique index app_user_email_lower_idx on public.app_user (lower(email));
create index app_user_tenant_id_idx on public.app_user (tenant_id);

create trigger app_user_set_updated_at
  before update on public.app_user
  for each row execute function app.set_updated_at();

alter table public.app_user enable row level security;

create policy app_user_deny_all on public.app_user
  for all to public using (false) with check (false);

comment on policy app_user_deny_all on public.app_user is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';

-- role ---------------------------------------------------------------------------------
-- Global reference table. The approved role model is exactly: owner, manager, staff,
-- baker, customer.
create table public.role (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.role is 'Global role reference. Fixed set: owner, manager, staff, baker, customer.';

create trigger role_set_updated_at
  before update on public.role
  for each row execute function app.set_updated_at();

alter table public.role enable row level security;

create policy role_deny_all on public.role
  for all to public using (false) with check (false);

comment on policy role_deny_all on public.role is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';

-- Seed the five approved roles (runs during migration, which bypasses RLS).
insert into public.role (key, name) values
  ('owner', 'Owner'),
  ('manager', 'Manager'),
  ('staff', 'Staff'),
  ('baker', 'Baker'),
  ('customer', 'Customer')
on conflict (key) do nothing;

-- user_branch_role ---------------------------------------------------------------------
-- Per-branch role assignment: a user holds a role at a branch, and may hold different
-- roles at different branches.
create table public.user_branch_role (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_user (id) on delete cascade,
  branch_id  uuid not null references public.branch (id) on delete cascade,
  role_id    uuid not null references public.role (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One role per user per branch.
  unique (user_id, branch_id)
);

comment on table public.user_branch_role is
  'Per-branch role assignment (user x branch -> role). One role per user per branch.';

create index user_branch_role_user_id_idx on public.user_branch_role (user_id);
create index user_branch_role_branch_id_idx on public.user_branch_role (branch_id);

create trigger user_branch_role_set_updated_at
  before update on public.user_branch_role
  for each row execute function app.set_updated_at();

alter table public.user_branch_role enable row level security;

create policy user_branch_role_deny_all on public.user_branch_role
  for all to public using (false) with check (false);

comment on policy user_branch_role_deny_all on public.user_branch_role is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';
