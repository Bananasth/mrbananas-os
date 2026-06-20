import 'server-only'
import { type Result, err, ok } from '@/lib/result'
import { type ServiceError, serviceError } from './roles'
import { getServiceContext, parseInput } from './context'
import {
  FulfilItemSchema,
  type FulfilItemInput,
  FulfilOrderSchema,
  type FulfilOrderInput,
} from './schemas'

const FULFIL_ROLES = ['owner', 'manager', 'staff', 'baker'] as const

/**
 * Fulfil a single order line: deducts stock via FEFO (app.fulfil_order_item) — for batch
 * products it consumes finished lots (stamping the source batch for traceability); for
 * made-to-order it deducts each recipe ingredient. Atomic; raises if stock is insufficient.
 */
export async function fulfilOrderItem(
  input: FulfilItemInput,
): Promise<Result<{ orderItemId: string }, ServiceError>> {
  const gate = await getServiceContext(FULFIL_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(FulfilItemSchema, input)
  if (!parsed.ok) return parsed
  const { db } = gate.value
  const { error } = await db.schema('app').rpc('fulfil_order_item', {
    p_order_item_id: parsed.value.orderItemId,
    p_employee_id: parsed.value.employeeId ?? null,
  })
  if (error) return err(serviceError('db', error.message))
  return ok({ orderItemId: parsed.value.orderItemId })
}

/** Fulfil every line of an order (FEFO deduction per line). Stops at the first failure. */
export async function fulfilOrder(
  input: FulfilOrderInput,
): Promise<Result<{ fulfilled: number }, ServiceError>> {
  const gate = await getServiceContext(FULFIL_ROLES)
  if (!gate.ok) return gate
  const parsed = parseInput(FulfilOrderSchema, input)
  if (!parsed.ok) return parsed
  const { db } = gate.value
  const { data: items, error } = await db
    .from('order_item')
    .select('id')
    .eq('order_id', parsed.value.orderId)
  if (error) return err(serviceError('db', error.message))
  const ids = ((items ?? []) as { id: string }[]).map((r) => r.id)

  let fulfilled = 0
  for (const id of ids) {
    const { error: fErr } = await db.schema('app').rpc('fulfil_order_item', {
      p_order_item_id: id,
      p_employee_id: parsed.value.employeeId ?? null,
    })
    if (fErr) return err(serviceError('db', `order_item ${id}: ${fErr.message}`))
    fulfilled += 1
  }
  return ok({ fulfilled })
}
