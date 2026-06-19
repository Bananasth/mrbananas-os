import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static schema test for the workstation + employee migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0003_workstation_employee.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0003_workstation_employee schema', () => {
  it('creates workstation and employee', () => {
    expect(norm).toContain('create table public.workstation')
    expect(norm).toContain('create table public.employee')
  })

  it('workstation belongs to a branch and constrains type to the four station kinds', () => {
    expect(norm).toMatch(/branch_id uuid not null references public\.branch/)
    for (const kind of ['beverage', 'bakery_oven', 'prep', 'pos']) {
      expect(norm).toContain(`'${kind}'`)
    }
  })

  it('employee carries tenant + branch and an OPTIONAL user link', () => {
    expect(norm).toMatch(/tenant_id uuid not null references public\.tenant/)
    expect(norm).toMatch(/branch_id uuid not null references public\.branch/)
    // user_id is nullable: present as a FK but NOT "not null".
    expect(norm).toContain('user_id uuid references public.app_user')
    expect(norm).not.toContain('user_id uuid not null references public.app_user')
  })

  it('employee code is unique within a tenant', () => {
    expect(norm).toContain('unique (tenant_id, code)')
  })

  it('enables RLS with a deny-by-default policy on both tables', () => {
    expect(count(/enable row level security/g)).toBe(2)
    expect(count(/for all to public using \(false\) with check \(false\)/g)).toBe(2)
  })

  it('attaches the updated_at trigger to both tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(2)
  })
})
