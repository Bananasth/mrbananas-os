-- =============================================================================
-- qr-pay-1-foundation.sql — Channel-agnostic payment foundation (Migration 1). APPLIED.
-- Additive: payment columns (channel + intent + settlement breakdown), payment_provider_config
-- (deny-all secrets), payment_event (idempotent webhook log). No existing data modified.
-- =============================================================================
begin;

alter table public.payment
  add column if not exists sales_channel text
    check (sales_channel is null or sales_channel in
      ('pos','qr','website','grabfood','shopeefood','lineman','tiktokshop','lazada')),
  add column if not exists external_order_id   text,
  add column if not exists qr_payload          text,
  add column if not exists provider_intent_ref text,
  add column if not exists intent_expires_at   timestamptz,
  add column if not exists platform_fee        bigint not null default 0 check (platform_fee >= 0),
  add column if not exists payment_fee         bigint not null default 0 check (payment_fee >= 0),
  add column if not exists tax_amount          bigint check (tax_amount is null or tax_amount >= 0),
  add column if not exists net_amount          bigint check (net_amount is null or net_amount >= 0),
  add column if not exists refunded_amount     bigint not null default 0 check (refunded_amount >= 0),
  add column if not exists settled_at          timestamptz,
  add column if not exists settlement_ref      text;

comment on column public.payment.sales_channel is
  'Origin channel for cross-channel settlement (pos/qr/website/grabfood/shopeefood/lineman/tiktokshop/lazada).';
comment on column public.payment.net_amount is
  'Net settlement = amount - platform_fee - payment_fee (set at settlement).';

create index if not exists payment_sales_channel_idx on public.payment (sales_channel, status);
create index if not exists payment_external_order_idx on public.payment (external_order_id) where external_order_id is not null;
create index if not exists payment_settled_at_idx on public.payment (settled_at) where settled_at is not null;

create table if not exists public.payment_provider_config (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  branch_id         uuid not null,
  provider          text not null check (provider in ('mock','promptpay','omise','2c2p','stripe','bank')),
  promptpay_target  text,
  webhook_secret    text,
  settlement_secret text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (branch_id, provider)
);
comment on table public.payment_provider_config is
  'Per-branch payment provider secrets. Deny-all RLS: readable/writable ONLY via SECURITY DEFINER functions.';

create trigger payment_provider_config_set_updated_at
  before update on public.payment_provider_config
  for each row execute function app.set_updated_at();

alter table public.payment_provider_config enable row level security;
create policy payment_provider_config_deny_all on public.payment_provider_config
  for all to public using (false) with check (false);
revoke all on public.payment_provider_config from anon, authenticated;

create table if not exists public.payment_event (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  branch_id     uuid,
  payment_id    uuid references public.payment (id) on delete set null,
  order_id      uuid,
  provider      text not null,
  sales_channel text check (sales_channel is null or sales_channel in
                  ('pos','qr','website','grabfood','shopeefood','lineman','tiktokshop','lazada')),
  event_id      text not null,
  event_type    text not null,
  amount        bigint,
  raw           jsonb,
  signature_ok  boolean not null default false,
  processed     boolean not null default false,
  processed_at  timestamptz,
  received_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (provider, event_id)
);
comment on table public.payment_event is
  'Append-style webhook/callback log. UNIQUE(provider,event_id) makes settlement idempotent across retries.';

create index if not exists payment_event_payment_idx on public.payment_event (payment_id);
create index if not exists payment_event_unprocessed_idx on public.payment_event (received_at) where processed = false;
create index if not exists payment_event_channel_idx on public.payment_event (sales_channel);

alter table public.payment_event enable row level security;
create policy payment_event_owner_all on public.payment_event
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy payment_event_mgr_select on public.payment_event
  for select to authenticated
  using (branch_id is not null and app.has_branch_role(branch_id, array['manager']));

revoke all on public.payment_event from anon, authenticated;
grant select on public.payment_event to authenticated;

notify pgrst, 'reload schema';
commit;
