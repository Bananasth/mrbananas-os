import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the branch_product (F2) migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0009_branch_product.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0009 branch_product', () => {
  it('creates branch_product', () => {
    expect(norm).toContain('create table public.branch_product ')
  })

  it('adds composite unique targets on branch and product', () => {
    expect(norm).toContain('add constraint branch_id_tenant_key unique (id, tenant_id)')
    expect(norm).toContain('add constraint product_id_tenant_key unique (id, tenant_id)')
  })

  it('forces branch and product to share one tenant via composite FKs', () => {
    expect(norm).toMatch(
      /foreign key \(branch_id, tenant_id\) references public\.branch \(id, tenant_id\) on delete cascade/,
    )
    expect(norm).toMatch(
      /foreign key \(product_id, tenant_id\) references public\.product \(id, tenant_id\) on delete cascade/,
    )
  })

  it('stores price in integer minor units (nullable, non-negative)', () => {
    expect(norm).toContain(
      'price_override bigint check (price_override is null or price_override >= 0)',
    )
  })

  it('models availability and one override per product per branch', () => {
    expect(norm).toContain('is_available boolean not null default true')
    expect(norm).toContain('unique (branch_id, product_id)')
  })

  it('enables RLS with Owner-full / Manager-branch / member-read policies', () => {
    expect(count(/enable row level security/g)).toBe(1)
    expect(norm).toContain('branch_product_owner_all on public.branch_product')
    expect(norm).toContain('branch_product_manager_all on public.branch_product')
    expect(norm).toContain('branch_product_branch_select on public.branch_product')
    expect(norm).not.toContain('using (false)')
  })

  it('attaches the updated_at trigger', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(1)
  })
})
