import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { type ServerDb, ensureBranch, getServiceContext } from './context'

/** Owner-only admin reads/writes for the QR ordering system (config, leak, complaints, KPI). */

const OWNER = ['owner'] as const

export type QrConfigRow = {
  branch_id: string; tenant_id: string; enabled: boolean; public_slug: string
  pickup_instruction: string | null; prep_sla_minutes: number; claim_timeout_minutes: number
}

export async function getQrConfig(branchId: string): Promise<Result<QrConfigRow | null, ServiceError>> {
  const gate = await getServiceContext(OWNER)
  if (!gate.ok) return gate
  const b = ensureBranch(gate.value.ctx, branchId)
  if (!b.ok) return b
  const { data, error } = await gate.value.db.from('qr_config').select('*').eq('branch_id', branchId).maybeSingle()
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? null) as QrConfigRow | null)
}

export async function upsertQrConfig(input: {
  branchId: string; enabled: boolean; publicSlug: string; pickupInstruction: string | null
}): Promise<Result<QrConfigRow, ServiceError>> {
  const gate = await getServiceContext(OWNER)
  if (!gate.ok) return gate
  const { ctx, db } = gate.value
  const b = ensureBranch(ctx, input.branchId)
  if (!b.ok) return b
  if (!/^[a-z0-9-]{3,40}$/.test(input.publicSlug)) {
    return err(serviceError('validation', 'Slug must be 3–40 chars: lowercase letters, numbers, hyphens.'))
  }
  const { data, error } = await db
    .from('qr_config')
    .upsert(
      {
        branch_id: input.branchId,
        tenant_id: ctx.tenantId,
        enabled: input.enabled,
        public_slug: input.publicSlug,
        pickup_instruction: input.pickupInstruction,
      },
      { onConflict: 'branch_id' },
    )
    .select('*')
    .single()
  if (error) {
    const conflict = error.code === '23505'
    return err(serviceError(conflict ? 'conflict' : 'db',
      conflict ? 'That slug is already used by another branch.' : error.message))
  }
  return ok(data as QrConfigRow)
}

// ============================ Recipe access / leak monitoring ============================

export type RecipeAccessRow = {
  id: string; kind: string; outcome: string; employeeName: string | null
  durationSeconds: number | null; openedAt: string; closedAt: string | null
  deviceId: string | null; ip: string | null
}

export type RecipeAnomalyRow = {
  id: string; kind: string; outcome: string; deviceId: string | null; ip: string | null
  openedAt: string; durationSeconds: number | null; denied: boolean; openedNotClosed: boolean; longView: boolean
}

export async function listRecipeAccess(branchId: string): Promise<Result<RecipeAccessRow[], ServiceError>> {
  const gate = await getServiceContext(OWNER)
  if (!gate.ok) return gate
  const b = ensureBranch(gate.value.ctx, branchId)
  if (!b.ok) return b
  const { data, error } = await gate.value.db
    .from('recipe_access')
    .select('id, kind, outcome, duration_seconds, opened_at, closed_at, device_id, ip_address, employee:employee_id(name)')
    .eq('branch_id', branchId)
    .order('opened_at', { ascending: false })
    .limit(300)
  if (error) return err(serviceError('db', error.message))
  type Row = {
    id: string; kind: string; outcome: string; duration_seconds: number | null; opened_at: string
    closed_at: string | null; device_id: string | null; ip_address: string | null
    employee: { name: string } | { name: string }[] | null
  }
  return ok((data ?? []).map((r: Row) => {
    const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee
    return {
      id: r.id, kind: r.kind, outcome: r.outcome, employeeName: emp?.name ?? null,
      durationSeconds: r.duration_seconds, openedAt: r.opened_at, closedAt: r.closed_at,
      deviceId: r.device_id, ip: r.ip_address,
    }
  }))
}

