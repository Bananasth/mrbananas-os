import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext } from './context'

/**
 * Sales read service for /admin/sales (Phase E). RLS-scoped reads over the sales-1 read layer:
 *   get_sales_summary() RPC  → KPI cards
 *   sales_list view          → history table
 *   top_products view        → Top Products card (aggregated per product here)
 * Read-only. Same pattern as the rest of the service layer: run as the logged-in user, Result.
 */
const SALES_ROLES = ['owner', 'manager'] as const

export type SalesFilters = {
  branchId?: string | null
  from?: string | null // inclusive (ISO timestamp)
  to?: string | null // exclusive (ISO timestamp)
  channel?: string | null
  paymentMethod?: string | null
}

export type SalesSummary = {
  orderCount: number
  grossTotal: number // satang, VAT-inclusive
  taxTotal: number
  netTotal: number
  avgOrderValue: number // satang
}

export type SalesRow = {
  orderId: string
  saleDatetime: string
  channel: string
  grossTotal: number
  taxTotal: number
  netTotal: number
  primaryPaymentMethod: string
  paymentCount: number
  invoiceNo: string | null
}

export type TopProduct = {
  productId: string
  name: string
  qtySold: number
  revenue: number // satang, incl VAT
}

type SummaryRow = {
  order_count: number
  gross_total: number
  tax_total: number
  net_total: number
  avg_order_value: number
}

/** Aggregated KPI totals for the filtered window (get_sales_summary RPC). */
export async function getSalesSummary(f: SalesFilters): Promise<Result<SalesSummary, ServiceError>> {
  const gate = await getServiceContext(SALES_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db.rpc('get_sales_summary', {
    p_branch_id: f.branchId ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_channel: f.channel ?? null,
    p_payment_method: f.paymentMethod ?? null,
  })
  if (error) return err(serviceError('db', error.message))
  const row = ((data as SummaryRow[] | null) ?? [])[0]
  return ok({
    orderCount: Number(row?.order_count ?? 0),
    grossTotal: Number(row?.gross_total ?? 0),
    taxTotal: Number(row?.tax_total ?? 0),
    netTotal: Number(row?.net_total ?? 0),
    avgOrderValue: Number(row?.avg_order_value ?? 0),
  })
}

type RawSaleRow = {
  order_id: string
  sale_datetime: string
  channel: string
  gross_total: number
  tax_total: number
  net_total: number
  primary_payment_method: string
  payment_count: number
  invoice_no: string | null
}

/** Sales history rows (sales_list view), newest first, paginated. */
export async function listSales(
  f: SalesFilters & { limit?: number; offset?: number },
): Promise<Result<SalesRow[], ServiceError>> {
  const gate = await getServiceContext(SALES_ROLES)
  if (!gate.ok) return gate
  const limit = f.limit ?? 50
  const offset = f.offset ?? 0
  let q = gate.value.db
    .from('sales_list')
    .select('*')
    .order('sale_datetime', { ascending: false })
    .range(offset, offset + limit - 1)
  if (f.branchId) q = q.eq('branch_id', f.branchId)
  if (f.from) q = q.gte('sale_datetime', f.from)
  if (f.to) q = q.lt('sale_datetime', f.to)
  if (f.channel) q = q.eq('channel', f.channel)
  if (f.paymentMethod) q = q.eq('primary_payment_method', f.paymentMethod)
  const { data, error } = await q
  if (error) return err(serviceError('db', error.message))
  return ok(
    ((data as RawSaleRow[] | null) ?? []).map((r) => ({
      orderId: r.order_id,
      saleDatetime: r.sale_datetime,
      channel: r.channel,
      grossTotal: Number(r.gross_total),
      taxTotal: Number(r.tax_total),
      netTotal: Number(r.net_total),
      primaryPaymentMethod: r.primary_payment_method,
      paymentCount: Number(r.payment_count),
      invoiceNo: r.invoice_no,
    })),
  )
}

type RawLineRow = { product_id: string; qty: number; line_revenue: number }

/** Top products by revenue over the window (aggregates the line-grain top_products view). */
export async function getTopProducts(
  f: SalesFilters & { limit?: number },
): Promise<Result<TopProduct[], ServiceError>> {
  const gate = await getServiceContext(SALES_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  let q = db.from('top_products').select('product_id, qty, line_revenue')
  if (f.branchId) q = q.eq('branch_id', f.branchId)
  if (f.from) q = q.gte('sale_datetime', f.from)
  if (f.to) q = q.lt('sale_datetime', f.to)
  const { data, error } = await q
  if (error) return err(serviceError('db', error.message))

  const agg = new Map<string, { qty: number; revenue: number }>()
  for (const r of (data as RawLineRow[] | null) ?? []) {
    const cur = agg.get(r.product_id) ?? { qty: 0, revenue: 0 }
    cur.qty += Number(r.qty)
    cur.revenue += Number(r.line_revenue)
    agg.set(r.product_id, cur)
  }
  const ranked = [...agg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, f.limit ?? 5)

  const ids = ranked.map(([id]) => id)
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: prods } = await db.from('product').select('id, name').in('id', ids)
    for (const p of (prods as { id: string; name: string }[] | null) ?? []) names.set(p.id, p.name)
  }
  return ok(
    ranked.map(([id, v]) => ({ productId: id, name: names.get(id) ?? id, qtySold: v.qty, revenue: v.revenue })),
  )
}
