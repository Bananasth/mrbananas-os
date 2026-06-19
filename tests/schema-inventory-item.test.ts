import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the inventory_item supertype migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0005_inventory_item.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0005_inventory_item schema', () => {
  it('creates the inventory_item supertype belonging to a tenant', () => {
    expect(norm).toContain('create table public.inventory_item')
    expect(norm).toMatch(
      /tenant_id uuid not null references public\.tenant \(id\) on delete restrict/,
    )
  })

  it('constrains item_kind to exactly raw, semi_finished, finished', () => {
    expect(norm).toContain("check (item_kind in ('raw', 'semi_finished', 'finished'))")
  })

  it('requires a base_unit', () => {
    expect(norm).toContain('base_unit text not null')
  })

  it('has a tenant-safe index', () => {
    expect(norm).toContain(
      'inventory_item_tenant_kind_idx on public.inventory_item (tenant_id, item_kind)',
    )
  })

  it('enables RLS with a single deny-by-default policy', () => {
    expect(count(/enable row level security/g)).toBe(1)
    expect(count(/for all to public using \(false\) with check \(false\)/g)).toBe(1)
  })

  it('attaches the updated_at trigger', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(1)
  })

  it('stays in scope: no movements, ledger, batches, or purchasing (DDL only)', () => {
    // Scan executable DDL, not comments (the header documents what is out of scope).
    const ddl = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ')
    for (const out of [
      'inventory_movement',
      'inventory_lot',
      'production_batch',
      'purchase_order',
      'yield',
    ]) {
      expect(ddl).not.toContain(out)
    }
  })
})
