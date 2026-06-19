/**
 * Service-role (admin) Supabase client — DANGEROUS, SERVER-ONLY.
 *
 * The service-role key BYPASSES Row Level Security entirely. This client must NEVER be
 * imported into client-reachable code or used to serve a browser-originated request. Use it
 * only inside trusted server contexts: server jobs, Edge Functions, migrations, scheduled
 * tasks.
 *
 * Two guards enforce this:
 *   1. `import 'server-only'` — fails the build if this module is pulled into a client bundle.
 *   2. An ESLint import-boundary rule forbids importing this module outside `src/server` and
 *      `supabase/functions` (see eslint.config.mjs).
 *
 * No network connection is made at construction time.
 */
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '../../lib/env'

/** Build the service-role client. Reads the full server env (throws if the key is absent). */
export function createAdminClient(): SupabaseClient {
  const env = getServerEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
