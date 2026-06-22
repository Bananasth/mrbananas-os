-- =============================================================================
-- qr-b3-2-prep-event.sql — QR Ordering B3.2: prep_event. PROPOSAL; review, then run.
-- Append-only production lifecycle log per order_item attempt. Mirrors batch_event
-- (event_type + payload jsonb + app.reject_mutation), but a CHECK hard-encodes the
-- LOCKED 6-event scope: recipe_viewed/method_viewed (-> recipe_access) and
-- photo_uploaded (-> completion_photo) are deliberately NOT stored here. 'claimed'
-- and 'completed' live on prep_item, not here. Additive; no existing data changed.
-- Writes happen via SECURITY DEFINER RPCs (B5); authenticated gets SELECT only.
-- =============================================================================
begin;

create table if not exists public.prep_event (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid not null,
  order_id          uuid not null,
  order_item_id     uuid not null references public.prep_item (order_item_id) on delete cascade,
  attempt_no        integer not null default 1 check (attempt_no >= 1),
  event_type        text not null
                      check (event_type in ('preparing_started','qc_started','qc_failed',
                                            'qc_passed','rework_started','claim_released')),
  actor_employee_id uuid references public.employee (id) on delete set null, -- null = system (timeout)
  payload           jsonb,   -- device {ip_address,device_id,user_agent,device_name} + reason/result
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.prep_event is
  'Append-only QR production lifecycle log (locked 6 events). Device/context in payload jsonb.';

create index prep_event_item_idx  on public.prep_event (order_item_id, occurred_at);
create index prep_event_order_idx on public.prep_event (order_id);

-- Append-only: reuse the 0006 guard. INSERT (via definer RPC) is allowed; UPDATE/DELETE raise.
create trigger prep_event_append_only
  before update or delete on public.prep_event
  for each row execute function app.reject_mutation();

alter table public.prep_event enable row level security;

create policy prep_event_owner_all on public.prep_event
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy prep_event_branch_select on public.prep_event
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Hardened grants: definer-write only; anon locked out of direct table access.
revoke all on public.prep_event from anon, authenticated;
grant select on public.prep_event to authenticated;

notify pgrst, 'reload schema';
commit;
