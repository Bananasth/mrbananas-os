-- 0018_tax_invoice.sql — Tax invoices (Thailand VAT 7%).
--
-- Immutable tax_invoice issued from a COMPLETED sales_order, numbered sequentially PER
-- BRANCH via a locked counter. Numbering is sequential-with-documented-gaps (T1/T4): skipped
-- numbers are recorded in invoice_number_gap (we do NOT attempt strict gapless). One invoice
-- per completed sale. Traceability: tax_invoice -> sales_order -> order_item. RLS-first.
-- No data, no secrets.

-- ============================ invoice_counter (per branch + series) ============================
create table public.invoice_counter (
  tenant_id uuid not null,
  branch_id uuid not null,
  series    text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  next_no   bigint not null default 1 check (next_no >= 1),
  primary key (branch_id, series),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade
);

comment on table public.invoice_counter is
  'Per-branch, per-series invoice number counter. Advanced under a row lock by app.issue_tax_invoice.';

alter table public.invoice_counter enable row level security;

create policy invoice_counter_owner_all on public.invoice_counter
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy invoice_counter_manager_select on public.invoice_counter
  for select to authenticated
  using (app.has_branch_role(branch_id, array['manager']));

-- ============================ tax_invoice (immutable) ============================
create table public.tax_invoice (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  order_id         uuid not null,
  invoice_no       bigint not null,
  series           text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  sale_occurred_at timestamptz not null, -- the tax point (sale time, even if issued later)
  vat_rate         numeric not null default 0.07, -- Thailand VAT 7%
  subtotal         bigint not null check (subtotal >= 0), -- minor units
  vat_amount       bigint not null check (vat_amount >= 0),
  total            bigint not null check (total >= 0),
  issued_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  foreign key (order_id, tenant_id, branch_id)
    references public.sales_order (id, tenant_id, branch_id) on delete restrict,
  unique (branch_id, series, invoice_no)
);

comment on table public.tax_invoice is
  'Immutable tax invoice (Thailand VAT 7%). Sequential per branch; corrections issue credit notes.';

-- One invoice (series=invoice) per completed sale.
create unique index tax_invoice_one_invoice_per_order
  on public.tax_invoice (order_id) where series = 'invoice';

create index tax_invoice_order_id_idx on public.tax_invoice (order_id);
create index tax_invoice_branch_id_idx on public.tax_invoice (branch_id);

-- Immutable: append-only (reuse reject_mutation). No UPDATE/DELETE for any role.
create trigger tax_invoice_append_only
  before update or delete on public.tax_invoice
  for each row execute function app.reject_mutation();

alter table public.tax_invoice enable row level security;

create policy tax_invoice_owner_all on public.tax_invoice
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy tax_invoice_branch_select on public.tax_invoice
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager', 'staff']));

-- ============================ invoice_number_gap (append-only) ============================
create table public.invoice_number_gap (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  series      text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  missing_no  bigint not null,
  reason      text not null check (reason in ('cancelled_before_issue', 'system_failure', 'rollback')),
  context     text,
  recorded_by uuid references public.app_user (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branch (id, tenant_id) on delete cascade,
  unique (branch_id, series, missing_no)
);

comment on table public.invoice_number_gap is
  'Documents every skipped invoice number (sequential-with-documented-gaps; not strict gapless).';

create index invoice_number_gap_branch_idx on public.invoice_number_gap (branch_id, series);

create trigger invoice_number_gap_append_only
  before update or delete on public.invoice_number_gap
  for each row execute function app.reject_mutation();

alter table public.invoice_number_gap enable row level security;

create policy invoice_number_gap_owner_all on public.invoice_number_gap
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());

create policy invoice_number_gap_branch_select on public.invoice_number_gap
  for select to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager']));

-- ============================ issuance primitive ============================
-- Issue ONE tax invoice for a completed order, taking the next per-branch number under a row
-- lock. SECURITY DEFINER with internal authorization (owner/manager/staff at the branch).
create or replace function app.issue_tax_invoice(
  p_order_id        uuid,
  p_sale_occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_ord     record;
  v_no      bigint;
  v_invoice uuid;
begin
  select branch_id, status, subtotal, tax_total, total, invoice_id, created_at
    into v_ord
    from public.sales_order where id = p_order_id and tenant_id = v_tenant;
  if not found then
    raise exception 'order not found';
  end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_ord.branch_id, array['manager', 'staff'])) then
    raise exception 'not authorized to issue an invoice for order %', p_order_id;
  end if;
  if v_ord.status <> 'completed' then
    raise exception 'order % is not completed (cannot invoice)', p_order_id;
  end if;
  if v_ord.invoice_id is not null then
    raise exception 'order % already has an invoice', p_order_id;
  end if;

  insert into public.invoice_counter (tenant_id, branch_id, series, next_no)
    values (v_tenant, v_ord.branch_id, 'invoice', 1)
    on conflict (branch_id, series) do nothing;

  select next_no into v_no
    from public.invoice_counter
   where branch_id = v_ord.branch_id and series = 'invoice'
   for update;
  update public.invoice_counter
     set next_no = next_no + 1
   where branch_id = v_ord.branch_id and series = 'invoice';

  insert into public.tax_invoice
    (tenant_id, branch_id, order_id, invoice_no, series, sale_occurred_at,
     vat_rate, subtotal, vat_amount, total)
    values (v_tenant, v_ord.branch_id, p_order_id, v_no, 'invoice',
            coalesce(p_sale_occurred_at, v_ord.created_at),
            0.07, v_ord.subtotal, v_ord.tax_total, v_ord.total)
    returning id into v_invoice;

  update public.sales_order set invoice_id = v_invoice where id = p_order_id;

  return v_invoice;
end;
$$;

-- Record a skipped invoice number (cancelled-before-issue / system failure / rollback).
create or replace function app.record_invoice_gap(
  p_branch_id  uuid,
  p_series     text,
  p_missing_no bigint,
  p_reason     text,
  p_context    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_gap    uuid;
begin
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['manager'])) then
    raise exception 'not authorized to record an invoice gap at branch %', p_branch_id;
  end if;
  insert into public.invoice_number_gap
    (tenant_id, branch_id, series, missing_no, reason, context, recorded_by)
    values (v_tenant, p_branch_id, p_series, p_missing_no, p_reason, p_context, app.current_user_id())
    returning id into v_gap;
  return v_gap;
end;
$$;

-- ============================ wire sales_order.invoice_id -> tax_invoice ============================
alter table public.sales_order
  add constraint sales_order_invoice_fk
  foreign key (invoice_id) references public.tax_invoice (id) on delete set null;
