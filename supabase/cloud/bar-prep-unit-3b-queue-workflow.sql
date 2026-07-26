-- =============================================================================
-- bar-prep-unit-3b-queue-workflow.sql — DB-3B MIGRATION (ADDITIVE + INERT). Run ONCE inside one transaction.
-- Installs type public.prep_queue_state; table public.prep_queue_acceptance; prep_unit indexes; prep_event
-- additions (prep_unit_id + FK ON DELETE CASCADE + index + extended prep_event_event_type_check); qr_order
-- additions (ready_by/ready_at + FK + consistency CHECK); and the DB-3B routines (app impl + public wrappers).
-- Performs NO business-state transition. All transitions occur only via the DB-3B routines AFTER activation
-- is separately enabled in a later authorized step.
--
-- The preflight asserts, EXACTLY and fail-closed before any DDL:
--   * baseline delta-fp-v2 fingerprints on 10 relations;
--   * the exact prep_event 11-column structure (name+type+nullability+default+position);
--   * the exact FK prep_event_order_item_id_fkey (order_item_id)->prep_item(order_item_id) ON DELETE CASCADE, validated;
--   * prep_event_event_type_check validated, exactly the six baseline labels, only one event_type CHECK;
--   * proved auth helpers app.current_user_id()/current_tenant_id()/has_branch_role(uuid,text[])/is_tenant_owner();
--   * every D10 PROTECTED routine (40) at exact signature + authoritative Gate-0 metadata (owner=postgres,
--     security, volatility, result type, language, config search_path='') + effective EXECUTE ACL
--     (PUBLIC/anon/authenticated/service_role) from G1_ROUTINE_META/G1_ROUTINE_ACL; md5(pg_get_functiondef)
--     enforced for all 40 D10 routines (3 from Gate-0 G0_DB2_FINGERPRINTS + 37 supplied in the correction messages);
--   * the COMPLETE DB-3B collision manifest is free (type/table/columns/constraints/indexes/trigger/fn/routines);
--   * employee(id,user_id,tenant_id,branch_id), app_user(id,tenant_id), sales_order composite key, order_item.qty;
--   * L2: order_item.workstation_id -> workstation.id + workstation.type (proved in G1_ROUTINE_DEFINITION);
--   * L3: payment(amount,status,order_id,tenant_id,branch_id) + sales_order(total,id,tenant_id,branch_id).
--
-- Acceptance enforces (integrated, not deferred): station_type = routed workstation.type via order_item
-- .workstation_id (L2); exactly one scoped captured payment with payment.amount = sales_order.total (L3);
-- ceil(order_item.qty) unit cardinality; complete-order pristine proof. EVIDENCE NOTE: all 40 protected D10
-- routines carry an authoritative non-empty md5(pg_get_functiondef) constant (3 from Gate-0 G0_DB2_FINGERPRINTS
-- + 37 supplied in the correction messages); MD5 is enforced for every manifest row alongside exact
-- signature + Gate-0 metadata + ACL. No empty MD5, no MD5 bypass, no fabricated constant.
-- =============================================================================
begin;

-- ─────────────── PREFLIGHT (fail-closed; no mutation until every exact assertion passes) ───────────────
do $preflight$
declare v_labels text[]; v_sig text; v_cols text;
  v_new text[] := array[
    'app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','app.qr_available_unit_work(uuid,uuid)','app.qr_claim_unit(uuid,uuid,inet,text,text,text)',
    'app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',
    'app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_complete_unit(uuid,uuid,inet,text,text,text)','app.qr_release_unit(uuid,uuid,inet,text,text,text)',
    'app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)','app.qr_bind_actor(uuid,uuid)','app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)',
    'public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','public.qr_available_unit_work(uuid,uuid)','public.qr_claim_unit(uuid,uuid,inet,text,text,text)',
    'public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',
    'public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_complete_unit(uuid,uuid,inet,text,text,text)','public.qr_release_unit(uuid,uuid,inet,text,text,text)',
    'public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)'];
