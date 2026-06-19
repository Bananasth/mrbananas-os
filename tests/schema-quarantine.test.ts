import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the quarantine migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0019_quarantine.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

describe('0019 quarantine — metadata + audit', () => {
  it('adds quarantine metadata to inventory_lot', () => {
    expect(norm).toContain('add column quarantine_reason text')
    expect(norm).toContain('add column quarantined_at timestamptz')
    expect(norm).toContain('add column quarantined_by uuid references public.app_user')
  })

  it('audits every inventory_lot change (quarantine trail)', () => {
    expect(norm).toContain('after insert or update or delete on public.inventory_lot')
    expect(norm).toContain('execute function app.audit_trigger()')
  })
})

describe('0019 quarantine — blocks sale/consume', () => {
  it('guards inventory_movement against selling/consuming a quarantined lot', () => {
    expect(norm).toContain('create or replace function app.guard_quarantined_movement()')
    expect(norm).toContain('before insert on public.inventory_movement')
    expect(norm).toContain("if new.reason in ('sell', 'consume')")
    expect(norm).toContain('is quarantined and cannot be sold or consumed')
  })
})

describe('0019 quarantine — primitives', () => {
  it('quarantine_lot is a guarded SECURITY DEFINER primitive that sets status', () => {
    expect(norm).toContain('create or replace function app.quarantine_lot(')
    expect(norm).toMatch(/quarantine_lot\([\s\S]*?security definer/)
    expect(norm).toContain("set status = 'quarantined'")
    expect(norm).toContain("app.has_branch_role(v_branch, array['manager'])")
  })

  it('release_lot restores a quarantined lot (available or depleted)', () => {
    expect(norm).toContain('create or replace function app.release_lot(')
    expect(norm).toContain("set status = case when v_qty > 0 then 'available' else 'depleted' end")
  })
})
