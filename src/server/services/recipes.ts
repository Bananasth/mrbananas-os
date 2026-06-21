import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { type ServerDb, getServiceContext, parseInput } from './context'
import {
  ActivateVersionSchema,
  type ActivateVersionInput,
  AddIngredientSchema,
  type AddIngredientInput,
  CreateDraftVersionSchema,
  type CreateDraftVersionInput,
  CreateRecipeSchema,
  type CreateRecipeInput,
  DeleteRecipeSchema,
  type DeleteRecipeInput,
  DeleteRecipeVersionSchema,
  type DeleteRecipeVersionInput,
  RetireVersionSchema,
  type RetireVersionInput,
  UpdateRecipeSchema,
  type UpdateRecipeInput,
  UpdateRecipeVersionSchema,
  type UpdateRecipeVersionInput,
} from './schemas'
import type { Recipe, RecipeIngredient, RecipeVersion } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

// A recipe_version that has been SOLD or PRODUCED is protected (DB ON DELETE RESTRICT).
const VERSION_REFERENCES: { table: string; label: string }[] = [
  { table: 'order_item', label: 'order lines' },
  { table: 'production_batch', label: 'production batches' },
]

/** List recipes, optionally filtered to one product. */
export async function listRecipes(productId?: string): Promise<Result<Recipe[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  let q = gate.value.db.from('recipe').select('*')
  if (productId) q = q.eq('product_id', productId)
  const { data, error } = await q
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as Recipe[])
}

/** Create a recipe for a product (owner only). */
export async function createRecipe(
  input: CreateRecipeInput,
): Promise<Result<Recipe, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateRecipeSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('recipe')
    .insert({
      tenant_id: ctx.tenantId,
      product_id: parsed.value.productId,
      name: parsed.value.name,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as Recipe)
}

/** Create a new DRAFT recipe version (owner only). Ingredients are added while draft. */
export async function createDraftVersion(
  input: CreateDraftVersionInput,
): Promise<Result<RecipeVersion, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateDraftVersionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const { data, error } = await db
    .from('recipe_version')
    .insert({
      tenant_id: ctx.tenantId,
      recipe_id: v.recipeId,
      version_no: v.versionNo,
      status: 'draft',
      shelf_life_hours: v.shelfLifeHours ?? null,
      yield_qty: v.yieldQty ?? null,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as RecipeVersion)
}

/** Add an ingredient to a DRAFT version (owner only; the DB guard blocks edits once active). */
export async function addIngredient(
  input: AddIngredientInput,
): Promise<Result<RecipeIngredient, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(AddIngredientSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const i = parsed.value
  const { data, error } = await db
    .from('recipe_ingredient')
    .insert({
      tenant_id: ctx.tenantId,
      recipe_version_id: i.recipeVersionId,
      item_id: i.itemId,
      quantity: i.quantity,
      unit: i.unit,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as RecipeIngredient)
}

/**
 * Activate a draft version (owner only). The DB enforces at-most-one active version per
 * recipe and makes it immutable thereafter (only retire is allowed).
 */
export async function activateVersion(
  input: ActivateVersionInput,
): Promise<Result<RecipeVersion, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(ActivateVersionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('recipe_version')
    .update({ status: 'active', effective_from: new Date().toISOString() })
    .eq('id', parsed.value.recipeVersionId)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as RecipeVersion)
}

/** Rename a recipe (owner only). */
export async function updateRecipe(
  input: UpdateRecipeInput,
): Promise<Result<Recipe, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateRecipeSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('recipe')
    .update({ name: parsed.value.name })
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as Recipe)
}

/**
 * Delete a recipe (owner only). Blocked if any of its versions has been sold or produced
 * (order_item / production_batch RESTRICT). Otherwise removes the recipe, its versions and
 * their ingredients (cascade).
 */
export async function deleteRecipe(
  input: DeleteRecipeInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteRecipeSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const id = parsed.value.id

  const { data: versions, error: vErr } = await db
    .from('recipe_version')
    .select('id')
    .eq('recipe_id', id)
  if (vErr) return err(serviceError('db', vErr.message))
  const versionIds = ((versions ?? []) as { id: string }[]).map((v) => v.id)
  if (versionIds.length > 0) {
    const conflict = await assertVersionsUnused(db, versionIds)
    if (!conflict.ok) return conflict
  }

  const { error } = await db.from('recipe').delete().eq('id', id).eq('tenant_id', ctx.tenantId)
  if (error) return err(serviceError('db', error.message))
  return ok({ deleted: true })
}

/** Edit a DRAFT version's shelf life / yield (owner only). The DB guard blocks active/retired. */
export async function updateRecipeVersion(
  input: UpdateRecipeVersionInput,
): Promise<Result<RecipeVersion, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateRecipeVersionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const patch: Record<string, number | null> = {}
  if (v.shelfLifeHours !== undefined) patch.shelf_life_hours = v.shelfLifeHours
  if (v.yieldQty !== undefined) patch.yield_qty = v.yieldQty
  const { data, error } = await db
    .from('recipe_version')
    .update(patch)
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) {
    return err(serviceError('conflict', `แก้ไขไม่ได้ (อาจ active/retired) · cannot edit: ${error.message}`))
  }
  return ok(data as RecipeVersion)
}

/** Retire a version (owner only): active/draft -> retired. */
export async function retireRecipeVersion(
  input: RetireVersionInput,
): Promise<Result<RecipeVersion, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(RetireVersionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { data, error } = await db
    .from('recipe_version')
    .update({ status: 'retired' })
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as RecipeVersion)
}

/**
 * Delete a recipe version (owner only). Blocked if sold or produced (order_item /
 * production_batch RESTRICT). Otherwise removes the version + its ingredients (cascade).
 */
export async function deleteRecipeVersion(
  input: DeleteRecipeVersionInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteRecipeVersionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const conflict = await assertVersionsUnused(db, [parsed.value.id])
  if (!conflict.ok) return conflict
  const { error } = await db
    .from('recipe_version')
    .delete()
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return err(serviceError('db', error.message))
  return ok({ deleted: true })
}

/** Shared guard: fail if any of `versionIds` is referenced by an order line or production batch. */
async function assertVersionsUnused(
  db: ServerDb,
  versionIds: string[],
): Promise<Result<true, ServiceError>> {
  for (const ref of VERSION_REFERENCES) {
    const { count, error } = await db
      .from(ref.table)
      .select('*', { count: 'exact', head: true })
      .in('recipe_version_id', versionIds)
    if (error) return err(serviceError('db', error.message))
    if ((count ?? 0) > 0) {
      return err(serviceError('conflict', `ใช้งานอยู่ใน ${ref.label} (${count}) · in use by ${ref.label}; cannot delete (retire instead).`))
    }
  }
  return ok(true)
}
