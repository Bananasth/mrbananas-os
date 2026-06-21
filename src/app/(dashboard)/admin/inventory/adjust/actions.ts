'use server'

import { revalidatePath } from 'next/cache'
import { adjustStock, recordWaste } from '@/server/services'

export type FormState = { ok?: boolean; error?: string }

const str = (fd: FormData, k: string): string => {
  const v = fd.get(k)
  return typeof v === 'string' ? v.trim() : ''
}

function revalidate() {
  revalidatePath('/admin/inventory/adjust')
  revalidatePath('/admin/inventory/stock')
  revalidatePath('/admin/inventory/movements')
}

export async function adjustStockAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await adjustStock({
    lotId: str(fd, 'lotId'),
    newQty: Number.parseFloat(str(fd, 'newQty')),
    reason: str(fd, 'reason'),
  })
  if (!res.ok) return { error: res.error.message }
  revalidate()
  return { ok: true }
}

export async function recordWasteAction(_p: FormState, fd: FormData): Promise<FormState> {
  const res = await recordWaste({
    lotId: str(fd, 'lotId'),
    qty: Number.parseFloat(str(fd, 'qty')),
    reason: str(fd, 'reason'),
  })
  if (!res.ok) return { error: res.error.message }
  revalidate()
  return { ok: true }
}
