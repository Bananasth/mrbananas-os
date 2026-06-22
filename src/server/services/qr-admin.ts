import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { ensureBranch, getServiceContext } from './context'

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
