"use server";

import {
  completeOrder,
  createOrder,
  fulfilOrder,
  issueTaxInvoice,
  recordCashPayment,
} from "@/server/services";

export type CheckoutLine = {
  productId: string;
  recipeVersionId: string;
  unitPrice: number;
  qty: number;
};
export type CheckoutInput = {
  branchId: string;
  workstationId: string;
  lines: CheckoutLine[];
};
export type CheckoutResult =
  | { ok: true; invoiceNo: number; total: number; orderId: string }
  | { ok: false; error: string; step: string };

/**
 * Ring up a cash sale end-to-end through the Phase 2 services:
 *   create order -> FEFO fulfil (deduct stock; fails early if short) -> cash payment
 *   -> complete -> issue tax invoice.
 * Not a single DB transaction (supabase-js limitation): on a mid-step failure the order
 * exists but is not completed/invoiced — recoverable. The step is returned for diagnosis.
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.lines?.length) {
    return { ok: false, error: "ตะกร้าว่าง · Cart is empty", step: "validate" };
  }
  if (!input.workstationId) {
    return { ok: false, error: "เลือกจุดทำงาน · Choose a workstation", step: "validate" };
  }

  const order = await createOrder({
    branchId: input.branchId,
    channel: "pos",
    items: input.lines.map((l) => ({
      productId: l.productId,
      recipeVersionId: l.recipeVersionId,
      workstationId: input.workstationId,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
  });
  if (!order.ok) return { ok: false, error: order.error.message, step: "createOrder" };
  const orderId = order.value.order.id;
  const total = order.value.order.total;

  const fulfil = await fulfilOrder({ orderId });
  if (!fulfil.ok) return { ok: false, error: fulfil.error.message, step: "fulfil" };

  const pay = await recordCashPayment({
    orderId,
    branchId: input.branchId,
    amount: total,
    clientUuid: crypto.randomUUID(),
  });
  if (!pay.ok) return { ok: false, error: pay.error.message, step: "payment" };

  const done = await completeOrder({ orderId });
  if (!done.ok) return { ok: false, error: done.error.message, step: "complete" };

  const inv = await issueTaxInvoice({ orderId });
  if (!inv.ok) return { ok: false, error: inv.error.message, step: "invoice" };

  return { ok: true, invoiceNo: inv.value.invoice_no, total: inv.value.total, orderId };
}
