import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the recall migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0020_recall.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0020 recall — structure & lifecycle', () => {
  it('creates recall, recall_action, recall_affected', () => {
    for (const t of ['recall', 'recall_action', 'recall_affected']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('models the recall lifecycle and both scopes', () => {
    expect(norm).toContain(
      "check (status in ('initiated', 'investigating', 'completed', 'closed'))",
    )
    expect(norm).toContain("check (scope_type in ('supplier', 'lot'))")
  })

  it('snapshots the four affected entity types', () => {
    expect(norm).toContain(
      "check (entity_type in ('inventory_lot', 'production_batch', 'order_item', 'sales_order'))",
    )
  })
})

describe('0020 recall — immutability & audit', () => {
  it('recall_action and recall_affected are append-only', () => {
    expect(norm).toContain('before update or delete on public.recall_action')
    expect(norm).toContain('before update or delete on public.recall_affected')
    expect(count(/execute function app\.reject_mutation\(\)/g)).toBe(2)
  })

  it('audits every recall change', () => {
    expect(norm).toContain('after insert or update or delete on public.recall')
    expect(norm).toContain('execute function app.audit_trigger()')
  })
})

describe('0020 recall — initiate_recall trace', () => {
  it('is a guarded SECURITY DEFINER primitive', () => {
    expect(norm).toContain('create or replace function app.initiate_recall(')
    expect(norm).toMatch(/initiate_recall\([\s\S]*?security definer/)
  })

  it('supports supplier-based and lot-based seeds', () => {
    expect(norm).toContain("if p_scope_type = 'lot'")
    expect(norm).toContain('join public.purchase_order_line pol on pol.id = m.ref_id')
    expect(norm).toContain('where po.supplier_id = p_scope_ref_id')
  })

  it('forward-traces lot -> batch -> produced lot recursively', () => {
    expect(norm).toContain('with recursive affected as (')
    expect(norm).toContain("cm.reason = 'consume' and cm.ref_type = 'production_batch'")
  })

  it('snapshots lots, batches, order_items, and sales_orders', () => {
    expect(norm).toContain("'inventory_lot', x from unnest(v_lots)")
    expect(norm).toContain("'production_batch', b")
    expect(norm).toContain("'order_item', cm.ref_id")
    expect(norm).toContain("'sales_order', oi.order_id")
  })

  it('auto-quarantines implicated sellable lots', () => {
    expect(norm).toContain("set status = 'quarantined'")
    expect(norm).toContain("where id = any(v_lots) and status in ('available', 'expired')")
  })
})

describe('0020 recall — advance_recall lifecycle', () => {
  it('enforces a forward-only lifecycle', () => {
    expect(norm).toContain('create or replace function app.advance_recall(')
    expect(norm).toContain("v_cur = 'initiated' and p_new_status in ('investigating', 'closed')")
    expect(norm).toContain('invalid recall transition')
  })
})

describe('0020 recall — RLS', () => {
  it('enables RLS with least-privilege policies on all three tables', () => {
    expect(count(/enable row level security/g)).toBe(3)
    expect(count(/_owner_all on public\./g)).toBe(3)
    expect(norm).not.toContain('using (false)')
  })
})
