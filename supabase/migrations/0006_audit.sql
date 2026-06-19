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
