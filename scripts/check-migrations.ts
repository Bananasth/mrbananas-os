/**
 * Offline validator for the migrations directory. Pure (operates on filenames, no fs, no
 * database) so it runs in the test suite without any external service. Enforces the naming
 * convention documented in supabase/migrations/README.md.
 */

export type MigrationIssue = { readonly file: string; readonly problem: string }

// NNNN_snake_case.sql — 4-digit number, lower snake_case description.
const MIGRATION_RE = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/

/** Return one issue per malformed or duplicate-numbered migration filename. */
export function validateMigrationFilenames(filenames: readonly string[]): MigrationIssue[] {
  const issues: MigrationIssue[] = []
  const seen = new Map<string, string>()

  for (const file of filenames) {
    if (!file.endsWith('.sql')) continue

    const match = MIGRATION_RE.exec(file)
    const num = match?.[1]
    if (num === undefined) {
      issues.push({ file, problem: 'does not match NNNN_snake_case.sql' })
      continue
    }

    const existing = seen.get(num)
    if (existing !== undefined) {
      issues.push({ file, problem: `duplicate migration number ${num} (also ${existing})` })
    } else {
      seen.set(num, file)
    }
  }

  return issues
}
