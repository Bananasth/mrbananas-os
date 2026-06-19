import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the batch-execution primitives.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0014_batch_execution.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

describe('0014 consume_for_batch', () => {
  it('is a guarded SECURITY DEFINER primitive', () => {
    expect(norm).toContain('create or replace function app.consume_for_batch(')
    expect(norm).toMatch(/consume_for_batch\([\s\S]*?security definer/)
    expect(norm).toContain("app.has_branch_role(v_branch, array['manager', 'baker'])")
  })

  it('consumes FEFO (oldest expiry first) with row locking', () => {
    expect(norm).toContain('order by expires_at nulls last, received_at')
    expect(norm).toContain('for update')
  })

  it('posts negative consume movements that reference the batch', () => {
    expect(norm).toContain("-v_take, 'consume', 'production_batch', p_batch_id")
  })

  it('raises on insufficient stock', () => {
    expect(norm).toContain('insufficient stock for item')
  })
})

describe('0014 complete_batch', () => {
  it('is a guarded SECURITY DEFINER primitive', () => {
    expect(norm).toContain('create or replace function app.complete_batch(')
    expect(norm).toMatch(/complete_batch\([\s\S]*?security definer/)
  })

  it('only completes a planned/in_progress batch', () => {
    expect(norm).toContain("if v_status not in ('planned', 'in_progress')")
  })

  it('resolves the finished item via recipe_version -> recipe -> product', () => {
    expect(norm).toContain('select p.inventory_item_id into v_item')
    expect(norm).toContain('join public.product p on p.id = rc.product_id')
  })

  it('produces a finished lot from actual_yield and reconciles the batch', () => {
    expect(norm).toContain("p_actual_yield, 'produce', 'production_batch', p_batch_id")
    expect(norm).toContain("set actual_yield = p_actual_yield, status = 'completed'")
  })
})

describe('0014 yield reconciliation', () => {
  it('exposes planned vs actual variance as a security_invoker view', () => {
    expect(norm).toContain(
      'create view public.production_batch_yield with (security_invoker = true)',
    )
    expect(norm).toContain('(b.actual_yield - b.planned_qty) as yield_variance')
  })
})
