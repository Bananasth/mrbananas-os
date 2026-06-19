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
