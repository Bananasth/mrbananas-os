-- =============================================================================
-- sales-1-read-layer.sql — Phase E Sales: read layer for /admin/sales. REVIEW ONLY (DRAFT).
-- Additive, READ-ONLY. No writes / triggers / RLS changes to sales_order/payment/order_item/
-- tax_invoice; no POS write-path change. security_invoker / security invoker → caller RLS scopes.
--
-- "Is a sale" = sales_order.status='completed' AND EXISTS a payment.status='captured'.
-- Revenue source of truth = sales_order.total / tax_total (satang, VAT-inclusive).
-- Recognition time (sale_datetime/paid_at) = max(coalesce(payment.paid_at, payment.created_at)).
-- Payment: primary_payment_method = the single captured method, or 'mixed' when >1 distinct method
--          (NOT concatenated); payment_count = number of captured payments (>1 flags a split).
--
--   get_sales_summary(...) — RPC: aggregation in SQL, filtered by branch/from/to/channel/method.
--   sales_list             — view: one row per sale + latest invoice (deterministic, via lateral).
--   top_products           — view: order_item line grain of qualifying sales.
-- DEPENDS ON payment.paid_at existing. Index in sales-1-index.sql.
--
-- FUTURE (do NOT implement here): refunds, credit notes, debit notes, split/partial payments.
--   split/partial already surfaced via primary_payment_method='mixed' + payment_count>1; refund/
--   credit/debit adjustments must layer ON TOP (a future net-of-returns view), never mutate source.
-- =============================================================================
begin;

-- ---- RPC: aggregated sales summary (aggregation lives in SQL) -------------------------
create or replace function public.get_sales_summary(
  p_branch_id       uuid        default null,
  p_from            timestamptz default null,   -- inclusive
  p_to              timestamptz default null,   -- exclusive
  p_channel         text        default null,
  p_payment_method  text        default null
)
returns table (
  order_count      bigint,
  gross_total      bigint,     -- satang, VAT-inclusive
  tax_total        bigint,
  net_total        bigint,
  avg_order_value  numeric     -- satang
)
language sql stable security invoker set search_path = '' as $$
  with fact as (
    select o.branch_id, o.channel,
           o.total as gross_total, o.tax_total, (o.total - o.tax_total) as net_total,
           p.primary_payment_method, p.sale_datetime
    from public.sales_order o
    join lateral (
      select case when count(distinct pp.method) = 1 then min(pp.method) else 'mixed' end
                                                         as primary_payment_method,
             max(coalesce(pp.paid_at, pp.created_at))    as sale_datetime
      from public.payment pp
      where pp.order_id = o.id and pp.status = 'captured'
      having count(*) > 0                                 -- EXISTS(captured)
    ) p on true
    where o.status = 'completed'
  )
  select
    count(*)::bigint,
    coalesce(sum(gross_total),0)::bigint,
    coalesce(sum(tax_total),0)::bigint,
    coalesce(sum(net_total),0)::bigint,
    case when count(*) > 0 then round(coalesce(sum(gross_total),0)::numeric / count(*), 2) else 0 end
  from fact
  where (p_branch_id      is null or branch_id = p_branch_id)
    and (p_from           is null or sale_datetime >= p_from)
    and (p_to             is null or sale_datetime <  p_to)
    and (p_channel        is null or channel = p_channel)
    and (p_payment_method is null or primary_payment_method = p_payment_method);
$$;

revoke all     on function public.get_sales_summary(uuid,timestamptz,timestamptz,text,text) from anon;
grant  execute on function public.get_sales_summary(uuid,timestamptz,timestamptz,text,text) to authenticated;

-- ---- history table: one row per sale + deterministic latest invoice -------------------
create or replace view public.sales_list with (security_invoker = true) as
select
  o.tenant_id, o.branch_id, o.id as order_id,
  p.sale_datetime, p.sale_datetime as paid_at,
  o.channel, o.employee_id,
  o.total as gross_total, o.tax_total, (o.total - o.tax_total) as net_total,
  p.primary_payment_method, p.payment_count,
  inv.invoice_no
from public.sales_order o
join lateral (
  select case when count(distinct pp.method) = 1 then min(pp.method) else 'mixed' end as primary_payment_method,
         count(*)                                    as payment_count,
         max(coalesce(pp.paid_at, pp.created_at))     as sale_datetime
  from public.payment pp
  where pp.order_id = o.id and pp.status = 'captured'
  having count(*) > 0
) p on true
left join lateral (
  -- deterministic latest invoice per order (prefer ABB once a type column is confirmed:
  --   prepend `(<abb_predicate>) desc,` to the ORDER BY). Never a direct multi-row LEFT JOIN.
  select ti.invoice_no
  from public.tax_invoice ti
  where ti.order_id = o.id
  order by ti.created_at desc, ti.invoice_no desc
  limit 1
) inv on true
where o.status = 'completed';
-- payment_status intentionally NOT exposed — every row already satisfies captured.

-- ---- top products source: order_item line grain of qualifying sales ------------------
create or replace view public.top_products with (security_invoker = true) as
select
  o.tenant_id, o.branch_id, o.id as order_id, p.sale_datetime,
  oi.product_id, oi.qty,
  (oi.unit_price * oi.qty)::bigint                as line_net,      -- satang, ex-VAT
  oi.line_tax,
  (oi.unit_price * oi.qty + oi.line_tax)::bigint  as line_revenue   -- qty*unit_price + line_tax (VAT-reconciling)
from public.sales_order o
join lateral (
  select max(coalesce(pp.paid_at, pp.created_at)) as sale_datetime
  from public.payment pp
  where pp.order_id = o.id and pp.status = 'captured'
  having count(*) > 0
) p on true
join public.order_item oi on oi.order_id = o.id and oi.tenant_id = o.tenant_id
where o.status = 'completed';

comment on function public.get_sales_summary(uuid,timestamptz,timestamptz,text,text) is
  'Phase E: aggregated sales (completed+captured) filtered by branch/from/to/channel/payment_method. primary_payment_method="mixed" when >1 captured method.';
comment on view public.sales_list   is 'Phase E: one row per completed+captured sale + deterministic latest tax_invoice.invoice_no (by order_id).';
comment on view public.top_products is 'Phase E: order_item line grain; line_revenue = qty*unit_price + line_tax.';

revoke all on public.sales_list, public.top_products from anon;
grant  select on public.sales_list, public.top_products to authenticated;

commit;
