-- =============================================================================
-- bar-prep-unit-3b-queue-workflow.verify.sql — DB-3B VERIFY (READ-ONLY). Run ONCE after the migration.
-- ONE SELECT statement, ONE result set (section, object_name, detail). SELECT/catalog only.
-- Binary PASS/FAIL (or NOT_PROVABLE / COMPARE_PRE_REQUIRED / TEXT_MATCH_ONLY). Every possibly-absent
-- business-row read is a guarded query_to_xml; missing => NOT_PROVABLE, never abort. PUBLIC EXECUTE via
-- aclexplode(proacl)/default-ACL (never has_function_privilege('public',...)). Routine PASS enforces every
-- displayed metadatum; unexpected DB-3B overloads FAIL. Protected D10 routines (40) are PASS/FAIL on exact
-- Gate-0 metadata + ACL; md5(pg_get_functiondef) enforced for every one of the 40 rows (3 Gate-0 + 37 supplied).
-- The 3 authorized-changed relations (prep_unit/prep_event/qr_order) remain COMPARE_PRE_REQUIRED (post != pre).
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
  from (values ('public.prep_item'),('public.prep_unit_activation'),('public.sales_order'),('public.payment'),('public.order_item'),('public.employee'),('public.app_user'),('public.prep_unit'),('public.prep_event'),('public.qr_order')) x(rel)
  cross join lateral (select to_regclass(x.rel) roid) g
),
v_protected as (
  select 0 ord,'VERIFY_PROTECTED_UNCHANGED'::text section, f.rel object_name,
    case when f.overall_fp=e.exp then 'PASS' else 'FAIL' end||' overall_fp='||f.overall_fp||' expected='||e.exp detail
  from fp f join (values ('public.prep_item','6c563a0c15643af3d7207979c8354afe'),('public.prep_unit_activation','526b6e0f8b4942b3490786fe23283bdb'),('public.sales_order','b8d28d49a212ab5af33f6f1046505982'),('public.payment','3d34ef56697772b5d2cef622c4583cbc'),('public.order_item','26ab9d0cfcdcc9051190c1a3d913db10'),('public.employee','fd63759e11baa370e6f2a8036fb564d4'),('public.app_user','26f45b4818496414df4f054ef5445cca')) e(rel,exp) on e.rel=f.rel
),
v_containment as (
  select 1,'VERIFY_AUTHORIZED_CONTAINMENT', f.rel,
    'COMPARE_PRE_REQUIRED post_overall_fp='||f.overall_fp||' (diff against PRE '||f.rel||' baseline; only the authorized DB-3B additions may account for the delta — never PASS here)' detail
  from fp f where f.rel in ('public.prep_unit','public.prep_event','public.qr_order')
),
v_protfn as (  -- every D10 protected routine: exact metadata + ACL (+ md5 for all 40 D10 routines (3 Gate-0 + 37 supplied))
  select 2,'VERIFY_PROTECTED_ROUTINE', x.sig,
    case when r.oid is null then 'FAIL(MISSING/wrong-signature)'
      when (select prosecdef from pg_proc where oid=r.oid)=x.secdef
       and (select provolatile::text from pg_proc where oid=r.oid)=x.vol
       and (select format_type(prorettype,null) from pg_proc where oid=r.oid)=x.res
       and (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=r.oid)=x.lang
       and (select pg_get_userbyid(proowner) from pg_proc where oid=r.oid)='postgres'
       and coalesce((select array_length(proconfig,1) from pg_proc where oid=r.oid),0)=1
       and replace(coalesce((select proconfig[1] from pg_proc where oid=r.oid),''),'"','')='search_path='
       and (case when (select proacl from pg_proc where oid=r.oid) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE') end)=x.pub
       and has_function_privilege('anon',r.oid,'EXECUTE')=x.anonx
       and has_function_privilege('authenticated',r.oid,'EXECUTE')=x.authx
       and has_function_privilege('service_role',r.oid,'EXECUTE')=x.svcx
       and md5(pg_get_functiondef(r.oid))=x.md5x
      then 'PASS' else 'FAIL' end
    ||' :: sec='||coalesce((select case when prosecdef then 'DEFINER' else 'INVOKER' end from pg_proc where oid=r.oid),'-')||' vol='||coalesce((select provolatile::text from pg_proc where oid=r.oid),'-')||' res='||coalesce((select format_type(prorettype,null) from pg_proc where oid=r.oid),'-')||' owner='||coalesce((select pg_get_userbyid(proowner) from pg_proc where oid=r.oid),'-')||' PUBLIC/anon/auth/svc='||(case when (select proacl from pg_proc where oid=r.oid) is null then 'true' else (exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE'))::text end)||'/'||has_function_privilege('anon',r.oid,'EXECUTE')::text||'/'||has_function_privilege('authenticated',r.oid,'EXECUTE')::text||'/'||has_function_privilege('service_role',r.oid,'EXECUTE')::text||' md5='||(md5(pg_get_functiondef(r.oid))=x.md5x)::text detail
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
v_tbl as (
  select 3,'VERIFY_ACCEPTANCE_TABLE','public.prep_queue_acceptance',
    case when to_regclass('public.prep_queue_acceptance') is null then 'FAIL(MISSING)'
      when (select array_agg(a.attname::text||' '||format_type(a.atttypid,a.atttypmod)||case when a.attnotnull then ' NN' else '' end||coalesce(' def:'||regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'') order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=to_regclass('public.prep_queue_acceptance') and a.attnum>0 and not a.attisdropped)
             = array['id uuid NN def:gen_random_uuid()','order_id uuid NN','tenant_id uuid NN','branch_id uuid NN','queue_day date NN','queue_number integer NN','accepted_by uuid NN','accepted_at timestamp with time zone NN def:now()','state prep_queue_state NN def:''accepted''::prep_queue_state','created_at timestamp with time zone NN def:now()','updated_at timestamp with time zone NN def:now()']::text[]
       and exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_pkey' and c.contype::text='p' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['id']::text[])
       and exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_order_key' and c.contype::text='u' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['order_id']::text[])
       and exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_branch_day_queue_key' and c.contype::text='u' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['branch_id','queue_day','queue_number']::text[])
       and exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_scope_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.sales_order') and c.confupdtype::text='a' and c.confdeltype::text='a' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['order_id','tenant_id','branch_id']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id','tenant_id','branch_id']::text[])
       and exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_employee_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.employee') and c.confupdtype::text='a' and c.confdeltype::text='r' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['accepted_by']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id']::text[])
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_queue_acceptance') and conname='prep_queue_acceptance_ts_check' and contype::text='c' and convalidated and regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s','','g'),'[()]','','g')='checkupdated_at>=created_atandaccepted_at>=created_at')
       and exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam where ix.indrelid=to_regclass('public.prep_queue_acceptance') and ic.relname='prep_queue_acceptance_branch_idx' and am.amname='btree' and not ix.indisunique and ix.indisvalid and ix.indisready and ix.indpred is null and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['branch_id','queue_day','queue_number']::text[])
      then 'PASS' else 'FAIL' end
    ||' :: owner='||coalesce((select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance')),'?')||' cons='||coalesce((select string_agg(conname||'['||contype::text||']',',' order by conname) from pg_constraint where conrelid=to_regclass('public.prep_queue_acceptance')),'-') detail
),
v_tbl2 as (
  select 4,'VERIFY_ACCEPTANCE_SECURITY','public.prep_queue_acceptance',
    case when to_regclass('public.prep_queue_acceptance') is null then 'FAIL(MISSING)'
      when (select relrowsecurity from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
       and (select count(*) from pg_policies where schemaname='public' and tablename='prep_queue_acceptance')=0
       and not exists(select 1 from aclexplode((select relacl from pg_class where oid=to_regclass('public.prep_queue_acceptance'))) where grantee=0)
       and (select bool_and(has_table_privilege(rn,to_regclass('public.prep_queue_acceptance'),p)=false) from (values ('anon'),('authenticated')) r(rn), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
       and (select bool_and(has_table_privilege('service_role',to_regclass('public.prep_queue_acceptance'),p)) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
       and exists(select 1 from pg_trigger tg where tg.tgrelid=to_regclass('public.prep_queue_acceptance') and tg.tgname='prep_queue_acceptance_set_updated_at' and not tg.tgisinternal and tg.tgenabled::text='O' and tg.tgtype=19 and tg.tgisinternal=false and (select nn.nspname||'.'||fp.proname from pg_proc fp join pg_namespace nn on nn.oid=fp.pronamespace where fp.oid=tg.tgfoid)='app.prep_queue_acceptance_touch')
       and (select count(*) from pg_trigger where tgrelid=to_regclass('public.prep_queue_acceptance') and not tgisinternal)=1
       and (select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance'))='postgres'
       and not (select relforcerowsecurity from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
       and (select bool_and(has_table_privilege('postgres',to_regclass('public.prep_queue_acceptance'),p)) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
       and not exists(select 1 from aclexplode((select relacl from pg_class where oid=to_regclass('public.prep_queue_acceptance'))) a where a.grantee<>0 and a.grantee<>(select relowner from pg_class where oid=to_regclass('public.prep_queue_acceptance')) and a.grantee<>(select oid from pg_roles where rolname='service_role'))
      then 'PASS' else 'FAIL' end
    ||' :: owner='||coalesce((select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance')),'?')||' RLS/force='||coalesce((select relrowsecurity::text||'/'||relforcerowsecurity::text from pg_class where oid=to_regclass('public.prep_queue_acceptance')),'?')||' policies='||coalesce((select count(*)::text from pg_policies where schemaname='public' and tablename='prep_queue_acceptance'),'?')||' svc/pg(7priv)='||coalesce((select bool_and(has_table_privilege('service_role',to_regclass('public.prep_queue_acceptance'),p))::text from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),'?')||'/'||coalesce((select bool_and(has_table_privilege('postgres',to_regclass('public.prep_queue_acceptance'),p))::text from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),'?') detail
),
v_enum as (
  select 5,'VERIFY_ENUM','public.prep_queue_state',
    case when (select string_agg(e.enumlabel,',' order by e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where t.typname='prep_queue_state' and n.nspname='public')='accepted,completed,cancelled,released' then 'PASS' else 'FAIL' end
    ||' :: labels='||coalesce((select string_agg(e.enumlabel,',' order by e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where t.typname='prep_queue_state' and n.nspname='public'),'MISSING') detail
),
v_prepevent as (
  select 6,'VERIFY_PREP_EVENT_DELTA','public.prep_event',
    case when to_regclass('public.prep_event') is null then 'FAIL(MISSING)'
      when exists(select 1 from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped and format_type(atttypid,atttypmod)='uuid' and not attnotnull)
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_prep_unit_fk' and contype::text='f' and confrelid=to_regclass('public.prep_unit') and confupdtype::text='a' and confdeltype::text='c' and convalidated
                  and (select array_agg(att.attname::text order by k.ord) from unnest(conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=conrelid and att.attnum=k.an)=array['prep_unit_id']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=confrelid and att.attnum=k.an)=array['id']::text[])
       and exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam where ix.indrelid=to_regclass('public.prep_event') and ic.relname='prep_event_unit_occurred_idx' and am.amname='btree' and not ix.indisunique and ix.indisvalid and ix.indisready and ix.indpred is null and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['prep_unit_id','occurred_at']::text[])
       and (select array_agg(x order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s)
             = array['claim_released','preparing_started','qc_failed','qc_passed','qc_started','rework_started','unit_claimed','unit_completed']::text[]
       and (select count(*) from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.contype::text='c' and exists(select 1 from pg_depend d join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid where d.objid=con.oid and d.refobjid=to_regclass('public.prep_event') and a.attname='event_type'))=1
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check' and contype::text='c' and convalidated)
       and (select regexp_replace(regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s|::text','','g'),'\[\]','','g'),'[()]','','g') from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check')='checkevent_type=anyarray[''preparing_started'',''qc_started'',''qc_failed'',''qc_passed'',''rework_started'',''claim_released'',''unit_claimed'',''unit_completed'']'
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_order_item_id_fkey' and confdeltype::text='c' and convalidated)
      then 'PASS' else 'FAIL' end
    ||' :: labels='||coalesce((select string_agg(x,',' order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s),'-')||' (exact 8) fk_del='||coalesce((select confdeltype::text from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_prep_unit_fk'),'?') detail
),
v_qrorder as (
  select 7,'VERIFY_QR_ORDER_DELTA','public.qr_order',
    case when to_regclass('public.qr_order') is null then 'FAIL(MISSING)'
      when exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_by' and not attisdropped and format_type(atttypid,atttypmod)='uuid' and not attnotnull)
       and exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_at' and not attisdropped and format_type(atttypid,atttypmod)='timestamp with time zone' and not attnotnull)
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.qr_order') and conname='qr_order_ready_actor_fk' and contype::text='f' and confrelid=to_regclass('public.employee') and confupdtype::text='a' and confdeltype::text='r' and convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=conrelid and att.attnum=k.an)=array['ready_by']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=confrelid and att.attnum=k.an)=array['id']::text[])
       and exists(select 1 from pg_constraint where conrelid=to_regclass('public.qr_order') and conname='qr_order_ready_actor_consistency' and contype::text='c' and convalidated and regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s','','g'),'[()]','','g')='checkready_byisnull=ready_atisnull')
       and (array['handed_over_by','handed_over_at']::text[] <@ (select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped))
      then 'PASS' else 'FAIL' end
    ||' :: ready_by/at + FK(restrict) + consistency CHECK; handed_over_* preserved' detail
),
v_idx as (
  select 8,'VERIFY_'||x.nm, x.nm,
    case when not exists(select 1 from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname=x.nm and ic.relkind::text='i') then 'FAIL(MISSING)'
      when exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_namespace nn on nn.oid=ic.relnamespace join pg_am am on am.oid=ic.relam
                  where nn.nspname='public' and ic.relname=x.nm and ix.indrelid=to_regclass('public.prep_unit') and am.amname='btree' and ix.indisvalid and ix.indisready
                    and ix.indisunique = x.uniq
                    and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=x.keys
                    and regexp_replace(regexp_replace(lower(coalesce(pg_get_expr(ix.indpred,ix.indrelid),'')),'\s|::text','','g'),'[()]','','g')=x.pred)
      then 'PASS' else 'FAIL' end
    ||' :: '||coalesce((select pg_get_indexdef(ic.oid) from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname=x.nm),'ABSENT') detail
  from (values
    ('prep_unit_one_active_per_employee_idx', true, array['claimed_by']::text[], 'workflow_generation=2andunit_mode=''per_cup''andprep_status=anyarray[''claimed'',''preparing'',''qc_required'',''qc_passed'']andclaimed_byisnotnull'),
    ('prep_unit_actionable_route_idx', false, array['branch_id','station_type','order_id','order_item_id','unit_index']::text[], 'workflow_generation=2andactionableandunit_mode=''per_cup''andprep_status=''waiting''')
  ) x(nm,uniq,keys,pred)
),
v_routines as (
  select 9,'VERIFY_ROUTINE', x.canon,
    case when to_regprocedure(x.reg) is null then 'FAIL(MISSING)'
      when (select prosecdef from pg_proc where oid=to_regprocedure(x.reg))=x.def
       and (select provolatile::text from pg_proc where oid=to_regprocedure(x.reg))=x.vol
       and (select format_type(prorettype,null) from pg_proc where oid=to_regprocedure(x.reg))=x.ret
       and (select proretset from pg_proc where oid=to_regprocedure(x.reg))=x.setof
       and (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(x.reg))=x.lang
       and (select pg_get_userbyid(proowner) from pg_proc where oid=to_regprocedure(x.reg)) = (select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
       and (select array_length(proconfig,1) from pg_proc where oid=to_regprocedure(x.reg))=1
       and replace(coalesce((select proconfig[1] from pg_proc where oid=to_regprocedure(x.reg)),''),'"','')='search_path='
       and not (case when (select proacl from pg_proc where oid=to_regprocedure(x.reg)) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=to_regprocedure(x.reg))) a where a.grantee=0 and a.privilege_type='EXECUTE') end)
       and not has_function_privilege('anon',to_regprocedure(x.reg),'EXECUTE')
       and (x.authx = has_function_privilege('authenticated',to_regprocedure(x.reg),'EXECUTE'))
       and (x.authx = has_function_privilege('service_role',to_regprocedure(x.reg),'EXECUTE'))
      then 'PASS' else 'FAIL' end
    ||' :: sec='||(select case when prosecdef then 'DEFINER' else 'INVOKER' end from pg_proc where oid=to_regprocedure(x.reg))||' owner='||(select pg_get_userbyid(proowner) from pg_proc where oid=to_regprocedure(x.reg))||' lang='||(select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(x.reg))||' vol='||(select provolatile::text from pg_proc where oid=to_regprocedure(x.reg))||' ret='||(select case when proretset then 'setof ' else '' end||format_type(prorettype,null) from pg_proc where oid=to_regprocedure(x.reg))||' cfg='||coalesce((select array_to_string(proconfig,',') from pg_proc where oid=to_regprocedure(x.reg)),'(none)')
    ||' PUBLIC_exec='||(case when (select proacl from pg_proc where oid=to_regprocedure(x.reg)) is null then 'true(default)' else (exists(select 1 from aclexplode((select proacl from pg_proc where oid=to_regprocedure(x.reg))) a where a.grantee=0 and a.privilege_type='EXECUTE'))::text end)
    ||' anon/auth/svc/pg='||has_function_privilege('anon',to_regprocedure(x.reg),'EXECUTE')::text||'/'||has_function_privilege('authenticated',to_regprocedure(x.reg),'EXECUTE')::text||'/'||has_function_privilege('service_role',to_regprocedure(x.reg),'EXECUTE')::text||'/'||has_function_privilege('postgres',to_regprocedure(x.reg),'EXECUTE')::text detail
  from (values
    ('app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_available_unit_work(uuid,uuid)','app.qr_available_unit_work(uuid,uuid)',true,'s','record',true,'plpgsql',true),
    ('app.qr_claim_unit(uuid,uuid,inet,text,text,text)','app.qr_claim_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)','app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_complete_unit(uuid,uuid,inet,text,text,text)','app.qr_complete_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_release_unit(uuid,uuid,inet,text,text,text)','app.qr_release_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)','app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true),
    ('app.qr_bind_actor(uuid,uuid)','app.qr_bind_actor(uuid,uuid)',true,'s','uuid',false,'plpgsql',false),
    ('app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)','app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)',true,'v','void',false,'plpgsql',false),
    ('app.prep_queue_acceptance_touch()','app.prep_queue_acceptance_touch()',true,'v','trigger',false,'plpgsql',false),
    ('public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_available_unit_work(uuid,uuid)','public.qr_available_unit_work(uuid,uuid)',false,'v','record',true,'sql',true),
    ('public.qr_claim_unit(uuid,uuid,inet,text,text,text)','public.qr_claim_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)','public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_complete_unit(uuid,uuid,inet,text,text,text)','public.qr_complete_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_release_unit(uuid,uuid,inet,text,text,text)','public.qr_release_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true),
    ('public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)','public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true)
  ) x(canon,reg,def,vol,ret,setof,lang,authx)
),
v_overloads as (
  select 9,'VERIFY_NO_UNEXPECTED_OVERLOAD', x.nm,
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and p.proname=x.nm) = x.expected then 'PASS' else 'FAIL' end
    ||' :: found='||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and p.proname=x.nm)||' expected='||x.expected detail
  from (values ('qr_accept_queue',2),('qr_available_unit_work',2),('qr_claim_unit',2),('qr_start_preparing_unit',2),('qr_start_qc_unit',2),('qr_qc_fail_unit',2),('qr_pass_qc_unit',2),('qr_complete_unit',2),('qr_release_unit',2),('qr_unit_ready_rollup',2),('qr_bind_actor',1),('qr_emit_unit_event',1),('prep_queue_acceptance_touch',1)) x(nm,expected)
),
v_inert as (
  select 10,'VERIFY_INERT_STATE','no business-state change',
    case
      when to_regclass('public.prep_unit_activation') is null or not (array['enabled']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit_activation') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      when to_regclass('public.prep_queue_acceptance') is null then 'NOT_PROVABLE'
      when to_regclass('public.prep_unit') is null or not (array['workflow_generation','actionable','quarantined_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      when to_regclass('public.qr_order') is null or not (array['ready_by','ready_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      when to_regclass('public.prep_event') is null or not (array['prep_unit_id','event_type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_event') and attnum>0 and not attisdropped),'{}'::text[])) then 'NOT_PROVABLE'
      when (xpath('//row/c/text()', query_to_xml($q$ select (
              (select count(*) from public.prep_queue_acceptance)
            + (select count(*) from public.prep_unit where workflow_generation=2 or actionable or quarantined_at is not null)
            + (select count(*) from public.qr_order where ready_by is not null or ready_at is not null)
            + (select count(*) from public.prep_event where prep_unit_id is not null)
            + (select count(*) from public.prep_event where event_type in ('unit_claimed','unit_completed'))
            + (select count(*) from public.prep_unit_activation where enabled))::text as c $q$, false,false,'')))[1]::text = '0' then 'PASS'
      else 'FAIL' end
    ||' :: acceptance='||case when to_regclass('public.prep_queue_acceptance') is null then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select count(*)::text c from public.prep_queue_acceptance $q$, false,false,'')))[1]::text,'NP') end
    ||' gen2/act/quar='||case when to_regclass('public.prep_unit') is null or not (array['workflow_generation','actionable','quarantined_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit') and attnum>0 and not attisdropped),'{}'::text[])) then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select count(*)::text c from public.prep_unit where workflow_generation=2 or actionable or quarantined_at is not null $q$, false,false,'')))[1]::text,'NP') end
    ||' ready='||case when to_regclass('public.qr_order') is null or not (array['ready_by','ready_at']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.qr_order') and attnum>0 and not attisdropped),'{}'::text[])) then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select count(*)::text c from public.qr_order where ready_by is not null or ready_at is not null $q$, false,false,'')))[1]::text,'NP') end
    ||' unit_events='||case when to_regclass('public.prep_event') is null or not (array['prep_unit_id']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_event') and attnum>0 and not attisdropped),'{}'::text[])) then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select count(*)::text c from public.prep_event where prep_unit_id is not null $q$, false,false,'')))[1]::text,'NP') end
    ||' new_labels='||case when to_regclass('public.prep_event') is null or not (array['event_type']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_event') and attnum>0 and not attisdropped),'{}'::text[])) then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select count(*)::text c from public.prep_event where event_type in ('unit_claimed','unit_completed') $q$, false,false,'')))[1]::text,'NP') end
    ||' activation='||case when to_regclass('public.prep_unit_activation') is null or not (array['enabled']::text[] <@ coalesce((select array_agg(attname::text) from pg_attribute where attrelid=to_regclass('public.prep_unit_activation') and attnum>0 and not attisdropped),'{}'::text[])) then 'NP' else coalesce((xpath('//row/c/text()', query_to_xml($q$ select (exists(select 1 from public.prep_unit_activation where enabled))::text c $q$, false,false,'')))[1]::text,'NP') end detail
),
v_fifo as (
  select 11,'VERIFY_FIFO_ORDERING','app.qr_accept_queue',
    case when to_regprocedure('app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)') is null then 'FAIL(MISSING)'
      when (select prosrc from pg_proc where oid=to_regprocedure('app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)')) ~ 'order[[:space:]]+by[[:space:]]+qo.paid_at[[:space:]]+asc,[[:space:]]*qo.queue_day[[:space:]]+asc,[[:space:]]*qo.queue_number[[:space:]]+asc,[[:space:]]*qo.order_id[[:space:]]+asc'
      then 'TEXT_MATCH_ONLY(PASS: paid_at,queue_day,queue_number,order_id ASC)' else 'FAIL/NOT_PROVABLE' end detail
),
v_avail_order as (
  select 11,'VERIFY_AVAILABLE_WORK_ORDER','app.qr_available_unit_work',
    case when to_regprocedure('app.qr_available_unit_work(uuid,uuid)') is null then 'FAIL(MISSING)'
      when (select prosrc from pg_proc where oid=to_regprocedure('app.qr_available_unit_work(uuid,uuid)')) ~ 'order[[:space:]]+by[[:space:]]+qo.paid_at[[:space:]]+asc,[[:space:]]*qo.queue_day[[:space:]]+asc,[[:space:]]*qo.queue_number[[:space:]]+asc,[[:space:]]*qo.order_id[[:space:]]+asc'
       and (select prosrc from pg_proc where oid=to_regprocedure('app.qr_available_unit_work(uuid,uuid)')) !~ 'order[[:space:]]+by[[:space:]]+a.accepted_at'
      then 'TEXT_MATCH_ONLY(PASS: qr_order.paid_at first; accepted_at NOT canonical priority)' else 'FAIL/NOT_PROVABLE' end detail
),
v_semantic as (  -- static (read-only) sanitized-source probes of app.qr_unit_ready_rollup — TEXT_MATCH_ONLY, no RPC executed
  select 12,'VERIFY_READY_ROLLUP_SEMANTIC', x.probe,
    case when to_regprocedure('app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)') is null then 'FAIL(MISSING)'
      when (select prosrc from pg_proc where oid=to_regprocedure('app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)')) ~ x.rx then 'TEXT_MATCH_ONLY(PASS)' else 'FAIL/NOT_PROVABLE' end detail
  from (values
    ('authoritative_source_is_prep_item','from[[:space:]]+public.prep_item[[:space:]]+pi[[:space:]]+where[[:space:]]+pi.order_id[[:space:]]*=[[:space:]]*p_order_id'),
    ('exact_one_source_grouping','group[[:space:]]+by[[:space:]]+pi.order_item_id'),
    ('source_count_must_be_one','g.source_count[[:space:]]*<>[[:space:]]*1'),
    ('all_order_units_locked','from[[:space:]]+public.prep_unit[[:space:]]+where[[:space:]]+order_id[[:space:]]*=[[:space:]]*p_order_id[[:space:]]+order[[:space:]]+by[[:space:]]+id[[:space:]]+for[[:space:]]+update'),
    ('all_prep_items_locked','from[[:space:]]+public.prep_item[[:space:]]+where[[:space:]]+order_id[[:space:]]*=[[:space:]]*p_order_id[[:space:]]+order[[:space:]]+by[[:space:]]+order_item_id[[:space:]]+for[[:space:]]+update'),
    ('full_qc_completion_predicate','last_qc_result::text[[:space:]]*=[[:space:]]*''pass''.*qc_passed_at[[:space:]]*<=[[:space:]]*u.completed_at'),
    ('completion_actor_scope','employee[[:space:]]+ec[[:space:]]+where[[:space:]]+ec.id[[:space:]]*=[[:space:]]*u.claimed_by[[:space:]]+and[[:space:]]+ec.tenant_id[[:space:]]*=[[:space:]]*u.tenant_id'),
    ('identical_v_complete_gates_both','and[[:space:]]+v_complete[[:space:]]+then')
  ) x(probe,rx)
)
select section, object_name, detail from (
  select * from v_protected union all select * from v_containment union all select * from v_protfn union all select * from v_tbl
  union all select * from v_tbl2 union all select * from v_enum union all select * from v_prepevent union all select * from v_qrorder
  union all select * from v_idx union all select * from v_routines union all select * from v_overloads union all select * from v_inert
  union all select * from v_fifo union all select * from v_avail_order union all select * from v_semantic
) q order by ord, object_name;
