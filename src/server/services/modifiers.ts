import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { type ServerDb, getServiceContext, parseInput } from './context'
import {
  AssignProductModifierGroupSchema,
  type AssignProductModifierGroupInput,
  CreateModifierEffectSchema,
  type CreateModifierEffectInput,
  CreateModifierGroupSchema,
  type CreateModifierGroupInput,
  CreateModifierOptionSchema,
  type CreateModifierOptionInput,
  DeleteModifierEffectSchema,
  type DeleteModifierEffectInput,
  DeleteModifierGroupSchema,
  type DeleteModifierGroupInput,
  DeleteModifierOptionSchema,
  type DeleteModifierOptionInput,
  UnassignProductModifierGroupSchema,
  type UnassignProductModifierGroupInput,
  UpdateModifierGroupSchema,
  type UpdateModifierGroupInput,
  UpdateModifierOptionSchema,
  type UpdateModifierOptionInput,
} from './schemas'
import type {
  GroupWithOptions,
  ModifierGroup,
  ModifierInventoryEffect,
  ModifierOption,
  OptionWithEffects,
} from './types'

const READ_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

// ---------- reads ----------

/** All modifier groups (admin list), ordered. */
export async function listModifierGroups(): Promise<Result<ModifierGroup[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('modifier_group')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  return ok((data ?? []) as ModifierGroup[])
}

/** One group with ALL its options (incl. inactive) + each option's effects — admin detail. */
export async function getModifierGroupDetail(
  groupId: string,
): Promise<Result<GroupWithOptions | null, ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data: group, error: gErr } = await db
    .from('modifier_group')
    .select('*')
    .eq('id', groupId)
    .maybeSingle()
  if (gErr) return err(serviceError('db', gErr.message))
  if (!group) return ok(null)
  const withOptions = await attachOptions(db, [group as ModifierGroup], false)
  return ok(withOptions[0] ?? null)
}

