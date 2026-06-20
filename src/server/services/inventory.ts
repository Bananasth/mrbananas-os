import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import {
  CreateInventoryItemSchema,
  type CreateInventoryItemInput,
  ReceiveInventorySchema,
  type ReceiveInventoryInput,
  StockOnHandSchema,
} from './schemas'
import type { InventoryItem, StockOnHand } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/**
 * Create an inventory item (owner only). For raw / semi_finished it writes the supertype
 * (inventory_item) then the named subtype (raw_material / semi_finished); for finished it
 * writes the bare supertype. Uses one client-generated id for both rows (shared PK).
 */
export async function createInventoryItem(
  input: CreateInventoryItemInput,
): Promise<Result<InventoryItem, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateInventoryItemSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const id = crypto.randomUUID()

  const { data, error } = await db
    .from('inventory_item')
    .insert({ id, tenant_id: ctx.tenantId, item_kind: v.itemKind, base_unit: v.baseUnit })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))

  if (v.itemKind === 'raw' || v.itemKind === 'semi_finished') {
    const table = v.itemKind === 'raw' ? 'raw_material' : 'semi_finished'
    const { error: subErr } = await db
      .from(table)
      .insert({ id, tenant_id: ctx.tenantId, item_kind: v.itemKind, sku: v.sku, name: v.name })
    if (subErr) {
      return err(serviceError('db', `inventory_item created but ${table} failed: ${subErr.message}`))
    }
  }
  return ok({ ...(data as InventoryItem), name: v.name ?? null, sku: v.sku ?? null })
}

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
