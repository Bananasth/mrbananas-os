-- =============================================================================
-- qr-b4-2-complaint.sql — QR Ordering B4.2: complaint. PROPOSAL; review, then run.
-- Customer complaint with full responsibility linkage + full lifecycle. Links to
-- order_item, attempt_no, snapshot recipe_version_id, assigned_barista, completion_photo,
-- and snapshot preparation_duration_seconds. No complaint_event table — app.audit_trigger()
-- records every status transition into audit_log. Visibility: owner + manager only.
-- On-delete is RESTRICT/SET NULL (never cascade): a complaint is a retained audit record.
-- Additive; no existing data changed. Writes via SECURITY DEFINER RPCs (B5); SELECT only.
-- =============================================================================
begin;

create table if not exists public.complaint (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null,
  branch_id                    uuid not null,
  order_id                     uuid not null,
  -- responsibility linkage (RESTRICT: cannot delete a complained-about item)
  order_item_id                uuid not null references public.order_item (id) on delete restrict,
  attempt_no                   integer check (attempt_no is null or attempt_no >= 1),  -- which attempt (v4-3)
  recipe_version_id            uuid references public.recipe_version (id) on delete restrict, -- snapshot
  assigned_barista             uuid references public.employee (id) on delete set null,       -- responsible
  completion_photo_id          uuid references public.completion_photo (id) on delete set null,
  preparation_duration_seconds integer check (preparation_duration_seconds is null or preparation_duration_seconds >= 0),
  -- categorization + severity
  category                     text not null
                                 check (category in ('taste','temperature','wrong_item','missing_modifier',
                                                     'hygiene','packaging','slow_service','other')),
  severity                     text not null default 'medium' check (severity in ('low','medium','high')),
  description                  text,
  -- lifecycle
  status                       text not null default 'new'
                                 check (status in ('new','triaged','investigating','action_taken',
                                                   'resolved','closed','rejected')),
  assigned_to                  uuid references public.app_user (id) on delete set null,  -- manager handling
  resolution_type              text check (resolution_type in ('refund','remake','replacement','apology','none')),
  resolution_note              text,
  customer_contacted_at        timestamptz,
  refund_payment_id            uuid references public.payment (id) on delete set null,
  remake_order_item_id         uuid references public.order_item (id) on delete set null,
  created_by                   uuid references public.app_user (id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  closed_at                    timestamptz
);

comment on table public.complaint is
  'Customer complaint with responsibility linkage (item/attempt/recipe_version/barista/photo/duration) + lifecycle. History via audit_log.';

create index complaint_branch_status_idx   on public.complaint (branch_id, status);
create index complaint_order_item_idx      on public.complaint (order_item_id);
create index complaint_barista_idx         on public.complaint (assigned_barista);
create index complaint_recipe_version_idx  on public.complaint (recipe_version_id);

create trigger complaint_set_updated_at
  before update on public.complaint
  for each row execute function app.set_updated_at();

-- Status history without a bespoke event table: reuse the generic audit trigger (0006).
create trigger complaint_audit
  after insert or update or delete on public.complaint
  for each row execute function app.audit_trigger();

alter table public.complaint enable row level security;

create policy complaint_owner_all on public.complaint
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

-- Managers handle complaints; staff/baker get NO read access (responsible-barista is sensitive).
create policy complaint_mgr_select on public.complaint
  for select to authenticated
  using (app.has_branch_role(branch_id, array['manager']));

-- Hardened grants: definer-write only; anon locked out of direct table access.
revoke all on public.complaint from anon, authenticated;
grant select on public.complaint to authenticated;

notify pgrst, 'reload schema';
commit;
