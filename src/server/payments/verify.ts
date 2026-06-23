import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an HMAC-SHA256 webhook signature against the RAW request body.
 *
 * The signature is the hex digest of HMAC-SHA256(rawBody, secret), optionally
 * prefixed with "sha256=". Comparison is constant-time. Returns false on any
 * malformed / missing input rather than throwing — the caller maps that to 401.
 */
export function verifyHmacSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // timingSafeEqual throws on unequal-length buffers, so length-guard first.
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
