/**
 * Service-layer authorization helpers and the shared error shape.
 *
 * RLS in the database is the real access authority; these checks are defense-in-depth that
 * fail fast with a clear error before a query is even issued. Pure logic — no I/O, no
 * `server-only` — so it is unit-testable.
 */
import type { BranchRole, RoleKey } from '@/server/auth/claims'

export type ServiceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'db'

export type ServiceError = {
  readonly code: ServiceErrorCode
  readonly message: string
  readonly details?: unknown
}

export const serviceError = (
  code: ServiceErrorCode,
  message: string,
  details?: unknown,
): ServiceError => ({ code, message, details })

/** True if the user holds any of `allowed` at any branch. */
export function isRoleAllowed(
  branchRoles: readonly BranchRole[],
  allowed: readonly RoleKey[],
): boolean {
  return branchRoles.some((br) => allowed.includes(br.role))
}

/** True if the user holds any of `allowed` AT the given branch. */
export function hasBranchRole(
  branchRoles: readonly BranchRole[],
  branchId: string,
  allowed: readonly RoleKey[],
): boolean {
  return branchRoles.some((br) => br.branch_id === branchId && allowed.includes(br.role))
}
