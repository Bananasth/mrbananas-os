/**
 * Row shapes returned by the service layer (mirror the public.* tables / views).
 * Money fields are integer minor units (satang); timestamps are ISO strings.
 */
import type { RoleKey } from '@/server/auth/claims'

export type ProductCategory = 'beverage' | 'bakery'
export type ProductType = 'made_to_order' | 'batch'

export type Product = {
  id: string
  tenant_id: string
  inventory_item_id: string | null
  sku: string
  name: string
  category: ProductCategory
  type: ProductType
  is_active: boolean
  created_at: string
  updated_at: string
}

export type BranchProduct = {
  id: string
  tenant_id: string
  branch_id: string
  product_id: string
  price_override: number | null
  is_available: boolean
  menu_section: string | null
  created_at: string
  updated_at: string
}

export type Recipe = {
  id: string
  tenant_id: string
  product_id: string
  name: string
  created_at: string
  updated_at: string
}

export type RecipeVersionStatus = 'draft' | 'active' | 'retired'

export type RecipeVersion = {
  id: string
  tenant_id: string
  recipe_id: string
  version_no: number
  status: RecipeVersionStatus
  shelf_life_hours: number | null
  yield_qty: number | null
  effective_from: string | null
  created_at: string
  updated_at: string
}

export type RecipeIngredient = {
  id: string
  tenant_id: string
  recipe_version_id: string
  item_id: string
  quantity: number
  unit: string
  created_at: string
  updated_at: string
}

export type StockOnHand = {
  tenant_id: string
  branch_id: string
  item_id: string
  qty_available: number
}

export type OrderChannel = 'pos' | 'qr'
export type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export type SalesOrder = {
  id: string
  tenant_id: string
  branch_id: string
  employee_id: string | null
  channel: OrderChannel
  status: OrderStatus
  subtotal: number
  tax_total: number
  total: number
  invoice_id: string | null
  created_at: string
  updated_at: string
}

export type OrderItem = {
  id: string
  tenant_id: string
  branch_id: string
  order_id: string
  product_id: string
  recipe_version_id: string
  workstation_id: string
  employee_id: string | null
  batch_id: string | null
  qty: number
  unit_price: number
  line_tax: number
  status: 'queued' | 'making' | 'ready' | 'served'
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'cash' | 'card' | 'qr' | 'other'
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'voided'

export type Payment = {
  id: string
  tenant_id: string
  branch_id: string
  order_id: string
  method: PaymentMethod
  amount: number
  status: PaymentStatus
  gateway_ref: string | null
  client_uuid: string
  employee_id: string | null
  created_at: string
  updated_at: string
}

export type TaxInvoice = {
  id: string
  tenant_id: string
  branch_id: string
  order_id: string
  invoice_no: number
  series: 'invoice' | 'credit_note'
  sale_occurred_at: string
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
  issued_at: string
  created_at: string
}

/** An order with its computed totals and freshly inserted line items. */
export type CreatedOrder = {
  order: SalesOrder
  items: OrderItem[]
}

/** Re-export for convenience at call sites. */
export type { RoleKey }
