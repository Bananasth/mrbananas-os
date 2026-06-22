'use server'

import { revalidatePath } from 'next/cache'
import { upsertQrConfig } from '@/server/services'

export type QrSettingsState = { ok?: boolean; error?: string }

export async function saveQrConfigAction(
  branchId: string,
  _prev: QrSettingsState,
  fd: FormData,
): Promise<QrSettingsState> {
  const slug = String(fd.get('public_slug') ?? '').trim().toLowerCase()
  const pickup = String(fd.get('pickup_instruction') ?? '').trim()
  const res = await upsertQrConfig({
    branchId,
    enabled: fd.get('enabled') === 'on',
    publicSlug: slug,
    pickupInstruction: pickup || null,
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/settings/qr')
  return { ok: true }
}
