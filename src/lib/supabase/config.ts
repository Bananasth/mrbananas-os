// Public Supabase config — the anon key is designed to ship to the client (RLS is the gate).
// Set these in .env.local (NEXT_PUBLIC_* are inlined at build time):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** Whether Supabase is configured. When false, the app stays safe-closed (no crashes). */
export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
