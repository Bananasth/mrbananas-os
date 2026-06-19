import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline schema test: asserts the tenancy migration's DDL by static inspection (no
// database connection). Guards the RLS-first invariant — if RLS or a deny-all policy is
// ever removed from these tables, this test fails.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0001_core_tenancy.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0001_core_tenancy schema', () => {
  it('creates the tenant and branch tables', () => {
    expect(norm).toContain('create table public.tenant')
    expect(norm).toContain('create table public.branch')
  })

  it('branch references tenant with on delete restrict', () => {
    expect(norm).toMatch(
      /tenant_id uuid not null references public\.tenant \(id\) on delete restrict/,
    )
  })

  it('models the approved branch columns', () => {
    for (const col of ['name', 'address', 'tax_profile_id', 'timezone']) {
      expect(norm).toContain(col)
    }
  })

  it('enables RLS on both tables', () => {
    expect(count(/enable row level security/g)).toBe(2)
  })

  it('declares explicit deny-by-default policies on both tables', () => {
    expect(count(/for all to public using \(false\) with check \(false\)/g)).toBe(2)
  })

  it('attaches the updated_at trigger to both tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(2)
  })

  it('indexes branch by tenant_id', () => {
    expect(norm).toContain('branch_tenant_id_idx')
  })
})
