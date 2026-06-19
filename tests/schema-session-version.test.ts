import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the session_version (JWT revocation) migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0004_session_version.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

describe('0004_session_version migration', () => {
  it('adds session_version to app_user as the single source of truth', () => {
    expect(norm).toContain('alter table public.app_user')
    expect(norm).toContain('add column session_version integer not null default 1')
  })

  it('defines a bump primitive that increments the version', () => {
    expect(norm).toContain('create or replace function app.bump_session_version')
    expect(norm).toContain('set session_version = session_version + 1')
  })

  it('hardens the bump function (security definer, pinned search_path)', () => {
    expect(norm).toContain('security definer')
    expect(norm).toContain("set search_path = ''")
  })

  it('locks execution to the trusted backend (revoked from public)', () => {
    expect(norm).toContain('revoke all on function app.bump_session_version(uuid) from public')
  })

  it('creates no new table (uses the existing app_user)', () => {
    expect(norm).not.toContain('create table')
  })
})
