'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  claimItem, startPreparing, startQc, passQc, qcFail, uploadCompletionPhoto, completeItem,
  openRecipe, closeRecipe, getItemTimeline, completePickup, type Device, type TimelineRow,
} from '@/server/services'

export type ActionState = { ok: boolean; error?: string; data?: unknown }

async function device(deviceId: string | null, deviceName: string | null): Promise<Device> {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
    deviceId,
    deviceName,
  }
}

function done(res: { ok: boolean; error?: { message: string }; value?: unknown }): ActionState {
  if (!res.ok) return { ok: false, error: res.error?.message ?? 'error' }
  revalidatePath('/bar')
  return { ok: true, data: 'value' in res ? res.value : undefined }
}

export async function claimAction(orderItemId: string, employeeId: string, deviceId: string | null, deviceName: string | null) {
  return done(await claimItem({ orderItemId, employeeId, device: await device(deviceId, deviceName) }))
}
export async function startPreparingAction(orderItemId: string, employeeId: string, deviceId: string | null, deviceName: string | null) {
  return done(await startPreparing({ orderItemId, employeeId, device: await device(deviceId, deviceName) }))
}
export async function startQcAction(orderItemId: string, employeeId: string, deviceId: string | null, deviceName: string | null) {
  return done(await startQc({ orderItemId, employeeId, device: await device(deviceId, deviceName) }))
}
export async function passQcAction(orderItemId: string, employeeId: string, deviceId: string | null, deviceName: string | null) {
  return done(await passQc({ orderItemId, employeeId, device: await device(deviceId, deviceName) }))
}
export async function completeAction(orderItemId: string, employeeId: string, deviceId: string | null, deviceName: string | null) {
  return done(await completeItem({ orderItemId, employeeId, device: await device(deviceId, deviceName) }))
}
export async function qcFailAction(orderItemId: string, employeeId: string, reason: string, deviceId: string | null, deviceName: string | null) {
  return done(await qcFail({ orderItemId, employeeId, reason, device: await device(deviceId, deviceName) }))
}
export async function uploadPhotoAction(orderItemId: string, employeeId: string, photoUrl: string, deviceId: string | null, deviceName: string | null) {
  return done(await uploadCompletionPhoto({ orderItemId, employeeId, photoUrl, device: await device(deviceId, deviceName) }))
}

/**
 * Confirm pickup/handover for a ready_for_pickup order (order-level, not item-level).
 * The actor is the AUTHENTICATED user's own employee row — resolved in the service and
 * re-verified by app.qr_complete_pickup — so the board's "I am" selector is not used here.
 */
export async function completePickupAction(orderId: string, branchId: string) {
  return done(await completePickup({ orderId, branchId }))
}

/** Open recipe/method (one-time). Returns the content without revalidating the whole board. */
export async function openRecipeAction(
  orderItemId: string, employeeId: string, kind: 'recipe' | 'method', deviceId: string | null, deviceName: string | null,
): Promise<ActionState> {
  const res = await openRecipe({ orderItemId, employeeId, kind, device: await device(deviceId, deviceName) })
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, data: res.value }
}

export async function closeRecipeAction(accessId: string): Promise<ActionState> {
  const res = await closeRecipe(accessId)
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, data: res.value }
}

export async function timelineAction(orderItemId: string): Promise<ActionState & { rows?: TimelineRow[] }> {
  const res = await getItemTimeline(orderItemId)
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true, rows: res.value }
}
