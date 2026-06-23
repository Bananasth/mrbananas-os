-- =============================================================================
-- qr-print-2-functions.sql — Print queue functions (PROPOSAL; review, do not run yet).
-- app.enqueue_print_jobs   — internal, idempotent: 1 receipt + 1 cup_sticker per cup
--                            (queue#/item/modifiers/timestamp) + 1 zone_ticket per zone;
--                            snapshots prep_item.zone_code. Called by settlement (next block).
-- app.generate_print_jobs  — gated owner/manager wrapper (manual/test/reprint a missing set).
-- app.claim_print_job      — agent claims the oldest queued job for (zone, kind), FOR UPDATE
--                            SKIP LOCKED; -> printing, attempts++.
-- app.mark_printed / mark_failed — agent finishes a job (failed re-queues until max_attempts).
-- Staff RPCs: app.* DEFINER + public.* INVOKER wrappers; authenticated only, anon revoked.
-- =============================================================================
begin;

-- zone fallback: explicit product.zone_code, else category -> zone
create or replace function app.enqueue_print_jobs(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid; v_branch uuid; v_total bigint; v_queue int;
  v_items jsonb; oi record; v_zone text; v_mods jsonb; v_cups int; i int;
begin
  select tenant_id, branch_id, total into v_tenant, v_branch, v_total
    from public.sales_order where id = p_order_id;
  if v_tenant is null then raise exception 'order % not found', p_order_id; end if;

  -- idempotent: a receipt job existing => already enqueued
  if exists (select 1 from public.print_job where ref_id = p_order_id and job_type = 'receipt') then
    return;
  end if;

  select queue_number into v_queue from public.qr_order where order_id = p_order_id;

  -- RECEIPT (one per order)
  v_items := coalesce((
    select jsonb_agg(jsonb_build_object(
             'name', pr.name, 'qty', oi2.qty, 'unit_price', oi2.unit_price,
             'modifiers', coalesce((select jsonb_agg(m.option_name order by m.option_name)
                                      from public.order_item_modifier m where m.order_item_id = oi2.id), '[]'::jsonb)))
      from public.order_item oi2 join public.product pr on pr.id = oi2.product_id
     where oi2.order_id = p_order_id), '[]'::jsonb);
  insert into public.print_job (tenant_id, branch_id, job_type, target_zone_code, ref_type, ref_id, payload)
    values (v_tenant, v_branch, 'receipt', null, 'sales_order', p_order_id,
            jsonb_build_object('queue', v_queue, 'total', v_total, 'items', v_items, 'printed_at', now()));

  -- CUP STICKERS (one per cup) + snapshot prep_item.zone_code
  for oi in
    select oi3.id, oi3.qty, pr.name as product_name, pr.category, pr.zone_code
      from public.order_item oi3 join public.product pr on pr.id = oi3.product_id
     where oi3.order_id = p_order_id
  loop
    v_zone := coalesce(oi.zone_code,
                case when oi.category = 'beverage' then 'drink_bar'
                     when oi.category = 'bakery'   then 'dessert'
                     else 'packaging' end);
    update public.prep_item set zone_code = v_zone where order_item_id = oi.id and zone_code is null;
    v_mods := coalesce((select jsonb_agg(m.option_name order by m.option_name)
                          from public.order_item_modifier m where m.order_item_id = oi.id), '[]'::jsonb);
    v_cups := greatest(ceil(oi.qty)::int, 1);
    for i in 1..v_cups loop
      insert into public.print_job (tenant_id, branch_id, job_type, target_zone_code, ref_type, ref_id, payload)
        values (v_tenant, v_branch, 'cup_sticker', v_zone, 'order_item', oi.id,
                jsonb_build_object('queue', v_queue, 'item', oi.product_name, 'modifiers', v_mods,
                                   'cup', i, 'of', v_cups, 'printed_at', now()));
    end loop;
  end loop;

  -- ZONE TICKETS (one per distinct zone)
  insert into public.print_job (tenant_id, branch_id, job_type, target_zone_code, ref_type, ref_id, payload)
  select v_tenant, v_branch, 'zone_ticket', z.zone, 'sales_order', p_order_id,
         jsonb_build_object('queue', v_queue, 'zone', z.zone, 'items', z.items, 'printed_at', now())
  from (
    select coalesce(pr.zone_code,
             case when pr.category = 'beverage' then 'drink_bar'
                  when pr.category = 'bakery'   then 'dessert' else 'packaging' end) as zone,
           jsonb_agg(jsonb_build_object('name', pr.name, 'qty', oi4.qty,
             'modifiers', coalesce((select jsonb_agg(m.option_name order by m.option_name)
                                      from public.order_item_modifier m where m.order_item_id = oi4.id), '[]'::jsonb))
             order by pr.name) as items
      from public.order_item oi4 join public.product pr on pr.id = oi4.product_id
     where oi4.order_id = p_order_id
     group by 1
  ) z;
end; $$;

-- gated manual/reprint trigger (owner/manager) — idempotent via enqueue's receipt guard
create or replace function app.generate_print_jobs(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.sales_order where id = p_order_id;
  if v_branch is null then raise exception 'order % not found', p_order_id; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager'])) then
    raise exception 'not authorized to generate print jobs at this branch';
  end if;
  perform app.enqueue_print_jobs(p_order_id);
end; $$;

-- agent claims the oldest queued job for (zone, kind)
create or replace function app.claim_print_job(
  p_branch_id uuid, p_kind text, p_zone_code text default null, p_printer_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_type text; v_payload jsonb;
begin
  if not (app.is_tenant_owner() or app.has_branch_role(p_branch_id, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  update public.print_job j
     set status = 'printing', claimed_at = now(), attempts = attempts + 1,
         printer_id = coalesce(p_printer_id, j.printer_id)
   where j.id = (
     select id from public.print_job
      where branch_id = p_branch_id and status = 'queued' and job_type = p_kind
        and (p_kind = 'receipt' or target_zone_code = p_zone_code)
      order by created_at
      for update skip locked
      limit 1)
  returning j.id, j.job_type, j.payload into v_id, v_type, v_payload;
  if v_id is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'id', v_id, 'job_type', v_type, 'payload', v_payload);
end; $$;

create or replace function app.mark_printed(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_rows int;
begin
  select branch_id into v_branch from public.print_job where id = p_job_id;
  if v_branch is null then raise exception 'print job not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  update public.print_job set status = 'printed', printed_at = now()
   where id = p_job_id and status = 'printing';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'print job not in printing state'; end if;
end; $$;

-- on failure: re-queue while attempts < max_attempts, else mark failed. Returns the new status.
create or replace function app.mark_failed(p_job_id uuid, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_new text;
begin
  select branch_id into v_branch from public.print_job where id = p_job_id;
  if v_branch is null then raise exception 'print job not found'; end if;
  if not (app.is_tenant_owner() or app.has_branch_role(v_branch, array['manager','staff','baker'])) then
    raise exception 'not authorized at this branch';
  end if;
  update public.print_job
     set status = case when attempts < max_attempts then 'queued' else 'failed' end,
         error = p_error, claimed_at = null
   where id = p_job_id and status = 'printing'
  returning status into v_new;
  if v_new is null then raise exception 'print job not in printing state'; end if;
  return v_new;
end; $$;

-- ============================ public wrappers + grants ============================
create or replace function public.generate_print_jobs(p_order_id uuid)
  returns void language sql security invoker set search_path = '' as $$ select app.generate_print_jobs(p_order_id); $$;
create or replace function public.claim_print_job(p_branch_id uuid, p_kind text, p_zone_code text default null, p_printer_id uuid default null)
  returns jsonb language sql security invoker set search_path = '' as $$ select app.claim_print_job(p_branch_id, p_kind, p_zone_code, p_printer_id); $$;
create or replace function public.mark_printed(p_job_id uuid)
  returns void language sql security invoker set search_path = '' as $$ select app.mark_printed(p_job_id); $$;
create or replace function public.mark_failed(p_job_id uuid, p_error text default null)
  returns text language sql security invoker set search_path = '' as $$ select app.mark_failed(p_job_id, p_error); $$;

grant execute on function app.generate_print_jobs(uuid)                       to authenticated;
grant execute on function app.claim_print_job(uuid, text, text, uuid)         to authenticated;
grant execute on function app.mark_printed(uuid)                              to authenticated;
grant execute on function app.mark_failed(uuid, text)                         to authenticated;

revoke all on function public.generate_print_jobs(uuid)                       from public, anon;
revoke all on function public.claim_print_job(uuid, text, text, uuid)         from public, anon;
revoke all on function public.mark_printed(uuid)                              from public, anon;
revoke all on function public.mark_failed(uuid, text)                         from public, anon;

grant execute on function public.generate_print_jobs(uuid)                    to authenticated;
grant execute on function public.claim_print_job(uuid, text, text, uuid)      to authenticated;
grant execute on function public.mark_printed(uuid)                           to authenticated;
grant execute on function public.mark_failed(uuid, text)                      to authenticated;

notify pgrst, 'reload schema';
commit;
