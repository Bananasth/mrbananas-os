import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext, parseInput } from './context'
import { UpsertBranchPriceSchema, type UpsertBranchPriceInput } from './schemas'
import type { BranchProduct } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/** List per-branch pricing/availability for a branch. */
export async function listBranchPricing(
  branchId: string,
): Promise<Result<BranchProduct[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const branchOk = ensureBranch(gate.value.ctx, branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await gate.value.db
    .from('branch_product')
    .select('*')
    .eq('branch_id', branchId)
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as BranchProduct[])
}

/**
 * Set a per-branch price override + availability for a product (owner or manager).
 * Upserts on (branch_id, product_id). price_override is in minor units; null means
 * "no branch price set".
 */
export async function upsertBranchPrice(
  input: UpsertBranchPriceInput,
): Promise<Result<BranchProduct, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpsertBranchPriceSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const p = parsed.value
  const branchOk = ensureBranch(ctx, p.branchId)
  if (!branchOk.ok) return branchOk
  const { data, error } = await db
    .from('branch_product')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        branch_id: p.branchId,
        product_id: p.productId,
        price_override: p.priceOverride,
        is_available: p.isAvailable ?? true,
        menu_section: p.menuSection ?? null,
      },
      { onConflict: 'branch_id,product_id' },
    )
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as BranchProduct)
}
