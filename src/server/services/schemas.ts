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

export const UpdateProductSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).max(200).optional(),
    sku: z.string().min(1).max(64).optional(),
    category: z.enum(['beverage', 'bakery']).optional(),
  })
  .refine((v) => v.name !== undefined || v.sku !== undefined || v.category !== undefined, {
    message: 'nothing to update',
  })
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>

export const DeleteProductSchema = z.object({ id: uuid })
export type DeleteProductInput = z.infer<typeof DeleteProductSchema>

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

export const UpdateRecipeSchema = z.object({ id: uuid, name: z.string().min(1).max(200) })
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeSchema>

export const DeleteRecipeSchema = z.object({ id: uuid })
export type DeleteRecipeInput = z.infer<typeof DeleteRecipeSchema>

export const UpdateRecipeVersionSchema = z
  .object({
    id: uuid,
    shelfLifeHours: z.number().int().nonnegative().nullable().optional(),
    yieldQty: positiveQty.nullable().optional(),
  })
  .refine((v) => v.shelfLifeHours !== undefined || v.yieldQty !== undefined, {
    message: 'nothing to update',
  })
export type UpdateRecipeVersionInput = z.infer<typeof UpdateRecipeVersionSchema>

export const RetireVersionSchema = z.object({ id: uuid })
export type RetireVersionInput = z.infer<typeof RetireVersionSchema>

export const DeleteRecipeVersionSchema = z.object({ id: uuid })
export type DeleteRecipeVersionInput = z.infer<typeof DeleteRecipeVersionSchema>

// 4. Inventory stock on hand --------------------------------------------------------------
export const StockOnHandSchema = z.object({
  branchId: uuid,
  itemId: uuid.optional(),
})
export type StockOnHandInput = z.infer<typeof StockOnHandSchema>

// 4b. Create inventory item (item_type + canonical name/sku on inventory_item) ------------
const itemType = z.enum(['RM', 'SF', 'PK', 'FG', 'MD', 'SV'])

export const CreateInventoryItemSchema = z
  .object({
    itemType,
    name: z.string().min(1).max(200),
    baseUnit: z.string().min(1).max(32),
    /** When true the SKU is allocated server-side at create; sku is ignored. */
    autoSku: z.boolean().default(false),
    sku: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.autoSku || !!v.sku, {
    message: 'SKU is required (or enable auto)',
    path: ['sku'],
  })
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>

export const GenerateSkuSchema = z.object({ itemType })
export type GenerateSkuInput = z.infer<typeof GenerateSkuSchema>

// 4c. Update / delete inventory item ------------------------------------------------------
export const UpdateInventoryItemSchema = z
  .object({
    id: uuid,
    itemType: itemType.optional(),
    baseUnit: z.string().min(1).max(32).optional(),
    name: z.string().min(1).max(200).optional(),
    sku: z.string().min(1).max(64).optional(),
  })
  .refine(
    (v) =>
      v.itemType !== undefined ||
      v.baseUnit !== undefined ||
      v.name !== undefined ||
      v.sku !== undefined,
    { message: 'nothing to update' },
  )
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>

export const DeleteInventoryItemSchema = z.object({ id: uuid })
export type DeleteInventoryItemInput = z.infer<typeof DeleteInventoryItemSchema>

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

// 10. Modifiers ---------------------------------------------------------------------------
export const CreateModifierGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  isRequired: z.boolean().optional(),
  selectionType: z.enum(['single', 'multiple']).optional(),
  displayType: z.enum(['radio', 'checkbox', 'button', 'dropdown']).optional(),
  minSelect: z.number().int().nonnegative().optional(),
  maxSelect: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})
export type CreateModifierGroupInput = z.infer<typeof CreateModifierGroupSchema>
export const UpdateModifierGroupSchema = CreateModifierGroupSchema.partial().extend({ id: uuid })
export type UpdateModifierGroupInput = z.infer<typeof UpdateModifierGroupSchema>
export const DeleteModifierGroupSchema = z.object({ id: uuid })
export type DeleteModifierGroupInput = z.infer<typeof DeleteModifierGroupSchema>

export const CreateModifierOptionSchema = z.object({
  groupId: uuid,
  name: z.string().min(1).max(120),
  code: z.string().max(64).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  priceAdjustment: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
export type CreateModifierOptionInput = z.infer<typeof CreateModifierOptionSchema>
export const UpdateModifierOptionSchema = CreateModifierOptionSchema.omit({ groupId: true })
  .partial()
  .extend({ id: uuid })
export type UpdateModifierOptionInput = z.infer<typeof UpdateModifierOptionSchema>
export const DeleteModifierOptionSchema = z.object({ id: uuid })
export type DeleteModifierOptionInput = z.infer<typeof DeleteModifierOptionSchema>

export const CreateModifierEffectSchema = z
  .object({
    modifierOptionId: uuid,
    effectType: z.enum(['add', 'replace', 'set_qty', 'none']),
    targetItemId: uuid.nullable().optional(),
    newItemId: uuid.nullable().optional(),
    quantity: z.number().nonnegative().nullable().optional(),
    unit: z.string().max(32).nullable().optional(),
  })
  .refine((v) => v.effectType === 'none' || (!!v.targetItemId && v.quantity != null), {
    message: 'target item + quantity are required (unless effect_type is none)',
    path: ['targetItemId'],
  })
  .refine((v) => v.effectType !== 'replace' || !!v.newItemId, {
    message: 'new item is required for replace',
    path: ['newItemId'],
  })
export type CreateModifierEffectInput = z.infer<typeof CreateModifierEffectSchema>
export const DeleteModifierEffectSchema = z.object({ id: uuid })
export type DeleteModifierEffectInput = z.infer<typeof DeleteModifierEffectSchema>

export const AssignProductModifierGroupSchema = z.object({
  productId: uuid,
  modifierGroupId: uuid,
  sortOrder: z.number().int().optional(),
})
export type AssignProductModifierGroupInput = z.infer<typeof AssignProductModifierGroupSchema>
export const UnassignProductModifierGroupSchema = z.object({
  productId: uuid,
  modifierGroupId: uuid,
})
export type UnassignProductModifierGroupInput = z.infer<typeof UnassignProductModifierGroupSchema>

// 11. Stock adjustment / waste / movement history -----------------------------------------
export const AdjustStockSchema = z.object({
  lotId: uuid,
  newQty: z.number().nonnegative(),
  reason: z.string().min(1).max(300),
})
export type AdjustStockInput = z.infer<typeof AdjustStockSchema>

export const RecordWasteSchema = z.object({
  lotId: uuid,
  qty: positiveQty,
  reason: z.string().min(1).max(300),
})
export type RecordWasteInput = z.infer<typeof RecordWasteSchema>

export const MovementsQuerySchema = z.object({ branchId: uuid, itemId: uuid.optional() })
export type MovementsQueryInput = z.infer<typeof MovementsQuerySchema>
