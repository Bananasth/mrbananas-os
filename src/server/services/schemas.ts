/**
 * Zod input schemas for every service-layer call. Pure (no I/O) so they are unit-testable
 * and shared between the service functions and any future UI/server-action callers.
 *
 * Money inputs are integer minor units (satang). UUIDs are validated. These guard the
 * boundary; the database (constraints + RLS) remains the final authority.
 */
import { z } from 'zod'

const uuid = z.string().uuid()
const money = z.number().int().nonnegative() // minor units (satang)
const positiveQty = z.number().positive()

// 1. Product catalog ----------------------------------------------------------------------
export const CreateProductSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  category: z.enum(['beverage', 'bakery']),
  type: z.enum(['made_to_order', 'batch']),
  inventoryItemId: uuid.nullable().optional(),
})
export type CreateProductInput = z.infer<typeof CreateProductSchema>

export const SetProductActiveSchema = z.object({
  productId: uuid,
  isActive: z.boolean(),
})
export type SetProductActiveInput = z.infer<typeof SetProductActiveSchema>

// 2. Branch product pricing ---------------------------------------------------------------
export const UpsertBranchPriceSchema = z.object({
  branchId: uuid,
  productId: uuid,
  priceOverride: money.nullable(),
  isAvailable: z.boolean().optional(),
  menuSection: z.string().max(64).nullable().optional(),
})
export type UpsertBranchPriceInput = z.infer<typeof UpsertBranchPriceSchema>

// 3. Recipe / recipe versions -------------------------------------------------------------
export const CreateRecipeSchema = z.object({
  productId: uuid,
  name: z.string().min(1).max(200),
})
export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>

export const CreateDraftVersionSchema = z.object({
  recipeId: uuid,
  versionNo: z.number().int().positive(),
  shelfLifeHours: z.number().int().nonnegative().nullable().optional(),
  yieldQty: positiveQty.nullable().optional(),
})
export type CreateDraftVersionInput = z.infer<typeof CreateDraftVersionSchema>

export const AddIngredientSchema = z.object({
  recipeVersionId: uuid,
  itemId: uuid,
  quantity: positiveQty,
  unit: z.string().min(1).max(32),
})
export type AddIngredientInput = z.infer<typeof AddIngredientSchema>

export const ActivateVersionSchema = z.object({ recipeVersionId: uuid })
export type ActivateVersionInput = z.infer<typeof ActivateVersionSchema>

// 4. Inventory stock on hand --------------------------------------------------------------
export const StockOnHandSchema = z.object({
  branchId: uuid,
  itemId: uuid.optional(),
})
export type StockOnHandInput = z.infer<typeof StockOnHandSchema>

// 5. Receive inventory --------------------------------------------------------------------
export const ReceiveInventorySchema = z.object({
  branchId: uuid,
  itemId: uuid,
  qty: positiveQty,
  unit: z.string().min(1).max(32),
  expiresAt: z.string().datetime().nullable().optional(),
  employeeId: uuid.nullable().optional(),
  refType: z.string().max(40).nullable().optional(),
  refId: uuid.nullable().optional(),
})
export type ReceiveInventoryInput = z.infer<typeof ReceiveInventorySchema>

// 6. POS order creation -------------------------------------------------------------------
export const OrderItemInputSchema = z.object({
  productId: uuid,
  recipeVersionId: uuid,
  workstationId: uuid,
  qty: positiveQty,
  /** Optional explicit per-unit price; if omitted, the branch price is used. */
  unitPrice: money.optional(),
})
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>

export const CreateOrderSchema = z.object({
  branchId: uuid,
  channel: z.enum(['pos', 'qr']).default('pos'),
  employeeId: uuid.nullable().optional(),
  items: z.array(OrderItemInputSchema).min(1),
})
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>

export const CompleteOrderSchema = z.object({ orderId: uuid })
export type CompleteOrderInput = z.infer<typeof CompleteOrderSchema>

// 7. Cash payment -------------------------------------------------------------------------
export const RecordCashPaymentSchema = z.object({
  orderId: uuid,
  branchId: uuid,
  amount: money.refine((n) => n > 0, 'amount must be > 0'),
  clientUuid: uuid,
  employeeId: uuid.nullable().optional(),
})
export type RecordCashPaymentInput = z.infer<typeof RecordCashPaymentSchema>

// 8. Tax invoice issuance -----------------------------------------------------------------
export const IssueInvoiceSchema = z.object({
  orderId: uuid,
  saleOccurredAt: z.string().datetime().nullable().optional(),
})
export type IssueInvoiceInput = z.infer<typeof IssueInvoiceSchema>

// 9. Order fulfillment / FEFO -------------------------------------------------------------
export const FulfilItemSchema = z.object({
  orderItemId: uuid,
  employeeId: uuid.nullable().optional(),
})
export type FulfilItemInput = z.infer<typeof FulfilItemSchema>

export const FulfilOrderSchema = z.object({
  orderId: uuid,
  employeeId: uuid.nullable().optional(),
})
export type FulfilOrderInput = z.infer<typeof FulfilOrderSchema>