/** Active groups + active options (+ effects) assigned to a product — POS rendering & resolving. */
export async function getProductModifiers(
  productId: string,
): Promise<Result<GroupWithOptions[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data: links, error: lErr } = await db
    .from('product_modifier_group')
    .select('modifier_group_id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
  if (lErr) return err(serviceError('db', lErr.message))
  const groupIds = ((links ?? []) as { modifier_group_id: string }[]).map((l) => l.modifier_group_id)
  if (groupIds.length === 0) return ok([])

  const { data: groups, error: gErr } = await db
    .from('modifier_group')
    .select('*')
    .in('id', groupIds)
    .eq('is_active', true)
  if (gErr) return err(serviceError('db', gErr.message))

  const order = new Map(
    ((links ?? []) as { modifier_group_id: string; sort_order: number }[]).map((l) => [
      l.modifier_group_id,
      l.sort_order,
    ]),
  )
  const sorted = ((groups ?? []) as ModifierGroup[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  )
  return ok(await attachOptions(db, sorted, true))
}

/** Attach options (+ effects) to groups. activeOnly filters out inactive options. */
async function attachOptions(
  db: ServerDb,
  groups: ModifierGroup[],
  activeOnly: boolean,
): Promise<GroupWithOptions[]> {
  if (groups.length === 0) return []
  const groupIds = groups.map((g) => g.id)
  let optQuery = db.from('modifier_option').select('*').in('group_id', groupIds)
  if (activeOnly) optQuery = optQuery.eq('is_active', true)
  const { data: optData } = await optQuery.order('sort_order', { ascending: true })
  const options = (optData ?? []) as ModifierOption[]

  const optionIds = options.map((o) => o.id)
  let effects: ModifierInventoryEffect[] = []
  if (optionIds.length > 0) {
    const { data: effData } = await db
      .from('modifier_inventory_effect')
      .select('*')
      .in('modifier_option_id', optionIds)
    effects = (effData ?? []) as ModifierInventoryEffect[]
  }

  const effectsByOption = new Map<string, ModifierInventoryEffect[]>()
  for (const e of effects) {
    const list = effectsByOption.get(e.modifier_option_id) ?? []
    list.push(e)
    effectsByOption.set(e.modifier_option_id, list)
  }
  const optionsByGroup = new Map<string, OptionWithEffects[]>()
  for (const o of options) {
    const list = optionsByGroup.get(o.group_id) ?? []
    list.push({ ...o, effects: effectsByOption.get(o.id) ?? [] })
    optionsByGroup.set(o.group_id, list)
  }
  return groups.map((g) => ({ ...g, options: optionsByGroup.get(g.id) ?? [] }))
}

/** The modifier_group_ids assigned to a product (admin assignment view). */
export async function listProductModifierGroupIds(
  productId: string,
): Promise<Result<string[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { data, error } = await gate.value.db
    .from('product_modifier_group')
    .select('modifier_group_id')
    .eq('product_id', productId)
  if (error) return err(serviceError('db', error.message))
  return ok(((data ?? []) as { modifier_group_id: string }[]).map((r) => r.modifier_group_id))
}

/** A product's assigned modifier groups with their per-product sort order, sorted. */
export async function getProductModifierAssignments(
  productId: string,
): Promise<Result<{ group: ModifierGroup; sortOrder: number }[], ServiceError>> {
  const gate = await getServiceContext(READ_ROLES)
  if (!gate.ok) return gate
  const { db } = gate.value
  const { data: links, error } = await db
    .from('product_modifier_group')
    .select('modifier_group_id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
  if (error) return err(serviceError('db', error.message))
  const rows = (links ?? []) as { modifier_group_id: string; sort_order: number }[]
  if (rows.length === 0) return ok([])

  const { data: groups, error: gErr } = await db
    .from('modifier_group')
    .select('*')
    .in(
      'id',
      rows.map((r) => r.modifier_group_id),
    )
  if (gErr) return err(serviceError('db', gErr.message))
  const byId = new Map(((groups ?? []) as ModifierGroup[]).map((g) => [g.id, g]))

  const out: { group: ModifierGroup; sortOrder: number }[] = []
  for (const r of rows) {
    const group = byId.get(r.modifier_group_id)
    if (group) out.push({ group, sortOrder: r.sort_order })
  }
  return ok(out)
}

// ---------- writes (owner) ----------

export async function createModifierGroup(
  input: CreateModifierGroupInput,
): Promise<Result<ModifierGroup, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateModifierGroupSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const { data, error } = await db
    .from('modifier_group')
    .insert({
      tenant_id: ctx.tenantId,
      name: v.name,
      description: v.description ?? null,
      is_required: v.isRequired ?? false,
      selection_type: v.selectionType ?? 'single',
      display_type: v.displayType ?? 'radio',
      min_select: v.minSelect ?? 0,
      max_select: v.maxSelect ?? 1,
      sort_order: v.sortOrder ?? 0,
      is_active: v.isActive ?? true,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as ModifierGroup)
}

export async function updateModifierGroup(
  input: UpdateModifierGroupInput,
): Promise<Result<ModifierGroup, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateModifierGroupSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const patch: Record<string, unknown> = {}
  if (v.name !== undefined) patch.name = v.name
  if (v.description !== undefined) patch.description = v.description
  if (v.isRequired !== undefined) patch.is_required = v.isRequired
  if (v.selectionType !== undefined) patch.selection_type = v.selectionType
  if (v.displayType !== undefined) patch.display_type = v.displayType
  if (v.minSelect !== undefined) patch.min_select = v.minSelect
  if (v.maxSelect !== undefined) patch.max_select = v.maxSelect
  if (v.sortOrder !== undefined) patch.sort_order = v.sortOrder
  if (v.isActive !== undefined) patch.is_active = v.isActive
  const { data, error } = await db
    .from('modifier_group')
    .update(patch)
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as ModifierGroup)
}

export async function deleteModifierGroup(
  input: DeleteModifierGroupInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteModifierGroupSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { error } = await db
    .from('modifier_group')
    .delete()
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
  if (error) {
    return err(serviceError('conflict', `ลบไม่ได้ (อาจถูกใช้ในออเดอร์) · cannot delete: ${error.message}`))
  }
  return ok({ deleted: true })
}

