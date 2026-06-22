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
