import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the Supabase custom access token hook.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/auth/custom_access_token_hook.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')

describe('custom_access_token_hook', () => {
  it('defines the hook as a SECURITY DEFINER function with a pinned search_path', () => {
    expect(norm).toContain(
      'create or replace function public.custom_access_token_hook(event jsonb)',
    )
    expect(norm).toContain('security definer')
    expect(norm).toContain("set search_path = ''")
  })

  it('stamps tenant_id, session_version, and branch_roles', () => {
    expect(norm).toContain("jsonb_set(v_claims, '{tenant_id}'")
    expect(norm).toContain("jsonb_set(v_claims, '{session_version}'")
    expect(norm).toContain("jsonb_set(v_claims, '{branch_roles}'")
  })

  it('derives branch_roles from user_branch_role x role', () => {
    expect(norm).toContain('from public.user_branch_role ubr')
    expect(norm).toContain('join public.role r on r.id = ubr.role_id')
    expect(norm).toContain("jsonb_build_object('branch_id', ubr.branch_id, 'role', r.key)")
  })

  it('reads tenant_id + session_version from app_user', () => {
    expect(norm).toContain('from public.app_user')
    expect(norm).toContain('select tenant_id, session_version')
  })

  it('grants execute only to supabase_auth_admin', () => {
    expect(norm).toContain(
      'grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin',
    )
    expect(norm).toMatch(
      /revoke execute on function public\.custom_access_token_hook\(jsonb\) from [^;]*authenticated/,
    )
  })
})
