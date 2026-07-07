import { NextResponse } from "next/server";
import { issueTaxInvoice } from "@/server/services/invoices";
import { getReceiptModel, onlineReceiptPath } from "@/server/services/receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { orderId } — ensure the tax invoice is issued (reuses issue_tax_invoice), then return the
 * receipt summary + online path. An already-invoiced order is fine: issueTaxInvoice returns an
 * error Result which we ignore, then we read the existing invoice. Authed via RLS in the services.
 * No POS/DB changes.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const orderId = (body as { orderId?: string } | null)?.orderId;
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  // Best-effort issuance (reuses the existing primitive); unique invoice_id prevents duplicates.
  await issueTaxInvoice({ orderId });

  const res = await getReceiptModel(orderId);
  if (!res.ok) {
    const status =
      res.error.code === "unauthorized" ? 401 :
      res.error.code === "forbidden" ? 403 :
      res.error.code === "not_found" ? 404 : 500;
    return NextResponse.json({ error: res.error.code, message: res.error.message }, { status });
  }
  return NextResponse.json({
    ok: true,
    orderId,
    invoiceNo: res.value.invoice?.invoiceNo ?? null,
    onlinePath: onlineReceiptPath(orderId),
  });
}
