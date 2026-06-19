/**
 * Shape of the application JWT claims.
 *
 * Claims are tenant-safe (a required `tenant_id`) and branch-safe (every entry in
 * `branch_roles` pins a `branch_id` to one of the approved roles). `session_version` is
 * embedded so each request can be checked against the user's current value for revocation
 * (see session-version.ts).
 *
 * This module is pure types + validation — no Supabase Auth integration, no I/O.
 */
import { z } from 'zod'

/** The approved role model — exactly these five. */
export const RoleKeySchema = z.enum(['owner', 'manager', 'staff', 'baker', 'customer'])
export type RoleKey = z.infer<typeof RoleKeySchema>

export const BranchRoleSchema = z.object({
  branch_id: z.string().uuid(),
  role: RoleKeySchema,
})
export type BranchRole = z.infer<typeof BranchRoleSchema>

export const AppClaimsSchema = z.object({
  sub: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_roles: z.array(BranchRoleSchema),
  session_version: z.number().int().nonnegative(),
})
export type AppClaims = z.infer<typeof AppClaimsSchema>

/** Validate and narrow an untrusted claims object (throws on invalid). */
export function parseAppClaims(source: unknown): AppClaims {
  return AppClaimsSchema.parse(source)
}
