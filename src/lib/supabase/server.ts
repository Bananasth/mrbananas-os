import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

/**
 * Server-side Supabase client bound to the request cookies (Next 15 — cookies() is async).
 * Runs under the authenticated user's JWT, so RLS applies as that user.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll can be called from a Server Component where cookies are read-only;
          // the middleware refresh handles writing in that case.
        }
      },
    },
  })
}
