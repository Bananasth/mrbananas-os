-- =============================================================================
-- expiry-1-derive-lot-expiry.sql — Phase C: auto-expiry for PRODUCED lots. REVIEW ONLY.
-- BEFORE-INSERT trigger on inventory_lot: when expires_at is NULL and the lot has a batch_id
-- (i.e. produced by complete_batch), derive expires_at = now() + recipe_version.shelf_life_hours.
-- complete_batch stays BYTE-UNTOUCHED. PURCHASED lots (batch_id NULL) are unaffected — their
-- expiry remains manual. If a caller passes expires_at explicitly, it is preserved. Additive.
-- =============================================================================
begin;

create or replace function app.derive_lot_expiry()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_hours integer;
begin
  if new.expires_at is null and new.batch_id is not null then
    select rv.shelf_life_hours into v_hours
      from public.production_batch b
      join public.recipe_version rv on rv.id = b.recipe_version_id
     where b.id = new.batch_id;
    if v_hours is not null then
      new.expires_at := now() + make_interval(hours => v_hours);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_lot_derive_expiry on public.inventory_lot;
create trigger inventory_lot_derive_expiry
  before insert on public.inventory_lot
  for each row execute function app.derive_lot_expiry();

comment on function app.derive_lot_expiry() is
  'Produced lots (batch_id set) get expires_at from recipe_version.shelf_life_hours when not explicitly provided. Purchased lots untouched.';

commit;
