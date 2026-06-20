import 'server-only'
import { hasSupabaseEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppClaims, BranchRole, RoleKey } from './claims'
import { parseAppClaims } from './claims'
import { primaryRole } from './routing'
import { isSessionCurrent } from './session-version'

export type AuthContext = {
  userId: string
  tenantId: string
  branchRoles: BranchRole[]
  branchIds: string[]
  sessionVersion: number
  primaryRole: RoleKey
}

function decodeJwtPayload(token: string): unknown {
  const part = token.split('.')[1]
  if (!part) return null
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
}

/**
 * Resolve the authenticated user's context from the verified session, validate the custom
 * claims (tenant_id / branch_roles / session_version) stamped by the access-token hook, and
 * enforce session-version revocation (S1). Returns null for no/invalid/revoked sessions.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (!hasSupabaseEnv) return null
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  let claims: AppClaims
  try {
    claims = parseAppClaims(decodeJwtPayload(session.access_token))
  } catch {
    // Unprovisioned user (no app_user / tenant) — no internal context.
    return null
  }

  // Session-version enforcement (S1): the token's version must match the DB.
  const { data } = await supabase
    .from('app_user')
    .select('session_version')
    .eq('id', user.id)
    .maybeSingle()
  const row = data as { session_version: number } | null
  if (!row || !isSessionCurrent(claims.session_version, row.session_version)) {
    return null
  }

  return {
    userId: claims.sub,
    tenantId: claims.tenant_id,
    branchRoles: claims.branch_roles,
    branchIds: claims.branch_roles.map((b) => b.branch_id),
    sessionVersion: claims.session_version,
    primaryRole: primaryRole(claims.branch_roles.map((b) => b.role)),
  }
}
