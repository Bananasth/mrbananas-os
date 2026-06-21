/**
 * Resolved bill-of-materials engine for modifiers. Pure — no I/O — so it's the testable
 * heart of modifier-aware stock deduction. Given a product's base recipe ingredients and the
 * inventory effects of the customer's selected options, it returns the EFFECTIVE per-drink
 * ingredient list that POS persists to order_item_ingredient and the DB deducts via FEFO.
 *
 * Effect semantics (configurable; nothing hardcoded):
 *   set_qty : override targetItem's quantity            (sweetness/ice -> syrup/ice)
 *   add     : add quantity to targetItem (sum)          (extra shot, toppings)
 *   replace : remove targetItem, set newItem = quantity (Milk -> Oat Milk)
 *   none    : no stock effect                           (temperature; price-only)
 */
import type { ModifierEffectType } from './types'

export type BomLine = { itemId: string; quantity: number; unit: string }

export type BomEffect = {
  effectType: ModifierEffectType
  targetItemId: string | null
  newItemId: string | null
  quantity: number | null
  unit: string | null
}

/** Apply effects (in order) to the base ingredient list. Returns the resolved per-drink BoM. */
export function resolveBoM(base: readonly BomLine[], effects: readonly BomEffect[]): BomLine[] {
  const map = new Map<string, BomLine>()
  for (const b of base) map.set(b.itemId, { ...b })

  for (const e of effects) {
    if (e.effectType === 'none') continue
    if (e.quantity == null) continue

    if (e.effectType === 'set_qty' && e.targetItemId) {
      const existing = map.get(e.targetItemId)
      map.set(e.targetItemId, {
        itemId: e.targetItemId,
        quantity: e.quantity,
        unit: e.unit ?? existing?.unit ?? '',
      })
    } else if (e.effectType === 'add' && e.targetItemId) {
      const existing = map.get(e.targetItemId)
      map.set(e.targetItemId, {
        itemId: e.targetItemId,
        quantity: (existing?.quantity ?? 0) + e.quantity,
        unit: e.unit ?? existing?.unit ?? '',
      })
    } else if (e.effectType === 'replace' && e.targetItemId && e.newItemId) {
      map.delete(e.targetItemId)
      map.set(e.newItemId, {
        itemId: e.newItemId,
        quantity: e.quantity,
        unit: e.unit ?? map.get(e.newItemId)?.unit ?? '',
      })
    }
  }

  // Drop zero/negative lines (e.g. "0% sweet" -> nothing to deduct).
  return [...map.values()].filter((l) => l.quantity > 0)
}