export async function createModifierOption(
  input: CreateModifierOptionInput,
): Promise<Result<ModifierOption, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateModifierOptionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const { data, error } = await db
    .from('modifier_option')
    .insert({
      tenant_id: ctx.tenantId,
      group_id: v.groupId,
      name: v.name,
      code: v.code ?? null,
      image_url: v.imageUrl ?? null,
      price_adjustment: v.priceAdjustment ?? 0,
      is_default: v.isDefault ?? false,
      is_active: v.isActive ?? true,
      sort_order: v.sortOrder ?? 0,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as ModifierOption)
}

export async function updateModifierOption(
  input: UpdateModifierOptionInput,
): Promise<Result<ModifierOption, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UpdateModifierOptionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const patch: Record<string, unknown> = {}
  if (v.name !== undefined) patch.name = v.name
  if (v.code !== undefined) patch.code = v.code
  if (v.imageUrl !== undefined) patch.image_url = v.imageUrl
  if (v.priceAdjustment !== undefined) patch.price_adjustment = v.priceAdjustment
  if (v.isDefault !== undefined) patch.is_default = v.isDefault
  if (v.isActive !== undefined) patch.is_active = v.isActive
  if (v.sortOrder !== undefined) patch.sort_order = v.sortOrder
  const { data, error } = await db
    .from('modifier_option')
    .update(patch)
    .eq('id', v.id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as ModifierOption)
}

export async function deleteModifierOption(
  input: DeleteModifierOptionInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteModifierOptionSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { error } = await db
    .from('modifier_option')
    .delete()
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
  if (error) {
    return err(serviceError('conflict', `ลบไม่ได้ (อาจถูกใช้ในออเดอร์) · cannot delete: ${error.message}`))
  }
  return ok({ deleted: true })
}

export async function createModifierEffect(
  input: CreateModifierEffectInput,
): Promise<Result<ModifierInventoryEffect, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(CreateModifierEffectSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const v = parsed.value
  const { data, error } = await db
    .from('modifier_inventory_effect')
    .insert({
      tenant_id: ctx.tenantId,
      modifier_option_id: v.modifierOptionId,
      effect_type: v.effectType,
      target_item_id: v.targetItemId ?? null,
      new_item_id: v.newItemId ?? null,
      quantity: v.quantity ?? null,
      unit: v.unit ?? null,
    })
    .select('*')
    .single()
  if (error) return err(serviceError('db', error.message))
  return ok(data as ModifierInventoryEffect)
}

export async function deleteModifierEffect(
  input: DeleteModifierEffectInput,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(DeleteModifierEffectSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { error } = await db
    .from('modifier_inventory_effect')
    .delete()
    .eq('id', parsed.value.id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return err(serviceError('db', error.message))
  return ok({ deleted: true })
}

export async function assignProductModifierGroup(
  input: AssignProductModifierGroupInput,
): Promise<Result<{ assigned: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(AssignProductModifierGroupSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { error } = await db.from('product_modifier_group').upsert(
    {
      tenant_id: ctx.tenantId,
      product_id: parsed.value.productId,
      modifier_group_id: parsed.value.modifierGroupId,
      sort_order: parsed.value.sortOrder ?? 0,
    },
    { onConflict: 'product_id,modifier_group_id' },
  )
  if (error) return err(serviceError('db', error.message))
  return ok({ assigned: true })
}

export async function unassignProductModifierGroup(
  input: UnassignProductModifierGroupInput,
): Promise<Result<{ removed: true }, ServiceError>> {
  const gate = await getServiceContext(['owner'])
  if (!gate.ok) return gate
  const parsed = parseInput(UnassignProductModifierGroupSchema, input)
  if (!parsed.ok) return parsed
  const { ctx, db } = gate.value
  const { error } = await db
    .from('product_modifier_group')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('product_id', parsed.value.productId)
    .eq('modifier_group_id', parsed.value.modifierGroupId)
  if (error) return err(serviceError('db', error.message))
  return ok({ removed: true })
}
