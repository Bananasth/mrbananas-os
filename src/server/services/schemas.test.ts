import { describe, expect, it } from 'vitest'
import {
  CreateOrderSchema,
  CreateProductSchema,
  RecordCashPaymentSchema,
  ReceiveInventorySchema,
  UpsertBranchPriceSchema,
} from './schemas'

const UUID = '11111111-1111-1111-1111-111111111111'

describe('schemas — product catalog', () => {
  it('accepts a valid product', () => {
    const r = CreateProductSchema.safeParse({
      sku: 'LATTE',
      name: 'Latte',
      category: 'beverage',
      type: 'made_to_order',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown category', () => {
    const r = CreateProductSchema.safeParse({
      sku: 'X',
      name: 'X',
      category: 'snack',
      type: 'batch',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty sku', () => {
    expect(
      CreateProductSchema.safeParse({ sku: '', name: 'X', category: 'bakery', type: 'batch' })
        .success,
    ).toBe(false)
  })
})

describe('schemas — order creation', () => {
  it('defaults channel to pos and requires at least one item', () => {
    const r = CreateOrderSchema.safeParse({
      branchId: UUID,
      items: [{ productId: UUID, recipeVersionId: UUID, workstationId: UUID, qty: 2 }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.channel).toBe('pos')
  })

  it('rejects an empty basket', () => {
    expect(CreateOrderSchema.safeParse({ branchId: UUID, items: [] }).success).toBe(false)
  })

  it('rejects a non-positive qty', () => {
    expect(
      CreateOrderSchema.safeParse({
        branchId: UUID,
        items: [{ productId: UUID, recipeVersionId: UUID, workstationId: UUID, qty: 0 }],
      }).success,
    ).toBe(false)
  })
})

describe('schemas — receive inventory & pricing & payment', () => {
  it('requires a positive received qty', () => {
    expect(
      ReceiveInventorySchema.safeParse({ branchId: UUID, itemId: UUID, qty: -1, unit: 'kg' })
        .success,
    ).toBe(false)
  })

  it('allows a null price override', () => {
    const r = UpsertBranchPriceSchema.safeParse({
      branchId: UUID,
      productId: UUID,
      priceOverride: null,
    })
    expect(r.success).toBe(true)
  })

  it('requires a positive cash amount and idempotency key', () => {
    expect(
      RecordCashPaymentSchema.safeParse({
        orderId: UUID,
        branchId: UUID,
        amount: 0,
        clientUuid: UUID,
      }).success,
    ).toBe(false)
    expect(
      RecordCashPaymentSchema.safeParse({
        orderId: UUID,
        branchId: UUID,
        amount: 10000,
        clientUuid: UUID,
      }).success,
    ).toBe(true)
  })
})
