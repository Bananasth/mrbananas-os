// Public Supabase config (RLS is the gate; these are safe to ship to the client).
// Set in .env.local (NEXT_PUBLIC_* are inlined at build time):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (preferred — the new sb_publishable_… key)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY         (legacy fallback)
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Whether Supabase is configured. When false, the app stays safe-closed (no crashes). */
export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_KEY);
