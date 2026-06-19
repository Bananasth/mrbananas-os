import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Offline static test for the catalog & recipes migration.
const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/0010_catalog_recipes.sql', import.meta.url)),
  'utf8',
).toLowerCase()
const norm = sql.replace(/\s+/g, ' ')
const count = (re: RegExp): number => (sql.match(re) ?? []).length

describe('0010 catalog & recipes — structure', () => {
  it('creates recipe, recipe_version, recipe_ingredient', () => {
    for (const t of ['recipe', 'recipe_version', 'recipe_ingredient']) {
      expect(norm).toContain(`create table public.${t} `)
    }
  })

  it('chains recipe -> product, version -> recipe, ingredient -> version (tenant-safe)', () => {
    expect(norm).toMatch(/foreign key \(product_id, tenant_id\) references public\.product/)
    expect(norm).toMatch(/foreign key \(recipe_id, tenant_id\) references public\.recipe /)
    expect(norm).toMatch(
      /foreign key \(recipe_version_id, tenant_id\) references public\.recipe_version/,
    )
  })

  it('uses a SINGLE FK from ingredient to the inventory_item supertype (N1)', () => {
    expect(norm).toMatch(/foreign key \(item_id, tenant_id\) references public\.inventory_item/)
  })

  it('constrains version status and quantities', () => {
    expect(norm).toContain(
      "status text not null default 'draft' check (status in ('draft', 'active', 'retired'))",
    )
    expect(norm).toContain('quantity numeric not null check (quantity > 0)')
  })
})

describe('0010 recipe version control', () => {
  it('allows at most one active version per recipe', () => {
    expect(norm).toContain(
      "create unique index recipe_version_one_active_idx on public.recipe_version (recipe_id) where status = 'active'",
    )
  })

  it('freezes an active version (immutable except retire) via a raising trigger', () => {
    expect(norm).toContain('create or replace function app.guard_active_recipe_version()')
    expect(norm).toContain('before update on public.recipe_version')
    expect(norm).toContain('is active and immutable')
    expect(norm).toContain('is retired and immutable')
  })

  it('freezes the ingredients of an active/retired version', () => {
    expect(norm).toContain('create or replace function app.guard_recipe_ingredient()')
    expect(norm).toContain('before insert or update or delete on public.recipe_ingredient')
    expect(norm).toContain('its ingredients cannot change')
  })

  it('reads version status via a SECURITY DEFINER helper', () => {
    expect(norm).toMatch(/recipe_version_status\(p_id uuid\)[\s\S]*?security definer/)
  })
})

describe('0010 RLS', () => {
  it('enables RLS with least-privilege policies on all three tables', () => {
    expect(count(/enable row level security/g)).toBe(3)
    expect(count(/_owner_all on public\./g)).toBe(3)
    expect(count(/_staff_select on public\./g)).toBe(3)
    expect(norm).not.toContain('using (false)')
  })
})
