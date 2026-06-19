/**
 * User-scoped Supabase client.
 *
 * Created with the anon key and (optionally) the authenticated user's access token, so
 * every query runs UNDER Row Level Security as that user. This is the client used for all
 * user-facing reads/writes — RLS is the access authority, never the application alone.
 *
 * No network connection is made at construction time; the client connects lazily on first
 * query. Nothing here contacts a hosted project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getClientEnv } from '../../lib/env'

/**
 * Build a user-scoped client. Pass the caller's JWT so RLS policies evaluate against their
 * claims; omit it for anonymous (RLS still applies to the anon role).
 */
export function createUserClient(accessToken?: string): SupabaseClient {
  const env = getClientEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  })
}
