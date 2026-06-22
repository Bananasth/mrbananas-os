import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/**
 * Anonymous Supabase client with NO session (no cookies). Requests run as the `anon` role,
 * which is exactly what the public QR RPCs (qr_menu / qr_create_pending_order /
 * qr_confirm_payment / qr_order_status) expect — they are SECURITY DEFINER and gate on the
 * QR slug, never on a logged-in user.
 */
export function createSupabasePublicClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: { getAll() { return []; }, setAll() {} },
  });
}
