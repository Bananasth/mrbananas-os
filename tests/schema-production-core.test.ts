import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the production core migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0013_production_core.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0013 production core — structure', () => {
  it('creates plan, batch, stage, event', () => {
    for (const t of ['production_plan', 'production_batch', 'batch_stage', 'batch_event']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('batch pins recipe_version + a branch-checked workstation', () => {
    expect(norm).toMatch(
      /foreign key \(recipe_version_id, tenant_id\) references public\.recipe_version/,
    )
    expect(norm).toContain('add constraint workstation_id_branch_key unique (id, branch_id)')
    expect(norm).toMatch(
      /foreign key \(workstation_id, branch_id\) references public\.workstation \(id, branch_id\)/,
    )
  })
})

describe('0013 production core — traceability fixes', () => {
  it('B1: provenance is per-stage (batch_stage.employee_id) with an optional batch lead', () => {
    expect(norm).toContain(
      'lead_employee_id uuid references public.employee (id) on delete set null',
    )
    expect(norm).toMatch(
      /create table public\.batch_stage[\s\S]*?employee_id uuid references public\.employee/,
    )
  })

  it('B2: batches model failure/scrap and partial yield', () => {
    expect(norm).toContain(
      "check (status in ('planned', 'in_progress', 'completed', 'failed', 'scrapped', 'quarantined'))",
    )
    expect(norm).toContain('actual_yield numeric check (actual_yield is null or actual_yield >= 0)')
  })

  it('models the six bakery stages in order', () => {
    expect(norm).toContain(
      "stage text not null check (stage in ('mix', 'ferment', 'proof', 'bake', 'cool', 'pack'))",
    )
  })

  it('batch_event is an append-only production log', () => {
    expect(norm).toContain('before update or delete on public.batch_event')
    expect(norm).toContain('execute function app.reject_mutation()')
  })

  it('closes the deferred inventory_lot.batch_id link (tenant-safe)', () => {
    expect(norm).toMatch(
      /alter table public\.inventory_lot[\s\S]*?foreign key \(batch_id, tenant_id\) references public\.production_batch/,
    )
  })
})

describe('0013 production core — RLS', () => {
  it('enables RLS with least-privilege policies on all four tables', () => {
    expect(count(/enable row level security/g)).toBe(4)
    expect(count(/_owner_all on public\./g)).toBe(4)
    expect(norm).not.toContain('using (false)')
  })

  it('lets Manager + Baker operate batches/stages/events; plan is Manager-managed', () => {
    expect(count(/_ops_all on public\./g)).toBe(3) // batch, stage, event
    expect(count(/_manager_all on public\./g)).toBe(1) // plan
    expect(count(/_branch_select on public\./g)).toBe(4)
  })

  it('resolves batch branch via a SECURITY DEFINER helper (stage/event isolation)', () => {
    expect(norm).toMatch(/batch_branch\(p_batch_id uuid\)[\s\S]*?security definer/)
  })

  it('only plan/batch/stage are mutable (event append-only; three updated_at triggers)', () => {
    expect(count(/execute function app\.set_updated_at\(\)/g)).toBe(3)
  })
})
