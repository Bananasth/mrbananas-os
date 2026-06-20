import 'server-only'
import type { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { RoleKey } from '@/server/auth/claims'
import { type AuthContext, getAuthContext } from '@/server/auth/context'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, isRoleAllowed, serviceError } from './roles'

/** The user-scoped Supabase client — every query runs UNDER RLS as the logged-in user. */
export type ServerDb = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type ServiceSession = { ctx: AuthContext; db: ServerDb }

/**
 * Resolve the auth context (tenant_id + branch_roles from the validated JWT), enforce that
 * the caller holds one of `allowed`, and hand back a user-scoped DB client. RLS is still the
 * real authority; this is a fast, clear pre-check. Returns a Result (never redirects).
 */
export async function getServiceContext(
  allowed: readonly RoleKey[],
): Promise<Result<ServiceSession, ServiceError>> {
  const ctx = await getAuthContext()
  if (!ctx) return err(serviceError('unauthorized', 'Not authenticated.'))
  if (!isRoleAllowed(ctx.branchRoles, allowed)) {
    return err(serviceError('forbidden', `Requires one of: ${allowed.join(', ')}.`))
  }
  const db = await createSupabaseServerClient()
  return ok({ ctx, db })
}

/** Validate input against a Zod schema, returning a typed Result. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): Result<T, ServiceError> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return err(serviceError('validation', 'Invalid input.', parsed.error.flatten()))
  }
  return ok(parsed.data)
}

/** Ensure the branch is in the caller's context — a clear error before RLS would reject. */
export function ensureBranch(ctx: AuthContext, branchId: string): Result<true, ServiceError> {
  if (!ctx.branchIds.includes(branchId)) {
    return err(serviceError('forbidden', 'Branch is not in your context.'))
  }
  return ok(true)
}
