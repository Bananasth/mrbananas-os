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
