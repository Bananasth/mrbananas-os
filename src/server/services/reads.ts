import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext } from './context'
import type { InventoryItem, RecipeIngredient, RecipeVersion } from './types'

// Additional RLS-scoped read helpers used by the admin setup UI (Phase 3). Same pattern as
// the rest of the service layer: run as the logged-in user, return a typed Result.
const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/** List the tenant's inventory items (supertype rows: raw / semi_finished / finished). */
export async function listInventoryItems(): Promise<Result<InventoryItem[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('inventory_item')
    .select('*')
    .order('item_kind', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as InventoryItem[])
}

/** List the versions of a recipe, newest version first. */
export async function getRecipeVersions(
  recipeId: string,
): Promise<Result<RecipeVersion[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('recipe_version')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('version_no', { ascending: false })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as RecipeVersion[])
}

/** List the ingredients (bill of materials) of a recipe version. */
export async function getRecipeIngredients(
  recipeVersionId: string,
): Promise<Result<RecipeIngredient[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('recipe_ingredient')
    .select('*')
    .eq('recipe_version_id', recipeVersionId)
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as RecipeIngredient[])
}
