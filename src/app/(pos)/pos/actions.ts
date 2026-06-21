"use server";

import {
  type BomLine,
  completeOrder,
  createOrder,
  fulfilOrderResolved,
  getOptionResolutions,
  getRecipeIngredients,
  issueTaxInvoice,
  listBranchPricing,
  persistOrderItemIngredients,
  persistOrderItemModifiers,
  recordCashPayment,
  resolveBoM,
} from "@/server/services";

export type CheckoutLine = {
  productId: string;
  recipeVersionId: string;
  qty: number;
  /** Selected modifier option ids (empty = no modifiers). */
  optionIds: string[];
};
export type CheckoutInput = {
  branchId: string;
  workstationId: string;
  lines: CheckoutLine[];
};
export type CheckoutResult =
  | { ok: true; invoiceNo: number; total: number; orderId: string }
  | { ok: false; error: string; step: string };

const fail = (error: string, step: string): CheckoutResult => ({ ok: false, error, step });

/**
 * Cash checkout with modifiers. The server is authoritative: it re-resolves each line's price
 * (branch price + option price adjustments) and its effective BoM (base recipe + option
 * effects), creates the order, persists order_item_modifier + order_item_ingredient, then
 * deducts via fulfil_order_item_resolved (which falls back to the recipe when there are no
 * overrides). Not a single transaction — the failing step is reported.
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.lines?.length) return fail("ตะกร้าว่าง · Cart is empty", "validate");
  if (!input.workstationId) return fail("เลือกจุดทำงาน · Choose a workstation", "validate");

  const pricing = await listBranchPricing(input.branchId);
  if (!pricing.ok) return fail(pricing.error.message, "pricing");
  const priceByProduct = new Map(
    pricing.value
      .filter((bp) => bp.price_override !== null)
      .map((bp) => [bp.product_id, bp.price_override as number]),
  );

  type Resolved = {
    line: CheckoutLine;
    unitPrice: number;
    bom: BomLine[];
    mods: { optionId: string; optionName: string; priceAdjustment: number }[];
  };
  const resolved: Resolved[] = [];
  for (const line of input.lines) {
    const base = priceByProduct.get(line.productId);
    if (base == null) return fail(`ไม่มีราคาสินค้า · No price for product ${line.productId}`, "pricing");
    let unitPrice = base;
    let bom: BomLine[] = [];
    let mods: Resolved["mods"] = [];

    if (line.optionIds.length > 0) {
      const ingR = await getRecipeIngredients(line.recipeVersionId);
      if (!ingR.ok) return fail(ingR.error.message, "recipe");
      const optR = await getOptionResolutions(line.optionIds);
      if (!optR.ok) return fail(optR.error.message, "options");
      const baseBom = ingR.value.map((i) => ({ itemId: i.item_id, quantity: i.quantity, unit: i.unit }));
      bom = resolveBoM(baseBom, optR.value.flatMap((o) => o.effects));
      unitPrice = base + optR.value.reduce((s, o) => s + o.priceAdjustment, 0);
      mods = optR.value.map((o) => ({ optionId: o.id, optionName: o.name, priceAdjustment: o.priceAdjustment }));
    }
    resolved.push({ line, unitPrice, bom, mods });
  }

  const order = await createOrder({
    branchId: input.branchId,
    channel: "pos",
    items: resolved.map((r) => ({
      productId: r.line.productId,
      recipeVersionId: r.line.recipeVersionId,
      workstationId: input.workstationId,
      qty: r.line.qty,
      unitPrice: r.unitPrice,
    })),
  });
  if (!order.ok) return fail(order.error.message, "createOrder");
  const orderId = order.value.order.id;
  const total = order.value.order.total;
  const items = order.value.items; // insertion order matches `resolved`

  for (let i = 0; i < items.length; i++) {
    const r = resolved[i];
    const item = items[i];
    if (!r || !item) continue;
    if (r.mods.length > 0) {
      const m = await persistOrderItemModifiers(item.id, input.branchId, r.mods);
      if (!m.ok) return fail(m.error.message, "save-modifiers");
    }
    if (r.bom.length > 0) {
      const b = await persistOrderItemIngredients(item.id, input.branchId, r.bom);
      if (!b.ok) return fail(b.error.message, "save-bom");
    }
  }

  const ful = await fulfilOrderResolved({ orderId });
  if (!ful.ok) return fail(ful.error.message, "fulfil");

  const pay = await recordCashPayment({
    orderId,
    branchId: input.branchId,
    amount: total,
    clientUuid: crypto.randomUUID(),
  });
  if (!pay.ok) return fail(pay.error.message, "payment");

  const done = await completeOrder({ orderId });
  if (!done.ok) return fail(done.error.message, "complete");

  const inv = await issueTaxInvoice({ orderId });
  if (!inv.ok) return fail(inv.error.message, "invoice");

  return { ok: true, invoiceNo: inv.value.invoice_no, total: inv.value.total, orderId };
}
