import 'server-only'
import QRCode from 'qrcode'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext } from './context'

/**
 * Receipt service (Phase E-2). Assembles a ReceiptModel for one order from existing tables:
 *   sales_order + order_item(+product name) + payment + tax_invoice + business_profile + branch_profile.
 * Read-only, RLS-scoped (runs as the logged-in user). No DB changes. Reuses issue_tax_invoice
 * elsewhere (the /api/receipt route) — this service only READS the issued invoice.
 */
const RECEIPT_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

export type ReceiptSeller = {
  legalName: string
  taxId: string | null
  isVatRegistered: boolean
  branchCode: string
  branchName: string | null
  address: string | null
  phone: string | null
  email: string | null
  logoColorUrl: string | null
  logoMonoUrl: string | null
  logoMode: 'auto' | 'color' | 'mono'
  colors: { primary?: string; secondary?: string; accent?: string; text?: string; background?: string }
  social: Record<string, string>
  currencyCode: string
  locale: string
  headerNote: string | null
  footerNote: string | null
  returnPolicy: string | null
  qrUrl: string | null
}

export type ReceiptInvoice = {
  invoiceNo: number
  series: 'invoice' | 'credit_note'
  vatRate: number
  saleOccurredAt: string
  issuedAt: string
}

export type ReceiptItem = { name: string; qty: number; unitPrice: number; lineTax: number; lineTotal: number }
export type ReceiptPayment = { method: string; amount: number; paidAt: string | null }

export type ReceiptModel = {
  orderId: string
  channel: string
  datetime: string
  seller: ReceiptSeller
  invoice: ReceiptInvoice | null
  items: ReceiptItem[]
  totals: { subtotal: number; taxTotal: number; total: number }
  payment: ReceiptPayment | null
}

type OrderRow = {
  id: string; tenant_id: string; branch_id: string; employee_id: string | null
  channel: string; status: string; subtotal: number; tax_total: number; total: number
  invoice_id: string | null; created_at: string
}
type ItemRow = { product_id: string; qty: number; unit_price: number; line_tax: number }
type PayRow = { method: string; amount: number; paid_at: string | null }
type InvRow = { invoice_no: number; series: 'invoice' | 'credit_note'; vat_rate: number; sale_occurred_at: string; issued_at: string }
type BizRow = {
  legal_name: string; tax_id: string | null; is_vat_registered: boolean; registered_address: string | null
  phone: string | null; email: string | null; social_links: Record<string, string> | null
  currency_code: string; locale: string; logo_color_url: string | null; logo_mono_url: string | null
  receipt_logo_mode: 'auto' | 'color' | 'mono'
  color_primary: string | null; color_secondary: string | null; color_accent: string | null
  color_text: string | null; color_background: string | null
  receipt_header_note: string | null; receipt_footer_note: string | null
  receipt_return_policy: string | null; receipt_qr_url: string | null
}
type BranchRow = { branch_code: string; display_name: string | null; address: string | null; phone: string | null }

/** Assemble the receipt for an order (RLS-scoped). */
export async function getReceiptModel(orderId: string): Promise<Result<ReceiptModel, ServiceError>> {
  const gate = await getServiceContext(RECEIPT_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value

  const { data: order, error: oErr } = await db
    .from('sales_order').select('*').eq('id', orderId).maybeSingle()
  if (oErr) return err(serviceError('db', oErr.message))
  if (!order) return err(serviceError('not_found', 'Order not found.'))
  const o = order as OrderRow

  const [{ data: itemRows, error: iErr }, { data: payRows, error: pErr }, { data: invRows, error: vErr }, { data: biz, error: bErr }, { data: brp, error: rErr }] =
    await Promise.all([
      db.from('order_item').select('product_id, qty, unit_price, line_tax').eq('order_id', orderId),
      db.from('payment').select('method, amount, paid_at').eq('order_id', orderId).eq('status', 'captured').order('paid_at', { ascending: false }).limit(1),
      db.from('tax_invoice').select('invoice_no, series, vat_rate, sale_occurred_at, issued_at').eq('order_id', orderId).order('issued_at', { ascending: false }).limit(1),
      db.from('business_profile').select('*').eq('tenant_id', o.tenant_id).maybeSingle(),
      db.from('branch_profile').select('branch_code, display_name, address, phone').eq('branch_id', o.branch_id).maybeSingle(),
    ])
  for (const e of [iErr, pErr, vErr, bErr, rErr]) if (e) return err(serviceError('db', e.message))

  const items = (itemRows as ItemRow[] | null) ?? []
  const ids = [...new Set(items.map((r) => r.product_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: prods } = await db.from('product').select('id, name').in('id', ids)
    for (const p of (prods as { id: string; name: string }[] | null) ?? []) names.set(p.id, p.name)
  }

  const b = biz as BizRow | null
  const branch = brp as BranchRow | null
  const pay = ((payRows as PayRow[] | null) ?? [])[0]
  const inv = ((invRows as InvRow[] | null) ?? [])[0]

  const seller: ReceiptSeller = {
    legalName: b?.legal_name ?? '',
    taxId: b?.tax_id ?? null,
    isVatRegistered: b?.is_vat_registered ?? false,
    branchCode: branch?.branch_code ?? '00000',
    branchName: branch?.display_name ?? null,
    address: branch?.address ?? b?.registered_address ?? null,
    phone: branch?.phone ?? b?.phone ?? null,
    email: b?.email ?? null,
    logoColorUrl: b?.logo_color_url ?? null,
    logoMonoUrl: b?.logo_mono_url ?? null,
    logoMode: b?.receipt_logo_mode ?? 'auto',
    colors: {
      primary: b?.color_primary ?? undefined,
      secondary: b?.color_secondary ?? undefined,
      accent: b?.color_accent ?? undefined,
      text: b?.color_text ?? undefined,
      background: b?.color_background ?? undefined,
    },
    social: (b?.social_links as Record<string, string>) ?? {},
    currencyCode: b?.currency_code ?? 'THB',
    locale: b?.locale ?? 'th-TH',
    headerNote: b?.receipt_header_note ?? null,
    footerNote: b?.receipt_footer_note ?? null,
    returnPolicy: b?.receipt_return_policy ?? null,
    qrUrl: b?.receipt_qr_url ?? null,
  }

  return ok({
    orderId: o.id,
    channel: o.channel,
    datetime: o.created_at,
    seller,
    invoice: inv
      ? { invoiceNo: inv.invoice_no, series: inv.series, vatRate: Number(inv.vat_rate), saleOccurredAt: inv.sale_occurred_at, issuedAt: inv.issued_at }
      : null,
    items: items.map((r) => ({
      name: names.get(r.product_id) ?? r.product_id,
      qty: Number(r.qty),
      unitPrice: Number(r.unit_price),
      lineTax: Number(r.line_tax),
      lineTotal: Math.round(Number(r.unit_price) * Number(r.qty)), // VAT-inclusive line gross
    })),
    totals: { subtotal: Number(o.subtotal), taxTotal: Number(o.tax_total), total: Number(o.total) },
    payment: pay ? { method: pay.method, amount: Number(pay.amount), paidAt: pay.paid_at } : null,
  })
}

/** Path of the online receipt (relative). Absolute URL is built by the caller from headers. */
export function onlineReceiptPath(orderId: string): string {
  return `/receipt/${orderId}`
}

/** Render an SVG QR for a URL (used on the receipt). Prefers business_profile.receipt_qr_url. */
export async function receiptQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 0, width: 128 })
}
