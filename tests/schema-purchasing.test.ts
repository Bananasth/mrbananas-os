import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the suppliers & purchasing migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0011_purchasing.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0011 purchasing — structure', () => {
  it('creates supplier, purchase_order, purchase_order_line', () => {
    for (const t of ['supplier', 'purchase_order', 'purchase_order_line']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('scopes purchase_order to a branch + supplier in the same tenant', () => {
    expect(norm).toMatch(/foreign key \(branch_id, tenant_id\) references public\.branch/)
    expect(norm).toMatch(/foreign key \(supplier_id, tenant_id\) references public\.supplier/)
    expect(norm).toContain("check (status in ('draft', 'ordered', 'received', 'cancelled'))")
  })

  it('lines reference a PO and the inventory_item supertype via single FKs (N1)', () => {
    expect(norm).toMatch(/foreign key \(po_id, tenant_id\) references public\.purchase_order/)
    expect(norm).toMatch(/foreign key \(item_id, tenant_id\) references public\.inventory_item/)
    expect(norm).toContain('qty numeric not null check (qty > 0)')
    expect(norm).toContain('unit_cost bigint check (unit_cost is null or unit_cost >= 0)')
  })

  it('resolves a PO branch via a SECURITY DEFINER helper (line branch isolation)', () => {
    expect(norm).toMatch(/purchase_order_branch\(p_po_id uuid\)[\s\S]*?security definer/)
  })

  it('stays minimal: no movements, lots, or ledger tables', () => {
    const ddl = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ')
    // ('received' is a valid PO status; we only exclude the ledger tables here.)
    for (const out of ['inventory_movement', 'inventory_lot']) {
      expect(ddl).not.toContain(out)
    }
  })
})

describe('0011 purchasing — RLS', () => {
  it('enables RLS on all three tables with least-privilege policies', () => {
    expect(count(/enable row level security/g)).toBe(3)
    expect(count(/_owner_all on public\./g)).toBe(3)
    expect(count(/_manager_all on public\./g)).toBe(2) // PO + line (branch-scoped)
    expect(count(/_branch_select on public\./g)).toBe(2)
    expect(count(/_staff_select on public\./g)).toBe(1) // supplier (tenant-level read)
    expect(norm).not.toContain('using (false)')
  })

  it('attaches the updated_at trigger to all three tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(3)
  })
})