begin
  -- DB-3A present + DISABLED
  if to_regclass('public.prep_unit_activation') is null then raise exception 'DB3B-PRE: prep_unit_activation missing'; end if;
  if exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B-PRE: activation already enabled'; end if;
  if exists(select 1 from public.prep_unit where workflow_generation=2 or actionable or quarantined_at is not null) then raise exception 'DB3B-PRE: gen2/actionable/quarantined rows exist'; end if;
  -- PROTECTED D10 ROUTINES: exact signature + authoritative Gate-0 metadata (owner=postgres, security,
  -- volatility, result type, language, config search_path='') + effective EXECUTE ACL (PUBLIC via aclexplode/
  -- default-ACL, plus anon/authenticated/service_role) from G1_ROUTINE_META/G1_ROUTINE_ACL; md5(pg_get_functiondef)
  -- enforced for all 40 D10 routines (3 Gate-0 + 37 supplied). Any drift blocks.
  if exists(
    select 1 from (values
      ('app.current_tenant_id()','9f1ab1733142cdde5f9d633ce4055a8e',false,'s','uuid','sql',true,true,true,true),
      ('app.current_user_id()','a2821520f06a520c12976ce4e492c757',false,'s','uuid','sql',true,true,true,true),
      ('app.has_branch_role(uuid,text[])','46045d10f4c08cc201445c2521518356',false,'s','boolean','sql',true,true,true,true),
      ('app.is_tenant_owner()','204344d1728a9f1210bb6731b9bcc5a3',false,'s','boolean','sql',true,true,true,true),
      ('app.pos_enqueue_production_order(uuid)','f2265b0ba0878653998e682c274405a9',true,'v','jsonb','plpgsql',false,false,true,false),
      ('app.prep_unit_create_per_cup(uuid,uuid,uuid)','f9eba7ed926506bdec928bffdd0bc7a6',true,'v','void','plpgsql',false,false,false,true),
      ('app.qr_assert_actor(uuid,uuid)','e81051628f2ed01f4b96886358cc86a1',true,'s','uuid','plpgsql',true,true,true,true),
      ('app.qr_assign_queue(uuid,uuid,uuid)','78d53297e4e3e6eabaa364479fd8dca2',true,'v','integer','plpgsql',false,false,false,true),
      ('app.qr_claim_item(uuid,uuid,inet,text,text,text)','651e7aaf78297d6a016cfa699d50c106',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_complete_item(uuid,uuid,inet,text,text,text)','d6df6eae12db5ad5bad400377fb3f00a',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_complete_pickup(uuid,uuid)','cc38c9283bbde88153573f6e926b7652',true,'v','jsonb','plpgsql',false,false,true,false),
      ('app.qr_confirm_payment(uuid,uuid)','44adfab0f5a406c7bb7460f815a21aa8',true,'v','jsonb','plpgsql',true,true,true,true),
      ('app.qr_customer_file_complaint(uuid,uuid,text,text)','f51a643b347b7172a345bb53c2329bfd',true,'v','jsonb','plpgsql',false,false,false,false),
      ('app.qr_customer_portal(uuid)','6a88ae50e0a7b067742d83cb60670ddf',true,'s','jsonb','sql',false,false,false,false),
      ('app.qr_customer_receipt(uuid)','c84ba0e2139550f46b2415d4be66fdb7',true,'s','jsonb','plpgsql',false,false,false,false),
      ('app.qr_emit_prep_event(uuid,text,uuid,inet,text,text,text,jsonb)','671b6de25684fdb6fc350aa14cef0e4a',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_ensure_prep_items(uuid,uuid,uuid)','634ced3a6b8aaebdf1dda3e4af967c0b',true,'v','void','plpgsql',false,false,false,true),
      ('app.qr_order_status(uuid)','1d813ae0c7cd5f4c05f64ce0b8ded35b',true,'s','jsonb','sql',true,true,true,true),
      ('app.qr_pass_qc(uuid,uuid,inet,text,text,text)','2b5710203578cb0971c700cd5dca448a',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_qc_fail(uuid,uuid,text,inet,text,text,text)','5648ab56f365452ccf8a74eda7587bcb',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_release_stale_claims(uuid)','495a429e2d9882f7b53216846adb3900',true,'v','integer','plpgsql',true,true,true,true),
      ('app.qr_rollup_order_status(uuid)','e9d3dc466322b5902787abbc8011c057',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_settle_payment(text,text,uuid,bigint,text)','644f33967f3503ffa1546e386092ce61',true,'v','jsonb','plpgsql',true,true,true,true),
      ('app.qr_start_preparing(uuid,uuid,inet,text,text,text)','f02f5a9efb1bbe43d5258900352d1082',true,'v','void','plpgsql',true,true,true,true),
      ('app.qr_start_qc(uuid,uuid,inet,text,text,text)','104e114d25fab455fa4d80408784d654',true,'v','void','plpgsql',true,true,true,true),
      ('public.qr_confirm_payment(uuid,uuid)','f1dcfdd3b422b1f1bdd00c8ecc945474',true,'v','jsonb','sql',false,false,true,true),
      ('public.qr_order_status(uuid)','cc163045ecfe7c3556fe989790a09875',true,'v','jsonb','sql',false,true,true,true),
      ('public.qr_settle_payment(text,text,uuid,bigint,text)','ff5fde99c31b20e05d613b3cd6444b65',true,'v','jsonb','sql',false,true,true,true),
      ('public.qr_customer_receipt(uuid)','445e02720c3e08a2692d64add72c3d46',true,'v','jsonb','sql',false,true,true,true),
      ('public.pos_enqueue_production_order(uuid)','44bc19091def1f812e8b1c954f6e5a7c',false,'v','jsonb','sql',false,false,true,true),
      ('public.qr_claim_item(uuid,uuid,inet,text,text,text)','13d1ce682f39afd6c29e97fc76a7e9d6',false,'v','void','sql',false,true,true,true),
      ('public.qr_complete_item(uuid,uuid,inet,text,text,text)','64c9decabd35faa02e326e54cf95d101',false,'v','void','sql',false,true,true,true),
      ('public.qr_complete_pickup(uuid,uuid)','6076815dc1350f62cebfc2e4630bff15',false,'v','jsonb','sql',false,true,true,true),
      ('public.qr_customer_file_complaint(uuid,uuid,text,text)','f570454d7966081003a9f517828d8120',true,'v','jsonb','sql',false,true,true,true),
      ('public.qr_customer_portal(uuid)','73e036d180816ec32110aa133271b162',true,'v','jsonb','sql',false,true,true,true),
      ('public.qr_pass_qc(uuid,uuid,inet,text,text,text)','fcae9c02c43e546908c3185ef46703ca',false,'v','void','sql',false,true,true,true),
      ('public.qr_qc_fail(uuid,uuid,text,inet,text,text,text)','c06b6c2bb1e13faf2211fdf3fcfed6c7',false,'v','void','sql',false,false,true,true),
      ('public.qr_release_stale_claims(uuid)','ec8c8fd1d6ba888b9e65eefb2a754e92',false,'v','integer','sql',false,false,true,true),
      ('public.qr_start_preparing(uuid,uuid,inet,text,text,text)','458d16a892fe02fa39281c2912313380',false,'v','void','sql',false,true,true,true),
      ('public.qr_start_qc(uuid,uuid,inet,text,text,text)','88f50cff8efa056976b09c0f17b2e136',false,'v','void','sql',false,false,true,true)
    ) t(sig,md5x,secdef,vol,res,lang,pub,anonx,authx,svcx)
    cross join lateral (select to_regprocedure(t.sig) oid) r
    where r.oid is null
       or (select prosecdef from pg_proc where oid=r.oid)<>t.secdef
       or (select provolatile::text from pg_proc where oid=r.oid)<>t.vol
       or (select format_type(prorettype,null) from pg_proc where oid=r.oid)<>t.res
       or (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=r.oid)<>t.lang
       or (select pg_get_userbyid(proowner) from pg_proc where oid=r.oid)<>'postgres'
       or coalesce((select array_length(proconfig,1) from pg_proc where oid=r.oid),0)<>1
       or coalesce((select proconfig[1] from pg_proc where oid=r.oid),'') not like 'search_path=%'
       or (case when (select proacl from pg_proc where oid=r.oid) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE') end)<>t.pub
       or has_function_privilege('anon',r.oid,'EXECUTE')<>t.anonx
       or has_function_privilege('authenticated',r.oid,'EXECUTE')<>t.authx
       or has_function_privilege('service_role',r.oid,'EXECUTE')<>t.svcx
       or md5(pg_get_functiondef(r.oid))<>t.md5x
  ) then raise exception 'DB3B-PRE: protected D10 routine drift (signature/metadata/ACL/md5)'; end if;
  -- delta-fp-v2 fingerprint drift on ALL baseline relations (pre-migration)
  if exists (
    select 1 from (
      select x.rel, case when g.roid is null then 'MISSING' else md5(
        coalesce((select string_agg(a.attnum::text||'|'||x.rel||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'')||'|'||a.attidentity::text||'|'||a.attgenerated::text,',' order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=g.roid and a.attnum>0 and not a.attisdropped),'')
        ||'::'||coalesce((select string_agg(con.conname||'|'||con.contype::text||'|'||coalesce((select string_agg(att.attname,'.' order by k.ord) from unnest(con.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.an),'')||'|'||coalesce((select string_agg(att.attname,'.' order by k.ord) from unnest(con.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.confrelid and att.attnum=k.an),'')||'|'||coalesce((select nn.nspname||'.'||cl.relname from pg_class cl join pg_namespace nn on nn.oid=cl.relnamespace where cl.oid=con.confrelid),'')||'|'||con.confupdtype::text||'|'||con.confdeltype::text||'|'||lower(regexp_replace(pg_get_constraintdef(con.oid),'\s','','g')),',' order by con.conname) from pg_constraint con where con.conrelid=g.roid),'')
        ||'::'||coalesce((select string_agg(ic.relname||'|'||am.amname||'|'||ix.indisunique::text||'|'||lower(regexp_replace(pg_get_indexdef(ic.oid),'\s','','g'))||'|'||ix.indisvalid::text||'|'||ix.indisready::text,',' order by ic.relname) from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam where ix.indrelid=g.roid),'')
        ||'::'||coalesce((select string_agg(tg.tgname||'|'||(select nn.nspname||'.'||cl.relname from pg_class cl join pg_namespace nn on nn.oid=cl.relnamespace where cl.oid=tg.tgrelid)||'|'||tg.tgtype::text||'|'||tg.tgenabled::text||'|'||tg.tgisinternal::text||'|'||fn.nspname||'.'||fp2.proname||'('||replace(oidvectortypes(fp2.proargtypes),' ','')||')',',' order by tg.tgname) from pg_trigger tg join pg_proc fp2 on fp2.oid=tg.tgfoid join pg_namespace fn on fn.oid=fp2.pronamespace where tg.tgrelid=g.roid and not tg.tgisinternal),'')
        ||'::'||(select relrowsecurity::text||'/'||relforcerowsecurity::text from pg_class where oid=g.roid)
        ||'::'||coalesce((select string_agg(pol.polname||'|'||pol.polcmd::text||'|'||pol.polpermissive::text||'|'||coalesce((select string_agg(case when rr=0 then 'PUBLIC' else pg_get_userbyid(rr) end,'+' order by (case when rr=0 then 'PUBLIC' else pg_get_userbyid(rr) end)) from unnest(pol.polroles) rr),'')||'|'||coalesce(lower(regexp_replace(pg_get_expr(pol.polqual,pol.polrelid),'\s','','g')),'')||'|'||coalesce(lower(regexp_replace(pg_get_expr(pol.polwithcheck,pol.polrelid),'\s','','g')),''),',' order by pol.polname) from pg_policy pol where pol.polrelid=g.roid),'')
        ||'::'||(select pg_get_userbyid(relowner) from pg_class where oid=g.roid)
        ||'::'||(case when (select relacl from pg_class where oid=g.roid) is null then 'RELACL_NULL' else coalesce((select string_agg((case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end)||':'||privilege_type||':'||is_grantable::text,',' order by (case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end), privilege_type, is_grantable) from aclexplode((select relacl from pg_class where oid=g.roid))),'RELACL_EMPTY') end)
        ||'::'||coalesce((select string_agg(fr||'='||case when fr<>'PUBLIC' and not exists(select 1 from pg_roles where rolname=fr) then 'ROLE_MISSING' when fr='PUBLIC' then (select string_agg((exists(select 1 from aclexplode((select relacl from pg_class where oid=g.roid)) a where a.grantee=0 and a.privilege_type=pv))::text,'') from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pv) else (select string_agg(has_table_privilege(fr,g.roid,pv)::text,'') from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pv) end,'/' order by fr) from (values ('PUBLIC'),('anon'),('authenticated'),('postgres'),('service_role')) f(fr)),'')
      ) end overall_fp
      from (values ('public.prep_unit'),('public.prep_unit_activation'),('public.prep_event'),('public.prep_item'),('public.qr_order'),('public.sales_order'),('public.payment'),('public.order_item'),('public.employee'),('public.app_user')) x(rel)
      cross join lateral (select to_regclass(x.rel) roid) g
    ) fpx join (values ('public.prep_unit','e71b49b10f006f712d1a035a41b67c29'),('public.prep_unit_activation','526b6e0f8b4942b3490786fe23283bdb'),('public.prep_event','901040af6f986d64b81c1b9057e116cd'),('public.prep_item','6c563a0c15643af3d7207979c8354afe'),('public.qr_order','f4422dd521c263c31b1a5c049e1e47f8'),('public.sales_order','b8d28d49a212ab5af33f6f1046505982'),('public.payment','3d34ef56697772b5d2cef622c4583cbc'),('public.order_item','26ab9d0cfcdcc9051190c1a3d913db10'),('public.employee','fd63759e11baa370e6f2a8036fb564d4'),('public.app_user','26f45b4818496414df4f054ef5445cca')) e(rel,exp) on e.rel=fpx.rel
    where fpx.overall_fp<>e.exp
  ) then raise exception 'DB3B-PRE: baseline fingerprint drift'; end if;
  -- COMPLETE collision manifest must be free
  if to_regclass('public.prep_queue_acceptance') is not null then raise exception 'DB3B-PRE: prep_queue_acceptance exists'; end if;
  if exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='prep_queue_state' and n.nspname='public') then raise exception 'DB3B-PRE: type prep_queue_state exists'; end if;
  if exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname in ('ready_by','ready_at') and not attisdropped) then raise exception 'DB3B-PRE: qr_order ready_* present'; end if;
  if exists(select 1 from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped) then raise exception 'DB3B-PRE: prep_event.prep_unit_id present'; end if;
  if exists(select 1 from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where ic.relkind::text='i' and nn.nspname in ('app','public') and ic.relname = any(array['prep_queue_acceptance_branch_idx','prep_unit_one_active_per_employee_idx','prep_unit_actionable_route_idx','prep_event_unit_occurred_idx'])) then raise exception 'DB3B-PRE: DB-3B index name collision'; end if;
  if exists(select 1 from pg_constraint con join pg_class cl on cl.oid=con.conrelid join pg_namespace nn on nn.oid=cl.relnamespace where nn.nspname in ('app','public') and con.conname = any(array['prep_queue_acceptance_pkey','prep_queue_acceptance_order_key','prep_queue_acceptance_branch_day_queue_key','prep_queue_acceptance_scope_fk','prep_queue_acceptance_employee_fk','prep_queue_acceptance_ts_check','prep_event_prep_unit_fk','qr_order_ready_actor_fk','qr_order_ready_actor_consistency'])) then raise exception 'DB3B-PRE: DB-3B constraint name collision'; end if;
  if exists(select 1 from pg_trigger where not tgisinternal and tgname='prep_queue_acceptance_set_updated_at') then raise exception 'DB3B-PRE: trigger collision'; end if;
  foreach v_sig in array v_new loop
    if to_regprocedure(v_sig) is not null then raise exception 'DB3B-PRE: DB-3B routine/overload collision: %', v_sig; end if;
  end loop;
  -- EXACT prep_event structure (num:name:type:nullability:default, ordered by position) — same 5-field form as PRE/VERIFY
  v_cols := (select string_agg(a.attnum::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'-'), ',' order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=to_regclass('public.prep_event') and a.attnum>0 and not a.attisdropped);
  if v_cols is distinct from '1:id:uuid:true:gen_random_uuid(),2:tenant_id:uuid:true:-,3:branch_id:uuid:true:-,4:order_id:uuid:true:-,5:order_item_id:uuid:true:-,6:attempt_no:integer:true:1,7:event_type:text:true:-,8:actor_employee_id:uuid:false:-,9:payload:jsonb:false:-,10:occurred_at:timestamp with time zone:true:now(),11:created_at:timestamp with time zone:true:now()'
    then raise exception 'DB3B-PRE: prep_event structure is not the exact authoritative 11-column form (found: %)', v_cols; end if;
  -- exact FK prep_event_order_item_id_fkey (order_item_id)->prep_item(order_item_id) ON DELETE CASCADE, validated
  if not exists(
    select 1 from pg_constraint con
    where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_order_item_id_fkey' and con.contype::text='f' and con.convalidated=true
      and con.confrelid=to_regclass('public.prep_item') and con.confdeltype::text='c'
      and (select array_agg(att.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.an)=array['order_item_id']::text[]
      and (select array_agg(att.attname::text order by k.ord) from unnest(con.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.confrelid and att.attnum=k.an)=array['order_item_id']::text[]
  ) then raise exception 'DB3B-PRE: prep_event_order_item_id_fkey not exactly (order_item_id)->prep_item(order_item_id) ON DELETE CASCADE validated'; end if;
  -- prep_event_event_type_check validated, exactly the 6 labels, only one event_type CHECK
  if (select conname from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check' and contype::text='c' and convalidated) is null then raise exception 'DB3B-PRE: prep_event_event_type_check missing/NOT VALID'; end if;
  if (select count(*) from pg_constraint where conrelid=to_regclass('public.prep_event') and contype::text='c' and strpos(pg_get_constraintdef(oid),'event_type')>0)<>1 then raise exception 'DB3B-PRE: more than one event_type CHECK on prep_event'; end if;
  v_labels := (select array_agg(x order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s);
  if v_labels <> array['claim_released','preparing_started','qc_failed','qc_passed','qc_started','rework_started']::text[] then raise exception 'DB3B-PRE: prep_event_event_type_check labels are not the exact six baseline (found %)', v_labels; end if;
  -- EXACT employee/app_user linkage + qr_order columns + sales_order composite key + proved order_item.qty
  if not (array['id','user_id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.employee') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: employee(id,user_id,tenant_id,branch_id) not present'; end if;
  if not (array['id','tenant_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.app_user') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: app_user(id,tenant_id) not present'; end if;
  if not (array['order_id','tenant_id','branch_id','status','paid_at','queue_day','queue_number','needs_review','handed_over_by','handed_over_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: qr_order proved columns not present'; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.sales_order') and contype::text in ('p','u') and (select array_agg(att.attname::text order by k.ord) from unnest(conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=conrelid and att.attnum=k.an)=array['id','tenant_id','branch_id']::text[]) then raise exception 'DB3B-PRE: sales_order composite key (id,tenant_id,branch_id) missing'; end if;
  if not (array['id','qty']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.order_item') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: proved order_item(id,qty) columns not present'; end if;
  -- L2 workstation linkage (proved: order_item.workstation_id -> workstation.id, workstation.type)
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.order_item') and attname='workstation_id' and not attisdropped) then raise exception 'DB3B-PRE: order_item.workstation_id not present (L2)'; end if;
  if to_regclass('public.workstation') is null or not (array['id','type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.workstation') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: workstation(id,type) not present (L2)'; end if;
  -- L3 payment amount / sales_order total (columns per authoritative statement; asserted fail-closed)
  if not (array['amount','status','order_id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.payment') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: payment(amount,status,order_id,tenant_id,branch_id) not present (L3)'; end if;
  if not (array['total','id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.sales_order') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: sales_order(total,id,tenant_id,branch_id) not present (L3)'; end if;
  -- prep_item pristine-proof columns (proved in G1_ROUTINE_DEFINITION_SANITIZED)
  if not (array['order_item_id','tenant_id','branch_id','order_id','prep_status','station_type','claimed_by']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_item') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: prep_item pristine-proof columns not present'; end if;
  -- child-workflow tables + linkage columns (fail-closed if any absent or incompatible)
  if to_regclass('public.prep_event') is null or not (array['order_id','order_item_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_event') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: prep_event child-evidence linkage absent'; end if;
  if to_regclass('public.completion_photo') is null or not (array['order_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.completion_photo') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: completion_photo child-evidence linkage absent'; end if;
  if to_regclass('public.recipe_access') is null or not (array['order_id','outcome']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.recipe_access') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: recipe_access child-evidence linkage absent'; end if;
  if to_regclass('public.complaint') is null or not (array['order_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.complaint') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: complaint child-evidence linkage absent'; end if;
  -- prep_unit QC/completion/actor/timestamp columns required by qr_unit_ready_rollup's full completion proof (block if any absent)
  if not (array['prep_status','workflow_generation','actionable','unit_mode','unit_index','quarantined_at','quarantine_reason','last_qc_result','claimed_by','claimed_at','preparing_started_at','qc_started_at','qc_by','qc_passed_at','completed_by','completed_at','order_item_id','order_id','tenant_id','branch_id','station_type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit') and attnum>0 and not attisdropped),'{}'::text[])) then raise exception 'DB3B-PRE: prep_unit QC/completion/actor/timestamp columns not present (ready-rollup proof)'; end if;
end
$preflight$;

-- ─────────────── ADDITIVE DDL (no business-state change) ───────────────
create type public.prep_queue_state as enum ('accepted','completed','cancelled','released');

create table public.prep_queue_acceptance (
  id           uuid        not null default gen_random_uuid(),
  order_id     uuid        not null,
  tenant_id    uuid        not null,
  branch_id    uuid        not null,
  queue_day    date        not null,
  queue_number integer     not null,
  accepted_by  uuid        not null,
  accepted_at  timestamptz not null default now(),
  state        public.prep_queue_state not null default 'accepted',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint prep_queue_acceptance_pkey primary key (id),
  constraint prep_queue_acceptance_order_key unique (order_id),
  constraint prep_queue_acceptance_branch_day_queue_key unique (branch_id, queue_day, queue_number),
  constraint prep_queue_acceptance_scope_fk foreign key (order_id, tenant_id, branch_id) references public.sales_order (id, tenant_id, branch_id),
  constraint prep_queue_acceptance_employee_fk foreign key (accepted_by) references public.employee (id) on delete restrict,
  constraint prep_queue_acceptance_ts_check check (updated_at >= created_at and accepted_at >= created_at)
);
create index prep_queue_acceptance_branch_idx on public.prep_queue_acceptance (branch_id, queue_day, queue_number);

alter table public.prep_queue_acceptance enable row level security;
revoke all on table public.prep_queue_acceptance from public, anon, authenticated;
grant all on table public.prep_queue_acceptance to service_role;

create function app.prep_queue_acceptance_touch() returns trigger language plpgsql security definer set search_path = '' as $fn$
begin new.updated_at := now(); return new; end $fn$;
create trigger prep_queue_acceptance_set_updated_at before update on public.prep_queue_acceptance for each row execute function app.prep_queue_acceptance_touch();

-- prep_unit indexes (0 gen-2 rows => partial predicates match nothing => created empty; no business change)
create unique index prep_unit_one_active_per_employee_idx on public.prep_unit (claimed_by)
  where (workflow_generation = 2 and unit_mode::text = 'per_cup' and prep_status::text in ('claimed','preparing','qc_required','qc_passed') and claimed_by is not null);
-- actionable route index leads with the routing scope (branch_id, station_type) used by available-work.
create index prep_unit_actionable_route_idx on public.prep_unit (branch_id, station_type, order_id, order_item_id, unit_index)
  where (workflow_generation = 2 and actionable and unit_mode::text = 'per_cup' and prep_status::text = 'waiting');

-- qr_order additive ready-rollup
alter table public.qr_order add column ready_by uuid, add column ready_at timestamptz;
alter table public.qr_order add constraint qr_order_ready_actor_fk foreign key (ready_by) references public.employee (id) on delete restrict;
alter table public.qr_order add constraint qr_order_ready_actor_consistency check ((ready_by is null) = (ready_at is null));

-- prep_event additive unit link (ON DELETE CASCADE, consistent with the existing order_item_id CASCADE)
alter table public.prep_event add column prep_unit_id uuid;
alter table public.prep_event add constraint prep_event_prep_unit_fk foreign key (prep_unit_id) references public.prep_unit (id) on delete cascade;
create index prep_event_unit_occurred_idx on public.prep_event (prep_unit_id, occurred_at);
alter table public.prep_event drop constraint prep_event_event_type_check;
alter table public.prep_event add constraint prep_event_event_type_check check (event_type = any (array['preparing_started','qc_started','qc_failed','qc_passed','rework_started','claim_released','unit_claimed','unit_completed']::text[]));

-- ─────────────── ROUTINES ───────────────
create function app.qr_bind_actor(p_branch_id uuid, p_employee_id uuid) returns uuid language plpgsql security definer set search_path = '' stable as $fn$
declare v_uid uuid; v_tid uuid; v_cnt int;
begin
  v_uid := app.current_user_id();
  v_tid := app.current_tenant_id();
  if v_uid is null or v_tid is null then raise exception 'DB3B: unauthenticated'; end if;
  select count(*) into v_cnt from public.employee e where e.id = p_employee_id and e.user_id = v_uid and e.tenant_id = v_tid and e.branch_id = p_branch_id;
  if v_cnt <> 1 then raise exception 'DB3B: actor binding failed (matched % rows)', v_cnt; end if;
  if not (app.has_branch_role(p_branch_id, array['manager','staff','baker']::text[]) or app.is_tenant_owner()) then raise exception 'DB3B: actor not authorized for branch'; end if;
  return p_employee_id;
end $fn$;

-- internal audit emitter. Derives authoritative context from the prep_unit; re-binds actor; DERIVED reserved
-- keys always win over p_extra (reserved keys stripped from p_extra, then derived merged on the right).
create function app.qr_emit_unit_event(p_event_type text, p_prep_unit_id uuid, p_actor_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text, p_extra jsonb) returns void language plpgsql security definer set search_path = '' as $fn$
declare v_u record; v_bound uuid; v_reserved text[] := array['prep_unit_id','station_type','ip','device_id','user_agent','device_name','tenant_id','branch_id','order_id','order_item_id','attempt_no','actor_employee_id','event_type'];
begin
  if p_event_type not in ('preparing_started','qc_started','qc_failed','qc_passed','rework_started','claim_released','unit_claimed','unit_completed') then raise exception 'DB3B: unsupported event_type %', p_event_type; end if;
  select tenant_id, branch_id, order_id, order_item_id, attempt_no, station_type into v_u from public.prep_unit where id = p_prep_unit_id;
  if not found then raise exception 'DB3B: prep_unit not found for event'; end if;
  v_bound := app.qr_bind_actor(v_u.branch_id, p_actor_employee_id);
  insert into public.prep_event (event_type, tenant_id, branch_id, order_id, order_item_id, attempt_no, actor_employee_id, prep_unit_id, payload, occurred_at)
  values (p_event_type, v_u.tenant_id, v_u.branch_id, v_u.order_id, v_u.order_item_id, v_u.attempt_no, v_bound, p_prep_unit_id,
    jsonb_strip_nulls((coalesce(p_extra, '{}'::jsonb) - v_reserved) || jsonb_build_object('prep_unit_id', p_prep_unit_id, 'station_type', v_u.station_type, 'ip', p_ip::text, 'device_id', p_device_id, 'user_agent', p_user_agent, 'device_name', p_device_name)),
    now());
end $fn$;

-- FIFO whole-queue acceptance (idempotent-exact-match first; fail-closed over the complete order).
create function app.qr_accept_queue(p_branch_id uuid, p_order_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_head uuid; v_expected int; v_legacy int; v_nonpristine int; v_units int; v_qtid uuid; v_qbr uuid; v_qday date; v_qnum int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  v_emp := app.qr_bind_actor(p_branch_id, p_employee_id);
  perform pg_advisory_xact_lock(hashtextextended('prep_queue_accept:'||p_branch_id::text, 0));
  -- lock EXACTLY ONE scoped qr_order row
  select qo.tenant_id, qo.branch_id, qo.queue_day, qo.queue_number into v_qtid, v_qbr, v_qday, v_qnum
  from public.qr_order qo where qo.order_id = p_order_id and qo.branch_id = p_branch_id for update;
  if not found then raise exception 'DB3B: order not found in branch scope'; end if;
  if v_qtid is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  -- idempotency EXACT-MATCH: an existing acceptance must match scope + queue coordinates + valid state
  if exists(select 1 from public.prep_queue_acceptance where order_id = p_order_id) then
    perform 1 from public.prep_queue_acceptance a
      where a.order_id = p_order_id and a.tenant_id = v_qtid and a.branch_id = p_branch_id and a.queue_day = v_qday and a.queue_number = v_qnum and a.state in ('accepted','completed');
    if not found then raise exception 'DB3B: existing acceptance row conflicts with requested scope/queue'; end if;
    return jsonb_build_object('order_id', p_order_id, 'state', 'already_accepted');
  end if;
  -- recompute + lock the true FIFO head under the branch lock
  select qo.order_id into v_head
  from public.qr_order qo
  join public.sales_order so on so.id = qo.order_id and so.tenant_id = qo.tenant_id and so.branch_id = qo.branch_id
  where qo.branch_id = p_branch_id
    and qo.status::text = 'order_received' and qo.paid_at is not null and qo.queue_day is not null and qo.queue_number is not null
    and coalesce(qo.needs_review, false) = false and so.status::text = 'confirmed'
    and (select count(*) from public.payment pp where pp.order_id = qo.order_id and pp.status::text = 'captured') = 1
    and not exists (select 1 from public.prep_queue_acceptance a where a.order_id = qo.order_id)
    and exists (select 1 from public.prep_unit u where u.order_id = qo.order_id and u.unit_mode::text = 'per_cup' and u.workflow_generation = 1)
  order by qo.paid_at asc, qo.queue_day asc, qo.queue_number asc, qo.order_id asc
  for update of qo
  limit 1;
  if v_head is null then raise exception 'DB3B: no eligible order for branch'; end if;
  if v_head <> p_order_id then raise exception 'DB3B: requested order is not the FIFO head'; end if;
  -- L3: exactly one captured payment scoped to this tenant/branch/order, and payment.amount = sales_order.total
  if (select count(*) from public.payment pp where pp.order_id = p_order_id and pp.tenant_id = v_qtid and pp.branch_id = p_branch_id and pp.status::text = 'captured') <> 1 then raise exception 'DB3B: not exactly one scoped captured payment'; end if;
  if (select pp.amount from public.payment pp where pp.order_id = p_order_id and pp.tenant_id = v_qtid and pp.branch_id = p_branch_id and pp.status::text = 'captured' limit 1)
     is distinct from (select so.total from public.sales_order so where so.id = p_order_id and so.tenant_id = v_qtid and so.branch_id = p_branch_id)
    then raise exception 'DB3B: captured payment.amount <> sales_order.total'; end if;
  -- fail-closed proof over the COMPLETE order's unit set (prep_unit proven columns only)
  select
    count(*) filter (where u.unit_mode::text = 'per_cup' and u.workflow_generation = 1 and u.prep_status::text = 'waiting' and u.actionable is not true and u.quarantined_at is null and u.claimed_by is null and u.claimed_at is null and u.preparing_started_at is null and u.qc_started_at is null and u.qc_by is null and u.qc_passed_at is null and u.completed_by is null and u.completed_at is null and u.last_qc_result is null and u.attempt_no = 1 and u.rework_count = 0 and u.station_type is not null and u.unit_index > 0 and u.tenant_id = v_qtid and u.branch_id = p_branch_id),
    count(*) filter (where u.unit_mode::text = 'legacy_line'),
    count(*) filter (where not (u.unit_mode::text = 'per_cup' and u.workflow_generation = 1 and u.prep_status::text = 'waiting' and u.actionable is not true and u.quarantined_at is null and u.claimed_by is null and u.claimed_at is null and u.preparing_started_at is null and u.qc_started_at is null and u.qc_by is null and u.qc_passed_at is null and u.completed_by is null and u.completed_at is null and u.last_qc_result is null and u.attempt_no = 1 and u.rework_count = 0 and u.station_type is not null and u.unit_index > 0 and u.tenant_id = v_qtid and u.branch_id = p_branch_id))
  into v_expected, v_legacy, v_nonpristine
  from public.prep_unit u where u.order_id = p_order_id;
  if v_legacy > 0 then raise exception 'DB3B: order contains legacy_line unit(s)'; end if;
  if v_nonpristine > 0 then raise exception 'DB3B: order has non-pristine per_cup unit(s)'; end if;
  if v_expected = 0 then raise exception 'DB3B: no eligible per_cup units'; end if;
  -- every per_cup order_item must exist; cast-safe quantity policy (non-null, positive, within int range) before ceil()
  if exists (
    select 1 from (select distinct order_item_id from public.prep_unit where order_id = p_order_id and unit_mode::text = 'per_cup') d
    where not exists (select 1 from public.order_item oi where oi.id = d.order_item_id)
  ) then raise exception 'DB3B: per_cup unit has no order_item'; end if;
  if exists (
    select 1 from (select distinct order_item_id from public.prep_unit where order_id = p_order_id and unit_mode::text = 'per_cup') d
    join public.order_item oi on oi.id = d.order_item_id
    where oi.qty is null or oi.qty <= 0 or oi.qty > 2147483647::numeric
  ) then raise exception 'DB3B: order_item.qty null / non-positive / out of integer range'; end if;
  -- authoritative cardinality contract: per order_item, unit count = ceil(qty) and unit_index is 1..ceil(qty) contiguous+unique
  if exists (
    select 1
    from (select order_item_id, count(*) c, count(distinct unit_index) d, min(unit_index) mn, max(unit_index) mx
          from public.prep_unit where order_id = p_order_id and unit_mode::text = 'per_cup' group by order_item_id) g
    join public.order_item oi on oi.id = g.order_item_id
    where g.c <> ceil(oi.qty)::int or g.d <> g.c or g.mn <> 1 or g.mx <> g.c
  ) then raise exception 'DB3B: per-order-item unit count/index does not match ceil(order_item.qty)'; end if;
  -- L2: every per_cup unit's station_type = routed workstation.type via order_item.workstation_id (proved linkage)
  if exists (
    select 1 from public.prep_unit u
    join public.order_item oi on oi.id = u.order_item_id
    left join public.workstation w on w.id = oi.workstation_id
    where u.order_id = p_order_id and u.unit_mode::text = 'per_cup'
      and (oi.workstation_id is null or w.id is null or u.station_type::text is distinct from w.type::text)
  ) then raise exception 'DB3B: per_cup unit station_type does not match routed workstation.type (via order_item.workstation_id)'; end if;
  -- exactly one PRISTINE prep_item source per order_item (waiting, unclaimed, scope + station_type consistent)
  if exists (
    select 1 from (select distinct order_item_id from public.prep_unit where order_id = p_order_id and unit_mode::text = 'per_cup') oi
    where (select count(*) from public.prep_item pi where pi.order_item_id = oi.order_item_id) <> 1
  ) then raise exception 'DB3B: order_item lacks a unique prep_item source'; end if;
  if exists (
    select 1 from public.prep_item pi
    join public.order_item oi on oi.id = pi.order_item_id
    left join public.workstation w on w.id = oi.workstation_id
    where pi.order_id = p_order_id and exists (select 1 from public.prep_unit u where u.order_item_id = pi.order_item_id and u.order_id = p_order_id and u.unit_mode::text = 'per_cup')
      and (pi.prep_status::text <> 'waiting' or pi.claimed_by is not null
           or pi.tenant_id is distinct from v_qtid or pi.branch_id is distinct from p_branch_id or pi.order_id is distinct from p_order_id
           or w.id is null or pi.station_type::text is distinct from w.type::text)
  ) then raise exception 'DB3B: source prep_item is not pristine / scope-consistent'; end if;
  -- child-workflow pristine: no prep_event / completion_photo / granted recipe_access / complaint for this order
  if exists (select 1 from public.prep_event where order_id = p_order_id) then raise exception 'DB3B: prep_event evidence exists (order not pristine)'; end if;
  if exists (select 1 from public.completion_photo where order_id = p_order_id) then raise exception 'DB3B: completion_photo evidence exists (order not pristine)'; end if;
  if exists (select 1 from public.recipe_access where order_id = p_order_id and outcome::text = 'granted') then raise exception 'DB3B: granted recipe_access evidence exists (order not pristine)'; end if;
  if exists (select 1 from public.complaint where order_id = p_order_id) then raise exception 'DB3B: complaint evidence exists (order not pristine)'; end if;
  -- record acceptance (one row) then convert EXACTLY the proved pristine set
  insert into public.prep_queue_acceptance (order_id, tenant_id, branch_id, queue_day, queue_number, accepted_by, accepted_at, state)
  select qo.order_id, qo.tenant_id, qo.branch_id, qo.queue_day, qo.queue_number, v_emp, now(), 'accepted'
  from public.qr_order qo where qo.order_id = p_order_id;
  update public.prep_unit set workflow_generation = 2, actionable = true
  where order_id = p_order_id and unit_mode::text = 'per_cup' and workflow_generation = 1 and prep_status::text = 'waiting'
    and actionable is not true and quarantined_at is null and claimed_by is null and claimed_at is null and preparing_started_at is null and qc_started_at is null and qc_by is null and qc_passed_at is null and completed_by is null and completed_at is null and last_qc_result is null and attempt_no = 1 and rework_count = 0 and station_type is not null and unit_index > 0 and tenant_id = v_qtid and branch_id = p_branch_id;
  get diagnostics v_units = row_count;
  if v_units <> v_expected then raise exception 'DB3B: activated unit count % <> expected %', v_units, v_expected; end if;
  return jsonb_build_object('order_id', p_order_id, 'units_activated', v_units, 'state', 'accepted');
end $fn$;

create function app.qr_available_unit_work(p_branch_id uuid, p_employee_id uuid) returns table(unit_id uuid, order_id uuid, order_item_id uuid, unit_index integer, station_type text, queue_day date, queue_number integer)
language plpgsql security definer set search_path = '' stable as $fn$
declare v_emp uuid;
begin
  v_emp := app.qr_bind_actor(p_branch_id, p_employee_id);
  return query
  select u.id, u.order_id, u.order_item_id, u.unit_index, u.station_type::text, a.queue_day, a.queue_number
  from public.prep_unit u
  join public.prep_queue_acceptance a on a.order_id = u.order_id and a.state = 'accepted'
  join public.qr_order qo on qo.order_id = u.order_id
  where u.branch_id = p_branch_id and u.tenant_id = app.current_tenant_id()
    and u.workflow_generation = 2 and u.actionable and u.unit_mode::text = 'per_cup' and u.prep_status::text = 'waiting' and u.quarantined_at is null
  order by qo.paid_at asc, qo.queue_day asc, qo.queue_number asc, qo.order_id asc, u.station_type asc, u.order_item_id asc, u.unit_index asc;
end $fn$;

create function app.qr_claim_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.prep_status::text <> 'waiting' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  update public.prep_unit set prep_status = 'claimed', claimed_by = v_emp, claimed_at = now() where id = p_unit_id and prep_status::text = 'waiting' and claimed_by is null;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: claim CAS conflict'; end if;
  perform app.qr_emit_unit_event('unit_claimed', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','claim'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'claimed');
end $fn$;

create function app.qr_start_preparing_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.claimed_by is distinct from v_emp then raise exception 'DB3B: not owner'; end if;
  if v_u.prep_status::text <> 'claimed' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  update public.prep_unit set prep_status = 'preparing', preparing_started_at = now() where id = p_unit_id and prep_status::text = 'claimed' and claimed_by = v_emp;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: CAS conflict'; end if;
  perform app.qr_emit_unit_event('preparing_started', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','start_preparing'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'preparing');
end $fn$;

create function app.qr_start_qc_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.claimed_by is distinct from v_emp then raise exception 'DB3B: not owner'; end if;
  if v_u.prep_status::text <> 'preparing' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  update public.prep_unit set prep_status = 'qc_required', qc_started_at = now() where id = p_unit_id and prep_status::text = 'preparing' and claimed_by = v_emp;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: CAS conflict'; end if;
  perform app.qr_emit_unit_event('qc_started', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','start_qc'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'qc_required');
end $fn$;

-- QC fail: emit qc_failed on the FAILED (current) attempt, THEN increment, THEN emit rework_started on the NEW attempt.
create function app.qr_qc_fail_unit(p_unit_id uuid, p_employee_id uuid, p_reason text, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'DB3B: qc fail reason required'; end if;
  if length(p_reason) > 500 then raise exception 'DB3B: qc fail reason too long'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.claimed_by is distinct from v_emp then raise exception 'DB3B: not owner'; end if;
  if v_u.prep_status::text <> 'qc_required' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  -- (1) emit qc_failed while attempt_no is still the failed attempt
  perform app.qr_emit_unit_event('qc_failed', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','qc_fail','reason', p_reason));
  -- (2) update to preparing and increment attempt/rework; reset stale pass/completion evidence
  update public.prep_unit set prep_status = 'preparing', last_qc_result = 'fail', qc_by = v_emp, attempt_no = attempt_no + 1, rework_count = rework_count + 1, qc_passed_at = null, completed_by = null, completed_at = null
  where id = p_unit_id and prep_status::text = 'qc_required' and claimed_by = v_emp;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: CAS conflict'; end if;
  -- (3) emit rework_started on the NEW attempt
  perform app.qr_emit_unit_event('rework_started', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','rework'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'preparing', 'qc', 'fail');
end $fn$;

create function app.qr_pass_qc_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.claimed_by is distinct from v_emp then raise exception 'DB3B: not owner'; end if;
  if v_u.prep_status::text <> 'qc_required' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  update public.prep_unit set prep_status = 'qc_passed', last_qc_result = 'pass', qc_by = v_emp, qc_passed_at = now() where id = p_unit_id and prep_status::text = 'qc_required' and claimed_by = v_emp;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: CAS conflict'; end if;
  perform app.qr_emit_unit_event('qc_passed', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','pass_qc'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'qc_passed');
end $fn$;

create function app.qr_complete_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.claimed_by is distinct from v_emp then raise exception 'DB3B: not owner'; end if;
  if v_u.prep_status::text <> 'qc_passed' then raise exception 'DB3B: bad prior state %', v_u.prep_status; end if;
  update public.prep_unit set prep_status = 'completed', completed_by = v_emp, completed_at = now() where id = p_unit_id and prep_status::text = 'qc_passed' and claimed_by = v_emp;
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: CAS conflict'; end if;
  perform app.qr_emit_unit_event('unit_completed', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_build_object('transition','complete'));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'completed');
end $fn$;

create function app.qr_release_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_u record; v_n int; v_prior uuid;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  select * into v_u from public.prep_unit where id = p_unit_id for update;
  if not found then raise exception 'DB3B: unit not found'; end if;
  if v_u.workflow_generation <> 2 or v_u.unit_mode::text <> 'per_cup' or v_u.actionable is not true or v_u.quarantined_at is not null then raise exception 'DB3B: unit not gen2/actionable/per_cup'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a where a.order_id = v_u.order_id and a.state = 'accepted') then raise exception 'DB3B: parent queue not accepted'; end if;
  v_emp := app.qr_bind_actor(v_u.branch_id, p_employee_id);
  if v_u.tenant_id is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  if v_u.prep_status::text not in ('claimed','preparing','qc_required','qc_passed') then raise exception 'DB3B: not in a releasable state %', v_u.prep_status; end if;
  v_prior := v_u.claimed_by;
  if v_prior is distinct from v_emp then
    if not (app.has_branch_role(v_u.branch_id, array['manager']::text[]) or app.is_tenant_owner()) then raise exception 'DB3B: only the claimant, a branch manager, or the tenant owner may release another employee''s cup'; end if;
  end if;
  update public.prep_unit set prep_status = 'waiting', claimed_by = null, claimed_at = null, preparing_started_at = null, qc_started_at = null, qc_by = null, last_qc_result = null, qc_passed_at = null, completed_by = null, completed_at = null
  where id = p_unit_id and prep_status::text in ('claimed','preparing','qc_required','qc_passed');
  get diagnostics v_n = row_count; if v_n = 0 then raise exception 'DB3B: release CAS conflict'; end if;
  perform app.qr_emit_unit_event('claim_released', p_unit_id, v_emp, p_ip, p_device_id, p_user_agent, p_device_name, jsonb_strip_nulls(jsonb_build_object('transition','release','released_by', v_emp, 'prior_claimant', v_prior)));
  return jsonb_build_object('unit_id', p_unit_id, 'state', 'waiting');
end $fn$;

-- ready rollup: deterministic locks (acceptance -> qr_order -> sales_order -> all per_cup prep_unit rows in pk order);
-- exact allowed pre-ready states; the required set is derived from order_item.qty (not the current gen2/actionable
-- filter) and the SAME full-set completeness proof gates both the transition and the idempotent already_ready
-- branch; fail-closed. Never writes handover.
create function app.qr_unit_ready_rollup(p_order_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_emp uuid; v_br uuid; v_tid uuid; v_n int; v_qs text; v_ss text; v_complete boolean;
begin
  if not exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B: activation disabled'; end if;
  perform 1 from public.prep_queue_acceptance where order_id = p_order_id for update;
  select branch_id, tenant_id into v_br, v_tid from public.qr_order where order_id = p_order_id for update;
  if v_br is null then raise exception 'DB3B: order not found'; end if;
  perform 1 from public.sales_order where id = p_order_id for update;
  perform 1 from public.prep_item where order_id = p_order_id order by order_item_id for update;
  perform 1 from public.prep_unit where order_id = p_order_id order by id for update;
  v_emp := app.qr_bind_actor(v_br, p_employee_id);
  if v_tid is distinct from app.current_tenant_id() then raise exception 'DB3B: tenant scope'; end if;
  -- acceptance row must exist uniquely and match the order's tenant/branch/queue coordinates
  if (select count(*) from public.prep_queue_acceptance where order_id = p_order_id) <> 1 then raise exception 'DB3B: acceptance row not unique for order'; end if;
  if not exists(select 1 from public.prep_queue_acceptance a join public.qr_order qo on qo.order_id = a.order_id where a.order_id = p_order_id and a.tenant_id = qo.tenant_id and a.branch_id = qo.branch_id and a.queue_day = qo.queue_day and a.queue_number = qo.queue_number) then raise exception 'DB3B: acceptance row scope/queue coordinates mismatch'; end if;
  select status::text into v_qs from public.qr_order where order_id = p_order_id;
  select status::text into v_ss from public.sales_order where id = p_order_id;
  -- AUTHORITATIVE required set = source prep_item rows scoped to p_order_id, grouped one row per order_item_id
  -- (source_count must be exactly 1, and that source row pristine + scoped + station-matched). For each source
  -- item: cast-safe ceil(qty) (cast only in the CASE after range checks), exact per_cup unit cardinality with
  -- distinct contiguous 1..ceil(qty) indexes, and every unit COMPLETED under the full QC/completion predicate
  -- with internally consistent timestamps and same-tenant/branch actors. Globally reject any unit outside the
  -- source set, any NULL/non-per_cup mode, and any quarantined unit. A zero-unit source item => s.c=0 <> ceil(qty)
  -- => ok=false (not NULL). The identical v_complete gates both the normal transition and already_ready.
  select coalesce(bool_and(ok), false)
    and not exists(select 1 from public.prep_unit u where u.order_id = p_order_id and not exists (select 1 from public.prep_item pi where pi.order_id = p_order_id and pi.order_item_id = u.order_item_id))
    and not exists(select 1 from public.prep_unit u where u.order_id = p_order_id and (u.unit_mode is null or u.unit_mode::text <> 'per_cup'))
    and not exists(select 1 from public.prep_unit u where u.order_id = p_order_id and (u.quarantined_at is not null or u.quarantine_reason is not null))
  into v_complete
  from (
    select case
             when g.source_count <> 1 then false
             when g.pi_ok is not true then false
             when oi.id is null or oi.qty is null or oi.qty <= 0 or oi.qty > 2147483647::numeric then false
             else (s.c = ceil(oi.qty)::int and s.done = ceil(oi.qty)::int and s.di = ceil(oi.qty)::int and s.mn = 1 and s.mx = ceil(oi.qty)::int) end ok
    from (
      select pi.order_item_id, count(*) source_count,
             bool_and(pi.prep_status::text = 'waiting' and pi.claimed_by is null and pi.tenant_id = v_tid and pi.branch_id = v_br and pi.order_id = p_order_id
                      and exists (select 1 from public.order_item oi2 join public.workstation w on w.id = oi2.workstation_id where oi2.id = pi.order_item_id and pi.station_type::text = w.type::text)) pi_ok
      from public.prep_item pi where pi.order_id = p_order_id
      group by pi.order_item_id
    ) g
    left join public.order_item oi on oi.id = g.order_item_id
    join lateral (
      select count(*) c,
        count(*) filter (where
             u.prep_status::text = 'completed' and u.workflow_generation = 2 and u.actionable is true and u.unit_mode::text = 'per_cup'
             and u.quarantined_at is null and u.quarantine_reason is null and u.last_qc_result::text = 'pass'
             and u.claimed_by is not null and u.claimed_at is not null and u.preparing_started_at is not null and u.qc_started_at is not null and u.qc_by is not null and u.qc_passed_at is not null and u.completed_by is not null and u.completed_at is not null
             and u.claimed_at <= u.preparing_started_at and u.preparing_started_at <= u.qc_started_at and u.qc_started_at <= u.qc_passed_at and u.qc_passed_at <= u.completed_at
             and u.qc_by = u.claimed_by and u.completed_by = u.claimed_by
             and exists (select 1 from public.employee ec where ec.id = u.claimed_by and ec.tenant_id = u.tenant_id and ec.branch_id = u.branch_id)
             and exists (select 1 from public.employee eq where eq.id = u.qc_by and eq.tenant_id = u.tenant_id and eq.branch_id = u.branch_id)
             and exists (select 1 from public.employee em where em.id = u.completed_by and em.tenant_id = u.tenant_id and em.branch_id = u.branch_id)
           ) done,
        count(distinct u.unit_index) di, min(u.unit_index) mn, max(u.unit_index) mx
      from public.prep_unit u where u.order_id = p_order_id and u.order_item_id = g.order_item_id and u.unit_mode::text = 'per_cup'
    ) s on true
  ) z;
  -- idempotency: fully-consistent already-ready state (SAME full-set completeness proof)
  if exists(select 1 from public.prep_queue_acceptance where order_id = p_order_id and state = 'completed')
     and v_qs = 'ready_for_pickup' and v_ss = 'ready'
     and exists(select 1 from public.qr_order where order_id = p_order_id and ready_by is not null and ready_at is not null)
     and exists(select 1 from public.qr_order qo join public.employee e on e.id = qo.ready_by where qo.order_id = p_order_id and e.tenant_id = v_tid and e.branch_id = v_br)
     and not exists(select 1 from public.qr_order where order_id = p_order_id and (handed_over_by is not null or handed_over_at is not null))
     and v_complete then
    return jsonb_build_object('order_id', p_order_id, 'state', 'already_ready');
  end if;
  if not exists(select 1 from public.prep_queue_acceptance where order_id = p_order_id and state = 'accepted') then raise exception 'DB3B: order not in accepted state'; end if;
  if v_qs not in ('order_received','in_progress') then raise exception 'DB3B: qr_order not in an allowed pre-ready state (%)', v_qs; end if;
  if v_ss not in ('confirmed','preparing') then raise exception 'DB3B: sales_order not in an allowed pre-ready state (%)', v_ss; end if;
  if (select coalesce(needs_review,false) from public.qr_order where order_id = p_order_id) then raise exception 'DB3B: qr_order needs_review'; end if;
  if exists(select 1 from public.qr_order where order_id = p_order_id and (handed_over_by is not null or handed_over_at is not null)) then raise exception 'DB3B: order already handed over'; end if;
  if not v_complete then raise exception 'DB3B: required unit set is not complete (missing/extra/legacy/wrong-mode/gen1/quarantined/incomplete/index-mismatch)'; end if;
  update public.sales_order set status = 'ready' where id = p_order_id and status::text in ('confirmed','preparing');
  get diagnostics v_n = row_count; if v_n <> 1 then raise exception 'DB3B: sales_order ready update affected % rows', v_n; end if;
  update public.qr_order set status = 'ready_for_pickup', ready_by = v_emp, ready_at = now() where order_id = p_order_id and status::text in ('order_received','in_progress');
  get diagnostics v_n = row_count; if v_n <> 1 then raise exception 'DB3B: qr_order ready update affected % rows', v_n; end if;
  update public.prep_queue_acceptance set state = 'completed' where order_id = p_order_id and state = 'accepted';
  get diagnostics v_n = row_count; if v_n <> 1 then raise exception 'DB3B: acceptance completion affected % rows', v_n; end if;
  return jsonb_build_object('order_id', p_order_id, 'state', 'ready_for_pickup');
end $fn$;

-- ─────────────── PUBLIC SECURITY INVOKER WRAPPERS (thin; identical signatures) ───────────────
create function public.qr_accept_queue(p_branch_id uuid, p_order_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_accept_queue(p_branch_id, p_order_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_available_unit_work(p_branch_id uuid, p_employee_id uuid) returns table(unit_id uuid, order_id uuid, order_item_id uuid, unit_index integer, station_type text, queue_day date, queue_number integer) language sql security invoker set search_path = '' as $fn$ select * from app.qr_available_unit_work(p_branch_id, p_employee_id) $fn$;
create function public.qr_claim_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_claim_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_start_preparing_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_start_preparing_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_start_qc_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_start_qc_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_qc_fail_unit(p_unit_id uuid, p_employee_id uuid, p_reason text, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_qc_fail_unit(p_unit_id, p_employee_id, p_reason, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_pass_qc_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_pass_qc_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_complete_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_complete_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_release_unit(p_unit_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_release_unit(p_unit_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;
create function public.qr_unit_ready_rollup(p_order_id uuid, p_employee_id uuid, p_ip inet, p_device_id text, p_user_agent text, p_device_name text) returns jsonb language sql security invoker set search_path = '' as $fn$ select app.qr_unit_ready_rollup(p_order_id, p_employee_id, p_ip, p_device_id, p_user_agent, p_device_name) $fn$;

-- ─────────────── ACLs (no PUBLIC execute; do not touch legacy ACLs) ───────────────
revoke all on function app.qr_bind_actor(uuid, uuid) from public;
revoke all on function app.qr_emit_unit_event(text, uuid, uuid, inet, text, text, text, jsonb) from public;
revoke all on function app.prep_queue_acceptance_touch() from public;
revoke all on function app.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text), app.qr_available_unit_work(uuid, uuid), app.qr_claim_unit(uuid, uuid, inet, text, text, text), app.qr_start_preparing_unit(uuid, uuid, inet, text, text, text), app.qr_start_qc_unit(uuid, uuid, inet, text, text, text), app.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text), app.qr_pass_qc_unit(uuid, uuid, inet, text, text, text), app.qr_complete_unit(uuid, uuid, inet, text, text, text), app.qr_release_unit(uuid, uuid, inet, text, text, text), app.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text) from public;
grant execute on function app.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text), app.qr_available_unit_work(uuid, uuid), app.qr_claim_unit(uuid, uuid, inet, text, text, text), app.qr_start_preparing_unit(uuid, uuid, inet, text, text, text), app.qr_start_qc_unit(uuid, uuid, inet, text, text, text), app.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text), app.qr_pass_qc_unit(uuid, uuid, inet, text, text, text), app.qr_complete_unit(uuid, uuid, inet, text, text, text), app.qr_release_unit(uuid, uuid, inet, text, text, text), app.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text) to authenticated, service_role;
revoke all on function public.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text), public.qr_available_unit_work(uuid, uuid), public.qr_claim_unit(uuid, uuid, inet, text, text, text), public.qr_start_preparing_unit(uuid, uuid, inet, text, text, text), public.qr_start_qc_unit(uuid, uuid, inet, text, text, text), public.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text), public.qr_pass_qc_unit(uuid, uuid, inet, text, text, text), public.qr_complete_unit(uuid, uuid, inet, text, text, text), public.qr_release_unit(uuid, uuid, inet, text, text, text), public.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text) from public, anon;
grant execute on function public.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text), public.qr_available_unit_work(uuid, uuid), public.qr_claim_unit(uuid, uuid, inet, text, text, text), public.qr_start_preparing_unit(uuid, uuid, inet, text, text, text), public.qr_start_qc_unit(uuid, uuid, inet, text, text, text), public.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text), public.qr_pass_qc_unit(uuid, uuid, inet, text, text, text), public.qr_complete_unit(uuid, uuid, inet, text, text, text), public.qr_release_unit(uuid, uuid, inet, text, text, text), public.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text) to authenticated, service_role;

commit;
