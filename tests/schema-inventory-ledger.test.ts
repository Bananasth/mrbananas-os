import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the inventory ledger migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0012_inventory_ledger.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0012 inventory ledger — structure', () => {
  it('creates inventory_lot and inventory_movement', () => {
    expect(norm).toContain('create table public.inventory_lot ')
    expect(norm).toContain('create table public.inventory_movement ')
  })

  it('inventory_lot has a non-negative qty_on_hand cache, expiry, and status', () => {
    expect(norm).toContain('qty_on_hand numeric not null default 0 check (qty_on_hand >= 0)')
    expect(norm).toContain(
      "status text not null default 'available' check (status in ('available', 'quarantined', 'expired', 'depleted'))",
    )
  })

  it('inventory_movement is the ledger: reason enum + non-zero delta, tenant-safe FKs', () => {
    expect(norm).toContain(
      "check (reason in ('receive', 'consume', 'produce', 'sell', 'waste', 'adjust', 'transfer'))",
    )
    expect(norm).toContain('qty_delta numeric not null check (qty_delta <> 0)')
    expect(norm).toMatch(/foreign key \(lot_id, tenant_id\) references public\.inventory_lot/)
  })

  it('indexes lots for FEFO (expires_at, available only)', () => {
    expect(norm).toContain(
      "on public.inventory_lot (branch_id, item_id, expires_at) where status = 'available'",
    )
  })
})

describe('0012 inventory ledger — append-only + cache (N3)', () => {
  it('makes the movement ledger append-only (reuses reject_mutation)', () => {
    expect(norm).toContain('before update or delete on public.inventory_movement')
    expect(norm).toContain('execute function app.reject_mutation()')
  })

  it('maintains qty_on_hand from the ledger via an AFTER INSERT trigger', () => {
    expect(norm).toContain('create or replace function app.apply_movement_to_lot()')
    expect(norm).toContain('after insert on public.inventory_movement')
    expect(norm).toContain('set qty_on_hand = qty_on_hand + new.qty_delta')
  })
})

describe('0012 inventory ledger — receiving primitive', () => {
  it('provides a guarded SECURITY DEFINER receive_inventory', () => {
    expect(norm).toContain('create or replace function app.receive_inventory(')
    expect(norm).toMatch(/receive_inventory\([\s\S]*?security definer/)
    expect(norm).toContain("'receive'")
  })

  it('authorizes the caller internally (tenant + branch role)', () => {
    expect(norm).toContain('app.is_tenant_owner()')
    expect(norm).toContain("app.has_branch_role(p_branch_id, array['owner', 'manager', 'staff'])")
  })
})

describe('0012 inventory ledger — derived views (N2)', () => {
  it('shelf_life is a VIEW with RLS via security_invoker (no stored fefo_rank)', () => {
    expect(norm).toContain('create view public.shelf_life with (security_invoker = true)')
    // No stored fefo_rank column anywhere in the DDL (comments may mention it).
    const ddl = sql.replace(/--[^\n]*/g, ' ')
    expect(ddl).not.toContain('fefo_rank')
  })

  it('stock_on_hand sums available qty per item per branch via security_invoker', () => {
    expect(norm).toContain('create view public.stock_on_hand with (security_invoker = true)')
    expect(norm).toContain('sum(l.qty_on_hand) as qty_available')
    expect(norm).toContain("where l.status = 'available'")
  })
})

describe('0012 inventory ledger — RLS', () => {
  it('enables RLS with least-privilege policies on both tables', () => {
    expect(count(/enable row level security/g)).toBe(2)
    expect(count(/_owner_all on public\./g)).toBe(2)
    expect(count(/_manager_all on public\./g)).toBe(2)
    expect(count(/_branch_select on public\./g)).toBe(2)
    expect(norm).not.toContain('using (false)')
  })

  it('only inventory_lot is mutable (movement is append-only; one updated_at trigger)', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(1)
  })
})
