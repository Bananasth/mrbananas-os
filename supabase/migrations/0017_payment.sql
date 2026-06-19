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
