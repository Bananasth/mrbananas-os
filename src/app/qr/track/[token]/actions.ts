'use server'

import { getQrStatus, type QrStatus } from '@/server/services/qr-public'

export async function statusAction(token: string): Promise<{ ok: boolean; error?: string; data?: QrStatus }> {
  const res = await getQrStatus(token)
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, data: res.value }
}
