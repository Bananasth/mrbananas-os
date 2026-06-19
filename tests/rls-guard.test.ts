import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeMigrations } from '../scripts/check-rls'

// The real migration set (this is the CI gate: it must report zero violations).
const dir = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
const combined = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
  .join('\n')

const BUSINESS_TABLES = [
  // Phase 0
  'app_user',
  'audit_log',
  'branch',
  'employee',
  'inventory_item',
  'role',
  'tenant',
  'user_branch_role',
  'workstation',
  // Phase 1 — P1-W1 inventory subtypes
  'product',
  'raw_material',
  'semi_finished',
  'unit_conversion',
  // Phase 1 — P1-W2 branch product (F2)
  'branch_product',
  // Phase 1 — P1-W3 catalog & recipes
  'recipe',
  'recipe_version',
  'recipe_ingredient',
  // Phase 1 — P1-W4 suppliers & purchasing
  'supplier',
  'purchase_order',
  'purchase_order_line',
  // Phase 1 — P1-W5 inventory ledger (lots + movements; shelf_life/stock_on_hand are views)
  'inventory_lot',
  'inventory_movement',
].sort()

describe('RLS guard — real migrations', () => {
  const report = analyzeMigrations(combined)

  it('detects every business table', () => {
    expect(report.tables).toEqual(BUSINESS_TABLES)
  })

  it('reports ZERO RLS violations (every table has RLS + a net policy)', () => {
    expect(report.violations).toEqual([])
  })
})

describe('RLS guard — pass/fail unit cases', () => {
  it('passes a table with RLS and a policy', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      alter table public.foo enable row level security;
      create policy foo_select on public.foo for select using (true);
    `
    expect(analyzeMigrations(sql).violations).toEqual([])
  })

  it('fails a table with no RLS', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      create policy foo_select on public.foo for select using (true);
    `
    expect(analyzeMigrations(sql).violations).toContainEqual({
      table: 'foo',
      problem: 'missing RLS',
    })
  })

  it('fails a table with RLS but zero policies', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      alter table public.foo enable row level security;
    `
    expect(analyzeMigrations(sql).violations).toContainEqual({
      table: 'foo',
      problem: 'no policies',
    })
  })

  it('fails when the only policy is later dropped (net zero)', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      alter table public.foo enable row level security;
      create policy foo_deny on public.foo for all using (false);
      drop policy if exists foo_deny on public.foo;
    `
    expect(analyzeMigrations(sql).violations).toContainEqual({
      table: 'foo',
      problem: 'no policies',
    })
  })

  it('passes when a deny-all is replaced by a real policy (net one)', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      alter table public.foo enable row level security;
      create policy foo_deny on public.foo for all using (false);
      drop policy if exists foo_deny on public.foo;
      create policy foo_real on public.foo for select using (true);
    `
    expect(analyzeMigrations(sql).violations).toEqual([])
  })

  it('fails when RLS is disabled after being enabled', () => {
    const sql = `
      create table public.foo (id uuid primary key);
      alter table public.foo enable row level security;
      create policy foo_select on public.foo for select using (true);
      alter table public.foo disable row level security;
    `
    expect(analyzeMigrations(sql).violations).toContainEqual({
      table: 'foo',
      problem: 'missing RLS',
    })
  })
})
