-- =============================================================================
-- qr-b5-1-qr-menu.sql — QR Ordering B5.1: qr_menu (anon storefront read). PROPOSAL.
-- Read-only. Establishes the anon-RPC pattern: app.qr_menu (SECURITY DEFINER, does the
-- work) + public.qr_menu (SECURITY INVOKER wrapper) + execute to anon/authenticated.
-- Gated on qr_config.enabled; unknown/disabled slug -> {"enabled": false}. Price is
-- branch_product.price_override (this schema has no product base-price column), so only
-- active+available+priced products are listed. No writes; no existing data changed.
-- =============================================================================
begin;

create or replace function app.qr_menu(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select tenant_id, branch_id, pickup_instruction
      from public.qr_config
     where public_slug = p_slug and enabled = true
  )
  select case
    when not exists (select 1 from cfg) then jsonb_build_object('enabled', false)
    else (
      select jsonb_build_object(
        'enabled', true,
        'pickup_instruction', c.pickup_instruction,
        'products', coalesce((
          select jsonb_agg(prod.obj order by prod.menu_section nulls last, prod.name)
          from (
            select bp.menu_section, pr.name,
              jsonb_build_object(
                'product_id',   pr.id,
                'name',         pr.name,
                'category',     pr.category,
                'type',         pr.type,
                'price',        bp.price_override,
                'menu_section', bp.menu_section,
                'modifier_groups', coalesce((
                  select jsonb_agg(grp.obj order by grp.sort_order)
                  from (
                    select pmg.sort_order,
                      jsonb_build_object(
                        'group_id',       mg.id,
                        'name',           mg.name,
                        'is_required',    mg.is_required,
                        'selection_type', mg.selection_type,
                        'min_select',     mg.min_select,
                        'max_select',     mg.max_select,
                        'options', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'option_id',        mo.id,
                                   'name',             mo.name,
                                   'price_adjustment', mo.price_adjustment,
                                   'is_default',       mo.is_default
                                 ) order by mo.sort_order)
                            from public.modifier_option mo
                           where mo.group_id = mg.id and mo.is_active = true
                        ), '[]'::jsonb)
                      ) as obj
                    from public.product_modifier_group pmg
                    join public.modifier_group mg
                      on mg.id = pmg.modifier_group_id and mg.tenant_id = c.tenant_id
                   where pmg.product_id = pr.id and mg.is_active = true
                  ) grp
                ), '[]'::jsonb)
              ) as obj
            from public.product pr
            join public.branch_product bp
              on bp.product_id = pr.id and bp.tenant_id = pr.tenant_id
           where pr.tenant_id = c.tenant_id
             and bp.branch_id = c.branch_id
             and pr.is_active = true
             and bp.is_available = true
             and bp.price_override is not null
          ) prod
        ), '[]'::jsonb)
      )
      from cfg c
    )
  end;
$$;

comment on function app.qr_menu(text) is
  'Anon QR storefront read for an enabled public_slug. Returns {enabled:false} if unknown/disabled.';

create or replace function public.qr_menu(p_slug text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app.qr_menu(p_slug); $$;

revoke all  on function public.qr_menu(text) from public;
grant execute on function app.qr_menu(text)    to anon, authenticated;
grant execute on function public.qr_menu(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