export async function listRecipeAnomalies(branchId: string): Promise<Result<RecipeAnomalyRow[], ServiceError>> {
  const gate = await getServiceContext(OWNER)
  if (!gate.ok) return gate
  const b = ensureBranch(gate.value.ctx, branchId)
  if (!b.ok) return b
  const { data, error } = await gate.value.db
    .from('qr_recipe_access_anomaly')
    .select('id, kind, outcome, device_id, ip_address, opened_at, duration_seconds, denied, opened_not_closed, long_view')
    .eq('branch_id', branchId)
    .order('opened_at', { ascending: false })
    .limit(100)
  if (error) return err(serviceError('db', error.message))
  type Row = {
    id: string; kind: string; outcome: string; device_id: string | null; ip_address: string | null
    opened_at: string; duration_seconds: number | null; denied: boolean; opened_not_closed: boolean; long_view: boolean
  }
  return ok((data ?? []).map((r: Row) => ({
    id: r.id, kind: r.kind, outcome: r.outcome, deviceId: r.device_id, ip: r.ip_address,
    openedAt: r.opened_at, durationSeconds: r.duration_seconds,
    denied: r.denied, openedNotClosed: r.opened_not_closed, longView: r.long_view,
  })))
}

// ============================ Complaints ============================

export type ComplaintRow = {
  id: string; createdAt: string; category: string; severity: string; status: string
  orderItemId: string; orderId: string; attemptNo: number | null; queueNumber: number | null
  productName: string; baristaName: string | null; description: string | null
  resolutionType: string | null; resolutionNote: string | null; prepDurationSeconds: number | null
  photoUrl: string | null; customerContactedAt: string | null; closedAt: string | null
}

type RawComplaint = {
  id: string; created_at: string; category: string; severity: string; status: string
  order_item_id: string; order_id: string; attempt_no: number | null; assigned_barista: string | null
  description: string | null; resolution_type: string | null; resolution_note: string | null
  preparation_duration_seconds: number | null; completion_photo_id: string | null
  customer_contacted_at: string | null; closed_at: string | null
}

/** Enrich complaint rows with product name, queue number, barista name, photo url. */
async function enrich(db: ServerDb, rows: RawComplaint[]): Promise<ComplaintRow[]> {
  if (rows.length === 0) return []
  const itemIds = [...new Set(rows.map((r) => r.order_item_id))]
  const orderIds = [...new Set(rows.map((r) => r.order_id))]
  const baristaIds = [...new Set(rows.map((r) => r.assigned_barista).filter(Boolean) as string[])]
  const photoIds = [...new Set(rows.map((r) => r.completion_photo_id).filter(Boolean) as string[])]

  const [oi, qo, emp, photos] = await Promise.all([
    db.from('order_item').select('id, product_id').in('id', itemIds),
    db.from('qr_order').select('order_id, queue_number').in('order_id', orderIds),
    baristaIds.length ? db.from('employee').select('id, name').in('id', baristaIds) : Promise.resolve({ data: [] }),
    photoIds.length ? db.from('completion_photo').select('id, photo_url').in('id', photoIds) : Promise.resolve({ data: [] }),
  ])
  const productIds = [...new Set(((oi.data ?? []) as Array<{ product_id: string }>).map((o) => o.product_id))]
  const prod = productIds.length ? await db.from('product').select('id, name').in('id', productIds) : { data: [] }

  const oiMap = new Map(((oi.data ?? []) as Array<{ id: string; product_id: string }>).map((o) => [o.id, o.product_id]))
  const nameMap = new Map(((prod.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))
  const queueMap = new Map(((qo.data ?? []) as Array<{ order_id: string; queue_number: number | null }>).map((q) => [q.order_id, q.queue_number]))
  const empMap = new Map(((emp.data ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]))
  const photoMap = new Map(((photos.data ?? []) as Array<{ id: string; photo_url: string }>).map((p) => [p.id, p.photo_url]))

  return rows.map((r) => ({
    id: r.id, createdAt: r.created_at, category: r.category, severity: r.severity, status: r.status,
    orderItemId: r.order_item_id, orderId: r.order_id, attemptNo: r.attempt_no,
    queueNumber: queueMap.get(r.order_id) ?? null,
    productName: nameMap.get(oiMap.get(r.order_item_id) ?? '') ?? 'item',
    baristaName: r.assigned_barista ? empMap.get(r.assigned_barista) ?? null : null,
    description: r.description, resolutionType: r.resolution_type, resolutionNote: r.resolution_note,
    prepDurationSeconds: r.preparation_duration_seconds,
    photoUrl: r.completion_photo_id ? photoMap.get(r.completion_photo_id) ?? null : null,
    customerContactedAt: r.customer_contacted_at, closedAt: r.closed_at,
  }))
}

const COLS = 'id, created_at, category, severity, status, order_item_id, order_id, attempt_no, assigned_barista, description, resolution_type, resolution_note, preparation_duration_seconds, completion_photo_id, customer_contacted_at, closed_at'

export async function listComplaints(branchId: string): Promise<Result<ComplaintRow[], ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('complaint').select(COLS).eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200)
  if (error) return err(serviceError('db', error.message))
  return ok(await enrich(gate.value.db, (data ?? []) as RawComplaint[]))
}

