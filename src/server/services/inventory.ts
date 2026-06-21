import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import {
  CreateInventoryItemSchema,
  type CreateInventoryItemInput,
  DeleteInventoryItemSchema,
  type DeleteInventoryItemInput,
  ReceiveInventorySchema,
  type ReceiveInventoryInput,
  StockOnHandSchema,
  UpdateInventoryItemSchema,
  type UpdateInventoryItemInput,
} from './schemas'
import type { InventoryItem, StockOnHand } from './types'

// Tables whose rows pin an inventory_item; deleting a referenced item is blocked (the DB also
// enforces ON DELETE RESTRICT on most of these — this gives a friendly message first).
const ITEM_REFERENCES: { table: string; col: string; label: string }[] = [
  { table: 'recipe_ingredient', col: 'item_id', label: 'recipe ingredients' },
  { table: 'inventory_lot', col: 'item_id', label: 'stock lots' },
  { table: 'inventory_movement', col: 'item_id', label: 'stock movements' },
  { table: 'purchase_order_line', col: 'item_id', label: 'purchase orders' },
  { table: 'product', col: 'inventory_item_id', label: 'products' },
]

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
  const { data, error } = await db.rpc('receive_inventory', {
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

/**
 * Rename / re-unit an inventory item (owner only). base_unit updates the supertype; name/sku
 * update the raw_material / semi_finished subtype (finished items have no name to edit).
 */
export async function updateInventoryItem(
  input: UpdateInventoryItemInput,
): Promise<Result<InventoryItem, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateInventoryItemSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value

  const { data: existing, error: e0 } = await db
    .from('inventory_item')
    .select('*')
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (e0) return err(serviceError('db', e0.message))
  if (!existing) return err(serviceError('not_found', 'Item not found.'))
  const item = existing as InventoryItem

  if (v.baseUnit) {
    const { error } = await db
      .from('inventory_item')
      .update({ base_unit: v.baseUnit })
      .eq('id', v.id)
      .eq('tenant_id', ctx.tenantId)
    if (error) return err(serviceError('db', error.message))
  }

  if ((v.name || v.sku) && (item.item_kind === 'raw' || item.item_kind === 'semi_finished')) {
    const table = item.item_kind === 'raw' ? 'raw_material' : 'semi_finished'
    const patch: Record<string, string> = {}
    if (v.name) patch.name = v.name
    if (v.sku) patch.sku = v.sku
    const { error } = await db.from(table).update(patch).eq('id', v.id).eq('tenant_id', ctx.tenantId)
    if (error) return err(serviceError('db', error.message))
  } else if ((v.name || v.sku) && item.item_kind === 'finished') {
    return err(serviceError('validation', 'Finished items have no name/SKU to edit.'))
  }

  return ok({
    ...item,
    base_unit: v.baseUnit ?? item.base_unit,
    name: v.name ?? item.name ?? null,
    sku: v.sku ?? item.sku ?? null,
  })
}

/**
 * Delete an inventory item (owner only). Blocked if it is referenced by recipe ingredients,
 * stock lots, stock movements, purchase orders, or products (the DB also enforces RESTRICT on
 * most of these). Otherwise the supertype + its subtype row are removed (cascade).
 */
export async function deleteInventoryItem(
  input: DeleteInventoryItemInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteInventoryItemSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const id = parsed.value.id

  for (const ref of ITEM_REFERENCES) {
    const { count, error } = await db
      .from(ref.table)
      .select('*', { count: 'exact', head: true })
      .eq(ref.col, id)
    if (error) return err(serviceError('db', error.message))
    if ((count ?? 0) > 0) {
      return err(serviceError('conflict', `ใช้งานอยู่ใน ${ref.label} (${count}) · in use by ${ref.label}; cannot delete.`))
    }
  }

  const { error } = await db
    .from('inventory_item')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return err(serviceError('db', error.message))
  return ok({ deleted: true })
}
