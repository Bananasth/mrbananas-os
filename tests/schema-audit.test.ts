import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the audit-log foundation. Proves the database-layer enforcement
// (append-only triggers, RLS, attachment) is present in the DDL. Live execution proof is
// gated on a database being available (out of the offline scope).
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0006_audit.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

const PHASE0_TABLES = [
  'tenant',
  'branch',
  'app_user',
  'role',
  'user_branch_role',
  'workstation',
  'employee',
  'inventory_item',
]

describe('0006_audit schema', () => {
  it('creates audit_log with the required audit columns', () => {
    expect(norm).toContain('create table public.audit_log')
    for (const col of [
      'entity_type', // table name
      'action', // operation type
      'entity_id', // row identifier
      'actor_user_id', // actor when available
      'tenant_id',
      'branch_id',
      'before',
      'after',
      'occurred_at', // timestamp
    ]) {
      expect(norm).toContain(col)
    }
  })

  it('records before/after as jsonb and a default timestamp', () => {
    expect(norm).toContain('before jsonb')
    expect(norm).toContain('after jsonb')
    expect(norm).toContain('occurred_at timestamptz not null default now()')
  })

  it('constrains action to INSERT/UPDATE/DELETE', () => {
    expect(norm).toContain("check (action in ('insert', 'update', 'delete'))")
  })
})

describe('0006_audit RLS', () => {
  it('enables RLS with a deny-by-default policy', () => {
    expect(count(/enable row level security/g)).toBe(1)
    expect(count(/for all to public using \(false\) with check \(false\)/g)).toBe(1)
  })
})

describe('0006_audit immutability (append-only, DB layer)', () => {
  it('forbids UPDATE and DELETE via a raising before-trigger', () => {
    expect(norm).toContain('before update or delete on public.audit_log')
    expect(norm).toContain('execute function app.reject_mutation()')
    expect(norm).toContain('raise exception')
  })

  it('does NOT block INSERT on audit_log (so the trigger can append)', () => {
    expect(norm).not.toContain('before insert')
  })
})

describe('0006_audit reusable trigger', () => {
  it('defines a SECURITY DEFINER audit trigger that appends to audit_log', () => {
    expect(norm).toContain('create or replace function app.audit_trigger()')
    expect(norm).toContain('security definer')
    expect(norm).toContain('insert into public.audit_log')
  })

  it('captures actor from the app.actor_user_id GUC when set', () => {
    expect(norm).toContain("current_setting('app.actor_user_id', true)")
  })
})

describe('0006_audit trigger attachment', () => {
  it('attaches the audit trigger to all approved Phase-0 tables', () => {
    for (const table of PHASE0_TABLES) {
      expect(norm).toContain(`after insert or update or delete on public.${table} `)
    }
    expect(count(/after insert or update or delete on public\./g)).toBe(PHASE0_TABLES.length)
  })

  it('does not audit audit_log itself (no recursion)', () => {
    expect(norm).not.toContain('after insert or update or delete on public.audit_log')
  })
})
