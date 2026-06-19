import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the sale-deduction (I1) primitives.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0016_sale_deduction.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

describe('0016 deduct_fifo helper', () => {
  it('is a SECURITY DEFINER helper, locked down from public', () => {
    expect(norm).toContain('create or replace function app.deduct_fifo(')
    expect(norm).toMatch(/deduct_fifo\([\s\S]*?security definer/)
    expect(norm).toContain('revoke all on function app.deduct_fifo(')
  })

  it('consumes FIFO (oldest received first) atomically with row locking', () => {
    expect(norm).toContain('order by received_at, id')
    expect(norm).toContain('for update')
  })

  it('rejects the sale when stock is insufficient', () => {
    expect(norm).toContain('insufficient stock for item')
  })

  it('posts negative sell movements (traceability preserved)', () => {
    expect(norm).toContain('-v_take, p_reason, p_ref_type, p_ref_id, p_employee_id')
  })
})

describe('0016 fulfil_order_item', () => {
  it('is a guarded SECURITY DEFINER primitive', () => {
    expect(norm).toContain('create or replace function app.fulfil_order_item(')
    expect(norm).toMatch(/fulfil_order_item\([\s\S]*?security definer/)
    expect(norm).toContain(
      "app.has_branch_role(v_oi.branch_id, array['manager', 'staff', 'baker'])",
    )
  })

  it('deducts finished-product lots for bakery items and stamps the batch (trace)', () => {
    expect(norm).toContain("if v_prod.type = 'batch'")
    expect(norm).toContain('v_prod.inventory_item_id, v_oi.qty')
    expect(norm).toContain('update public.order_item set batch_id = v_batch')
  })

  it('deducts recipe ingredients for made-to-order beverages', () => {
    expect(norm).toContain('from public.recipe_ingredient')
    expect(norm).toContain('ing.quantity * v_oi.qty')
  })

  it('references the order_item on every sell movement', () => {
    expect(norm).toContain("'sell', 'order_item', p_order_item_id")
  })
})
