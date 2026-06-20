import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext } from './context'
import type {
  InventoryItem,
  MenuItem,
  ProductCategory,
  RecipeIngredient,
  RecipeVersion,
  Workstation,
} from './types'

// Additional RLS-scoped read helpers used by the admin setup UI (Phase 3) and POS (Phase 4).
// Same pattern as the rest of the service layer: run as the logged-in user, return a Result.
const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/**
 * List the tenant's inventory items with their subtype name/sku merged in (raw_material /
 * semi_finished). Bare finished items keep null name.
 */
export async function listInventoryItems(): Promise<Result<InventoryItem[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const [itemsR, rawR, semiR] = await Promise.all([
    db.from('inventory_item').select('*').order('item_kind', { ascending: true }),
    db.from('raw_material').select('id, sku, name'),
    db.from('semi_finished').select('id, sku, name'),
  ])
  if (itemsR.error) return err(serviceError('db', itemsR.error.message))

  const meta = new Map<string, { sku: string; name: string }>()
  for (const r of [...(rawR.data ?? []), ...(semiR.data ?? [])] as {
    id: string
    sku: string
    name: string
  }[]) {
    meta.set(r.id, { sku: r.sku, name: r.name })
  }
  const items = ((itemsR.data ?? []) as InventoryItem[]).map((it) => {
    const m = meta.get(it.id)
    return { ...it, name: m?.name ?? null, sku: m?.sku ?? null }
  })
  return ok(items)
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

/** List the workstations of a branch (POS pins each sold line to a workstation). */
export async function listWorkstations(
  branchId: string,
): Promise<Result<Workstation[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('workstation')
    .select('*')
    .eq('branch_id', branchId)
    .order('type', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as Workstation[])
}

type ProductRow = { id: string; sku: string; name: string; category: ProductCategory }
type PriceRow = { product_id: string; price_override: number | null }
type RecipeRow = { id: string; product_id: string }
type ActiveVersionRow = { id: string; recipe_id: string }

/**
 * The POS menu for a branch: active products that are available AND priced AND have an active
 * recipe version (order_item requires a recipe_version_id). Composed from the catalog,
 * per-branch pricing, and active recipe versions — all under RLS.
 */
export async function getMenu(branchId: string): Promise<Result<MenuItem[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value

  const [productsR, pricingR, recipesR, versionsR] = await Promise.all([
    db.from('product').select('id, sku, name, category').eq('is_active', true),
    db
      .from('branch_product')
      .select('product_id, price_override')
      .eq('branch_id', branchId)
      .eq('is_available', true),
    db.from('recipe').select('id, product_id'),
    db.from('recipe_version').select('id, recipe_id').eq('status', 'active'),
  ])
  for (const r of [productsR, pricingR, recipesR, versionsR]) {
    if (r.error) return err(serviceError('db', r.error.message))
  }

  const priceByProduct = new Map(
    ((pricingR.data ?? []) as PriceRow[])
      .filter((p) => p.price_override !== null)
      .map((p) => [p.product_id, p.price_override as number]),
  )
  const productByRecipe = new Map(
    ((recipesR.data ?? []) as RecipeRow[]).map((r) => [r.id, r.product_id]),
  )
  const activeVersionByProduct = new Map<string, string>()
  for (const v of (versionsR.data ?? []) as ActiveVersionRow[]) {
    const productId = productByRecipe.get(v.recipe_id)
    if (productId && !activeVersionByProduct.has(productId)) {
      activeVersionByProduct.set(productId, v.id)
    }
  }

  const menu: MenuItem[] = []
  for (const p of (productsR.data ?? []) as ProductRow[]) {
    const unitPrice = priceByProduct.get(p.id)
    const recipeVersionId = activeVersionByProduct.get(p.id)
    if (unitPrice === undefined || !recipeVersionId) continue
    menu.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      unitPrice,
      recipeVersionId,
    })
  }
  return ok(menu)
}
