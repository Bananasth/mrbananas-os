import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import {
  CreateInventoryItemSchema,
  type CreateInventoryItemInput,
  DeleteInventoryItemSchema,
  type DeleteInventoryItemInput,
  GenerateSkuSchema,
  type GenerateSkuInput,
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

// RM/SF/FG map to the legacy item_kind; PK/MD/SV have no subtype kind.
const KIND_BY_TYPE: Record<string, 'raw' | 'semi_finished' | 'finished' | null> = {
  RM: 'raw',
  SF: 'semi_finished',
  FG: 'finished',
  PK: null,
  MD: null,
  SV: null,
}

/** Friendly duplicate-key message for the per-tenant name/sku unique indexes. */
function dupMessage(error: { code?: string; message?: string }): ServiceError | null {
  if (error.code !== '23505') return null
  const m = error.message ?? ''
  if (m.includes('name')) return serviceError('conflict', 'ชื่อซ้ำ · Item name already exists for this shop.')
  if (m.includes('sku')) return serviceError('conflict', 'SKU ซ้ำ · SKU already exists for this shop.')
  return serviceError('conflict', 'ข้อมูลซ้ำ · Duplicate name or SKU.')
}

/** Create an inventory item (owner only): item_type + name + sku on the supertype. */
export async function createInventoryItem(
  input: CreateInventoryItemInput,
): Promise<Result<InventoryItem, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateInventoryItemSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const { data, error } = await db
    .from('inventory_item')
    .insert({
      tenant_id: ctx.tenantId,
      item_type: v.itemType,
      item_kind: KIND_BY_TYPE[v.itemType] ?? null,
      base_unit: v.baseUnit,
      name: v.name,
      sku: v.sku,
    })
    .select('*')
    .single()
  if (error) return err(dupMessage(error) ?? serviceError('db', error.message))
  return ok(data as InventoryItem)
}

/** Generate the next available SKU for an item type (e.g. RM0001). Never reuses numbers. */
export async function generateSku(
  input: GenerateSkuInput,
): Promise<Result<{ sku: string }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(GenerateSkuSchema, input)
  if (!parsed.ok) return parsed
  const { data, error } = await gate.value.db.rpc('next_sku', { p_prefix: parsed.value.itemType })
  if (error) return err(serviceError('db', error.message))
  return ok({ sku: data as string })
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

/** Edit an inventory item (owner only): item_type / name / SKU / base_unit on the supertype. */
export async function updateInventoryItem(
  input: UpdateInventoryItemInput,
): Promise<Result<InventoryItem, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateInventoryItemSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const patch: Record<string, string | null> = {}
  if (v.itemType !== undefined) {
    patch.item_type = v.itemType
    patch.item_kind = KIND_BY_TYPE[v.itemType] ?? null
  }
  if (v.name !== undefined) patch.name = v.name
  if (v.sku !== undefined) patch.sku = v.sku
  if (v.baseUnit !== undefined) patch.base_unit = v.baseUnit
  const { data, error } = await db
    .from('inventory_item')
    .update(patch)
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(dupMessage(error) ?? serviceError('db', error.message))
  return ok(data as InventoryItem)
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
