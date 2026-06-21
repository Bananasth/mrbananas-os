'use server'

import { revalidatePath } from 'next/cache'
import {
  createModifierGroup,
  createModifierOption,
  deleteModifierGroup,
  deleteModifierOption,
  updateModifierGroup,
  updateModifierOption,
} from '@/server/services'

export type FormState = { ok?: boolean; error?: string }

const str = (fd: FormData, k: string): string => {
  const v = fd.get(k)
  return typeof v === 'string' ? v.trim() : ''
}
const optStr = (fd: FormData, k: string): string | null => {
  const v = str(fd, k)
  return v === '' ? null : v
}
const intOr = (fd: FormData, k: string, d: number): number => {
  const n = Number.parseInt(str(fd, k), 10)
  return Number.isFinite(n) ? n : d
}
const checked = (fd: FormData, k: string): boolean => fd.get(k) === 'on'
const bahtToSatang = (v: string): number => Math.round(Number.parseFloat(v) * 100)

type SelType = 'single' | 'multiple'
type DispType = 'radio' | 'checkbox' | 'button' | 'dropdown'

// ---- groups ----
export async function createGroupAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await createModifierGroup({
    name: str(fd, 'name'),
    description: optStr(fd, 'description'),
    isRequired: checked(fd, 'isRequired'),
    selectionType: (str(fd, 'selectionType') || 'single') as SelType,
    displayType: (str(fd, 'displayType') || 'radio') as DispType,
    minSelect: intOr(fd, 'minSelect', 0),
    maxSelect: intOr(fd, 'maxSelect', 1),
    sortOrder: intOr(fd, 'sortOrder', 0),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/modifiers')
  return { ok: true }
}

export async function updateGroupAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await updateModifierGroup({
    id: str(fd, 'id'),
    name: str(fd, 'name'),
    description: optStr(fd, 'description'),
    isRequired: checked(fd, 'isRequired'),
    selectionType: (str(fd, 'selectionType') || 'single') as SelType,
    displayType: (str(fd, 'displayType') || 'radio') as DispType,
    minSelect: intOr(fd, 'minSelect', 0),
    maxSelect: intOr(fd, 'maxSelect', 1),
    sortOrder: intOr(fd, 'sortOrder', 0),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/modifiers')
  return { ok: true }
}

export async function toggleGroupActiveAction(fd: FormData): Promise<void> {
  await updateModifierGroup({ id: str(fd, 'id'), isActive: str(fd, 'isActive') === 'true' })
  revalidatePath('/admin/modifiers')
}

export async function deleteGroupAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await deleteModifierGroup({ id: str(fd, 'id') })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/modifiers')
  return { ok: true }
}

// ---- options ----
export async function createOptionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const price = str(fd, 'priceAdjustment')
  const res = await createModifierOption({
    groupId: str(fd, 'groupId'),
    name: str(fd, 'name'),
    code: optStr(fd, 'code'),
    imageUrl: optStr(fd, 'imageUrl'),
    priceAdjustment: price === '' ? 0 : bahtToSatang(price),
    isDefault: checked(fd, 'isDefault'),
    sortOrder: intOr(fd, 'sortOrder', 0),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/modifiers/${str(fd, 'groupId')}`)
  return { ok: true }
}

export async function updateOptionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const price = str(fd, 'priceAdjustment')
  const res = await updateModifierOption({
    id: str(fd, 'id'),
    name: str(fd, 'name'),
    code: optStr(fd, 'code'),
    imageUrl: optStr(fd, 'imageUrl'),
    priceAdjustment: price === '' ? 0 : bahtToSatang(price),
    isDefault: checked(fd, 'isDefault'),
    sortOrder: intOr(fd, 'sortOrder', 0),
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/modifiers/${str(fd, 'groupId')}`)
  return { ok: true }
}

export async function toggleOptionActiveAction(fd: FormData): Promise<void> {
  await updateModifierOption({ id: str(fd, 'id'), isActive: str(fd, 'isActive') === 'true' })
  revalidatePath(`/admin/modifiers/${str(fd, 'groupId')}`)
}

export async function deleteOptionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await deleteModifierOption({ id: str(fd, 'id') })
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/modifiers/${str(fd, 'groupId')}`)
  return { ok: true }
}
