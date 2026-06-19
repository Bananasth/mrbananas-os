-- 0001_core_tenancy.sql — Core multi-tenant spine: tenant + branch.
--
-- RLS is enabled on every table immediately, with explicit DENY-BY-DEFAULT policies.
-- No business access is permitted until the real access policies arrive in W11
-- (0007_rls_policies.sql). No data, no secrets.

-- tenant -------------------------------------------------------------------------------
-- The franchise organization. One row in single-store operation; many under a franchise.
create table public.tenant (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active'
               check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant is 'A franchise organization. One row in single-store operation.';

create trigger tenant_set_updated_at
  before update on public.tenant
  for each row execute function app.set_updated_at();

alter table public.tenant enable row level security;

-- Deny-by-default: this permissive policy grants access to nothing; with no other policy,
-- all non-superuser, non-service-role access is denied. Replaced by real policies in W11.
create policy tenant_deny_all on public.tenant
  for all to public using (false) with check (false);

comment on policy tenant_deny_all on public.tenant is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';

-- branch -------------------------------------------------------------------------------
-- A physical store belonging to a tenant.
create table public.branch (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete restrict,
  name          text not null,
  address       text,
  -- FK to a future tax_profile table is added when that table exists (compliance phase).
  tax_profile_id uuid,
  timezone      text not null default 'Asia/Bangkok',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.branch is 'A physical store/branch belonging to a tenant.';
comment on column public.branch.tax_profile_id is
  'FK constraint deferred until the tax_profile table exists (compliance phase).';

create index branch_tenant_id_idx on public.branch (tenant_id);

create trigger branch_set_updated_at
  before update on public.branch
  for each row execute function app.set_updated_at();

alter table public.branch enable row level security;

create policy branch_deny_all on public.branch
  for all to public using (false) with check (false);

comment on policy branch_deny_all on public.branch is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';
