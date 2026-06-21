import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import {
  AdjustStockSchema,
  type AdjustStockInput,
  MovementsQuerySchema,
  type MovementsQueryInput,
  RecordWasteSchema,
  type RecordWasteInput,
} from './schemas'
import type { InventoryLot, StockAdjustment, StockMovement } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const
const ADJUST_ROLES = ['owner', 'manager'] as const

/** Lots at a branch (for the adjustment screen) — available, with stock, soonest expiry first. */
export async function listInventoryLots(branchId: string): Promise<Result<InventoryLot[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const branchOk = ensureBranch(gate.value.ctx, branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await gate.value.db
    .from('inventory_lot')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'available')
    .order('expires_at', { ascending: true, nullsFirst: false })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as InventoryLot[])
}

/** Set a lot to a target quantity (owner/manager). Writes a movement + audit, never edits qty. */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<Result<StockAdjustment, ServiceError>> {
  const gate = await getServiceContext(ADJUST_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(AdjustStockSchema, input)
  if (!parsed.ok) return parsed
  const { data, error } = await gate.value.db.rpc('adjust_stock', {
    p_lot_id: parsed.value.lotId,
    p_new_qty: parsed.value.newQty,
    p_reason: parsed.value.reason,
    p_employee_id: null,
  })
  if (error) return err(serviceError('validation', error.message))
  return ok(data as StockAdjustment)
}

/** Record waste from a lot (owner/manager). Writes a 'waste' movement + audit. */
export async function recordWaste(
  input: RecordWasteInput,
): Promise<Result<StockAdjustment, ServiceError>> {
  const gate = await getServiceContext(ADJUST_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(RecordWasteSchema, input)
  if (!parsed.ok) return parsed
  const { data, error } = await gate.value.db.rpc('record_waste', {
    p_lot_id: parsed.value.lotId,
    p_qty: parsed.value.qty,
    p_reason: parsed.value.reason,
    p_employee_id: null,
  })
  if (error) return err(serviceError('validation', error.message))
  return ok(data as StockAdjustment)
}

/** Adjustment/waste audit rows for a branch (before/after/reason/user/time). */
export async function listStockAdjustments(
  branchId: string,
): Promise<Result<StockAdjustment[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const branchOk = ensureBranch(gate.value.ctx, branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await gate.value.db
    .from('stock_adjustment')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as StockAdjustment[])
}

/** Stock movement ledger for a branch (newest first), optionally for one item. Read-only. */
export async function listMovements(
  input: MovementsQueryInput,
): Promise<Result<StockMovement[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(MovementsQuerySchema, input)
  if (!parsed.ok) return parsed
  const branchOk = ensureBranch(gate.value.ctx, parsed.value.branchId)
  if (!branchOk.ok) return branchOk
  let q = gate.value.db
    .from('inventory_movement')
    .select('*')
    .eq('branch_id', parsed.value.branchId)
    .order('occurred_at', { ascending: false })
    .limit(300)
  if (parsed.value.itemId) q = q.eq('item_id', parsed.value.itemId)
  const { data, error } = await q
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as StockMovement[])
}
