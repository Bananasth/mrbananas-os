/**
 * Validated environment access.
 *
 * Env is parsed through zod schemas so a missing/invalid variable fails loudly and early
 * instead of surfacing as an undefined at runtime. Parsing is split into a pure function
 * (`parseClientEnv` / `parseServerEnv`) so it can be unit-tested with mock inputs — no real
 * environment or secrets required — and lazy getters that read `process.env` in real use.
 *
 * Client vs server split mirrors the security boundary: the service-role key is part of the
 * SERVER schema only and must never be read in a client context.
 */
import { z } from 'zod'

const ClientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const ServerEnvSchema = ClientEnvSchema.extend({
  // Service-role key bypasses RLS — server-only. See src/server/db/admin.ts.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export type ClientEnv = z.infer<typeof ClientEnvSchema>
export type ServerEnv = z.infer<typeof ServerEnvSchema>

/** Parse the client-safe environment from an arbitrary source (pure; throws on invalid). */
export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  return ClientEnvSchema.parse(source)
}

/** Parse the full server environment from an arbitrary source (pure; throws on invalid). */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return ServerEnvSchema.parse(source)
}

/** Read and validate the client-safe environment from `process.env`. */
export const getClientEnv = (): ClientEnv => parseClientEnv(process.env)

/** Read and validate the full server environment from `process.env`. */
export const getServerEnv = (): ServerEnv => parseServerEnv(process.env)
