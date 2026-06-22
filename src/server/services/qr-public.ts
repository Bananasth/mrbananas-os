import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { createSupabasePublicClient } from '@/lib/supabase/public'

/**
 * Public (anon) QR ordering service. Calls the SECURITY DEFINER public RPCs with the anon
 * client (no session). Customers never touch tables directly. Money is integer satang.
 */

export type QrOption = { option_id: string; name: string; price_adjustment: number; is_default: boolean }
export type QrGroup = {
  group_id: string; name: string; is_required: boolean
  selection_type: 'single' | 'multiple'; min_select: number; max_select: number; options: QrOption[]
}
export type QrProduct = {
  product_id: string; name: string; category: string; type: string
  price: number; menu_section: string | null; modifier_groups: QrGroup[]
}
export type QrMenu = { enabled: boolean; pickup_instruction?: string | null; products?: QrProduct[] }

export type QrCartItem = { product_id: string; qty: number; option_ids: string[] }
export type QrPending = { tracking_token: string; order_id: string; amount: number; client_uuid: string }
export type QrConfirm = { status: string; queue_number: number; order_id: string; already?: boolean; review_reason?: string }
export type QrStatusItem = { name: string; qty: number; status: string }
export type QrStatus = {
  found: boolean; status?: string; queue_number?: number | null; paid_at?: string | null
  total?: number; pickup_instruction?: string | null; items?: QrStatusItem[]
}

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<Result<T, ServiceError>> {
  const db = createSupabasePublicClient()
  const { data, error } = await db.rpc(fn, params)
  if (error) {
    const code = error.code === 'PGRST202' || error.code === 'PGRST205' ? 'not_found' : 'validation'
    return err(serviceError(code, error.message))
  }
  return ok(data as T)
}

export const getQrMenu = (slug: string) => rpc<QrMenu>('qr_menu', { p_slug: slug })

export const createPendingOrder = (slug: string, items: QrCartItem[], note: string | null) =>
  rpc<QrPending>('qr_create_pending_order', { p_slug: slug, p_items: items, p_note: note })

export const confirmQrPayment = (trackingToken: string, clientUuid: string) =>
  rpc<QrConfirm>('qr_confirm_payment', { p_tracking_token: trackingToken, p_client_uuid: clientUuid })

export const getQrStatus = (trackingToken: string) =>
  rpc<QrStatus>('qr_order_status', { p_tracking_token: trackingToken })
