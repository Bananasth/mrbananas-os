-- =============================================================================
-- qr-b3-3-recipe-access.sql — QR Ordering B3.3: recipe_access. PROPOSAL; review, then run.
-- One-time recipe/method view control + leak-monitoring trail, single table.
--   * separate 'recipe' vs 'method' rows (independent one-time latches + durations)
--   * partial unique (order_item_id, kind) WHERE outcome='granted' => one grant EVER
--   * denied re-attempts accumulate (outcome='denied_*') as the leak audit trail
-- Granted rows get a single close update (closed_at + duration_seconds); not append-only.
-- Additive; no existing data changed. Writes via SECURITY DEFINER RPCs (B5); SELECT only.
-- =============================================================================
begin;

create table if not exists public.recipe_access (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  order_id         uuid not null,
  order_item_id    uuid not null references public.prep_item (order_item_id) on delete cascade,
  employee_id      uuid references public.employee (id) on delete set null,
  kind             text not null check (kind in ('recipe', 'method')),
  outcome          text not null
                     check (outcome in ('granted', 'denied_already_used', 'denied_not_owner')),
  ip_address       inet,
  device_id        text,
  user_agent       text,
  device_name      text,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,                         -- granted rows only
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at       timestamptz not null default now()
);

comment on table public.recipe_access is
  'One-time recipe/method view + leak trail. One granted open per (item,kind); denied attempts logged.';

-- One successful open per item per kind, EVER (even after close). Denied rows are unconstrained.
create unique index recipe_access_one_grant_uniq
  on public.recipe_access (order_item_id, kind) where outcome = 'granted';

create index recipe_access_item_kind_idx on public.recipe_access (order_item_id, kind);
-- leak monitoring: an employee's access activity over time
create index recipe_access_employee_idx  on public.recipe_access (employee_id, opened_at);

alter table public.recipe_access enable row level security;

create policy recipe_access_owner_all on public.recipe_access
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy recipe_access_branch_select on public.recipe_access
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Hardened grants: definer-write only; anon locked out of direct table access.
revoke all on public.recipe_access from anon, authenticated;
grant select on public.recipe_access to authenticated;

notify pgrst, 'reload schema';
commit;
