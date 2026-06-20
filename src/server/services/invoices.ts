import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext, parseInput } from './context'
import { IssueInvoiceSchema, type IssueInvoiceInput } from './schemas'
import type { TaxInvoice } from './types'

/**
 * Issue a Thailand VAT tax invoice for a COMPLETED order (owner/manager/staff), via the
 * guarded app.issue_tax_invoice primitive: it allocates the next per-branch invoice number
 * under a row lock, writes the immutable invoice, and links it to the order. Returns the
 * issued invoice row.
 */
export async function issueTaxInvoice(
  input: IssueInvoiceInput,
): Promise<Result<TaxInvoice, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager', 'staff'])
  if (!gate.ok) return gate
  const parsed = parseInput(IssueInvoiceSchema, input)
  if (!parsed.ok) return parsed
  const { db } = gate.value
  const { data: invoiceId, error } = await db.schema('app').rpc('issue_tax_invoice', {
    p_order_id: parsed.value.orderId,
    p_sale_occurred_at: parsed.value.saleOccurredAt ?? null,
  })
  if (error) return err(serviceError('db', error.message))

  const { data: invoice, error: fetchErr } = await db
    .from('tax_invoice')
    .select('*')
    .eq('id', invoiceId as string)
    .single()
  if (fetchErr) return err(serviceError('db', fetchErr.message))
  return ok(invoice as TaxInvoice)
}
