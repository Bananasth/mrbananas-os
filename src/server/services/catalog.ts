import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext, parseInput } from './context'
import {
  CreateProductSchema,
  type CreateProductInput,
  DeleteProductSchema,
  type DeleteProductInput,
  SetProductActiveSchema,
  type SetProductActiveInput,
  UpdateProductSchema,
  type UpdateProductInput,
} from './schemas'
import type { Product } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

// Deleting a product would CASCADE-delete its recipes (recipe.product_id ON DELETE CASCADE),
// so the recipe guard MUST be enforced here; order_item is ON DELETE RESTRICT (DB also blocks).
const PRODUCT_REFERENCES: { table: string; label: string }[] = [
  { table: 'recipe', label: 'recipes / versions' },
  { table: 'order_item', label: 'order lines / invoices' },
]

/** List the tenant's catalog products (RLS scopes to the caller's tenant). */
export async function listProducts(): Promise<Result<Product[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('product')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as Product[])
}

/** Create a catalog product (owner only). */
export async function createProduct(
  input: CreateProductInput,
): Promise<Result<Product, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateProductSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const p = parsed.value
  const { data, error } = await db
    .from('product')
    .insert({
      tenant_id: ctx.tenantId,
      sku: p.sku,
      name: p.name,
      category: p.category,
      type: p.type,
      inventory_item_id: p.inventoryItemId ?? null,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as Product)
}

/** Edit a product's name / SKU / category (owner only). type and stock link are immutable. */
export async function updateProduct(
  input: UpdateProductInput,
): Promise<Result<Product, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateProductSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const patch: Record<string, string> = {}
  if (v.name) patch.name = v.name
  if (v.sku) patch.sku = v.sku
  if (v.category) patch.category = v.category
  const { data, error } = await db
    .from('product')
    .update(patch)
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as Product)
}

/**
 * Hard-delete a product (owner only). Blocked if it has recipes (would cascade-delete them) or
 * order lines / invoices (DB also RESTRICTs). Its per-branch pricing cascades away. To merely
 * hide a product, deactivate it instead (setProductActive).
 */
export async function deleteProduct(
  input: DeleteProductInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteProductSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const id = parsed.value.id

  for (const ref of PRODUCT_REFERENCES) {
    const { count, error } = await db
      .from(ref.table)
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)
    if (error) return err(serviceError('db', error.message))
    if ((count ?? 0) > 0) {
      return err(serviceError('conflict', `ใช้งานอยู่ใน ${ref.label} (${count}) · in use by ${ref.label}; cannot delete (deactivate instead).`))
    }
  }

  const { error } = await db.from('product').delete().eq('id', id).eq('tenant_id', ctx.tenantId)
  if (error) return err(serviceError('db', error.message))
  return ok({ deleted: true })
}

/** Activate or deactivate a product (owner only). */
export async function setProductActive(
  input: SetProductActiveInput,
): Promise<Result<Product, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(SetProductActiveSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('product')
    .update({ is_active: parsed.value.isActive })
    .eq('id', parsed.value.productId)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as Product)
}
