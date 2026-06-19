import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the tax invoice migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0018_tax_invoice.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0018 tax invoice — structure & VAT', () => {
  it('creates invoice_counter, tax_invoice, invoice_number_gap', () => {
    for (const t of ['invoice_counter', 'tax_invoice', 'invoice_number_gap']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('applies Thailand VAT 7% and a sale-time tax point in minor units', () => {
    expect(norm).toContain('vat_rate numeric not null default 0.07')
    expect(norm).toContain('sale_occurred_at timestamptz not null')
    expect(norm).toContain('vat_amount bigint not null check (vat_amount >= 0)')
  })
})

describe('0018 tax invoice — immutability', () => {
  it('makes tax_invoice and invoice_number_gap append-only', () => {
    expect(norm).toContain('before update or delete on public.tax_invoice')
    expect(norm).toContain('before update or delete on public.invoice_number_gap')
    expect(count(/execute function app\.reject_mutation\(\)/g)).toBe(2)
  })
})

describe('0018 tax invoice — sequential per branch + documented gaps', () => {
  it('numbers sequentially per branch via a locked counter', () => {
    expect(norm).toContain('unique (branch_id, series, invoice_no)')
    expect(norm).toMatch(/select next_no into v_no[\s\S]*?for update/)
    expect(norm).toContain('set next_no = next_no + 1')
  })

  it('records gaps (not strict gapless) with a reason', () => {
    expect(norm).toContain(
      "check (reason in ('cancelled_before_issue', 'system_failure', 'rollback'))",
    )
    expect(norm).toContain('create or replace function app.record_invoice_gap(')
  })
})

describe('0018 tax invoice — one per completed sale', () => {
  it('enforces one invoice per order and only for completed orders', () => {
    expect(norm).toContain(
      "create unique index tax_invoice_one_invoice_per_order on public.tax_invoice (order_id) where series = 'invoice'",
    )
    expect(norm).toContain("if v_ord.status <> 'completed'")
    expect(norm).toContain('already has an invoice')
  })

  it('issue_tax_invoice is a guarded SECURITY DEFINER primitive', () => {
    expect(norm).toContain('create or replace function app.issue_tax_invoice(')
    expect(norm).toMatch(/issue_tax_invoice\([\s\S]*?security definer/)
  })
})

describe('0018 tax invoice — traceability', () => {
  it('chains tax_invoice -> sales_order (and back via invoice_id)', () => {
    expect(norm).toMatch(
      /foreign key \(order_id, tenant_id, branch_id\) references public\.sales_order/,
    )
    expect(norm).toContain(
      'add constraint sales_order_invoice_fk foreign key (invoice_id) references public.tax_invoice (id)',
    )
  })
})

describe('0018 tax invoice — RLS', () => {
  it('enables RLS on all three tables with no deny-all bootstraps', () => {
    expect(count(/enable row level security/g)).toBe(3)
    expect(norm).toContain('tax_invoice_owner_all on public.tax_invoice')
    expect(norm).toContain('invoice_counter_owner_all on public.invoice_counter')
    expect(norm).toContain('invoice_number_gap_owner_all on public.invoice_number_gap')
    expect(norm).not.toContain('using (false)')
  })
})
