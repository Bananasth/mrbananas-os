-- =============================================================================
-- MR.BANANA'S OS — cloud apply bundle (schema + grants + auth hook)
-- Run in the Supabase Dashboard SQL Editor. Safe to run once on a fresh project.
-- Contains: validated migrations 0000-0020, role grants, custom access token hook.
-- No secrets. No service-role key. No DB password.
-- =============================================================================

-- ============================ 0000_prelude.sql ============================
-- 0000_prelude.sql — Migration prelude.
--
-- Establishes the foundations every later migration relies on. Idempotent and safe to
-- re-run. Contains NO business tables, NO data, NO secrets.

-- Extensions ---------------------------------------------------------------------------
-- pgcrypto provides gen_random_uuid(), used as the default for primary keys.
create extension if not exists pgcrypto;

-- Private schema -----------------------------------------------------------------------
-- `app` holds internal helpers, RLS functions, and audit machinery, kept out of `public`
-- so it is never part of the auto-generated API surface for business data.
create schema if not exists app;

comment on schema app is
  'Internal helpers, RLS functions, and audit machinery. Not exposed as API surface.';

-- Shared trigger function --------------------------------------------------------------
-- BEFORE UPDATE trigger that maintains an `updated_at` timestamp. Attached per-table in
-- later migrations (every mutable business table carries created_at + updated_at).
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger: sets updated_at to now(). Attached per-table in later migrations.';

-- ============================ 0001_core_tenancy.sql ============================
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

-- ============================ 0002_identity.sql ============================
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

-- ============================ 0003_workstation_employee.sql ============================
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

-- ============================ 0004_session_version.sql ============================
-- 0004_session_version.sql — JWT revocation: per-user session_version (single source of truth).
--
-- Adds session_version to app_user (no new table) plus a bump primitive. app_user already
-- has RLS enabled with a deny-by-default policy (0002); no policy change is needed here.
-- No Supabase Auth integration, no data, no secrets.

alter table public.app_user
  add column session_version integer not null default 1;

comment on column public.app_user.session_version is 'Single source of truth for JWT revocation: each JWT embeds this value at issue; a request is rejected when the token value no longer matches. Bump to revoke all of a user''s tokens.';

-- Revocation primitive: increment a user's session_version, invalidating all prior tokens.
-- SECURITY DEFINER with an empty search_path; every reference is schema-qualified.
create or replace function app.bump_session_version(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.app_user
     set session_version = session_version + 1
   where id = p_user_id
  returning session_version;
$$;

comment on function app.bump_session_version(uuid) is 'Increments app_user.session_version for the given user, revoking all outstanding JWTs. SECURITY DEFINER; intended for trusted server/Edge contexts only.';

-- Execution is locked to the trusted backend; general roles cannot bump.
revoke all on function app.bump_session_version(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.bump_session_version(uuid) to service_role;
  end if;
end
$$;

-- ============================ 0005_inventory_item.sql ============================
-- 0005_inventory_item.sql — Inventory item supertype (N1).
--
-- The single referenceable identity for anything stockable. raw_material / semi_finished /
-- product subtypes (and lots, movements, waste, recipe ingredients) will reference this
-- table by a SINGLE foreign key — no polymorphic (kind, id) columns.
--
-- OUT OF SCOPE here (Phase 1+): subtypes, inventory lots, movements, the stock ledger,
-- inventory transactions, purchasing, production batches, yield calculations, menu
-- integration. This migration is the supertype table and its supporting constraints only.
--
-- RLS enabled immediately with an explicit deny-by-default policy. No data, no secrets.

create table public.inventory_item (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  item_kind  text not null
               check (item_kind in ('raw', 'semi_finished', 'finished')),
  base_unit  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_item is
  'Supertype for every stockable item. Subtypes reference this by a single FK (N1). Lots, movements, ledgers, purchasing, and batches are out of scope here.';
comment on column public.inventory_item.item_kind is
  'Exactly one of: raw, semi_finished, finished.';

-- Tenant-safe index; the leading tenant_id column also serves tenant-only lookups via the
-- leftmost-prefix rule, while (tenant_id, item_kind) supports per-kind filtering.
create index inventory_item_tenant_kind_idx on public.inventory_item (tenant_id, item_kind);

create trigger inventory_item_set_updated_at
  before update on public.inventory_item
  for each row execute function app.set_updated_at();

alter table public.inventory_item enable row level security;

create policy inventory_item_deny_all on public.inventory_item
  for all to public using (false) with check (false);

comment on policy inventory_item_deny_all on public.inventory_item is
  'Deny-by-default. Real access policies are added in W11 (0007_rls_policies.sql).';

-- ============================ 0006_audit.sql ============================
-- 0006_audit.sql — Immutable audit-log foundation.
--
-- Append-only audit_log + a reusable AFTER trigger that records every INSERT/UPDATE/DELETE
-- on the approved Phase-0 tables. Immutability is enforced in the DATABASE layer: RLS
-- deny-by-default PLUS a BEFORE UPDATE/DELETE trigger that raises (applies to every role,
-- including the table owner / service_role). No business modules, reporting, analytics, or
-- domain logic. No data, no secrets.

-- audit_log ----------------------------------------------------------------------------
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,        -- the table name
  action        text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),  -- operation
  entity_id     uuid,                 -- the row identifier (null when absent)
  actor_user_id uuid,                 -- the acting user when available
  tenant_id     uuid,                 -- captured from the row when present
  branch_id     uuid,                 -- captured from the row when present
  before        jsonb,                -- null on INSERT
  after         jsonb,                -- null on DELETE
  occurred_at   timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only audit trail. Written only by app.audit_trigger(); UPDATE/DELETE are forbidden.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at);

alter table public.audit_log enable row level security;

create policy audit_log_deny_all on public.audit_log
  for all to public using (false) with check (false);

comment on policy audit_log_deny_all on public.audit_log is
  'Deny-by-default. Owner/Manager read access is added in W11 (0007_rls_policies.sql).';

-- Append-only enforcement (database layer) ---------------------------------------------
-- Reusable guard that rejects any mutation it is attached to.
create or replace function app.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

comment on function app.reject_mutation() is
  'Raises on any mutation; makes a table append-only at the database layer for every role.';

-- Fires for EVERY role (including owner / service_role), so audit_log can never be updated
-- or deleted. INSERT is deliberately NOT guarded, so the audit trigger can append.
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app.reject_mutation();

-- Reusable audit trigger ----------------------------------------------------------------
create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_after   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_payload jsonb := coalesce(v_after, v_before);
  v_actor   uuid  := nullif(current_setting('app.actor_user_id', true), '')::uuid;
begin
  insert into public.audit_log
    (entity_type, action, entity_id, actor_user_id, tenant_id, branch_id, before, after)
  values (
    tg_table_name,
    tg_op,
    nullif(v_payload->>'id', '')::uuid,
    v_actor,
    nullif(v_payload->>'tenant_id', '')::uuid,
    nullif(v_payload->>'branch_id', '')::uuid,
    v_before,
    v_after
  );
  return null;
end;
$$;

comment on function app.audit_trigger() is
  'AFTER INSERT/UPDATE/DELETE trigger: appends a row to audit_log. SECURITY DEFINER so it can write through audit_log RLS; actor read from the app.actor_user_id GUC when set.';

-- Attach to the approved Phase-0 tables (audit_log itself is NOT audited) ----------------
create trigger tenant_audit
  after insert or update or delete on public.tenant
  for each row execute function app.audit_trigger();

create trigger branch_audit
  after insert or update or delete on public.branch
  for each row execute function app.audit_trigger();

create trigger app_user_audit
  after insert or update or delete on public.app_user
  for each row execute function app.audit_trigger();

create trigger role_audit
  after insert or update or delete on public.role
  for each row execute function app.audit_trigger();

create trigger user_branch_role_audit
  after insert or update or delete on public.user_branch_role
  for each row execute function app.audit_trigger();

create trigger workstation_audit
  after insert or update or delete on public.workstation
  for each row execute function app.audit_trigger();

create trigger employee_audit
  after insert or update or delete on public.employee
  for each row execute function app.audit_trigger();

create trigger inventory_item_audit
  after insert or update or delete on public.inventory_item
  for each row execute function app.audit_trigger();

-- ============================ 0007_rls_policies.sql ============================
-- 0007_rls_policies.sql — RLS policy foundation (least-privilege).
--
-- Replaces every deny-all bootstrap policy with approved least-privilege policies derived
-- from the permission matrix (docs/architecture/06-role-permission-matrix.md). Enforces
-- tenant, branch, and role isolation. RLS stays enabled on every table; no table is left
-- without policy coverage. No business logic, no workflows. No data, no secrets.
--
-- Claims shape (stamped at login): { sub, tenant_id, branch_roles:[{branch_id, role}],
-- session_version }. Helpers read claims from the request JWT; they touch no tables (except
-- branch_tenant_id, which is SECURITY DEFINER to resolve a branch's tenant past RLS).

-- ============================ Helper functions ============================

-- Raw JWT claims as jsonb ('{}' when absent, e.g. offline / anon).
create or replace function app.current_claims()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

-- The authenticated user id (claim `sub`).
create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(app.current_claims() ->> 'sub', '')::uuid;
$$;

-- The tenant the request is scoped to.
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(app.current_claims() ->> 'tenant_id', '')::uuid;
$$;

-- The branch ids present in the request's branch_roles.
create or replace function app.current_branch_ids()
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
    array(
      select (elem ->> 'branch_id')::uuid
      from jsonb_array_elements(app.current_claims() -> 'branch_roles') as elem
      where elem ->> 'branch_id' is not null
    ),
    array[]::uuid[]
  );
$$;

-- True if the request holds the owner role anywhere (owner = full access within tenant).
create or replace function app.is_tenant_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(app.current_claims() -> 'branch_roles') as elem
    where elem ->> 'role' = 'owner'
  );
