'use server'

import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { createPaymentIntent, getQrStatus, type QrCartItem, type QrStatus } from '@/server/services/qr-public'
import { promptPayPayload } from '@/server/payments/promptpay'

export type PayIntent = {
  tracking_token: string
  amount: number
  expires_at: string
  qr_svg: string
  is_mock: boolean
}
export type CheckoutState = { ok: boolean; error?: string; data?: PayIntent }

/**
 * Create a locked-amount payment intent and return everything the pay screen needs:
 * a rendered QR (PromptPay EMVCo when a real provider is configured, else the tracking URL
 * in mock mode), the amount, and the expiry. NO settlement — the order stays pending_payment.
 */
export async function checkoutAction(slug: string, items: QrCartItem[], note: string | null): Promise<CheckoutState> {
  if (!items.length) return { ok: false, error: 'Cart is empty.' }
  const res = await createPaymentIntent(slug, items, note)
  if (!res.ok) return { ok: false, error: res.error.message }
  const i = res.value

  let payload: string
  let isMock: boolean
  if (i.provider === 'promptpay' && i.promptpay_target) {
    payload = promptPayPayload(i.promptpay_target, i.amount)
    isMock = false
  } else {
    const h = await headers()
    const base = process.env.NEXT_PUBLIC_SITE_URL
      ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`
    payload = `${base}/qr/track/${i.tracking_token}` // mock: no bank consumes it; encode tracking
    isMock = true
  }
  const qr_svg = await QRCode.toString(payload, { type: 'svg', margin: 1, width: 240 })

  return {
    ok: true,
    data: { tracking_token: i.tracking_token, amount: i.amount, expires_at: i.expires_at, qr_svg, is_mock: isMock },
  }
}

/** Poll order status for the pay screen (read-only; never settles). */
export async function pollStatusAction(trackingToken: string): Promise<{ ok: boolean; status?: string; data?: QrStatus }> {
  const res = await getQrStatus(trackingToken)
  if (!res.ok) return { ok: false }
  return { ok: true, status: res.value.status, data: res.value }
}
