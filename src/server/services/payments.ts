import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import { RecordCashPaymentSchema, type RecordCashPaymentInput } from './schemas'
import type { Payment } from './types'

/**
 * Record a CASH payment against an order (owner/manager/staff). Cash is captured on the
 * spot, so status='captured'. Idempotent on (order_id, client_uuid) — pass a stable
 * clientUuid to make retries safe.
 */
export async function recordCashPayment(
  input: RecordCashPaymentInput,
): Promise<Result<Payment, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager', 'staff'])
  if (!gate.ok) return gate
  const parsed = parseInput(RecordCashPaymentSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const p = parsed.value
  const branchOk = ensureBranch(ctx, p.branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await db
    .from('payment')
    .insert({
      tenant_id: ctx.tenantId,
      branch_id: p.branchId,
      order_id: p.orderId,
      method: 'cash',
      amount: p.amount,
      status: 'captured',
      client_uuid: p.clientUuid,
      employee_id: p.employeeId ?? null,
    })
    .select('*')
    .single()
  if (error) {
    const code = error.code === '23505' ? 'conflict' : 'db'
    return err(serviceError(code, error.message))
  }
  return ok(data as Payment)
}
