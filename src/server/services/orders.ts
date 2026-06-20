import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import { computeOrderTotals } from './money'
import {
  CompleteOrderSchema,
  type CompleteOrderInput,
  CreateOrderSchema,
  type CreateOrderInput,
} from './schemas'
import type { CreatedOrder, OrderItem, SalesOrder } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const
const WRITE_ROLES = ['owner', 'manager', 'staff'] as const

/**
 * Create a POS order: resolve each line's unit price (explicit, else the branch price),
 * compute VAT-inclusive totals, insert the sales_order header with those totals, then
 * insert the line items. NOTE: supabase-js has no multi-statement transaction, so a failure
 * after the header insert can leave an empty order (acceptable for MVP; documented).
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<Result<CreatedOrder, ServiceError>> {
  const gate = await getServiceContext(WRITE_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(CreateOrderSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const o = parsed.value
  const branchOk = ensureBranch(ctx, o.branchId)
  if (!branchOk.ok) return branchOk

  // Resolve prices: use explicit unitPrice, else the branch_product override.
  const needPrice = o.items.filter((i) => i.unitPrice === undefined).map((i) => i.productId)
  const priceByProduct = new Map<string, number | null>()
  if (needPrice.length > 0) {
    const { data, error } = await db
      .from('branch_product')
      .select('product_id, price_override')
      .eq('branch_id', o.branchId)
      .in('product_id', needPrice)
    if (error) return err(serviceError('db', error.message))
    for (const row of (data ?? []) as { product_id: string; price_override: number | null }[]) {
      priceByProduct.set(row.product_id, row.price_override)
    }
  }

  const resolved: { unitPrice: number; qty: number }[] = []
  for (const i of o.items) {
    const price = i.unitPrice ?? priceByProduct.get(i.productId) ?? null
    if (price === null || price === undefined) {
      return err(serviceError('validation', `No price for product ${i.productId} at this branch.`))
    }
    resolved.push({ unitPrice: price, qty: i.qty })
  }

  const totals = computeOrderTotals(resolved)

  const { data: orderRow, error: orderErr } = await db
    .from('sales_order')
    .insert({
      tenant_id: ctx.tenantId,
      branch_id: o.branchId,
      channel: o.channel,
      employee_id: o.employeeId ?? null,
      subtotal: totals.subtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
    })
    .select('*')
    .single()
  if (orderErr) return err(serviceError('db', orderErr.message))
  const order = orderRow as SalesOrder

  const itemRows = o.items.map((i, idx) => ({
    tenant_id: ctx.tenantId,
    branch_id: o.branchId,
    order_id: order.id,
    product_id: i.productId,
    recipe_version_id: i.recipeVersionId,
    workstation_id: i.workstationId,
    employee_id: o.employeeId ?? null,
    qty: i.qty,
    unit_price: resolved[idx]!.unitPrice,
    line_tax: totals.lines[idx]!.tax,
  }))
  const { data: items, error: itemsErr } = await db.from('order_item').insert(itemRows).select('*')
  if (itemsErr) return err(serviceError('db', itemsErr.message))

  return ok({ order, items: (items ?? []) as OrderItem[] })
}

/** Fetch an order with its line items. */
export async function getOrder(orderId: string): Promise<Result<CreatedOrder, ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data: order, error: oErr } = await db
    .from('sales_order')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()
  if (oErr) return err(serviceError('db', oErr.message))
  if (!order) return err(serviceError('not_found', 'Order not found.'))
  const { data: items, error: iErr } = await db
    .from('order_item')
    .select('*')
    .eq('order_id', orderId)
  if (iErr) return err(serviceError('db', iErr.message))
  return ok({ order: order as SalesOrder, items: (items ?? []) as OrderItem[] })
}

/** Mark an order completed (required before a tax invoice can be issued). */
export async function completeOrder(
  input: CompleteOrderInput,
): Promise<Result<SalesOrder, ServiceError>> {
  const gate = await getServiceContext(WRITE_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(CompleteOrderSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('sales_order')
    .update({ status: 'completed' })
    .eq('id', parsed.value.orderId)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as SalesOrder)
}
