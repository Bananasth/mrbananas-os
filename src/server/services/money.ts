/**
 * Money and VAT math for MR.BANANA'S OS.
 *
 * - All money is INTEGER MINOR UNITS (satang; ฿1 = 100). No floats stored.
 * - Menu prices are VAT-INCLUSIVE (Thai retail convention): the displayed price the
 *   customer pays already contains 7% VAT. Subtotal (ex-VAT) and the VAT amount are
 *   extracted from the inclusive gross, so the invoice's subtotal + vat == total exactly.
 *
 * Pure functions — no I/O — so this is the unit-tested heart of the sales math.
 */

/** Thailand VAT rate (locked product decision). */
export const VAT_RATE = 0.07

export type OrderLineInput = {
  /** Per-unit, VAT-inclusive price in minor units (satang). */
  readonly unitPrice: number
  /** Quantity (may be fractional for weighed goods). */
  readonly qty: number
}

export type OrderLineAmounts = {
  /** unitPrice * qty, rounded to whole minor units. */
  readonly gross: number
  /** VAT portion extracted from the inclusive gross. */
  readonly tax: number
}

export type OrderTotals = {
  /** Ex-VAT amount = total - taxTotal. */
  readonly subtotal: number
  /** Sum of per-line VAT. */
  readonly taxTotal: number
  /** VAT-inclusive amount the customer pays. */
  readonly total: number
  readonly lines: readonly OrderLineAmounts[]
}

/** Line gross (VAT-inclusive), in whole minor units. */
export function lineGross(unitPrice: number, qty: number): number {
  return Math.round(unitPrice * qty)
}

/** The VAT portion contained within a VAT-inclusive gross amount. */
export function vatFromInclusive(gross: number): number {
  return gross - Math.round(gross / (1 + VAT_RATE))
}

/**
 * Compute order totals from VAT-inclusive line prices. taxTotal is summed per line and
 * subtotal is derived as (total - taxTotal), guaranteeing subtotal + taxTotal === total.
 */
export function computeOrderTotals(items: readonly OrderLineInput[]): OrderTotals {
  const lines = items.map((i) => {
    const gross = lineGross(i.unitPrice, i.qty)
    return { gross, tax: vatFromInclusive(gross) }
  })
  const total = lines.reduce((sum, l) => sum + l.gross, 0)
  const taxTotal = lines.reduce((sum, l) => sum + l.tax, 0)
  return { subtotal: total - taxTotal, taxTotal, total, lines }
}