export async function getComplaint(id: string): Promise<Result<ComplaintRow, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db.from('complaint').select(COLS).eq('id', id).maybeSingle()
  if (error) return err(serviceError('db', error.message))
  if (!data) return err(serviceError('not_found', 'Complaint not found.'))
  const [row] = await enrich(gate.value.db, [data as RawComplaint])
  return ok(row)
}

export type ComplaintableItem = { orderItemId: string; label: string }

export async function listComplaintableItems(branchId: string): Promise<Result<ComplaintableItem[], ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data, error } = await db
    .from('prep_item').select('order_item_id, order_id, attempt_no')
    .eq('branch_id', branchId).eq('prep_status', 'completed').order('completed_at', { ascending: false }).limit(50)
  if (error) return err(serviceError('db', error.message))
  const rows = (data ?? []) as Array<{ order_item_id: string; order_id: string; attempt_no: number }>
  if (rows.length === 0) return ok([])
  const [oi, qo] = await Promise.all([
    db.from('order_item').select('id, product_id').in('id', rows.map((r) => r.order_item_id)),
    db.from('qr_order').select('order_id, queue_number').in('order_id', [...new Set(rows.map((r) => r.order_id))]),
  ])
  const oiMap = new Map(((oi.data ?? []) as Array<{ id: string; product_id: string }>).map((o) => [o.id, o.product_id]))
  const pIds = [...new Set([...oiMap.values()])]
  const prod = pIds.length ? await db.from('product').select('id, name').in('id', pIds) : { data: [] }
  const nameMap = new Map(((prod.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))
  const qMap = new Map(((qo.data ?? []) as Array<{ order_id: string; queue_number: number | null }>).map((q) => [q.order_id, q.queue_number]))
  return ok(rows.map((r) => ({
    orderItemId: r.order_item_id,
    label: `#${qMap.get(r.order_id) ?? "?"} · ${nameMap.get(oiMap.get(r.order_item_id) ?? '') ?? 'item'}${r.attempt_no > 1 ? ` (attempt ${r.attempt_no})` : ''}`,
  })))
}

async function callComplaintRpc(fn: string, params: Record<string, unknown>): Promise<Result<unknown, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db.rpc(fn, params)
  if (error) return err(serviceError('validation', error.message))
  return ok(data)
}

export const fileComplaintRpc = (i: { orderItemId: string; category: string; severity: string; description: string | null }) =>
  callComplaintRpc('file_complaint', { p_order_item_id: i.orderItemId, p_category: i.category, p_severity: i.severity, p_description: i.description, p_attempt_no: null })

export const setComplaintStatus = (i: { complaintId: string; status: string; note: string | null }) =>
  callComplaintRpc('complaint_set_status', { p_complaint_id: i.complaintId, p_status: i.status, p_note: i.note })

export const resolveComplaint = (i: { complaintId: string; resolutionType: string; note: string | null; customerContacted: boolean }) =>
  callComplaintRpc('complaint_resolve', { p_complaint_id: i.complaintId, p_resolution_type: i.resolutionType, p_resolution_note: i.note, p_refund_payment_id: null, p_remake_order_item_id: null, p_customer_contacted: i.customerContacted })

export async function assignComplaintToMe(complaintId: string): Promise<Result<unknown, ServiceError>> {
  const gate = await getServiceContext(['owner', 'manager'])
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db.rpc('complaint_assign', { p_complaint_id: complaintId, p_assigned_to: gate.value.ctx.userId })
  if (error) return err(serviceError('validation', error.message))
  return ok(data)
}
