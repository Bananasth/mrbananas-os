-- =============================================================================
-- expiry-2-sweep.sql — Phase C: inventory expiry sweep (STATUS-ONLY). REVIEW ONLY.
-- Flips available lots past expires_at to status='expired' so FEFO/stock-on-hand stop
-- handing them out. DOES NOT touch qty_on_hand and writes NO movement — quantity is reduced
-- only by a manual Dispose/Waste (record_expired / record_waste). Row-locked, re-checked
-- under lock, idempotent. System-only (revoked from anon/authenticated); run by pg_cron.
-- =============================================================================
begin;

create or replace function app.expire_inventory_lots(p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_expired integer;
begin
  with due as (
    select id from public.inventory_lot
     where status = 'available' and expires_at is not null and expires_at <= now()
     order by expires_at
     for update skip locked
     limit greatest(p_limit, 0)
  ),
  flipped as (
    update public.inventory_lot l
       set status = 'expired', updated_at = now()
      from due
     where l.id = due.id
       and l.status = 'available' and l.expires_at <= now()   -- re-check under lock
    returning l.id
  )
  select count(*) into v_expired from flipped;
  return jsonb_build_object('expired_lots', v_expired, 'ts', now());
end;
$$;

comment on function app.expire_inventory_lots(integer) is
  'Flips available past-expiry lots to status=expired (no qty change, no movement). Disposal is manual via record_expired/record_waste. Run by pg_cron.';

-- System-only: only the scheduler (superuser) runs it; not on the public API.
revoke all on function app.expire_inventory_lots(integer) from public, anon, authenticated;

commit;
