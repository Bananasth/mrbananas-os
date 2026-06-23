import { NextResponse } from "next/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { verifyHmacSignature } from "@/server/payments/verify";

// Needs node:crypto + the raw request body, so force the Node runtime and skip caching.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Payment provider webhook → settlement.
 *
 * Phase B: channel-agnostic. Verifies an HMAC-SHA256 signature over the raw body,
 * then calls the EXISTING anon-callable, secret-gated `public.qr_settle_payment`
 * RPC. No payment-core / settlement-SQL changes — idempotency, ledger, DLQ and
 * queue assignment all live inside that RPC.
 *
 * HTTP contract (per approved decision #3):
 *   200 — any business outcome from settlement (confirmed, duplicate_ignored,
 *         amount_mismatch, expired_rejected, *_failed). The provider should stop
 *         retrying; our settlement_ledger / DLQ own any follow-up.
 *   401 — bad/missing signature.   400 — malformed payload.   404 — unknown order.
 *   500 — our misconfiguration (missing env, or settlement secret mismatch).
 *   502 — settlement RPC unavailable (transport/DB) → provider may retry.
 */
export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const settlementSecret = process.env.PAYMENT_SETTLEMENT_SECRET;
  if (!webhookSecret || !settlementSecret) {
    console.error("[payments/webhook] missing WEBHOOK_SECRET or PAYMENT_SETTLEMENT_SECRET");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? req.headers.get("x-signature");
  if (!verifyHmacSignature(raw, signature, webhookSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const body = (parsed ?? {}) as Record<string, unknown>;

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  const trackingToken = typeof body.tracking_token === "string" ? body.tracking_token.trim() : "";
  const amount = typeof body.amount === "number" ? body.amount : NaN;

  if (!provider || !eventId || !UUID_RE.test(trackingToken) || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const db = createSupabasePublicClient();
  const { data, error } = await db.rpc("qr_settle_payment", {
    p_provider: provider,
    p_event_id: eventId,
    p_tracking_token: trackingToken,
    p_amount: amount,
    p_settlement_secret: settlementSecret,
  });

  if (error) {
    if (/not found/i.test(error.message)) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }
    console.error("[payments/webhook] settle rpc error:", error.message);
    return NextResponse.json({ error: "settlement_unavailable" }, { status: 502 });
  }

  const result = (data as { result?: string } | null)?.result ?? "unknown";

  // auth_failed means OUR PAYMENT_SETTLEMENT_SECRET ≠ the provider config row → system misconfig.
  if (result === "auth_failed") {
    console.error("[payments/webhook] auth_failed: PAYMENT_SETTLEMENT_SECRET does not match provider config");
    return NextResponse.json({ result }, { status: 500 });
  }

  // Every other settlement outcome is final → ack with 200.
  return NextResponse.json({ result }, { status: 200 });
}
