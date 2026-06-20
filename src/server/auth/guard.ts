import 'server-only'
import { redirect } from 'next/navigation'
import type { RoleKey } from './claims'
import { type AuthContext, getAuthContext } from './context'
import { defaultRouteForRole } from './routing'

/** Require an authenticated, provisioned, non-revoked session — else redirect to login. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  return ctx
}

/** Require the user to hold one of the given roles at any branch — else send them to their home. */
export async function requireRole(roles: readonly RoleKey[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  const allowed = ctx.branchRoles.some((br) => roles.includes(br.role))
  if (!allowed) redirect(defaultRouteForRole(ctx.primaryRole))
  return ctx
}
