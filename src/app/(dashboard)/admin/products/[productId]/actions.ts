'use server'

import { revalidatePath } from 'next/cache'
import { assignProductModifierGroup, unassignProductModifierGroup } from '@/server/services'

export type FormState = { ok?: boolean; error?: string }

const str = (fd: FormData, k: string): string => {
  const v = fd.get(k)
  return typeof v === 'string' ? v.trim() : ''
}
const intOr = (fd: FormData, k: string, d: number): number => {
  const n = Number.parseInt(str(fd, k), 10)
  return Number.isFinite(n) ? n : d
}

/** Assign a group to the product, or update its per-product sort order (upsert). */
export async function assignGroupAction(_p: FormState, fd: FormData): Promise<FormState> {
  const productId = str(fd, 'productId')
  const res = await assignProductModifierGroup({
    productId,
    modifierGroupId: str(fd, 'modifierGroupId'),
    sortOrder: intOr(fd, 'sortOrder', 0),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/products/${productId}`)
  return { ok: true }
}

export async function unassignGroupAction(fd: FormData): Promise<void> {
  const productId = str(fd, 'productId')
  await unassignProductModifierGroup({ productId, modifierGroupId: str(fd, 'modifierGroupId') })
  revalidatePath(`/admin/products/${productId}`)
}
