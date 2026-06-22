import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext } from './context'

/**
 * QR staff station-board service. Reads the per-item production board + production timeline,
 * and wraps the B5.4 production RPCs (claim / recipe view / prepare / QC / rework / photo /
 * complete). Every write goes through the SECURITY DEFINER RPCs (authorization + audit live in
 * the DB); these run under RLS as the logged-in staff member. Device audit is captured by the
 * caller (server action reads ip/user-agent from headers) and threaded through.
 */

const ROLES = ['owner', 'manager', 'staff', 'baker'] as const

export type Device = {
  ip?: string | null
  deviceId?: string | null
  userAgent?: string | null
  deviceName?: string | null
}

export type BarItem = {
  orderItemId: string
  orderId: string
  queueNumber: number | null
  orderStatus: string
  productName: string
  qty: number
  prepStatus: string
  attemptNo: number
  reworkCount: number
  stationType: string
  claimedBy: string | null
  qcBy: string | null
  hasPhoto: boolean
}

export type BarEmployee = { id: string; name: string; code: string; trainingMode: boolean }

export type TimelineRow = {
  event: string
  actor: string | null
  occurredAt: string
  detail: Record<string, unknown> | null
  source: string
}

type Mutation = { orderItemId: string; employeeId: string; device?: Device }

function rpcArgs(orderItemId: string, employeeId: string, device?: Device) {
  return {
    p_order_item_id: orderItemId,
    p_employee_id: employeeId,
    p_ip: device?.ip ?? null,
    p_device_id: device?.deviceId ?? null,
    p_user_agent: device?.userAgent ?? null,
    p_device_name: device?.deviceName ?? null,
  }
}

