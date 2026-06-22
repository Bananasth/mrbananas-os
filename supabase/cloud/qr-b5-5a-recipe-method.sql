-- =============================================================================
-- qr-b5-5a-recipe-method.sql — QR Ordering B5.5a: recipe_version.method. PROPOSAL.
-- Adds ONE additive column to the EXISTING public.recipe_version table, giving the
-- "View Method" feature a content source (preparation steps). Nullable; authored while the
-- version is 'draft' and frozen on activation by the existing immutability guard. Existing
-- rows default to NULL; no business data modified. Only B5 change to an existing table here.
-- =============================================================================
begin;

alter table public.recipe_version
  add column if not exists method text;

comment on column public.recipe_version.method is
  'Preparation method/steps (free text). Authored in draft; frozen once the version is active.';

-- Extend the immutability guard so `method` is frozen on the active->retired transition too,
-- with full parity to the other frozen columns. Only tightens the guard (closes the leak).
create or replace function app.guard_active_recipe_version()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'retired' then
    raise exception 'recipe_version % is retired and immutable', old.id;
  elsif old.status = 'active' then
    if new.status = 'retired'
       and new.tenant_id = old.tenant_id
       and new.recipe_id = old.recipe_id
       and new.version_no = old.version_no
       and new.shelf_life_hours is not distinct from old.shelf_life_hours
       and new.yield_qty is not distinct from old.yield_qty
       and new.effective_from is not distinct from old.effective_from
       and new.method is not distinct from old.method then          -- method frozen on retire too
      return new;
    end if;
    raise exception 'recipe_version % is active and immutable; create a new version (only retire is allowed)', old.id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
