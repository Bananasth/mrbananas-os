-- =============================================================================
-- qr-b3-4-completion-photo.sql — QR Ordering B3.4: completion_photo. PROPOSAL; review, then run.
-- Mandatory per-attempt completion photo. unique (order_item_id, attempt_no) => one photo per
-- attempt; rework (attempt_no+1) forces a NEW photo (no reuse). B5 complete_item raises unless
-- a photo exists for the item's CURRENT attempt_no. photo_url is a Supabase Storage path
-- (bucket 'completion-photos', created in the app phase). Additive; no existing data changed.
-- Writes via SECURITY DEFINER RPCs (B5); SELECT only. Retake = update of photo_url; no delete.
-- =============================================================================
begin;

create table if not exists public.completion_photo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  branch_id     uuid not null,
  order_id      uuid not null,
  order_item_id uuid not null references public.prep_item (order_item_id) on delete cascade,
  attempt_no    integer not null check (attempt_no >= 1),
  employee_id   uuid references public.employee (id) on delete set null,
  photo_url     text not null,                 -- Supabase Storage object path
  ip_address    inet,
  device_id     text,
  user_agent    text,
  device_name   text,
  created_at    timestamptz not null default now(),
  -- one photo per attempt; the completion gate + "no reuse across rework"
  unique (order_item_id, attempt_no)
);

comment on table public.completion_photo is
  'Mandatory per-attempt completion photo. One per (order_item, attempt_no); gates item completion.';

-- (order_item_id, attempt_no) unique index also serves order_item_id lookups (timeline/board).

alter table public.completion_photo enable row level security;

create policy completion_photo_owner_all on public.completion_photo
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy completion_photo_branch_select on public.completion_photo
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff', 'baker']));

-- Hardened grants: definer-write only; anon locked out of direct table access.
revoke all on public.completion_photo from anon, authenticated;
grant select on public.completion_photo to authenticated;

notify pgrst, 'reload schema';
commit;
