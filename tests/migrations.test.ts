import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateMigrationFilenames } from '../scripts/check-migrations'

const migrationsDir = fileURLToPath(new URL('../supabase/migrations', import.meta.url))

describe('migration conventions (real directory)', () => {
  const files = readdirSync(migrationsDir)

  it('all migration files follow NNNN_snake_case.sql with unique numbers', () => {
    expect(validateMigrationFilenames(files)).toEqual([])
  })

  it('the prelude migration exists and is non-empty', () => {
    expect(files).toContain('0000_prelude.sql')
    const sql = readFileSync(`${migrationsDir}/0000_prelude.sql`, 'utf8')
    expect(sql.trim().length).toBeGreaterThan(0)
  })

  it('the prelude creates the app schema and the updated_at helper', () => {
    const sql = readFileSync(`${migrationsDir}/0000_prelude.sql`, 'utf8')
    expect(sql).toContain('create schema if not exists app')
    expect(sql).toContain('app.set_updated_at()')
  })
})

describe('validateMigrationFilenames (unit)', () => {
  it('flags malformed filenames', () => {
    const issues = validateMigrationFilenames(['1_foo.sql', '0001_Bad.sql', '0002_ok.sql'])
    expect(issues.map((issue) => issue.file)).toEqual(['1_foo.sql', '0001_Bad.sql'])
  })

  it('flags duplicate migration numbers', () => {
    const issues = validateMigrationFilenames(['0001_a.sql', '0001_b.sql'])
    expect(issues.some((issue) => issue.problem.includes('duplicate'))).toBe(true)
  })

  it('ignores non-SQL files', () => {
    expect(validateMigrationFilenames(['README.md', '.gitkeep'])).toEqual([])
  })
})
