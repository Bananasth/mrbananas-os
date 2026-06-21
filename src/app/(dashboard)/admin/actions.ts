'use server'

import { revalidatePath } from 'next/cache'
import {
  activateVersion,
  addIngredient,
  createDraftVersion,
  createInventoryItem,
  createProduct,
  createRecipe,
  deleteInventoryItem,
  deleteProduct,
  receiveInventory,
  setProductActive,
  updateInventoryItem,
  updateProduct,
  upsertBranchPrice,
} from '@/server/services'

export type FormState = { ok?: boolean; error?: string }

// 0. Inventory items ----------------------------------------------------------------------
export async function createInventoryItemAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const res = await createInventoryItem({
    itemKind: fd.get('itemKind') as 'raw' | 'semi_finished' | 'finished',
    baseUnit: typeof fd.get('baseUnit') === 'string' ? (fd.get('baseUnit') as string).trim() : '',
    name: typeof fd.get('name') === 'string' ? (fd.get('name') as string).trim() || undefined : undefined,
    sku: typeof fd.get('sku') === 'string' ? (fd.get('sku') as string).trim() || undefined : undefined,
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/inventory/items')
  return { ok: true }
}

const str = (fd: FormData, k: string): string => {
  const v = fd.get(k)
  return typeof v === 'string' ? v.trim() : ''
}
const optStr = (fd: FormData, k: string): string | null => {
  const v = str(fd, k)
  return v === '' ? null : v
}
const bahtToSatang = (v: string): number => Math.round(Number.parseFloat(v) * 100)

export async function updateInventoryItemAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const res = await updateInventoryItem({
    id: str(fd, 'id'),
    baseUnit: optStr(fd, 'baseUnit') ?? undefined,
    name: optStr(fd, 'name') ?? undefined,
    sku: optStr(fd, 'sku') ?? undefined,
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/inventory/items')
  return { ok: true }
}

export async function deleteInventoryItemAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const res = await deleteInventoryItem({ id: str(fd, 'id') })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/inventory/items')
  return { ok: true }
}

// 1. Products -----------------------------------------------------------------------------
export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await createProduct({
    sku: str(fd, 'sku'),
    name: str(fd, 'name'),
    category: str(fd, 'category') as 'beverage' | 'bakery',
    type: str(fd, 'type') as 'made_to_order' | 'batch',
    inventoryItemId: optStr(fd, 'inventoryItemId'),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/products')
  return { ok: true }
}

export async function toggleProductAction(fd: FormData): Promise<void> {
  await setProductActive({
    productId: str(fd, 'productId'),
    isActive: str(fd, 'isActive') === 'true',
  })
  revalidatePath('/admin/products')
}

export async function updateProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await updateProduct({
    id: str(fd, 'id'),
    name: optStr(fd, 'name') ?? undefined,
    sku: optStr(fd, 'sku') ?? undefined,
    category: (optStr(fd, 'category') as 'beverage' | 'bakery' | null) ?? undefined,
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/products')
  return { ok: true }
}

export async function deleteProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await deleteProduct({ id: str(fd, 'id') })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/products')
  return { ok: true }
}

// 2. Branch pricing -----------------------------------------------------------------------
export async function upsertPriceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const price = str(fd, 'price')
  const res = await upsertBranchPrice({
    branchId: str(fd, 'branchId'),
    productId: str(fd, 'productId'),
    priceOverride: price === '' ? null : bahtToSatang(price),
    isAvailable: fd.get('isAvailable') === 'on',
    menuSection: optStr(fd, 'menuSection'),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/pricing')
  return { ok: true }
}

// 3. Recipes / versions -------------------------------------------------------------------
export async function createRecipeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await createRecipe({ productId: str(fd, 'productId'), name: str(fd, 'name') })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/recipes')
  return { ok: true }
}

export async function createDraftVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const shelf = optStr(fd, 'shelfLifeHours')
  const yieldQty = optStr(fd, 'yieldQty')
  const recipeId = str(fd, 'recipeId')
  const res = await createDraftVersion({
    recipeId,
    versionNo: Number.parseInt(str(fd, 'versionNo'), 10),
    shelfLifeHours: shelf === null ? null : Number.parseInt(shelf, 10),
    yieldQty: yieldQty === null ? null : Number.parseFloat(yieldQty),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/recipes/${recipeId}`)
  return { ok: true }
}

export async function addIngredientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const recipeId = str(fd, 'recipeId')
  const res = await addIngredient({
    recipeVersionId: str(fd, 'recipeVersionId'),
    itemId: str(fd, 'itemId'),
    quantity: Number.parseFloat(str(fd, 'quantity')),
    unit: str(fd, 'unit'),
  })
  if (!res.ok) return { error: res.error.message }
  if (recipeId) revalidatePath(`/admin/recipes/${recipeId}`)
  return { ok: true }
}

export async function activateVersionAction(fd: FormData): Promise<void> {
  await activateVersion({ recipeVersionId: str(fd, 'recipeVersionId') })
  const recipeId = str(fd, 'recipeId')
  if (recipeId) revalidatePath(`/admin/recipes/${recipeId}`)
}

// 4/5. Inventory receive ------------------------------------------------------------------
export async function receiveInventoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const expires = optStr(fd, 'expiresAt')
  const res = await receiveInventory({
    branchId: str(fd, 'branchId'),
    itemId: str(fd, 'itemId'),
    qty: Number.parseFloat(str(fd, 'qty')),
    unit: str(fd, 'unit'),
    expiresAt: expires === null ? null : new Date(expires).toISOString(),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/inventory/stock')
  revalidatePath('/admin/inventory/receive')
  return { ok: true }
}
