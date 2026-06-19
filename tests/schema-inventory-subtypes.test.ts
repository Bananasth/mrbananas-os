import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the inventory subtypes migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0008_inventory_subtypes.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0008 inventory subtypes', () => {
  it('creates the four subtype/UoM tables', () => {
    for (const t of ['raw_material', 'semi_finished', 'product', 'unit_conversion']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('adds composite unique targets on the supertype', () => {
    expect(norm).toContain('unique (id, tenant_id)')
    expect(norm).toContain('unique (id, tenant_id, item_kind)')
  })

  it('raw_material is a shared-PK subtype constrained to kind = raw', () => {
    expect(norm).toContain("item_kind text not null default 'raw' check (item_kind = 'raw')")
    expect(norm).toMatch(
      /foreign key \(id, tenant_id, item_kind\) references public\.inventory_item \(id, tenant_id, item_kind\) on delete cascade/,
    )
  })

  it('semi_finished is a shared-PK subtype constrained to kind = semi_finished', () => {
    expect(norm).toContain(
      "item_kind text not null default 'semi_finished' check (item_kind = 'semi_finished')",
    )
  })

  it('product has an OPTIONAL inventory_item link and category/type checks', () => {
    expect(norm).toContain(
      'inventory_item_id uuid references public.inventory_item (id) on delete set null',
    )
    expect(norm).toContain("check (category in ('beverage', 'bakery'))")
    expect(norm).toContain("check (type in ('made_to_order', 'batch'))")
  })

  it('unit_conversion enforces a positive factor and distinct units', () => {
    expect(norm).toContain('factor numeric not null check (factor > 0)')
    expect(norm).toContain('check (from_unit <> to_unit)')
  })

  it('scopes sku uniqueness per tenant', () => {
    expect(count(/unique \(tenant_id, sku\)/g)).toBe(3)
  })

  it('enables RLS with least-privilege policies on all four tables', () => {
    expect(count(/enable row level security/g)).toBe(4)
    expect(count(/_owner_all on public\./g)).toBe(4)
    expect(count(/_staff_select on public\./g)).toBe(4)
    expect(norm).not.toContain('using (false)') // no deny-all bootstraps; real policies only
  })

  it('attaches the updated_at trigger to all four tables', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(4)
  })
})