/** The station board: every non-completed (plus just-completed) item for a branch. */
export async function listBarQueue(branchId: string): Promise<Result<BarItem[], ServiceError>> {
  const gate = await getServiceContext(ROLES)
  if (!gate.ok) return gate
  const branchOk = ensureBranch(gate.value.ctx, branchId)
  if (!branchOk.ok) return branchOk
  const { db } = gate.value

  const { data: preps, error: pErr } = await db
    .from('prep_item')
    .select('order_item_id, order_id, prep_status, attempt_no, rework_count, station_type, claimed_by, qc_by')
    .eq('branch_id', branchId)
  if (pErr) return err(serviceError('db', pErr.message))
  const rows = (preps ?? []) as Array<{
    order_item_id: string; order_id: string; prep_status: string; attempt_no: number
    rework_count: number; station_type: string; claimed_by: string | null; qc_by: string | null
  }>
  if (rows.length === 0) return ok([])

  const orderItemIds = rows.map((r) => r.order_item_id)
  const orderIds = [...new Set(rows.map((r) => r.order_id))]

  const [oiRes, qoRes, photoRes] = await Promise.all([
    db.from('order_item').select('id, qty, product_id').in('id', orderItemIds),
    db.from('qr_order').select('order_id, queue_number, status').in('order_id', orderIds),
    db.from('completion_photo').select('order_item_id, attempt_no').in('order_item_id', orderItemIds),
  ])
  if (oiRes.error) return err(serviceError('db', oiRes.error.message))
  if (qoRes.error) return err(serviceError('db', qoRes.error.message))
  if (photoRes.error) return err(serviceError('db', photoRes.error.message))

  const ois = (oiRes.data ?? []) as Array<{ id: string; qty: number; product_id: string }>
  const productIds = [...new Set(ois.map((o) => o.product_id))]
  const prodRes = await db.from('product').select('id, name').in('id', productIds)
  if (prodRes.error) return err(serviceError('db', prodRes.error.message))

  const nameById = new Map((prodRes.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  const oiById = new Map(ois.map((o) => [o.id, o]))
  const qoById = new Map(
    (qoRes.data ?? []).map((q: { order_id: string; queue_number: number | null; status: string }) => [q.order_id, q]),
  )
  const photoKeys = new Set(
    (photoRes.data ?? []).map((p: { order_item_id: string; attempt_no: number }) => `${p.order_item_id}:${p.attempt_no}`),
  )

  const items: BarItem[] = rows.map((r) => {
    const oi = oiById.get(r.order_item_id)
    const qo = qoById.get(r.order_id)
    return {
      orderItemId: r.order_item_id,
      orderId: r.order_id,
      queueNumber: qo?.queue_number ?? null,
      orderStatus: qo?.status ?? '—',
      productName: oi ? (nameById.get(oi.product_id) ?? 'item') : 'item',
      qty: oi?.qty ?? 1,
      prepStatus: r.prep_status,
      attemptNo: r.attempt_no,
      reworkCount: r.rework_count,
      stationType: r.station_type,
      claimedBy: r.claimed_by,
      qcBy: r.qc_by,
      hasPhoto: photoKeys.has(`${r.order_item_id}:${r.attempt_no}`),
    }
  })
  // queue order: lowest queue number first; unpaid (null) last
  items.sort((a, b) => (a.queueNumber ?? 1e9) - (b.queueNumber ?? 1e9))
  return ok(items)
}

/** Branch employees, for the "I am" selector that supplies p_employee_id. */
export async function listBarEmployees(branchId: string): Promise<Result<BarEmployee[], ServiceError>> {
  const gate = await getServiceContext(ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data, error } = await db
    .from('employee')
    .select('id, name, code, training_mode')
    .eq('branch_id', branchId)
    .order('name')
  if (error) return err(serviceError('db', error.message))
  return ok(
    (data ?? []).map((e: { id: string; name: string; code: string; training_mode: boolean }) => ({
      id: e.id, name: e.name, code: e.code, trainingMode: e.training_mode,
    })),
  )
}

/** Per-item production timeline (unified view). */
export async function getItemTimeline(orderItemId: string): Promise<Result<TimelineRow[], ServiceError>> {
  const gate = await getServiceContext(ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data, error } = await db
    .from('qr_production_timeline')
    .select('event, actor, occurred_at, detail, source')
    .eq('order_item_id', orderItemId)
    .order('occurred_at', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  return ok(
    (data ?? []).map((r: { event: string; actor: string | null; occurred_at: string; detail: Record<string, unknown> | null; source: string }) => ({
      event: r.event, actor: r.actor, occurredAt: r.occurred_at, detail: r.detail, source: r.source,
    })),
  )
}

async function callRpc(fn: string, params: Record<string, unknown>): Promise<Result<unknown, ServiceError>> {
  const gate = await getServiceContext(ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db.rpc(fn, params)
  if (error) return err(serviceError('validation', error.message))
  return ok(data)
}

export const claimItem = (i: Mutation) => callRpc('qr_claim_item', rpcArgs(i.orderItemId, i.employeeId, i.device))
export const startPreparing = (i: Mutation) => callRpc('qr_start_preparing', rpcArgs(i.orderItemId, i.employeeId, i.device))
export const startQc = (i: Mutation) => callRpc('qr_start_qc', rpcArgs(i.orderItemId, i.employeeId, i.device))
export const passQc = (i: Mutation) => callRpc('qr_pass_qc', rpcArgs(i.orderItemId, i.employeeId, i.device))
export const completeItem = (i: Mutation) => callRpc('qr_complete_item', rpcArgs(i.orderItemId, i.employeeId, i.device))

export const qcFail = (i: Mutation & { reason: string }) =>
  callRpc('qr_qc_fail', { ...rpcArgs(i.orderItemId, i.employeeId, i.device), p_reason: i.reason })

export const uploadCompletionPhoto = (i: Mutation & { photoUrl: string }) =>
  callRpc('qr_upload_completion_photo', { ...rpcArgs(i.orderItemId, i.employeeId, i.device), p_photo_url: i.photoUrl })

/** Open the recipe or method (one-time). Returns { outcome, content, access_id }. */
export async function openRecipe(
  i: Mutation & { kind: 'recipe' | 'method' },
): Promise<Result<{ outcome: string; content: unknown; access_id: string | null }, ServiceError>> {
  const r = await callRpc('qr_open_recipe', { ...rpcArgs(i.orderItemId, i.employeeId, i.device), p_kind: i.kind })
  if (!r.ok) return r
  return ok(r.value as { outcome: string; content: unknown; access_id: string | null })
}

export async function closeRecipe(accessId: string): Promise<Result<number, ServiceError>> {
  const r = await callRpc('qr_close_recipe', { p_access_id: accessId })
  if (!r.ok) return r
  return ok((r.value as number) ?? 0)
}
