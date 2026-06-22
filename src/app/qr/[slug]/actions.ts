'use server'

import { createPendingOrder, confirmQrPayment, type QrCartItem } from '@/server/services/qr-public'

export type CheckoutState = { ok: boolean; error?: string; data?: unknown }

/** Create the pending QR order (server re-prices; no queue/stock yet). */
export async function checkoutAction(slug: string, items: QrCartItem[], note: string | null): Promise<CheckoutState> {
  if (!items.length) return { ok: false, error: 'Cart is empty.' }
  const res = await createPendingOrder(slug, items, note)
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, data: res.value }
}

/** Mock payment success -> confirm (queue + stock + prep_items). */
export async function payAction(trackingToken: string, clientUuid: string): Promise<CheckoutState> {
  const res = await confirmQrPayment(trackingToken, clientUuid)
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, data: res.value }
}
