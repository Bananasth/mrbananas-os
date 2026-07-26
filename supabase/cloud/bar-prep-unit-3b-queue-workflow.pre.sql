-- =============================================================================
-- bar-prep-unit-3b-queue-workflow.pre.sql — DB-3B PRE (READ-ONLY). Run ONCE before the migration.
-- ONE SELECT statement, ONE result set (section, object_name, detail). SELECT/catalog only. No DML/DDL/DO/CALL.
-- Every possibly-absent business-row read goes through a guarded query_to_xml (dynamic SQL). The final gate p9
-- consumes ONLY guarded evidence CTEs + catalog checks — no static reference to a potentially-missing business
-- relation/column. PUBLIC EXECUTE via aclexplode(proacl)/default-ACL. Protected D10 routines are gated on
-- authoritative Gate-0 metadata (owner/security/volatility/result/lang/config) + effective EXECUTE ACL +
-- md5(pg_get_functiondef) for all 40 D10 routines (3 Gate-0 + 37 supplied). L2 (order_item.workstation_id ->
-- workstation.type) and L3 (payment.amount = sales_order.total) are integrated as fail-closed prerequisites.
-- =============================================================================
with
fp as (
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
),
prot as (  -- D10 protected routines: exact metadata + ACL (+ md5 for all 40 D10 routines (3 Gate-0 + 37 supplied))
  select x.sig, x.md5x, r.oid,
    (r.oid is not null
     and (select prosecdef from pg_proc where oid=r.oid)=x.secdef
     and (select provolatile::text from pg_proc where oid=r.oid)=x.vol
     and (select format_type(prorettype,null) from pg_proc where oid=r.oid)=x.res
     and (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=r.oid)=x.lang
     and (select pg_get_userbyid(proowner) from pg_proc where oid=r.oid)='postgres'
     and coalesce((select array_length(proconfig,1) from pg_proc where oid=r.oid),0)=1
     and coalesce((select proconfig[1] from pg_proc where oid=r.oid),'') like 'search_path=%'
     and (case when (select proacl from pg_proc where oid=r.oid) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE') end)=x.pub
     and has_function_privilege('anon',r.oid,'EXECUTE')=x.anonx
     and has_function_privilege('authenticated',r.oid,'EXECUTE')=x.authx
     and has_function_privilege('service_role',r.oid,'EXECUTE')=x.svcx
     and md5(pg_get_functiondef(r.oid))=x.md5x) as ok
  from (values
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
  ) x(sig,md5x,secdef,vol,res,lang,pub,anonx,authx,svcx)
  cross join lateral (select to_regprocedure(x.sig) oid) r
),
gev as (
  select
    case when to_regclass('public.prep_unit_activation') is null or not (array['enabled']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit_activation') and attnum>0 and not attisdropped),'{}'::text[])) then null
      else (xpath('//row/c/text()', query_to_xml($q$ select (exists(select 1 from public.prep_unit_activation where enabled))::text as c $q$, false,false,'')))[1]::text end as activation_enabled,
    case when to_regclass('public.prep_unit') is null or not (array['workflow_generation','actionable','quarantined_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit') and attnum>0 and not attisdropped),'{}'::text[])) then null
      else (xpath('//row/c/text()', query_to_xml($q$ select count(*)::text as c from public.prep_unit where workflow_generation=2 or actionable or quarantined_at is not null $q$, false,false,'')))[1]::text end as gen_bad_count,
    case when to_regclass('public.prep_unit') is null or not (array['unit_mode','workflow_generation','actionable','quarantined_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      else (xpath('//row/c/text()', query_to_xml($q$ select 'total='||count(*)||' per_cup='||count(*) filter(where unit_mode::text='per_cup')||' legacy_line='||count(*) filter(where unit_mode::text='legacy_line')||' gen2='||count(*) filter(where workflow_generation=2)||' actionable='||count(*) filter(where actionable)||' quarantined='||count(*) filter(where quarantined_at is not null) as c from public.prep_unit $q$, false,false,'')))[1]::text end as gen_detail,
    case when to_regclass('public.qr_order') is null or not (array['status','paid_at','queue_number','queue_day','needs_review','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      else (xpath('//row/c/text()', query_to_xml($q$ select 'order_received='||count(*) filter(where status::text='order_received')||' paid_at_null='||count(*) filter(where status::text='order_received' and paid_at is null)||' queue_null='||count(*) filter(where status::text='order_received' and (queue_number is null or queue_day is null))||' needs_review_true='||count(*) filter(where status::text='order_received' and coalesce(needs_review,false))||' inversions='||(select count(*) from (select paid_at, lag(paid_at) over (partition by branch_id, queue_day order by queue_number) lp from public.qr_order where status::text='order_received' and queue_number is not null) w where w.lp is not null and w.paid_at<w.lp) as c from public.qr_order $q$, false,false,'')))[1]::text end as elig_detail
),
coll as (
  select count(*) cnt, string_agg(what,'; ') hits from (
    select 'table:prep_queue_acceptance' what where to_regclass('public.prep_queue_acceptance') is not null
    union all select 'type:prep_queue_state' from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='prep_queue_state' and n.nspname='public'
    union all select 'col:prep_event.prep_unit_id' from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped
    union all select 'col:qr_order.'||attname from pg_attribute where attrelid=to_regclass('public.qr_order') and attname in ('ready_by','ready_at') and not attisdropped
    union all select 'index:'||ic.relname from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where ic.relkind::text='i' and nn.nspname in ('app','public') and ic.relname = any(array['prep_queue_acceptance_branch_idx','prep_unit_one_active_per_employee_idx','prep_unit_actionable_route_idx','prep_event_unit_occurred_idx'])
    union all select 'constraint:'||con.conname from pg_constraint con join pg_class cl on cl.oid=con.conrelid join pg_namespace nn on nn.oid=cl.relnamespace where nn.nspname in ('app','public') and con.conname = any(array['prep_queue_acceptance_pkey','prep_queue_acceptance_order_key','prep_queue_acceptance_branch_day_queue_key','prep_queue_acceptance_scope_fk','prep_queue_acceptance_employee_fk','prep_queue_acceptance_ts_check','prep_event_prep_unit_fk','qr_order_ready_actor_fk','qr_order_ready_actor_consistency'])
    union all select 'trigger:prep_queue_acceptance_set_updated_at' from pg_trigger where not tgisinternal and tgname='prep_queue_acceptance_set_updated_at'
    union all select 'routine:'||s.sig from unnest(array['app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','app.qr_available_unit_work(uuid,uuid)','app.qr_claim_unit(uuid,uuid,inet,text,text,text)','app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)','app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_complete_unit(uuid,uuid,inet,text,text,text)','app.qr_release_unit(uuid,uuid,inet,text,text,text)','app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)','app.qr_bind_actor(uuid,uuid)','app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)','app.prep_queue_acceptance_touch()','public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','public.qr_available_unit_work(uuid,uuid)','public.qr_claim_unit(uuid,uuid,inet,text,text,text)','public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)','public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_complete_unit(uuid,uuid,inet,text,text,text)','public.qr_release_unit(uuid,uuid,inet,text,text,text)','public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)']) s(sig) where to_regprocedure(s.sig) is not null
  ) z
),
p0 as (
  select 0 ord,'PRE_REL_FINGERPRINT'::text section, f.rel object_name,
    'overall_fp='||f.overall_fp||' | expected='||e.exp||' | '||case when f.overall_fp=e.exp then 'MATCH' else 'DRIFT/MISMATCH' end
    ||case when f.rel in ('public.prep_unit','public.prep_event','public.qr_order') then ' (AUTHORIZED-TO-CHANGE baseline)' else ' (PROTECTED)' end detail
  from fp f join (values ('public.prep_unit','e71b49b10f006f712d1a035a41b67c29'),('public.prep_unit_activation','526b6e0f8b4942b3490786fe23283bdb'),('public.prep_event','901040af6f986d64b81c1b9057e116cd'),('public.prep_item','6c563a0c15643af3d7207979c8354afe'),('public.qr_order','f4422dd521c263c31b1a5c049e1e47f8'),('public.sales_order','b8d28d49a212ab5af33f6f1046505982'),('public.payment','3d34ef56697772b5d2cef622c4583cbc'),('public.order_item','26ab9d0cfcdcc9051190c1a3d913db10'),('public.employee','fd63759e11baa370e6f2a8036fb564d4'),('public.app_user','26f45b4818496414df4f054ef5445cca')) e(rel,exp) on e.rel=f.rel
),
p1 as (
  select 1,'PRE_PROTECTED_ROUTINE', prot.sig,
    case when prot.oid is null then 'FAIL(MISSING/wrong-signature)' when prot.ok then 'PASS' else 'FAIL(metadata/ACL/md5 drift)' end
    ||' :: sec='||coalesce((select case when prosecdef then 'DEFINER' else 'INVOKER' end from pg_proc where oid=prot.oid),'-')||' vol='||coalesce((select provolatile::text from pg_proc where oid=prot.oid),'-')||' res='||coalesce((select format_type(prorettype,null) from pg_proc where oid=prot.oid),'-')||' owner='||coalesce((select pg_get_userbyid(proowner) from pg_proc where oid=prot.oid),'-')||' cfg='||coalesce((select array_to_string(proconfig,',') from pg_proc where oid=prot.oid),'-')
    ||' md5='||coalesce(md5(pg_get_functiondef(prot.oid)),'-')||(case when md5(pg_get_functiondef(prot.oid))=prot.md5x then '=OK' else '=DRIFT' end) detail
  from prot
),
p2 as ( select 2,'PRE_ACTIVATION_DISABLED','public.prep_unit_activation', 'enabled='||coalesce((select activation_enabled from gev),'NOT_PROVABLE')||' (expect false)' detail ),
p3 as ( select 3,'PRE_GEN_ACTIONABLE_QUARANTINE','public.prep_unit', coalesce((select gen_detail from gev),'NOT_PROVABLE')||' (expect gen2/actionable/quarantined=0)' detail ),
p4 as ( select 4,'PRE_ELIGIBILITY_AND_QUEUE','order_received aggregates', coalesce((select elig_detail from gev),'NOT_PROVABLE')||'  (LOCKED: paid_at,queue_day,queue_number,order_id ASC)' detail ),
p5 as (
  select 5,'PRE_L2_L3_PREREQS','workstation + payment/total',
    'order_item.workstation_id='||(exists(select 1 from pg_attribute where attrelid=to_regclass('public.order_item') and attname='workstation_id' and not attisdropped))::text
    ||' | workstation(id,type)='||(to_regclass('public.workstation') is not null and (array['id','type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.workstation') and attnum>0 and not attisdropped),'{}'::text[])))::text
    ||' | payment(amount,status,order_id,tenant_id,branch_id)='||(array['amount','status','order_id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.payment') and attnum>0 and not attisdropped),'{}'::text[]))::text
    ||' | sales_order(total,id,tenant_id,branch_id)='||(array['total','id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.sales_order') and attnum>0 and not attisdropped),'{}'::text[]))::text
    ||' | qr_order(order_id,tenant_id,branch_id,status,paid_at,queue_day,queue_number,needs_review,handed_over_by,handed_over_at)='||(array['order_id','tenant_id','branch_id','status','paid_at','queue_day','queue_number','needs_review','handed_over_by','handed_over_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[]))::text
    ||'  (all must be true; acceptance enforces station_type=workstation.type and payment.amount=sales_order.total)' detail
),
p6 as (
  select 6,'PRE_PREP_EVENT_AUTHORITATIVE','public.prep_event',
    case when to_regclass('public.prep_event') is null then 'MISSING'
      when (select string_agg(a.attnum::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'-'), ',' order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=to_regclass('public.prep_event') and a.attnum>0 and not a.attisdropped)
             = '1:id:uuid:true:gen_random_uuid(),2:tenant_id:uuid:true:-,3:branch_id:uuid:true:-,4:order_id:uuid:true:-,5:order_item_id:uuid:true:-,6:attempt_no:integer:true:1,7:event_type:text:true:-,8:actor_employee_id:uuid:false:-,9:payload:jsonb:false:-,10:occurred_at:timestamp with time zone:true:now(),11:created_at:timestamp with time zone:true:now()'
       and exists(select 1 from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_order_item_id_fkey' and con.contype::text='f' and con.convalidated and con.confrelid=to_regclass('public.prep_item') and con.confdeltype::text='c'
                  and (select array_agg(att.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.an)=array['order_item_id']::text[]
                  and (select array_agg(att.attname::text order by k.ord) from unnest(con.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.confrelid and att.attnum=k.an)=array['order_item_id']::text[])
       and (select conname from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check' and contype::text='c' and convalidated) is not null
       and (select count(*) from pg_constraint where conrelid=to_regclass('public.prep_event') and contype::text='c' and strpos(pg_get_constraintdef(oid),'event_type')>0)=1
       and (select array_agg(x order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s)=array['claim_released','preparing_started','qc_failed','qc_passed','qc_started','rework_started']::text[]
       and not exists(select 1 from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped)
      then 'PASS (exact 11-col struct; prep_event_order_item_id_fkey ON DELETE CASCADE validated; event CHECK validated w/ exactly 6 labels; prep_unit_id absent)'
      else 'DEFECT: struct='||coalesce((select string_agg(a.attnum::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text,',' order by a.attnum) from pg_attribute a where a.attrelid=to_regclass('public.prep_event') and a.attnum>0 and not a.attisdropped),'-') end detail
),
p7 as (
  select 7,'PRE_COLLISION_MANIFEST','all DB-3B objects', 'collision_count='||(select cnt from coll)||coalesce(' hits='||(select hits from coll),' (all free)') detail
),
p9 as (
  select 9,'PRE_READY_TO_APPLY','gate',
    case
      when (select overall_fp from fp where rel='public.prep_unit')<>'e71b49b10f006f712d1a035a41b67c29'
        or (select overall_fp from fp where rel='public.prep_unit_activation')<>'526b6e0f8b4942b3490786fe23283bdb'
        or (select overall_fp from fp where rel='public.prep_event')<>'901040af6f986d64b81c1b9057e116cd'
        or (select overall_fp from fp where rel='public.prep_item')<>'6c563a0c15643af3d7207979c8354afe'
        or (select overall_fp from fp where rel='public.qr_order')<>'f4422dd521c263c31b1a5c049e1e47f8'
        or (select overall_fp from fp where rel='public.sales_order')<>'b8d28d49a212ab5af33f6f1046505982'
        or (select overall_fp from fp where rel='public.payment')<>'3d34ef56697772b5d2cef622c4583cbc'
        or (select overall_fp from fp where rel='public.order_item')<>'26ab9d0cfcdcc9051190c1a3d913db10'
        or (select overall_fp from fp where rel='public.employee')<>'fd63759e11baa370e6f2a8036fb564d4'
        or (select overall_fp from fp where rel='public.app_user')<>'26f45b4818496414df4f054ef5445cca' then 'BLOCKED: fingerprint drift'
      when (select count(*) from prot where not ok)>0 then 'BLOCKED: protected D10 routine drift (signature/metadata/ACL/md5) — '||(select string_agg(sig,', ') from prot where not ok)
      when (select activation_enabled from gev) is null then 'BLOCKED: activation state not provable'
      when (select activation_enabled from gev) <> 'false' then 'BLOCKED: activation missing or enabled'
      when (select gen_bad_count from gev) is null then 'BLOCKED: gen/actionable/quarantine count not provable'
      when (select gen_bad_count from gev) <> '0' then 'BLOCKED: gen2/actionable/quarantined rows exist'
      when (select cnt from coll) <> 0 then 'BLOCKED: DB-3B object collision (count='||(select cnt from coll)||')'
      when (select string_agg(a.attnum::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'-'), ',' order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=to_regclass('public.prep_event') and a.attnum>0 and not a.attisdropped)
             is distinct from '1:id:uuid:true:gen_random_uuid(),2:tenant_id:uuid:true:-,3:branch_id:uuid:true:-,4:order_id:uuid:true:-,5:order_item_id:uuid:true:-,6:attempt_no:integer:true:1,7:event_type:text:true:-,8:actor_employee_id:uuid:false:-,9:payload:jsonb:false:-,10:occurred_at:timestamp with time zone:true:now(),11:created_at:timestamp with time zone:true:now()' then 'BLOCKED: prep_event structure not exact-authoritative'
      when not exists(select 1 from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_order_item_id_fkey' and con.contype::text='f' and con.convalidated and con.confrelid=to_regclass('public.prep_item') and con.confdeltype::text='c'
                      and (select array_agg(att.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.an)=array['order_item_id']::text[]) then 'BLOCKED: prep_event_order_item_id_fkey not exact'
      when (select conname from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check' and contype::text='c' and convalidated) is null
        or (select array_agg(x order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s)<>array['claim_released','preparing_started','qc_failed','qc_passed','qc_started','rework_started']::text[] then 'BLOCKED: prep_event_event_type_check not the exact 6-label validated baseline'
      when not (array['id','user_id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.employee') and attnum>0 and not attisdropped),'{}'::text[]))
        or not (array['id','tenant_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.app_user') and attnum>0 and not attisdropped),'{}'::text[])) then 'BLOCKED: employee/app_user linkage columns not present'
      when not (array['order_id','tenant_id','branch_id','status','paid_at','queue_day','queue_number','needs_review','handed_over_by','handed_over_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[])) then 'BLOCKED: qr_order linkage/FIFO/handover columns not present'
      when not exists(select 1 from pg_constraint where conrelid=to_regclass('public.sales_order') and contype::text in ('p','u') and (select array_agg(att.attname::text order by k.ord) from unnest(conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=conrelid and att.attnum=k.an)=array['id','tenant_id','branch_id']::text[]) then 'BLOCKED: sales_order composite key (id,tenant_id,branch_id) missing'
      when not (array['id','qty']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.order_item') and attnum>0 and not attisdropped),'{}'::text[])) then 'BLOCKED: order_item(id,qty) not present'
      when not exists(select 1 from pg_attribute where attrelid=to_regclass('public.order_item') and attname='workstation_id' and not attisdropped)
        or to_regclass('public.workstation') is null or not (array['id','type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.workstation') and attnum>0 and not attisdropped),'{}'::text[])) then 'BLOCKED: L2 workstation linkage columns not present'
      when not (array['amount','status','order_id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.payment') and attnum>0 and not attisdropped),'{}'::text[]))
        or not (array['total','id','tenant_id','branch_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.sales_order') and attnum>0 and not attisdropped),'{}'::text[])) then 'BLOCKED: L3 payment.amount / sales_order.total columns not present'
      else 'READY_TO_APPLY' end detail
)
select section, object_name, detail from (
  select * from p0 union all select * from p1 union all select * from p2 union all select * from p3
  union all select * from p4 union all select * from p5 union all select * from p6 union all select * from p7 union all select * from p9
) q order by ord, object_name;
