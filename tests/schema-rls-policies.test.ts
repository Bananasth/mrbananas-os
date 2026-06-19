import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the RLS policy foundation.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0007_rls_policies.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

const HELPERS = [
  'app.current_claims()',
  'app.current_user_id()',
  'app.current_tenant_id()',
  'app.current_branch_ids()',
  'app.is_tenant_owner()',
  'app.has_branch_role(',
  'app.has_any_role(',
  'app.branch_tenant_id(',
]

const DENY_ALL = [
  ['tenant_deny_all', 'tenant'],
  ['branch_deny_all', 'branch'],
  ['app_user_deny_all', 'app_user'],
  ['role_deny_all', 'role'],
  ['user_branch_role_deny_all', 'user_branch_role'],
  ['workstation_deny_all', 'workstation'],
  ['employee_deny_all', 'employee'],
  ['inventory_item_deny_all', 'inventory_item'],
  ['audit_log_deny_all', 'audit_log'],
]

const PHASE0_TABLES = [
  'tenant',
  'branch',
  'app_user',
  'role',
  'user_branch_role',
  'workstation',
  'employee',
  'inventory_item',
  'audit_log',
]

describe('0007 helper functions', () => {
  it('defines all required claim/role helpers', () => {
    for (const fn of HELPERS) expect(norm).toContain(`create or replace function ${fn}`)
  })

  it('helpers are STABLE with a pinned (empty) search_path', () => {
    expect(count(/\bstable\b/g)).toBeGreaterThanOrEqual(HELPERS.length)
    expect(count(/set search_path = ''/g)).toBeGreaterThanOrEqual(HELPERS.length)
  })

  it('branch_tenant_id is SECURITY DEFINER (resolves tenant past RLS)', () => {
    expect(norm).toMatch(/branch_tenant_id\(p_branch_id uuid\)[\s\S]*?security definer/)
  })
})

describe('0007 replaces deny-all with real policies', () => {
  it('drops every deny-all bootstrap policy', () => {
    for (const [policy, table] of DENY_ALL) {
      expect(norm).toContain(`drop policy if exists ${policy} on public.${table}`)
    }
    expect(count(/drop policy if exists/g)).toBe(DENY_ALL.length)
  })

  it('leaves every Phase-0 table with policy coverage', () => {
    for (const table of PHASE0_TABLES) {
      expect(norm).toContain(`on public.${table} `)
    }
  })

  it('does not disable RLS on any table', () => {
    expect(norm).not.toContain('disable row level security')
  })
})

describe('0007 isolation', () => {
  it('enforces tenant isolation via current_tenant_id / branch_tenant_id', () => {
    expect(norm).toContain('app.current_tenant_id()')
    expect(norm).toContain('app.branch_tenant_id(')
  })

  it('enforces branch + role isolation via branch-role helpers', () => {
    expect(norm).toContain('app.has_branch_role(')
    expect(norm).toContain('app.current_branch_ids()')
  })

  it('grants Owner tenant-wide access and Manager branch-scoped access', () => {
    expect(norm).toContain('app.is_tenant_owner()')
    expect(norm).toContain("app.has_branch_role(branch_id, array['manager'])")
  })
})

describe('0007 audit-log is read-only + immutable', () => {
  it('grants Owner and Manager SELECT only', () => {
    expect(norm).toContain('audit_log_owner_select')
    expect(norm).toContain('audit_log_manager_select')
  })

  it('declares no write policy on audit_log', () => {
    expect(norm).not.toMatch(/on public\.audit_log for (all|insert|update|delete)/)
  })
})

describe('0007 customer-safe', () => {
  it('grants no access to internal Phase-0 tables for customers', () => {
    // Scan executable DDL, not comments (which explain the customer exclusion).
    const ddl = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ')
    // The 'customer' role is never named in any policy expression.
    expect(ddl).not.toContain("'customer'")
    expect(ddl).not.toContain('customer')
  })
})
