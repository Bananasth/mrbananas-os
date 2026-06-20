import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext, parseInput } from './context'
import {
  ActivateVersionSchema,
  type ActivateVersionInput,
  AddIngredientSchema,
  type AddIngredientInput,
  CreateDraftVersionSchema,
  type CreateDraftVersionInput,
  CreateRecipeSchema,
  type CreateRecipeInput,
} from './schemas'
import type { Recipe, RecipeIngredient, RecipeVersion } from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

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
