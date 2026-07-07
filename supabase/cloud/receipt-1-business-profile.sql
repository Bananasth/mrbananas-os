-- =============================================================================
-- receipt-1-business-profile.sql — Phase E-2: seller identity for receipts. REVIEW ONLY.
-- Additive. Two new tables + RLS. No changes to tenant/branch/POS/inventory. DB stores
-- URLs/text/jsonb only — never binary; logos are uploaded to Storage later from the admin UI.
-- Storage bucket 'brand' is created MANUALLY in Supabase Storage (not here).
-- RLS uses the project's existing helper pattern (app.current_tenant_id / is_tenant_owner /
-- has_any_role / has_branch_role — all present, per the applied prod-*/expiry-* migrations).
--   business_profile — one row per TENANT (company/seller identity, brand, receipt content).
--   branch_profile   — one row per BRANCH (branch code + operating address/phone).
-- =============================================================================
begin;

-- ---- company / seller identity (per tenant) ----
create table if not exists public.business_profile (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant (id) on delete cascade,
  -- identity / tax
  legal_name            text not null,
  tax_id                text check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  is_vat_registered     boolean not null default true,
  vat_rate              numeric not null default 0.07 check (vat_rate >= 0),
  registered_address    text,
  phone                 text,
  email                 text,
  -- contact / social (single jsonb, e.g. {"website":"…","facebook":"…","line_id":"…","instagram":"…","tiktok":"…"})
  social_links          jsonb not null default '{}'::jsonb,
  -- formatting
  currency_code         text not null default 'THB',
  locale                text not null default 'th-TH',
  -- logos (Supabase Storage URLs; never binary) + render mode
  logo_color_url        text,
  logo_mono_url         text,
  receipt_logo_mode     text not null default 'auto' check (receipt_logo_mode in ('auto','color','mono')),
  -- theme (hex)
  color_primary         text check (color_primary    is null or color_primary    ~ '^#[0-9a-fA-F]{6}$'),
  color_secondary       text check (color_secondary  is null or color_secondary  ~ '^#[0-9a-fA-F]{6}$'),
  color_accent          text check (color_accent     is null or color_accent     ~ '^#[0-9a-fA-F]{6}$'),
  color_text            text check (color_text       is null or color_text       ~ '^#[0-9a-fA-F]{6}$'),
  color_background      text check (color_background is null or color_background ~ '^#[0-9a-fA-F]{6}$'),
  -- receipt content
  receipt_header_note   text,
  receipt_footer_note   text,
  receipt_return_policy text,
  receipt_qr_url        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id)
);
comment on table public.business_profile is
  'Per-tenant seller identity for receipts / ABB / full tax invoice / online receipt / PDF. URLs/jsonb only, no binary.';

-- ---- per-branch receipt identity ----
create table if not exists public.branch_profile (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  branch_id      uuid not null,
  branch_code    text not null default '00000' check (branch_code ~ '^[0-9]{5}$'),  -- 00000 = HQ
  is_head_office boolean not null default false,
  display_name   text,
  address        text,
  phone          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (branch_id)
);
comment on table public.branch_profile is
  'Per-branch receipt identity: branch_code (00000 HQ) + operating address/phone. Falls back to business_profile when absent.';

-- ---- RLS: owner writes; owner/manager/staff/baker read (cashiers print receipts) ----
alter table public.business_profile enable row level security;
alter table public.branch_profile   enable row level security;

create policy business_profile_owner_all on public.business_profile for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy business_profile_read on public.business_profile for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_any_role(array['owner','manager','staff','baker']));

create policy branch_profile_owner_all on public.branch_profile for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy branch_profile_read on public.branch_profile for select to authenticated
  using (app.has_branch_role(branch_id, array['owner','manager','staff','baker']));

create trigger business_profile_set_updated_at before update on public.business_profile
  for each row execute function app.set_updated_at();
create trigger branch_profile_set_updated_at   before update on public.branch_profile
  for each row execute function app.set_updated_at();

-- Explicit grants (RLS is the gate); keep off the anon API.
grant select, insert, update, delete on public.business_profile, public.branch_profile to authenticated;
revoke all on public.business_profile, public.branch_profile from anon;

commit;
