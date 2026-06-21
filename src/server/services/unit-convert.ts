/**
 * Unit conversion for receiving stock. Pure — no I/O — so it's testable and safe to import
 * on the client. Stock is ALWAYS stored in the item's base_unit; receive converts the input
 * unit to base_unit. Conversions are only allowed within the same dimension.
 *
 *   mass:   g (base) , kg = 1000 g
 *   volume: ml (base), L  = 1000 ml
 *   count:  pc (base)
 */
export type UnitDim = 'mass' | 'volume' | 'count'

const UNITS: Record<string, { dim: UnitDim; toBase: number; display: string }> = {
  g: { dim: 'mass', toBase: 1, display: 'g' },
  kg: { dim: 'mass', toBase: 1000, display: 'kg' },
  ml: { dim: 'volume', toBase: 1, display: 'ml' },
  l: { dim: 'volume', toBase: 1000, display: 'L' },
  pc: { dim: 'count', toBase: 1, display: 'pc' },
}

/** Normalize a unit string to its canonical key (case/alias-insensitive). */
export function normUnit(u: string): string {
  const k = u.trim().toLowerCase()
  if (k === 'litre' || k === 'liter' || k === 'l') return 'l'
  if (k === 'pcs' || k === 'piece' || k === 'pieces' || k === 'pc') return 'pc'
  return k
}

/** Human-friendly label for a unit (e.g. 'l' -> 'L'). */
export function displayUnit(u: string): string {
  return UNITS[normUnit(u)]?.display ?? u
}

export type ConvertResult = { ok: true; value: number } | { ok: false; error: string }

/** Convert qty from `from` to `to` (same dimension only). Friendly errors otherwise. */
export function convertUnit(qty: number, from: string, to: string): ConvertResult {
  const f = UNITS[normUnit(from)]
  const t = UNITS[normUnit(to)]
  if (!f) return { ok: false, error: `หน่วยไม่รองรับ · Unsupported unit "${from}"` }
  if (!t) return { ok: false, error: `หน่วยไม่รองรับ · Unsupported unit "${to}"` }
  if (f.dim !== t.dim) {
    return {
      ok: false,
      error: `แปลงหน่วยไม่ได้ · Cannot convert ${displayUnit(from)} to ${displayUnit(to)}`,
    }
  }
  return { ok: true, value: (qty * f.toBase) / t.toBase }
}

/** The input units that can be received for a given base_unit (same dimension), nice order. */
export function unitsForBase(baseUnit: string): string[] {
  const b = UNITS[normUnit(baseUnit)]
  if (!b) return [normUnit(baseUnit)]
  return ['kg', 'g', 'l', 'ml', 'pc'].filter((k) => UNITS[k]?.dim === b.dim)
}

/** Pretty stock display: base qty + a friendly large-unit hint when it simplifies. */
export function formatStock(qty: number, baseUnit: string): string {
  const b = normUnit(baseUnit)
  const base = `${qty.toLocaleString('en-US')} ${displayUnit(baseUnit)}`
  if ((b === 'g' || b === 'ml') && qty >= 1000) {
    const big = b === 'g' ? 'kg' : 'L'
    return `${base} (${(qty / 1000).toLocaleString('en-US')} ${big})`
  }
  return base
}
