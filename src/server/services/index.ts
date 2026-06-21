/**
 * MR.BANANA'S OS — typed service layer (Phase 2).
 *
 * Every function runs UNDER Row Level Security as the logged-in user (cookie-scoped
 * Supabase client), reads tenant/branch context from the validated JWT claims, validates
 * input with Zod, and returns a typed Result. RLS is the access authority; the in-app role
 * checks are defense-in-depth.
 */
export * from './roles'
export * from './money'
export * from './types'
export * from './schemas'
export * from './context'

export * from './catalog' // 1. Product catalog
export * from './pricing' // 2. Branch product pricing
export * from './recipes' // 3. Recipe / recipe versions
export * from './inventory' // 4. Stock on hand · 5. Receive inventory
export * from './orders' // 6. POS order creation
export * from './payments' // 7. Cash payment
export * from './invoices' // 8. Tax invoice issuance
export * from './fulfillment' // 9. Order fulfillment / FEFO deduction
export * from './reads' // admin read helpers (inventory items, recipe versions/ingredients)
export * from './modifier-bom' // pure resolved-BoM engine
export * from './modifiers' // POS modifier system (config CRUD + product modifiers)