$$;

-- True if the request holds any of the given roles at the given branch.
create or replace function app.has_branch_role(p_branch_id uuid, p_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(app.current_claims() -> 'branch_roles') as elem
    where (elem ->> 'branch_id')::uuid = p_branch_id
      and elem ->> 'role' = any (p_roles)
  );
$$;

-- True if the request holds any of the given roles at any branch (used to exclude
-- customer-only sessions from internal tables).
create or replace function app.has_any_role(p_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(app.current_claims() -> 'branch_roles') as elem
    where elem ->> 'role' = any (p_roles)
  );
$$;

-- Resolve a branch's tenant past RLS (SECURITY DEFINER), for branch-only tables that carry
-- no tenant_id column. Used to enforce tenant isolation on user_branch_role / workstation /
-- audit rows captured with only a branch_id.
create or replace function app.branch_tenant_id(p_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.branch where id = p_branch_id;
$$;

-- ============================ tenant ============================
drop policy if exists tenant_deny_all on public.tenant;

create policy tenant_owner_all on public.tenant
  for all to authenticated
  using (id = app.current_tenant_id() and app.is_tenant_owner())
  with check (id = app.current_tenant_id() and app.is_tenant_owner());

create policy tenant_member_select on public.tenant
  for select to authenticated
  using (
    id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ branch ============================
drop policy if exists branch_deny_all on public.branch;

create policy branch_owner_all on public.branch
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy branch_member_select on public.branch
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_branch_role(id, array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ app_user ============================
drop policy if exists app_user_deny_all on public.app_user;

create policy app_user_owner_all on public.app_user
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy app_user_self_select on public.app_user
  for select to authenticated
  using (id = app.current_user_id());

-- ============================ role (global reference) ============================
drop policy if exists role_deny_all on public.role;

-- Reference data: readable by any authenticated session; not writable from the app.
create policy role_authenticated_select on public.role
  for select to authenticated
  using (true);

-- ============================ user_branch_role ============================
drop policy if exists user_branch_role_deny_all on public.user_branch_role;

create policy user_branch_role_owner_all on public.user_branch_role
  for all to authenticated
  using (app.is_tenant_owner() and app.branch_tenant_id(branch_id) = app.current_tenant_id())
  with check (app.is_tenant_owner() and app.branch_tenant_id(branch_id) = app.current_tenant_id());

create policy user_branch_role_self_select on public.user_branch_role
  for select to authenticated
  using (user_id = app.current_user_id());

-- ============================ workstation ============================
drop policy if exists workstation_deny_all on public.workstation;

create policy workstation_owner_all on public.workstation
  for all to authenticated
  using (app.is_tenant_owner() and app.branch_tenant_id(branch_id) = app.current_tenant_id())
  with check (app.is_tenant_owner() and app.branch_tenant_id(branch_id) = app.current_tenant_id());

create policy workstation_manager_all on public.workstation
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy workstation_branch_select on public.workstation
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ employee ============================
drop policy if exists employee_deny_all on public.employee;

create policy employee_owner_all on public.employee
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy employee_manager_select on public.employee
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_branch_role(branch_id, array['manager'])
  );

create policy employee_self_select on public.employee
  for select to authenticated
  using (user_id = app.current_user_id());

-- ============================ inventory_item ============================
drop policy if exists inventory_item_deny_all on public.inventory_item;

create policy inventory_item_owner_all on public.inventory_item
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy inventory_item_staff_select on public.inventory_item
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ audit_log (read-only; immutable) ============================
drop policy if exists audit_log_deny_all on public.audit_log;

-- Owner reads all audit rows in their tenant (tenant resolved via branch_id when the row
-- carries no tenant_id). No insert/update/delete policy: the log is append-only (the W10
-- trigger blocks update/delete; inserts come only from the SECURITY DEFINER audit trigger).
create policy audit_log_owner_select on public.audit_log
  for select to authenticated
  using (
    app.is_tenant_owner()
    and coalesce(tenant_id, app.branch_tenant_id(branch_id)) = app.current_tenant_id()
  );

create policy audit_log_manager_select on public.audit_log
  for select to authenticated
  using (
    branch_id = any (app.current_branch_ids())
    and app.has_branch_role(branch_id, array['manager'])
  );

-- ============================ 0008_inventory_subtypes.sql ============================
-- 0008_inventory_subtypes.sql — Inventory subtypes on the inventory_item supertype (N1).
--
-- raw_material and semi_finished are SHARED-PK subtypes of inventory_item (every one IS a
-- stockable item; the composite FK guarantees the linked supertype row has the right tenant
-- AND item_kind). product is a catalog entity that OPTIONALLY links to an inventory_item
-- (batch/finished goods are stocked; made-to-order beverages are not). unit_conversion holds
-- UoM factors. RLS-first least-privilege, reusing the W11 helpers. No movements, lots,
-- ledger, pricing logic, or workflows. No data, no secrets.

-- Composite unique targets on the supertype for subtype foreign keys (id is already PK).
alter table public.inventory_item
  add constraint inventory_item_id_tenant_key unique (id, tenant_id);
alter table public.inventory_item
  add constraint inventory_item_id_tenant_kind_key unique (id, tenant_id, item_kind);

-- ============================ raw_material (shared PK, kind = raw) ============================
create table public.raw_material (
  id            uuid primary key,
  tenant_id     uuid not null,
  item_kind     text not null default 'raw' check (item_kind = 'raw'),
  sku           text not null,
  name          text not null,
  reorder_point numeric not null default 0 check (reorder_point >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (id, tenant_id, item_kind)
    references public.inventory_item (id, tenant_id, item_kind) on delete cascade,
  unique (tenant_id, sku)
);

comment on table public.raw_material is
  'Shared-PK subtype of inventory_item (item_kind = raw); tenant + kind enforced by composite FK.';

create index raw_material_tenant_id_idx on public.raw_material (tenant_id);

create trigger raw_material_set_updated_at
  before update on public.raw_material
  for each row execute function app.set_updated_at();

alter table public.raw_material enable row level security;

create policy raw_material_owner_all on public.raw_material
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy raw_material_staff_select on public.raw_material
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ semi_finished (shared PK, kind = semi_finished) ============================
create table public.semi_finished (
  id         uuid primary key,
  tenant_id  uuid not null,
  item_kind  text not null default 'semi_finished' check (item_kind = 'semi_finished'),
  sku        text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (id, tenant_id, item_kind)
    references public.inventory_item (id, tenant_id, item_kind) on delete cascade,
  unique (tenant_id, sku)
);

comment on table public.semi_finished is
  'Shared-PK subtype of inventory_item (item_kind = semi_finished); tenant + kind enforced by composite FK.';

create index semi_finished_tenant_id_idx on public.semi_finished (tenant_id);

create trigger semi_finished_set_updated_at
  before update on public.semi_finished
  for each row execute function app.set_updated_at();

alter table public.semi_finished enable row level security;

create policy semi_finished_owner_all on public.semi_finished
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy semi_finished_staff_select on public.semi_finished
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ product (catalog; optional stock link) ============================
create table public.product (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete restrict,
  -- Set for batch/finished goods (stocked); null for made-to-order. Tenant-match for the
  -- optional link is enforced at the service layer (documented Phase-1 follow-up).
  inventory_item_id uuid references public.inventory_item (id) on delete set null,
  sku               text not null,
  name              text not null,
  category          text not null check (category in ('beverage', 'bakery')),
  type              text not null check (type in ('made_to_order', 'batch')),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, sku)
);

comment on table public.product is
  'Sellable product. Optionally links to an inventory_item (batch/finished goods are stocked).';

create index product_tenant_id_idx on public.product (tenant_id);

create trigger product_set_updated_at
  before update on public.product
  for each row execute function app.set_updated_at();

alter table public.product enable row level security;

create policy product_owner_all on public.product
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy product_staff_select on public.product
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ unit_conversion (UoM) ============================
create table public.unit_conversion (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  -- null item_id = a tenant-global conversion (e.g. kg <-> g); otherwise item-specific.
  item_id    uuid references public.inventory_item (id) on delete cascade,
  from_unit  text not null,
  to_unit    text not null,
  factor     numeric not null check (factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_unit <> to_unit),
  unique (tenant_id, item_id, from_unit, to_unit)
);

comment on table public.unit_conversion is
  'Unit-of-measure conversion factors; item-specific or tenant-global (null item_id).';

create index unit_conversion_tenant_id_idx on public.unit_conversion (tenant_id);

create trigger unit_conversion_set_updated_at
  before update on public.unit_conversion
  for each row execute function app.set_updated_at();

alter table public.unit_conversion enable row level security;

create policy unit_conversion_owner_all on public.unit_conversion
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy unit_conversion_staff_select on public.unit_conversion
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ 0009_branch_product.sql ============================
-- 0009_branch_product.sql — Per-branch product price override + availability (F2).
--
-- A franchise overrides price/availability/menu per branch; single-store can ignore it.
-- Orders/invoices still snapshot the EFFECTIVE price, so history stays correct regardless.
-- Money is stored in integer minor units (e.g. satang). RLS-first least-privilege. No
-- pricing logic, no workflows. No data, no secrets.

-- Composite unique targets so branch_product can prove branch + product share one tenant.
alter table public.branch
  add constraint branch_id_tenant_key unique (id, tenant_id);
alter table public.product
  add constraint product_id_tenant_key unique (id, tenant_id);

create table public.branch_product (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  branch_id      uuid not null,
  product_id     uuid not null,
  -- Integer minor units (e.g. satang). Null = use the product's base price.
  price_override bigint check (price_override is null or price_override >= 0),
  is_available   boolean not null default true,
  menu_section   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Composite FKs force branch and product to belong to branch_product.tenant_id.
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete cascade,
  unique (branch_id, product_id)
);

comment on table public.branch_product is
  'Per-branch price override / availability / menu placement for a product (F2).';
comment on column public.branch_product.price_override is
  'Integer minor units (e.g. satang); null means use the product base price.';

create index branch_product_branch_id_idx on public.branch_product (branch_id);
create index branch_product_product_id_idx on public.branch_product (product_id);
create index branch_product_tenant_id_idx on public.branch_product (tenant_id);

create trigger branch_product_set_updated_at
  before update on public.branch_product
  for each row execute function app.set_updated_at();

alter table public.branch_product enable row level security;

-- Owner: full access within tenant.
create policy branch_product_owner_all on public.branch_product
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager: manages price/availability/menu for their own branches.
create policy branch_product_manager_all on public.branch_product
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

-- Staff/Baker (and Owner/Manager): read their own branch's menu.
create policy branch_product_branch_select on public.branch_product
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ 0010_catalog_recipes.sql ============================
-- 0010_catalog_recipes.sql — Catalog recipes with version control.
--
-- recipe (per product) -> recipe_version (immutable once active) -> recipe_ingredient
-- (bill of materials; SINGLE FK to inventory_item, N1). Version control is enforced in the
-- database: an active version's content cannot change (only active -> retired), a retired
-- version is fully immutable, and at most one version per recipe is active. Ingredients of
-- an active/retired version cannot change. RLS-first least-privilege. No data, no secrets.

-- ============================ helpers / guards ============================

-- Read a recipe_version's status past RLS (used by the ingredient guard).
-- plpgsql (not sql) so the body is validated at call time — recipe_version is created below.
create or replace function app.recipe_version_status(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.recipe_version where id = p_id;
  return v_status;
end;
$$;

-- BEFORE UPDATE guard: an active version is immutable except an active -> retired
-- transition (no other column change); a retired version is fully immutable.
create or replace function app.guard_active_recipe_version()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'retired' then
    raise exception 'recipe_version % is retired and immutable', old.id;
  elsif old.status = 'active' then
    if new.status = 'retired'
       and new.tenant_id = old.tenant_id
       and new.recipe_id = old.recipe_id
       and new.version_no = old.version_no
       and new.shelf_life_hours is not distinct from old.shelf_life_hours
       and new.yield_qty is not distinct from old.yield_qty
       and new.effective_from is not distinct from old.effective_from then
      return new;
    end if;
    raise exception 'recipe_version % is active and immutable; create a new version (only retire is allowed)', old.id;
  end if;
  return new;
end;
$$;

-- BEFORE INSERT/UPDATE/DELETE guard: ingredients of an active/retired version are frozen.
create or replace function app.guard_recipe_ingredient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid := coalesce(new.recipe_version_id, old.recipe_version_id);
  v_status  text := app.recipe_version_status(v_version);
begin
  if v_status in ('active', 'retired') then
    raise exception 'recipe_version % is % and immutable; its ingredients cannot change',
      v_version, v_status;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ============================ recipe ============================
create table public.recipe (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  product_id uuid not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (product_id, name)
);

comment on table public.recipe is 'A recipe for a product. Versioned via recipe_version.';

create index recipe_product_id_idx on public.recipe (product_id);

create trigger recipe_set_updated_at
  before update on public.recipe
  for each row execute function app.set_updated_at();

alter table public.recipe enable row level security;

create policy recipe_owner_all on public.recipe
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_staff_select on public.recipe
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ recipe_version ============================
create table public.recipe_version (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  recipe_id        uuid not null,
  version_no       integer not null check (version_no > 0),
  status           text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  shelf_life_hours integer check (shelf_life_hours is null or shelf_life_hours >= 0),
  yield_qty        numeric check (yield_qty is null or yield_qty > 0),
  effective_from   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (recipe_id, tenant_id) references public.recipe (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (recipe_id, version_no)
);

comment on table public.recipe_version is
  'A versioned recipe. Immutable once active (content frozen; only active -> retired).';

create index recipe_version_recipe_id_idx on public.recipe_version (recipe_id);
-- At most one active version per recipe.
create unique index recipe_version_one_active_idx
  on public.recipe_version (recipe_id) where status = 'active';

create trigger recipe_version_set_updated_at
  before update on public.recipe_version
  for each row execute function app.set_updated_at();

create trigger recipe_version_immutable
  before update on public.recipe_version
  for each row execute function app.guard_active_recipe_version();

alter table public.recipe_version enable row level security;

create policy recipe_version_owner_all on public.recipe_version
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_version_staff_select on public.recipe_version
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ recipe_ingredient (BoM; single FK to inventory_item) ============================
create table public.recipe_ingredient (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  recipe_version_id uuid not null,
  item_id           uuid not null,
  quantity          numeric not null check (quantity > 0),
  unit              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (recipe_version_id, tenant_id)
    references public.recipe_version (id, tenant_id) on delete cascade,
  -- Single FK to the inventory_item supertype (N1); raw or semi-finished in practice.
  foreign key (item_id, tenant_id)
    references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.recipe_ingredient is
  'Bill of materials. Single FK to inventory_item (N1). Frozen once its version is active.';

create index recipe_ingredient_version_idx on public.recipe_ingredient (recipe_version_id);
create index recipe_ingredient_item_idx on public.recipe_ingredient (item_id);

create trigger recipe_ingredient_set_updated_at
  before update on public.recipe_ingredient
  for each row execute function app.set_updated_at();

create trigger recipe_ingredient_immutable
  before insert or update or delete on public.recipe_ingredient
  for each row execute function app.guard_recipe_ingredient();

alter table public.recipe_ingredient enable row level security;

create policy recipe_ingredient_owner_all on public.recipe_ingredient
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_ingredient_staff_select on public.recipe_ingredient
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ 0011_purchasing.sql ============================
-- 0011_purchasing.sql — Minimal suppliers & purchasing.
--
-- supplier (tenant master) -> purchase_order (per branch) -> purchase_order_line (what was
-- ordered, referencing inventory_item via a single FK). This is the MINIMAL purchasing
-- scope: no receiving, no inventory movements, no lots, no ledger — those arrive with the
-- inventory-ledger module. RLS-first least-privilege. No data, no secrets.

-- ============================ supplier ============================
create table public.supplier (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete restrict,
  name       text not null,
  contact    text,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

comment on table public.supplier is 'Minimal supplier master (tenant-level).';

create index supplier_tenant_id_idx on public.supplier (tenant_id);

create trigger supplier_set_updated_at
  before update on public.supplier
  for each row execute function app.set_updated_at();

alter table public.supplier enable row level security;

create policy supplier_owner_all on public.supplier
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy supplier_staff_select on public.supplier
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_any_role(array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ purchase_order (per branch) ============================
create table public.purchase_order (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  supplier_id uuid not null,
  status      text not null default 'draft'
                check (status in ('draft', 'ordered', 'received', 'cancelled')),
  ordered_at  timestamptz,
  expected_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (supplier_id, tenant_id) references public.supplier (id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

comment on table public.purchase_order is 'Minimal purchase-order header (per branch).';

create index purchase_order_branch_id_idx on public.purchase_order (branch_id);
create index purchase_order_supplier_id_idx on public.purchase_order (supplier_id);
create index purchase_order_tenant_id_idx on public.purchase_order (tenant_id);

create trigger purchase_order_set_updated_at
  before update on public.purchase_order
  for each row execute function app.set_updated_at();

alter table public.purchase_order enable row level security;

create policy purchase_order_owner_all on public.purchase_order
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy purchase_order_manager_all on public.purchase_order
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy purchase_order_branch_select on public.purchase_order
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Resolve a PO's branch past RLS, for line-level branch isolation.
create or replace function app.purchase_order_branch(p_po_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select branch_id from public.purchase_order where id = p_po_id;
$$;

-- ============================ purchase_order_line ============================
create table public.purchase_order_line (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  po_id      uuid not null,
  item_id    uuid not null,
  qty        numeric not null check (qty > 0),
  unit       text not null,
  -- Integer minor units (e.g. satang); null when not priced yet.
  unit_cost  bigint check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (po_id, tenant_id) references public.purchase_order (id, tenant_id) on delete cascade,
  -- Single FK to the inventory_item supertype (N1).
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.purchase_order_line is
  'A purchase-order line referencing an inventory_item (single FK, N1). No receiving logic yet.';

create index purchase_order_line_po_idx on public.purchase_order_line (po_id);
create index purchase_order_line_item_idx on public.purchase_order_line (item_id);

create trigger purchase_order_line_set_updated_at
  before update on public.purchase_order_line
  for each row execute function app.set_updated_at();

alter table public.purchase_order_line enable row level security;

create policy purchase_order_line_owner_all on public.purchase_order_line
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy purchase_order_line_manager_all on public.purchase_order_line
  for all to authenticated
  using (app.has_branch_role(app.purchase_order_branch(po_id), array['manager']))
  with check (app.has_branch_role(app.purchase_order_branch(po_id), array['manager']));

create policy purchase_order_line_branch_select on public.purchase_order_line
  for select to authenticated
  using (
    app.has_branch_role(app.purchase_order_branch(po_id), array['owner', 'manager', 'staff', 'baker'])
  );

-- ============================ 0012_inventory_ledger.sql ============================
-- 0012_inventory_ledger.sql — Inventory ledger: lots, movements, stock-on-hand, receiving.
--
-- inventory_movement is the APPEND-ONLY source of truth (N3); inventory_lot.qty_on_hand is
-- a cache maintained transactionally by a trigger as movements are inserted. expires_at is
-- the single source of shelf life (N2) and shelf_life is a VIEW. Receiving is a guarded
-- SECURITY DEFINER primitive that creates a lot + a 'receive' movement. RLS-first
-- least-privilege. No production batches, no sales, no waste workflows. No data, no secrets.

-- ============================ inventory_lot (stock; qty_on_hand cache) ============================
create table public.inventory_lot (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  item_id     uuid not null,
  -- FK to production_batch added in Phase 2 (production).
  batch_id    uuid,
  qty_on_hand numeric not null default 0 check (qty_on_hand >= 0),
  unit        text not null,
  received_at timestamptz not null default now(),
  expires_at  timestamptz,
  status      text not null default 'available'
                check (status in ('available', 'quarantined', 'expired', 'depleted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

comment on table public.inventory_lot is
  'A trackable stock lot. qty_on_hand is a cache maintained from inventory_movement (N3); expires_at is the single source of shelf life (N2).';
comment on column public.inventory_lot.qty_on_hand is
  'Cache of net movements for this lot; the inventory_movement ledger is the authority.';

create index inventory_lot_tenant_id_idx on public.inventory_lot (tenant_id);
create index inventory_lot_branch_item_idx on public.inventory_lot (branch_id, item_id);
-- FEFO scan: soonest-expiring available lots first (N2; replaces a stored fefo_rank).
create index inventory_lot_fefo_idx
  on public.inventory_lot (branch_id, item_id, expires_at) where status = 'available';

create trigger inventory_lot_set_updated_at
  before update on public.inventory_lot
  for each row execute function app.set_updated_at();

alter table public.inventory_lot enable row level security;

create policy inventory_lot_owner_all on public.inventory_lot
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy inventory_lot_manager_all on public.inventory_lot
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy inventory_lot_branch_select on public.inventory_lot
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ inventory_movement (append-only ledger; the authority) ============================
create table public.inventory_movement (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  lot_id      uuid not null,
  item_id     uuid not null,
  qty_delta   numeric not null check (qty_delta <> 0),
  reason      text not null
                check (reason in ('receive', 'consume', 'produce', 'sell', 'waste', 'adjust', 'transfer')),
  ref_type    text,
  ref_id      uuid,
  employee_id uuid references public.employee (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (lot_id, tenant_id) references public.inventory_lot (id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_item (id, tenant_id) on delete restrict
);

comment on table public.inventory_movement is
  'Append-only inventory ledger (the source of truth). Corrections are new adjust rows.';

create index inventory_movement_lot_idx on public.inventory_movement (lot_id, occurred_at);
create index inventory_movement_ref_idx on public.inventory_movement (ref_type, ref_id);
create index inventory_movement_branch_idx on public.inventory_movement (branch_id);
create index inventory_movement_tenant_idx on public.inventory_movement (tenant_id);

-- Append-only: reuse the reject_mutation guard (0006). Blocks UPDATE/DELETE for every role.
create trigger inventory_movement_append_only
  before update or delete on public.inventory_movement
  for each row execute function app.reject_mutation();

alter table public.inventory_movement enable row level security;

create policy inventory_movement_owner_all on public.inventory_movement
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy inventory_movement_manager_all on public.inventory_movement
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager']))
  with check (app.has_branch_role(branch_id, array['manager']));

create policy inventory_movement_branch_select on public.inventory_movement
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ stock-on-hand cache maintenance (N3) ============================
-- AFTER INSERT on a movement, apply qty_delta to the lot's cache. The lot's qty_on_hand >= 0
-- CHECK rejects any movement that would over-deplete a lot. SECURITY DEFINER so the cache is
-- maintained regardless of the poster's lot-update rights.
create or replace function app.apply_movement_to_lot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_lot
     set qty_on_hand = qty_on_hand + new.qty_delta,
         status = case
                    when qty_on_hand + new.qty_delta <= 0 and status <> 'quarantined' then 'depleted'
                    else status
                  end
   where id = new.lot_id;
  return null;
end;
$$;

create trigger inventory_movement_apply
  after insert on public.inventory_movement
  for each row execute function app.apply_movement_to_lot();

-- ============================ receiving primitive (guarded) ============================
-- Creates a lot + a 'receive' movement atomically. SECURITY DEFINER, so it validates the
-- caller's authorization internally: same tenant, and owner/manager/staff at the branch.
create or replace function app.receive_inventory(
  p_branch_id   uuid,
  p_item_id     uuid,
  p_qty         numeric,
  p_unit        text,
  p_expires_at  timestamptz default null,
  p_employee_id uuid default null,
  p_ref_type    text default null,
  p_ref_id      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_lot    uuid;
begin
  if p_qty <= 0 then
    raise exception 'receive qty must be positive';
  end if;
  if v_tenant is null then
    raise exception 'no tenant context';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['owner', 'manager', 'staff'])) then
    raise exception 'not authorized to receive at branch %', p_branch_id;
  end if;

  insert into public.inventory_lot (tenant_id, branch_id, item_id, unit, expires_at, status, qty_on_hand)
    values (v_tenant, p_branch_id, p_item_id, p_unit, p_expires_at, 'available', 0)
    returning id into v_lot;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
    values (v_tenant, p_branch_id, v_lot, p_item_id, p_qty, 'receive', p_ref_type, p_ref_id, p_employee_id);

  return v_lot;
end;
$$;

-- ============================ derived views (RLS via security_invoker) ============================
-- Shelf life is a VIEW over inventory_lot (N2) — no separate table, no stored fefo_rank.
create view public.shelf_life with (security_invoker = true) as
select
  l.id as lot_id,
  l.tenant_id,
  l.branch_id,
  l.item_id,
  l.received_at,
  l.expires_at,
  case
    when l.expires_at is null then 'fresh'
    when l.expires_at <= now() then 'expired'
    when l.expires_at <= now() + interval '24 hours' then 'expiring'
    else 'fresh'
  end as freshness
from public.inventory_lot l;

comment on view public.shelf_life is
  'Derived shelf-life over inventory_lot (N2). FEFO = order by expires_at. RLS via security_invoker.';

-- Stock on hand: available quantity per item per branch (cache rollup).
create view public.stock_on_hand with (security_invoker = true) as
select
  l.tenant_id,
  l.branch_id,
  l.item_id,
  sum(l.qty_on_hand) as qty_available
from public.inventory_lot l
where l.status = 'available'
group by l.tenant_id, l.branch_id, l.item_id;

comment on view public.stock_on_hand is
  'Available stock per item per branch, summed from the qty_on_hand cache. RLS via security_invoker.';

-- ============================ 0013_production_core.sql ============================
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

-- ============================ 0014_batch_execution.sql ============================
-- 0014_batch_execution.sql — Batch-execution primitives (production <-> inventory loop).
--
-- Guarded SECURITY DEFINER functions that connect production to the inventory ledger:
--   * consume_for_batch — FEFO-consume raw/semi stock into 'consume' movements
--   * complete_batch     — set actual_yield + produce a finished lot ('produce' movement)
-- Each validates the caller's authorization internally (tenant context + owner/manager/baker
-- at the batch's branch). Plus a yield-reconciliation view. No new tables, no data, no
-- secrets.

-- ============================ consume_for_batch (FEFO) ============================
-- Consume p_qty of an item at the batch's branch, oldest-expiring first (FEFO), posting
-- negative 'consume' movements that reference the batch. Locks the lots it draws from and
-- raises if stock is insufficient. The lot qty_on_hand >= 0 CHECK is the final backstop.
create or replace function app.consume_for_batch(
  p_batch_id   uuid,
  p_item_id    uuid,
  p_qty        numeric,
  p_employee_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_branch    uuid;
  v_remaining numeric := p_qty;
  v_take      numeric;
  r           record;
begin
  if p_qty <= 0 then
    raise exception 'consume qty must be positive';
  end if;
  select branch_id into v_branch
    from public.production_batch where id = p_batch_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'batch not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager', 'baker'])) then
    raise exception 'not authorized to consume for batch %', p_batch_id;
  end if;

  for r in
    select id, qty_on_hand
      from public.inventory_lot
     where tenant_id = v_tenant and branch_id = v_branch and item_id = p_item_id
       and status = 'available' and qty_on_hand > 0
     order by expires_at nulls last, received_at
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, r.qty_on_hand);
    insert into public.inventory_movement
      (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
      values (v_tenant, v_branch, r.id, p_item_id, -v_take, 'consume', 'production_batch', p_batch_id, p_employee_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient stock for item % at branch %: short by %',
      p_item_id, v_branch, v_remaining;
  end if;
end;
$$;

-- ============================ complete_batch (produce + reconcile yield) ============================
-- Record actual_yield, mark the batch completed, and produce a finished lot of the batch's
-- product (qty = actual_yield) via a 'produce' movement. The finished item is resolved from
-- recipe_version -> recipe -> product.inventory_item_id.
create or replace function app.complete_batch(
  p_batch_id    uuid,
  p_actual_yield numeric,
  p_unit        text,
  p_expires_at  timestamptz default null,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
  v_item   uuid;
  v_lot    uuid;
begin
  if p_actual_yield <= 0 then
    raise exception 'actual_yield must be positive';
  end if;
  select branch_id, status into v_branch, v_status
    from public.production_batch where id = p_batch_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'batch not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager', 'baker'])) then
    raise exception 'not authorized to complete batch %', p_batch_id;
  end if;
  if v_status not in ('planned', 'in_progress') then
    raise exception 'batch % cannot be completed from status %', p_batch_id, v_status;
  end if;

  select p.inventory_item_id into v_item
    from public.production_batch b
    join public.recipe_version rv on rv.id = b.recipe_version_id
    join public.recipe rc on rc.id = rv.recipe_id
    join public.product p on p.id = rc.product_id
   where b.id = p_batch_id;
  if v_item is null then
    raise exception 'batch product has no stockable inventory_item; cannot produce a finished lot';
  end if;

  insert into public.inventory_lot
    (tenant_id, branch_id, item_id, batch_id, unit, expires_at, status, qty_on_hand)
    values (v_tenant, v_branch, v_item, p_batch_id, p_unit, p_expires_at, 'available', 0)
    returning id into v_lot;

  insert into public.inventory_movement
    (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
    values (v_tenant, v_branch, v_lot, v_item, p_actual_yield, 'produce', 'production_batch', p_batch_id, p_employee_id);

  update public.production_batch
     set actual_yield = p_actual_yield,
         status = 'completed',
         completed_at = now()
   where id = p_batch_id;

  return v_lot;
end;
$$;

-- ============================ yield reconciliation (view) ============================
create view public.production_batch_yield with (security_invoker = true) as
select
  b.id as batch_id,
  b.tenant_id,
  b.branch_id,
  b.planned_qty,
  b.actual_yield,
  (b.actual_yield - b.planned_qty) as yield_variance
from public.production_batch b;

comment on view public.production_batch_yield is
  'Planned vs actual yield per batch (B2 reconciliation). RLS via security_invoker.';

-- ============================ 0015_sales_orders.sql ============================
-- 0015_sales_orders.sql — Sales orders + order items (the traceability anchor).
--
-- NOTE: `order` is a SQL reserved word, so the header table is `sales_order` (identical
-- semantics to the ERD's `order`). order_item is THE traceability anchor: each line pins
-- employee + workstation + recipe_version + (for bakery) production_batch, giving the chain
--   order_item -> batch -> recipe_version -> production_batch.
-- Money is stored in integer minor units; order/line totals are intentional snapshots.
-- Inventory deduction at sale (I1), payment, and tax invoice are separate WPs. No data,
-- no secrets.

-- ============================ sales_order (header) ============================
create table public.sales_order (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  employee_id uuid references public.employee (id) on delete set null,
  channel     text not null check (channel in ('pos', 'qr')),
  status      text not null default 'open'
                check (status in ('open', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  subtotal    bigint not null default 0 check (subtotal >= 0),
  tax_total   bigint not null default 0 check (tax_total >= 0),
  total       bigint not null default 0 check (total >= 0),
  -- FK to tax_invoice added with the tax-invoice WP; unique prevents double-invoicing.
  invoice_id  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (id, tenant_id, branch_id),
  unique (invoice_id)
);

comment on table public.sales_order is
  'Sales order header (ERD `order`; renamed to avoid the SQL reserved word). Money in minor units.';

create index sales_order_branch_id_idx on public.sales_order (branch_id);
create index sales_order_employee_id_idx on public.sales_order (employee_id);

create trigger sales_order_set_updated_at
  before update on public.sales_order
  for each row execute function app.set_updated_at();

alter table public.sales_order enable row level security;

create policy sales_order_owner_all on public.sales_order
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy sales_order_ops_all on public.sales_order
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'staff']))
  with check (app.has_branch_role(branch_id, array['manager', 'staff']));

create policy sales_order_branch_select on public.sales_order
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ order_item (traceability anchor) ============================
create table public.order_item (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid not null,
  order_id          uuid not null,
  product_id        uuid not null,
  -- Traceability anchors:
  recipe_version_id uuid not null,                                   -- exact formula
  workstation_id    uuid not null,                                   -- where
  employee_id       uuid references public.employee (id) on delete set null, -- who made it
  batch_id          uuid,                                            -- bakery: which batch (null = made-to-order)
  qty               numeric not null check (qty > 0),
  unit_price        bigint not null check (unit_price >= 0),         -- snapshot, minor units
  line_tax          bigint not null default 0 check (line_tax >= 0), -- snapshot
  status            text not null default 'queued'
                      check (status in ('queued', 'making', 'ready', 'served')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.product (id, tenant_id) on delete restrict,
  foreign key (recipe_version_id, tenant_id)
    references public.recipe_version (id, tenant_id) on delete restrict,
  foreign key (workstation_id, branch_id)
    references public.workstation (id, branch_id) on delete restrict,
  foreign key (batch_id, tenant_id)
    references public.production_batch (id, tenant_id)
);

comment on table public.order_item is
  'The traceability anchor: pins employee + workstation + recipe_version + batch per sold line.';

create index order_item_order_id_idx on public.order_item (order_id);
create index order_item_batch_id_idx on public.order_item (batch_id);
create index order_item_recipe_version_idx on public.order_item (recipe_version_id);
create index order_item_workstation_idx on public.order_item (workstation_id);
create index order_item_branch_id_idx on public.order_item (branch_id);

create trigger order_item_set_updated_at
  before update on public.order_item
  for each row execute function app.set_updated_at();

alter table public.order_item enable row level security;

create policy order_item_owner_all on public.order_item
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager/Staff take orders; Staff/Baker fulfil items at stations (KDS).
create policy order_item_ops_all on public.order_item
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'staff', 'baker']))
  with check (app.has_branch_role(branch_id, array['manager', 'staff', 'baker']));

create policy order_item_branch_select on public.order_item
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ 0016_sale_deduction.sql ============================
-- 0016_sale_deduction.sql — Inventory deduction at sale (I1 atomic fix).
--
-- app.fulfil_order_item deducts stock for a sold line, atomically:
--   * bakery (product.type = 'batch')        -> deduct the finished-product lots, and stamp
--                                                the consumed batch onto order_item (trace)
--   * beverage (product.type = 'made_to_order') -> deduct each recipe ingredient
-- Deduction is FEFO (earliest expiry first; fall back to received_at when expiry is equal or
-- null), aligned with production consumption. It locks the lots it draws from (FOR UPDATE)
-- and rejects the sale if stock is insufficient. The lot qty_on_hand >= 0 CHECK is the final
-- backstop. 'sell' movements reference the order_item, preserving traceability. No new
-- tables, no data, no secrets.

-- Internal FEFO deduction helper. SECURITY DEFINER and revoked from public so only the
-- fulfil primitive (running in the definer context) may call it.
create or replace function app.deduct_fefo(
  p_tenant      uuid,
  p_branch      uuid,
  p_item_id     uuid,
  p_qty         numeric,
  p_reason      text,
  p_ref_type    text,
  p_ref_id      uuid,
  p_employee_id uuid
)
returns uuid -- batch_id of the first lot consumed (for traceability), or null
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining   numeric := p_qty;
  v_take        numeric;
  v_first_batch uuid;
  v_seen        boolean := false;
  r             record;
begin
  if p_qty <= 0 then
    raise exception 'deduct qty must be positive';
  end if;

  for r in
    select id, qty_on_hand, batch_id
      from public.inventory_lot
     where tenant_id = p_tenant and branch_id = p_branch and item_id = p_item_id
       and status = 'available' and qty_on_hand > 0
     order by expires_at nulls last, received_at, id -- FEFO (then received_at)
     for update
  loop
    exit when v_remaining <= 0;
    if not v_seen then
      v_first_batch := r.batch_id;
      v_seen := true;
    end if;
    v_take := least(v_remaining, r.qty_on_hand);
    insert into public.inventory_movement
      (tenant_id, branch_id, lot_id, item_id, qty_delta, reason, ref_type, ref_id, employee_id)
      values (p_tenant, p_branch, r.id, p_item_id, -v_take, p_reason, p_ref_type, p_ref_id, p_employee_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient stock for item % at branch %: short by %',
      p_item_id, p_branch, v_remaining;
  end if;

  return v_first_batch;
end;
$$;

revoke all on function app.deduct_fefo(uuid, uuid, uuid, numeric, text, text, uuid, uuid) from public;

-- Deduct inventory for a sold order line. SECURITY DEFINER with internal authorization.
create or replace function app.fulfil_order_item(
  p_order_item_id uuid,
  p_employee_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_oi     record;
  v_prod   record;
  v_batch  uuid;
  ing      record;
begin
  select branch_id, product_id, recipe_version_id, qty, batch_id
    into v_oi
    from public.order_item
   where id = p_order_item_id and tenant_id = v_tenant;
  if not found then
    raise exception 'order_item not found';
  end if;

  if not (app.is_tenant_owner() or app.has_branch_role(v_oi.branch_id, array['manager', 'staff', 'baker'])) then
    raise exception 'not authorized to fulfil order_item %', p_order_item_id;
  end if;

  select type, inventory_item_id into v_prod
    from public.product where id = v_oi.product_id;

  if v_prod.type = 'batch' then
    -- Bakery: deduct the finished-product lots.
    if v_prod.inventory_item_id is null then
      raise exception 'batch product has no stockable inventory_item; cannot deduct';
    end if;
    v_batch := app.deduct_fefo(
      v_tenant, v_oi.branch_id, v_prod.inventory_item_id, v_oi.qty,
      'sell', 'order_item', p_order_item_id, p_employee_id);
    -- Stamp the batch the sold item came from (traceability) when not already pinned.
    if v_oi.batch_id is null and v_batch is not null then
      update public.order_item set batch_id = v_batch where id = p_order_item_id;
    end if;
  else
    -- Made-to-order beverage: deduct each recipe ingredient (qty x line qty).
    for ing in
      select item_id, quantity
        from public.recipe_ingredient
       where recipe_version_id = v_oi.recipe_version_id and tenant_id = v_tenant
    loop
      perform app.deduct_fefo(
        v_tenant, v_oi.branch_id, ing.item_id, ing.quantity * v_oi.qty,
        'sell', 'order_item', p_order_item_id, p_employee_id);
    end loop;
  end if;
end;
$$;

-- ============================ 0017_payment.sql ============================
-- 0017_payment.sql — Payments.
--
-- A payment against a sales_order. Money in integer minor units. Idempotent via a
-- client-supplied client_uuid (unique per order) so a retry can't double-charge. Hosted /
-- tokenized gateway: only an opaque gateway_ref token is stored — NEVER card data. RLS-first
-- least-privilege. No data, no secrets.

create table public.payment (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  order_id    uuid not null,
  method      text not null check (method in ('cash', 'card', 'qr', 'other')),
  amount      bigint not null check (amount > 0), -- integer minor units (e.g. satang)
  status      text not null default 'pending'
                check (status in ('pending', 'authorized', 'captured', 'failed', 'refunded', 'voided')),
  -- Opaque token from the hosted gateway. No PAN / CVV / card data is ever stored.
  gateway_ref text,
  -- Client-supplied idempotency key; bound to the order to prevent double-charge on retry.
  client_uuid uuid not null,
  employee_id uuid references public.employee (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete cascade,
  unique (order_id, client_uuid)
);

comment on table public.payment is
  'A payment against a sales_order. Idempotent via (order_id, client_uuid). Tokenized gateway only — no card data.';
comment on column public.payment.gateway_ref is
  'Opaque hosted-gateway token. Never store PAN/CVV/card data (PCI scope-out).';

create index payment_order_id_idx on public.payment (order_id);
create index payment_branch_id_idx on public.payment (branch_id);
create index payment_tenant_id_idx on public.payment (tenant_id);

create trigger payment_set_updated_at
  before update on public.payment
  for each row execute function app.set_updated_at();

alter table public.payment enable row level security;

create policy payment_owner_all on public.payment
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Manager/Staff take payments at the branch.
create policy payment_ops_all on public.payment
  for all to authenticated
  using (app.has_branch_role(branch_id, array['manager', 'staff']))
  with check (app.has_branch_role(branch_id, array['manager', 'staff']));

create policy payment_branch_select on public.payment
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- ============================ 0018_tax_invoice.sql ============================
-- 0018_tax_invoice.sql — Tax invoices (Thailand VAT 7%).
--
-- Immutable tax_invoice issued from a COMPLETED sales_order, numbered sequentially PER
-- BRANCH via a locked counter. Numbering is sequential-with-documented-gaps (T1/T4): skipped
-- numbers are recorded in invoice_number_gap (we do NOT attempt strict gapless). One invoice
-- per completed sale. Traceability: tax_invoice -> sales_order -> order_item. RLS-first.
-- No data, no secrets.

-- ============================ invoice_counter (per branch + series) ============================
create table public.invoice_counter (
  tenant_id uuid not null,
  branch_id uuid not null,
  series    text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  next_no   bigint not null default 1 check (next_no >= 1),
  primary key (branch_id, series),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);

comment on table public.invoice_counter is
  'Per-branch, per-series invoice number counter. Advanced under a row lock by app.issue_tax_invoice.';

alter table public.invoice_counter enable row level security;

create policy invoice_counter_owner_all on public.invoice_counter
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy invoice_counter_manager_select on public.invoice_counter
  for select to authenticated
  using (app.has_branch_role(branch_id, array['manager']));

-- ============================ tax_invoice (immutable) ============================
create table public.tax_invoice (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  order_id         uuid not null,
  invoice_no       bigint not null,
  series           text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  sale_occurred_at timestamptz not null, -- the tax point (sale time, even if issued later)
  vat_rate         numeric not null default 0.07, -- Thailand VAT 7%
  subtotal         bigint not null check (subtotal >= 0), -- minor units
  vat_amount       bigint not null check (vat_amount >= 0),
  total            bigint not null check (total >= 0),
  issued_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete restrict,
  unique (branch_id, series, invoice_no)
);

comment on table public.tax_invoice is
  'Immutable tax invoice (Thailand VAT 7%). Sequential per branch; corrections issue credit notes.';

-- One invoice (series=invoice) per completed sale.
create unique index tax_invoice_one_invoice_per_order
  on public.tax_invoice (order_id) where series = 'invoice';

create index tax_invoice_order_id_idx on public.tax_invoice (order_id);
create index tax_invoice_branch_id_idx on public.tax_invoice (branch_id);

-- Immutable: append-only (reuse reject_mutation). No UPDATE/DELETE for any role.
create trigger tax_invoice_append_only
  before update or delete on public.tax_invoice
  for each row execute function app.reject_mutation();

alter table public.tax_invoice enable row level security;

create policy tax_invoice_owner_all on public.tax_invoice
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy tax_invoice_branch_select on public.tax_invoice
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff']));

-- ============================ invoice_number_gap (append-only) ============================
create table public.invoice_number_gap (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  series      text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  missing_no  bigint not null,
  reason      text not null check (reason in ('cancelled_before_issue', 'system_failure', 'rollback')),
  context     text,
  recorded_by uuid references public.app_user (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (branch_id, series, missing_no)
);

comment on table public.invoice_number_gap is
  'Documents every skipped invoice number (sequential-with-documented-gaps; not strict gapless).';

create index invoice_number_gap_branch_idx on public.invoice_number_gap (branch_id, series);

create trigger invoice_number_gap_append_only
  before update or delete on public.invoice_number_gap
  for each row execute function app.reject_mutation();

alter table public.invoice_number_gap enable row level security;

create policy invoice_number_gap_owner_all on public.invoice_number_gap
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy invoice_number_gap_branch_select on public.invoice_number_gap
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager']));

-- ============================ issuance primitive ============================
-- Issue ONE tax invoice for a completed order, taking the next per-branch number under a row
-- lock. SECURITY DEFINER with internal authorization (owner/manager/staff at the branch).
create or replace function app.issue_tax_invoice(
  p_order_id        uuid,
  p_sale_occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_ord     record;
  v_no      bigint;
  v_invoice uuid;
begin
  select branch_id, status, subtotal, tax_total, total, invoice_id, created_at
    into v_ord
    from public.sales_order where id = p_order_id and tenant_id = v_tenant;
  if not found then
    raise exception 'order not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_ord.branch_id, array['manager', 'staff'])) then
    raise exception 'not authorized to issue an invoice for order %', p_order_id;
  end if;
  if v_ord.status <> 'completed' then
    raise exception 'order % is not completed (cannot invoice)', p_order_id;
  end if;
  if v_ord.invoice_id is not null then
    raise exception 'order % already has an invoice', p_order_id;
  end if;

  insert into public.invoice_counter (tenant_id, branch_id, series, next_no)
    values (v_tenant, v_ord.branch_id, 'invoice', 1)
    on conflict (branch_id, series) do nothing;

  select next_no into v_no
    from public.invoice_counter
   where branch_id = v_ord.branch_id and series = 'invoice'
   for update;
  update public.invoice_counter
     set next_no = next_no + 1
   where branch_id = v_ord.branch_id and series = 'invoice';

  insert into public.tax_invoice
    (tenant_id, branch_id, order_id, invoice_no, series, sale_occurred_at,
     vat_rate, subtotal, vat_amount, total)
    values (v_tenant, v_ord.branch_id, p_order_id, v_no, 'invoice',
            coalesce(p_sale_occurred_at, v_ord.created_at),
            0.07, v_ord.subtotal, v_ord.tax_total, v_ord.total)
    returning id into v_invoice;

  update public.sales_order set invoice_id = v_invoice where id = p_order_id;

  return v_invoice;
end;
$$;

-- Record a skipped invoice number (cancelled-before-issue / system failure / rollback).
create or replace function app.record_invoice_gap(
  p_branch_id  uuid,
  p_series     text,
  p_missing_no bigint,
  p_reason     text,
  p_context    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_gap    uuid;
begin
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['manager'])) then
    raise exception 'not authorized to record an invoice gap at branch %', p_branch_id;
  end if;
  insert into public.invoice_number_gap
    (tenant_id, branch_id, series, missing_no, reason, context, recorded_by)
    values (v_tenant, p_branch_id, p_series, p_missing_no, p_reason, p_context, app.current_user_id())
    returning id into v_gap;
  return v_gap;
end;
$$;

-- ============================ wire sales_order.invoice_id -> tax_invoice ============================
alter table public.sales_order
  add constraint sales_order_invoice_fk
  foreign key (invoice_id) references public.tax_invoice (id) on delete set null;

-- ============================ 0019_quarantine.sql ============================
-- 0019_quarantine.sql — Lot quarantine + sale/consume block.
--
-- Quarantine an inventory_lot so it cannot be sold or consumed. Two layers of blocking:
--   * deduct_fefo / consume_for_batch already draw only from status='available' lots, so a
--     quarantined lot is excluded from FEFO automatically; and
--   * a BEFORE INSERT guard on inventory_movement rejects any 'sell'/'consume' against a
--     quarantined lot, regardless of code path.
-- Status changes are audited (the audit trigger is attached to inventory_lot here). RLS is
-- unchanged. No new tables, no data, no secrets.

-- Quarantine metadata on the lot (status='quarantined' already exists from 0012).
alter table public.inventory_lot
  add column quarantine_reason text,
  add column quarantined_at    timestamptz,
  add column quarantined_by    uuid references public.app_user (id) on delete set null;

-- Audit trail: record every inventory_lot mutation (incl. quarantine/release).
create trigger inventory_lot_audit
  after insert or update or delete on public.inventory_lot
  for each row execute function app.audit_trigger();

-- DB-level block: no selling/consuming a quarantined lot.
create or replace function app.guard_quarantined_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.reason in ('sell', 'consume') then
    select status into v_status from public.inventory_lot where id = new.lot_id;
    if v_status = 'quarantined' then
      raise exception 'lot % is quarantined and cannot be sold or consumed', new.lot_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger inventory_movement_quarantine_guard
  before insert on public.inventory_movement
  for each row execute function app.guard_quarantined_movement();

-- Quarantine a lot (Owner or branch Manager).
create or replace function app.quarantine_lot(p_lot_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
begin
  select branch_id, status into v_branch, v_status
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'lot not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to quarantine lot %', p_lot_id;
  end if;
  if v_status = 'depleted' then
    raise exception 'cannot quarantine a depleted lot';
  end if;
  update public.inventory_lot
     set status = 'quarantined',
         quarantine_reason = p_reason,
         quarantined_at = now(),
         quarantined_by = app.current_user_id()
   where id = p_lot_id;
end;
$$;

-- Release a quarantined lot back to available (or depleted if empty).
create or replace function app.release_lot(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_status text;
  v_qty    numeric;
begin
  select branch_id, status, qty_on_hand into v_branch, v_status, v_qty
    from public.inventory_lot where id = p_lot_id and tenant_id = v_tenant;
  if v_branch is null then
    raise exception 'lot not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to release lot %', p_lot_id;
  end if;
  if v_status <> 'quarantined' then
    raise exception 'lot % is not quarantined', p_lot_id;
  end if;
  update public.inventory_lot
     set status = case when v_qty > 0 then 'available' else 'depleted' end,
         quarantine_reason = null,
         quarantined_at = null,
         quarantined_by = null
   where id = p_lot_id;
end;
$$;

-- ============================ 0020_recall.sql ============================
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

-- ============================ role grants ============================
-- Supabase grants public-schema access to authenticated/anon/service_role by default;
-- these are explicit + cover the private `app` schema. RLS still governs ROW access.
grant usage on schema app to authenticated, service_role;
grant usage on schema public to authenticated, anon, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all privileges on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- keep the internal FEFO helper locked down even after the broad grant
revoke all on function app.deduct_fefo(uuid, uuid, uuid, numeric, text, text, uuid, uuid) from authenticated, anon;

-- ============================ custom_access_token_hook.sql ============================
-- supabase/auth/custom_access_token_hook.sql
--
-- Supabase "Custom Access Token Hook": stamps tenant_id, branch_roles, and session_version
-- into the JWT at token issuance, so the validated RLS helpers (app.current_tenant_id(),
-- app.has_branch_role(), app.is_tenant_owner(), session-version checks) work against REAL
-- Supabase Auth tokens.
--
-- IMPORTANT: this is NOT part of the validated/frozen migration set (0000-0020). It is auth
-- integration, applied separately, and reads the existing identity tables read-only.
--
-- After applying, register it in the dashboard: Authentication -> Hooks ->
-- "Custom Access Token" -> public.custom_access_token_hook.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_tenant uuid;
  v_sv     integer;
  v_roles  jsonb;
begin
  select tenant_id, session_version
    into v_tenant, v_sv
    from public.app_user
   where id = v_user;

  if v_tenant is not null then
    -- tenant_id and branch_id are emitted as text/uuid strings to match the RLS helpers,
    -- which cast (claims ->> '...')::uuid.
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text));
    v_claims := jsonb_set(v_claims, '{session_version}', to_jsonb(v_sv));

    select coalesce(
             jsonb_agg(jsonb_build_object('branch_id', ubr.branch_id, 'role', r.key)),
             '[]'::jsonb
           )
      into v_roles
      from public.user_branch_role ubr
      join public.role r on r.id = ubr.role_id
     where ubr.user_id = v_user;

    v_claims := jsonb_set(v_claims, '{branch_roles}', v_roles);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Only the Supabase auth admin may execute the hook; nobody else.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook is SECURITY DEFINER (runs as owner), so it reads the identity tables past RLS.
-- No additional table grants to supabase_auth_admin are required.
