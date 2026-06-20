import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import { ReceiveInventorySchema, type ReceiveInventoryInput, StockOnHandSchema } from './schemas'
import type { StockOnHand } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/** Stock on hand for a branch (optionally one item), from the RLS-scoped stock_on_hand view. */
export async function getStockOnHand(input: unknown): Promise<Result<StockOnHand[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(StockOnHandSchema, input)
  if (!parsed.ok) return parsed
  const branchOk = ensureBranch(gate.value.ctx, parsed.value.branchId)
  if (!branchOk.ok) return branchOk
  let q = gate.value.db.from('stock_on_hand').select('*').eq('branch_id', parsed.value.branchId)
  if (parsed.value.itemId) q = q.eq('item_id', parsed.value.itemId)
  const { data, error } = await q
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as StockOnHand[])
}

/**
 * Receive stock into a lot (owner or manager) via the guarded app.receive_inventory
 * primitive — appends a 'receive' movement and reconciles the lot cache atomically.
 * Returns the new lot id.
 */
export async function receiveInventory(
  input: ReceiveInventoryInput,
): Promise<Result<{ lotId: string }, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const parsed = parseInput(ReceiveInventorySchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const r = parsed.value
  const branchOk = ensureBranch(ctx, r.branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await db.schema('app').rpc('receive_inventory', {
    p_branch_id: r.branchId,
    p_item_id: r.itemId,
    p_qty: r.qty,
    p_unit: r.unit,
    p_expires_at: r.expiresAt ?? null,
    p_employee_id: r.employeeId ?? null,
    p_ref_type: r.refType ?? null,
    p_ref_id: r.refId ?? null,
  })
  if (error) return err(serviceError('db', error.message))
  return ok({ lotId: data as string })
}
