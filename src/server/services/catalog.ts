import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext, parseInput } from './context'
import {
  CreateProductSchema,
  type CreateProductInput,
  SetProductActiveSchema,
  type SetProductActiveInput,
} from './schemas'
import type { Product } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

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
