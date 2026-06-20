import { describe, expect, it } from 'vitest'
import { VAT_RATE, computeOrderTotals, lineGross, vatFromInclusive } from './money'

describe('money — VAT-inclusive extraction (Thailand 7%)', () => {
  it('VAT_RATE is 7%', () => {
    expect(VAT_RATE).toBe(0.07)
  })

  it('extracts 7 from an inclusive 107', () => {
    expect(vatFromInclusive(107)).toBe(7)
  })

  it('rounds the extracted VAT to whole minor units', () => {
    // 10000 / 1.07 = 9345.79… -> subtotal 9346, vat 654
    expect(vatFromInclusive(10000)).toBe(654)
  })

  it('lineGross multiplies and rounds to whole minor units', () => {
    expect(lineGross(10000, 1)).toBe(10000)
    expect(lineGross(5000, 2)).toBe(10000)
    expect(lineGross(333, 1.5)).toBe(500) // 499.5 -> 500
  })
})

describe('money — computeOrderTotals', () => {
  it('is empty-safe', () => {
    expect(computeOrderTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0, lines: [] })
  })

  it('single line: subtotal + tax === total', () => {
    const t = computeOrderTotals([{ unitPrice: 10000, qty: 1 }])
    expect(t.total).toBe(10000)
    expect(t.taxTotal).toBe(654)
    expect(t.subtotal).toBe(9346)
    expect(t.subtotal + t.taxTotal).toBe(t.total)
  })

  it('multi-line totals sum per line and stay internally consistent', () => {
    const t = computeOrderTotals([
      { unitPrice: 10000, qty: 1 },
      { unitPrice: 5000, qty: 2 },
    ])
    expect(t.total).toBe(20000)
    expect(t.taxTotal).toBe(1308) // 654 + 654
    expect(t.subtotal).toBe(18692)
    expect(t.subtotal + t.taxTotal).toBe(t.total)
    expect(t.lines).toHaveLength(2)
    expect(t.lines[0]).toEqual({ gross: 10000, tax: 654 })
  })

  it('invariant: subtotal + taxTotal === total for arbitrary baskets', () => {
    const t = computeOrderTotals([
      { unitPrice: 4500, qty: 3 },
      { unitPrice: 199, qty: 7 },
      { unitPrice: 12345, qty: 1 },
    ])
    expect(t.subtotal + t.taxTotal).toBe(t.total)
  })
})
