import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext } from './context'
import type { BomEffect, BomLine } from './modifier-bom'

const WRITE_ROLES = ['owner', 'manager', 'staff'] as const
const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

export type OptionResolution = {
  id: string
  name: string
  priceAdjustment: number
  effects: BomEffect[]
}

type OptRow = { id: string; name: string; price_adjustment: number }
type EffRow = {
  modifier_option_id: string
  effect_type: BomEffect['effectType']
  target_item_id: string | null
  new_item_id: string | null
  quantity: number | null
  unit: string | null
}

/** Server-authoritative resolution of selected options: price adjustment + inventory effects. */
export async function getOptionResolutions(
  optionIds: string[],
): Promise<Result<OptionResolution[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  if (optionIds.length === 0) return ok([])
  const { db } = gate.value
  const [optsR, effsR] = await Promise.all([
    db.from('modifier_option').select('id, name, price_adjustment').in('id', optionIds),
    db.from('modifier_inventory_effect').select('*').in('modifier_option_id', optionIds),
  ])
  if (optsR.error) return err(serviceError('db', optsR.error.message))
  if (effsR.error) return err(serviceError('db', effsR.error.message))

  const effByOption = new Map<string, BomEffect[]>()
  for (const e of (effsR.data ?? []) as EffRow[]) {
    const list = effByOption.get(e.modifier_option_id) ?? []
    list.push({
      effectType: e.effect_type,
      targetItemId: e.target_item_id,
      newItemId: e.new_item_id,
      quantity: e.quantity,
      unit: e.unit,
    })
    effByOption.set(e.modifier_option_id, list)
  }
  return ok(
    ((optsR.data ?? []) as OptRow[]).map((o) => ({
      id: o.id,
      name: o.name,
      priceAdjustment: o.price_adjustment,
      effects: effByOption.get(o.id) ?? [],
    })),
  )
}

/** Persist the selected modifier options for an order line (snapshot name + price). */
export async function persistOrderItemModifiers(
  orderItemId: string,
  branchId: string,
  mods: { optionId: string; optionName: string; priceAdjustment: number }[],
): Promise<Result<true, ServiceError>> {
  if (mods.length === 0) return ok(true)
  const gate = await getServiceContext(WRITE_ROLES)
  if (!gate.ok) return gate
  const { ctx, db } = gate.value
  const rows = mods.map((m) => ({
    tenant_id: ctx.tenantId,
    branch_id: branchId,
    order_item_id: orderItemId,
    modifier_option_id: m.optionId,
    option_name: m.optionName,
    price_adjustment: m.priceAdjustment,
  }))
  const { error } = await db.from('order_item_modifier').insert(rows)
  if (error) return err(serviceError('db', error.message))
  return ok(true)
}

/** Persist the resolved per-line BoM (the effective ingredients the DB will deduct). */
export async function persistOrderItemIngredients(
  orderItemId: string,
  branchId: string,
  bom: BomLine[],
): Promise<Result<true, ServiceError>> {
  if (bom.length === 0) return ok(true)
  const gate = await getServiceContext(WRITE_ROLES)
  if (!gate.ok) return gate
  const { ctx, db } = gate.value
  const rows = bom.map((b) => ({
    tenant_id: ctx.tenantId,
    branch_id: branchId,
    order_item_id: orderItemId,
    item_id: b.itemId,
    quantity: b.quantity,
    unit: b.unit,
  }))
  const { error } = await db.from('order_item_ingredient').insert(rows)
  if (error) return err(serviceError('db', error.message))
  return ok(true)
}
