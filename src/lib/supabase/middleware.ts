import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseEnv } from './config'

/**
 * Refresh the auth session on every request (token rotation) and surface the user.
 * Returns the response to send (with refreshed cookies) plus the current user.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Safe-closed when unconfigured: no user -> protected routes redirect to login.
  if (!hasSupabaseEnv) return { response, user: null }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, user }
}
