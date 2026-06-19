import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the payment migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0017_payment.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0017 payment', () => {
  it('creates payment bound to a branch-local order', () => {
    expect(norm).toContain('create table public.payment ')
    expect(norm).toMatch(
      /foreign key \(order_id, tenant_id, branch_id\) references public\.sales_order \(id, tenant_id, branch_id\)/,
    )
  })

  it('stores money in integer minor units and constrains method/status', () => {
    expect(norm).toContain('amount bigint not null check (amount > 0)')
    expect(norm).toContain("check (method in ('cash', 'card', 'qr', 'other'))")
    expect(norm).toContain(
      "check (status in ('pending', 'authorized', 'captured', 'failed', 'refunded', 'voided'))",
    )
  })

  it('is idempotent via (order_id, client_uuid)', () => {
    expect(norm).toContain('client_uuid uuid not null')
    expect(norm).toContain('unique (order_id, client_uuid)')
  })

  it('is tokenized: stores a gateway_ref but never card data', () => {
    expect(norm).toContain('gateway_ref text')
    // Strip both COMMENT ON statements (which document what NOT to store) and -- comments.
    const ddl = sql
      .replace(/comment on [\s\S]*?;/g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .replace(/\s+/g, ' ')
    for (const forbidden of ['card_number', 'pan', 'cvv', 'cardholder']) {
      expect(ddl).not.toContain(forbidden)
    }
  })

  it('enables RLS with least-privilege policies', () => {
    expect(count(/enable row level security/g)).toBe(1)
    expect(norm).toContain('payment_owner_all on public.payment')
    expect(norm).toContain('payment_ops_all on public.payment')
    expect(norm).toContain('payment_branch_select on public.payment')
    expect(norm).not.toContain('using (false)')
  })

  it('attaches the updated_at trigger', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(1)
  })
})
