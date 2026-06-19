import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the sales orders migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0015_sales_orders.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0015 sales orders — structure', () => {
  it('creates sales_order and order_item', () => {
    expect(norm).toContain('create table public.sales_order ')
    expect(norm).toContain('create table public.order_item ')
  })

  it('stores money in integer minor units with snapshot totals', () => {
    expect(norm).toContain('subtotal bigint not null default 0 check (subtotal >= 0)')
    expect(norm).toContain('total bigint not null default 0 check (total >= 0)')
    expect(norm).toContain('unit_price bigint not null check (unit_price >= 0)')
  })

  it('prevents double-invoicing via a unique invoice_id', () => {
    expect(norm).toContain('unique (invoice_id)')
  })

  it('constrains channel and item status', () => {
    expect(norm).toContain("channel text not null check (channel in ('pos', 'qr'))")
    expect(norm).toContain("check (status in ('queued', 'making', 'ready', 'served'))")
  })
})

describe('0015 order_item — traceability anchor', () => {
  it('pins recipe_version, workstation, employee, and batch', () => {
    expect(norm).toContain('recipe_version_id uuid not null')
    expect(norm).toContain('workstation_id    uuid not null'.replace(/\s+/g, ' '))
    expect(norm).toContain('employee_id       uuid references public.employee'.replace(/\s+/g, ' '))
    expect(norm).toContain('batch_id          uuid'.replace(/\s+/g, ' '))
  })

  it('chains order_item -> batch -> production_batch and -> recipe_version', () => {
    expect(norm).toMatch(/foreign key \(batch_id, tenant_id\) references public\.production_batch/)
    expect(norm).toMatch(
      /foreign key \(recipe_version_id, tenant_id\) references public\.recipe_version/,
    )
  })

  it('binds the line to a branch-local order and workstation', () => {
    expect(norm).toMatch(
      /foreign key \(order_id, tenant_id, branch_id\) references public\.sales_order \(id, tenant_id, branch_id\)/,
    )
    expect(norm).toMatch(/foreign key \(workstation_id, branch_id\) references public\.workstation/)
  })
})

describe('0015 sales orders — RLS', () => {
  it('enables RLS with least-privilege policies on both tables', () => {
    expect(count(/enable row level security/g)).toBe(2)
    expect(count(/_owner_all on public\./g)).toBe(2)
    expect(count(/_ops_all on public\./g)).toBe(2)
    expect(count(/_branch_select on public\./g)).toBe(2)
    expect(norm).not.toContain('using (false)')
  })

  it('attaches the updated_at trigger to both tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(2)
  })
})
