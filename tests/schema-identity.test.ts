import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static schema test for the identity migration (no database connection).
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0002_identity.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0002_identity schema', () => {
  it('creates app_user, role, and user_branch_role', () => {
    expect(norm).toContain('create table public.app_user')
    expect(norm).toContain('create table public.role')
    expect(norm).toContain('create table public.user_branch_role')
  })

  it('does NOT create an employee table (out of W6 scope)', () => {
    expect(norm).not.toContain('create table public.employee')
  })

  it('app_user belongs to a tenant and has a case-insensitive unique email', () => {
    expect(norm).toMatch(/tenant_id uuid not null references public\.tenant/)
    expect(norm).toContain('app_user_email_lower_idx on public.app_user (lower(email))')
  })

  it('user_branch_role maps user -> branch -> role with one role per user per branch', () => {
    expect(norm).toMatch(/user_id uuid not null references public\.app_user/)
    expect(norm).toMatch(/branch_id uuid not null references public\.branch/)
    expect(norm).toMatch(/role_id uuid not null references public\.role/)
    expect(norm).toContain('unique (user_id, branch_id)')
  })

  it('enables RLS with a deny-by-default policy on all three tables', () => {
    expect(count(/enable row level security/g)).toBe(3)
    expect(count(/for all to public using \(false\) with check \(false\)/g)).toBe(3)
  })

  it('attaches the updated_at trigger to all three tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(3)
  })

  it('seeds exactly the five approved roles and nothing else', () => {
    for (const key of ['owner', 'manager', 'staff', 'baker', 'customer']) {
      expect(norm).toContain(`('${key}',`)
    }
    expect(count(/\('(owner|manager|staff|baker|customer)',/g)).toBe(5)
    expect(norm).not.toContain("('admin',")
    expect(norm).not.toContain("('superuser',")
  })
})
