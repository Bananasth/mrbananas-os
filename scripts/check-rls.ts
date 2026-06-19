/**
 * RLS CI guard (S2) — offline static migration scanner.
 *
 * Analyzes the full migration set (no database, no Docker, no connection) and reports any
 * business table that is missing Row Level Security or has zero net policies. The build
 * fails on any violation, so a future migration that adds a `public` table without RLS +
 * a policy turns CI red instead of silently shipping an open table.
 *
 * Net policy count accounts for DROP POLICY (e.g. deny-all bootstraps dropped in 0007),
 * and ENABLE/DISABLE ROW LEVEL SECURITY are applied in order across the whole set.
 */

export type RlsProblem = 'missing RLS' | 'no policies'
export type RlsViolation = { readonly table: string; readonly problem: RlsProblem }
export type RlsReport = { readonly tables: string[]; readonly violations: RlsViolation[] }

/** Analyze concatenated migration SQL (all files, in order) for RLS coverage. */
export function analyzeMigrations(sql: string): RlsReport {
  const text = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/--[^\n]*/g, ' ') // line comments
    .replace(/\s+/g, ' ')
    .toLowerCase()

  const tables = new Set<string>()
  for (const m of text.matchAll(/create table (?:if not exists )?public\.(\w+)/g)) {
    tables.add(m[1]!)
  }

  // RLS enabled/disabled, applied in source order.
  const rlsEnabled = new Set<string>()
  for (const m of text.matchAll(/alter table public\.(\w+) (enable|disable) row level security/g)) {
    if (m[2] === 'enable') rlsEnabled.add(m[1]!)
    else rlsEnabled.delete(m[1]!)
  }

  // Net policies per table = created minus dropped.
  const policies = new Map<string, Set<string>>()
  const ensure = (table: string): Set<string> => {
    const existing = policies.get(table)
    if (existing) return existing
    const created = new Set<string>()
    policies.set(table, created)
    return created
  }
  for (const m of text.matchAll(/create policy (\w+) on public\.(\w+)/g)) {
    ensure(m[2]!).add(m[1]!)
  }
  for (const m of text.matchAll(/drop policy (?:if exists )?(\w+) on public\.(\w+)/g)) {
    policies.get(m[2]!)?.delete(m[1]!)
  }

  const sorted = [...tables].sort()
  const violations: RlsViolation[] = []
  for (const table of sorted) {
    if (!rlsEnabled.has(table)) violations.push({ table, problem: 'missing RLS' })
    if ((policies.get(table)?.size ?? 0) === 0) violations.push({ table, problem: 'no policies' })
  }

  return { tables: sorted, violations }
}
