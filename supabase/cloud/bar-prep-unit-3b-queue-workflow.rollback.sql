-- =============================================================================
-- bar-prep-unit-3b-queue-workflow.rollback.sql — DB-3B ROLLBACK. Run ONCE inside one transaction.
-- Fail-loud. NO CASCADE. No business-row deletion. Reverts ONLY DB-3B objects + authorized DB-3B additions.
-- Refuses unless the COMPLETE, EXACT DB-3B manifest is present AND every protected relation/routine is intact.
-- After the structural preflight passes, exact DROPs run in dependency order (no CASCADE, no IF EXISTS).
-- =============================================================================
begin;

do $refuse$
declare v_oids oid[]; v_labels text[]; v_sig text; v_fam text; v_exp int;
  v_new text[] := array[
    'app.qr_bind_actor(uuid,uuid)','app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)','app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)',
    'app.qr_available_unit_work(uuid,uuid)','app.qr_claim_unit(uuid,uuid,inet,text,text,text)','app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)',
    'app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)','app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)',
    'app.qr_complete_unit(uuid,uuid,inet,text,text,text)','app.qr_release_unit(uuid,uuid,inet,text,text,text)','app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)',
    'public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)','public.qr_available_unit_work(uuid,uuid)','public.qr_claim_unit(uuid,uuid,inet,text,text,text)',
    'public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)','public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',
    'public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)','public.qr_complete_unit(uuid,uuid,inet,text,text,text)','public.qr_release_unit(uuid,uuid,inet,text,text,text)',
    'public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)'];
begin
  -- ── protected DB-2 fn fingerprints (3 absolute md5) ──
  if to_regprocedure('app.prep_unit_create_per_cup(uuid,uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('app.prep_unit_create_per_cup(uuid,uuid,uuid)')))<>'f9eba7ed926506bdec928bffdd0bc7a6' then raise exception 'DB3B-RB: prep_unit_create_per_cup drift/missing'; end if;
  if to_regprocedure('app.qr_ensure_prep_items(uuid,uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('app.qr_ensure_prep_items(uuid,uuid,uuid)')))<>'634ced3a6b8aaebdf1dda3e4af967c0b' then raise exception 'DB3B-RB: qr_ensure_prep_items drift/missing'; end if;
  if to_regprocedure('app.qr_confirm_payment(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('app.qr_confirm_payment(uuid,uuid)')))<>'44adfab0f5a406c7bb7460f815a21aa8' then raise exception 'DB3B-RB: qr_confirm_payment drift/missing'; end if;
  -- ── all D10 protected routines intact: exact signature + metadata + ACL (+ md5 for all 40 D10 routines) ──
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
       or replace(coalesce((select proconfig[1] from pg_proc where oid=r.oid),''),'"','')<>'search_path='
       or (case when (select proacl from pg_proc where oid=r.oid) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE') end)<>t.pub
       or has_function_privilege('anon',r.oid,'EXECUTE')<>t.anonx
       or has_function_privilege('authenticated',r.oid,'EXECUTE')<>t.authx
       or has_function_privilege('service_role',r.oid,'EXECUTE')<>t.svcx
       or md5(pg_get_functiondef(r.oid))<>t.md5x
  ) then raise exception 'DB3B-RB: protected D10 routine drift (signature/metadata/ACL/md5) — refuse'; end if;
  -- ── protected relation fingerprints intact (delta-fp-v2) ──
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
      from (values ('public.prep_item'),('public.prep_unit_activation'),('public.sales_order'),('public.payment'),('public.order_item'),('public.employee'),('public.app_user')) x(rel)
      cross join lateral (select to_regclass(x.rel) roid) g
    ) fpx join (values ('public.prep_item','6c563a0c15643af3d7207979c8354afe'),('public.prep_unit_activation','526b6e0f8b4942b3490786fe23283bdb'),('public.sales_order','b8d28d49a212ab5af33f6f1046505982'),('public.payment','3d34ef56697772b5d2cef622c4583cbc'),('public.order_item','26ab9d0cfcdcc9051190c1a3d913db10'),('public.employee','fd63759e11baa370e6f2a8036fb564d4'),('public.app_user','26f45b4818496414df4f054ef5445cca')) e(rel,exp) on e.rel=fpx.rel
    where fpx.overall_fp<>e.exp
  ) then raise exception 'DB3B-RB: protected relation fingerprint drift — refuse'; end if;
  -- ── activation disabled ──
  if to_regclass('public.prep_unit_activation') is null then raise exception 'DB3B-RB: prep_unit_activation missing'; end if;
  if exists(select 1 from public.prep_unit_activation where enabled) then raise exception 'DB3B-RB: activation enabled — refuse'; end if;

  -- ── COMPLETE + EXACT DB-3B manifest (catalog-only) ──
  v_labels := (select array_agg(e.enumlabel order by e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where t.typname='prep_queue_state' and n.nspname='public');
  if v_labels is distinct from array['accepted','completed','cancelled','released']::text[] then raise exception 'DB3B-RB: prep_queue_state enum missing/altered — refuse'; end if;
  if to_regclass('public.prep_queue_acceptance') is null then raise exception 'DB3B-RB: prep_queue_acceptance missing — refuse'; end if;
  if (select array_agg(a.attname::text||' '||format_type(a.atttypid,a.atttypmod)||case when a.attnotnull then ' NN' else '' end||coalesce(' def:'||regexp_replace(pg_get_expr(ad.adbin,ad.adrelid),'\s','','g'),'') order by a.attnum) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=to_regclass('public.prep_queue_acceptance') and a.attnum>0 and not a.attisdropped)
       is distinct from array['id uuid NN def:gen_random_uuid()','order_id uuid NN','tenant_id uuid NN','branch_id uuid NN','queue_day date NN','queue_number integer NN','accepted_by uuid NN','accepted_at timestamp with time zone NN def:now()','state prep_queue_state NN def:''accepted''::prep_queue_state','created_at timestamp with time zone NN def:now()','updated_at timestamp with time zone NN def:now()']::text[]
    then raise exception 'DB3B-RB: prep_queue_acceptance columns differ — refuse'; end if;
  if (select array_agg(conname order by conname) from pg_constraint where conrelid=to_regclass('public.prep_queue_acceptance'))
       is distinct from array['prep_queue_acceptance_branch_day_queue_key','prep_queue_acceptance_employee_fk','prep_queue_acceptance_order_key','prep_queue_acceptance_pkey','prep_queue_acceptance_scope_fk','prep_queue_acceptance_ts_check']::text[]
    then raise exception 'DB3B-RB: prep_queue_acceptance constraints differ — refuse'; end if;
  if not exists(select 1 from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_queue_acceptance_branch_idx') then raise exception 'DB3B-RB: prep_queue_acceptance_branch_idx missing — refuse'; end if;
  if not exists(select 1 from pg_trigger tg where tg.tgrelid=to_regclass('public.prep_queue_acceptance') and tg.tgname='prep_queue_acceptance_set_updated_at' and not tg.tgisinternal) then raise exception 'DB3B-RB: acceptance trigger missing — refuse'; end if;
  if (select count(*) from pg_trigger where tgrelid=to_regclass('public.prep_queue_acceptance') and not tgisinternal)<>1 then raise exception 'DB3B-RB: unexpected extra trigger on acceptance — refuse'; end if;
  if to_regprocedure('app.prep_queue_acceptance_touch()') is null then raise exception 'DB3B-RB: prep_queue_acceptance_touch() missing — refuse'; end if;
  -- prep_unit indexes (exact keys, incl. corrected route index)
  if not exists(select 1 from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_unit_one_active_per_employee_idx') then raise exception 'DB3B-RB: one-active index missing — refuse'; end if;
  if not exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_unit_actionable_route_idx' and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['branch_id','station_type','order_id','order_item_id','unit_index']::text[]) then raise exception 'DB3B-RB: actionable-route index missing/wrong keys — refuse'; end if;
  -- prep_event column + FK(cascade) + index + exact 8-label CHECK
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped) then raise exception 'DB3B-RB: prep_event.prep_unit_id missing — refuse'; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_prep_unit_fk' and contype::text='f' and confrelid=to_regclass('public.prep_unit') and confdeltype::text='c') then raise exception 'DB3B-RB: prep_event_prep_unit_fk missing/altered — refuse'; end if;
  if not exists(select 1 from pg_class ic join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_event_unit_occurred_idx') then raise exception 'DB3B-RB: prep_event_unit_occurred_idx missing — refuse'; end if;
  v_labels := (select array_agg(x order by x) from (select (regexp_matches(pg_get_constraintdef(con.oid),'''([a-z_]+)''','g'))[1] x from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname='prep_event_event_type_check') s);
  if v_labels is distinct from array['claim_released','preparing_started','qc_failed','qc_passed','qc_started','rework_started','unit_claimed','unit_completed']::text[] then raise exception 'DB3B-RB: prep_event_event_type_check is not the extended 8-label DB-3B form — refuse'; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check' and contype::text='c' and convalidated) then raise exception 'DB3B-RB: prep_event_event_type_check not validated — refuse'; end if;
  if (select count(*) from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.contype::text='c' and exists(select 1 from pg_depend d join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid where d.objid=con.oid and d.refobjid=to_regclass('public.prep_event') and a.attname='event_type'))<>1 then raise exception 'DB3B-RB: not exactly one event_type CHECK on prep_event — refuse'; end if;
  if (select regexp_replace(regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s|::text','','g'),'\[\]','','g'),'[()]','','g') from pg_constraint where conrelid=to_regclass('public.prep_event') and conname='prep_event_event_type_check')<>'checkevent_type=anyarray[''preparing_started'',''qc_started'',''qc_failed'',''qc_passed'',''rework_started'',''claim_released'',''unit_claimed'',''unit_completed'']' then raise exception 'DB3B-RB: prep_event_event_type_check full expression differs — refuse'; end if;
  -- qr_order additions
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_by' and not attisdropped)
     or not exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_at' and not attisdropped)
     or not exists(select 1 from pg_constraint where conrelid=to_regclass('public.qr_order') and conname='qr_order_ready_actor_fk' and contype::text='f')
     or not exists(select 1 from pg_constraint where conrelid=to_regclass('public.qr_order') and conname='qr_order_ready_actor_consistency' and contype::text='c')
    then raise exception 'DB3B-RB: qr_order ready additions missing — refuse'; end if;
  -- ── EXACT structural verification (name+type+ordered cols+ref+actions+predicate+validation); same-name-different => refuse ──
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_pkey' and c.contype::text='p' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['id']::text[]) then raise exception 'DB3B-RB: pkey structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_order_key' and c.contype::text='u' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['order_id']::text[]) then raise exception 'DB3B-RB: order_key structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_branch_day_queue_key' and c.contype::text='u' and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['branch_id','queue_day','queue_number']::text[]) then raise exception 'DB3B-RB: branch_day_queue_key structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_scope_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.sales_order') and c.confdeltype::text='a' and c.confupdtype::text='a' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['order_id','tenant_id','branch_id']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id','tenant_id','branch_id']::text[]) then raise exception 'DB3B-RB: scope_fk structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_queue_acceptance') and c.conname='prep_queue_acceptance_employee_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.employee') and c.confupdtype::text='a' and c.confdeltype::text='r' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['accepted_by']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id']::text[]) then raise exception 'DB3B-RB: employee_fk structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.prep_queue_acceptance') and conname='prep_queue_acceptance_ts_check' and contype::text='c' and convalidated and regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s','','g'),'[()]','','g')='checkupdated_at>=created_atandaccepted_at>=created_at') then raise exception 'DB3B-RB: ts_check missing/not-valid/meaning-differs — refuse'; end if;
  if not exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_queue_acceptance_branch_idx' and ix.indrelid=to_regclass('public.prep_queue_acceptance') and am.amname='btree' and not ix.indisunique and ix.indisvalid and ix.indisready and ix.indpred is null and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['branch_id','queue_day','queue_number']::text[]) then raise exception 'DB3B-RB: branch_idx structure differs — refuse'; end if;
  if not exists(select 1 from pg_trigger tg where tg.tgrelid=to_regclass('public.prep_queue_acceptance') and tg.tgname='prep_queue_acceptance_set_updated_at' and not tg.tgisinternal and tg.tgenabled::text='O' and tg.tgtype=19 and tg.tgisinternal=false and (select nn.nspname||'.'||fp.proname from pg_proc fp join pg_namespace nn on nn.oid=fp.pronamespace where fp.oid=tg.tgfoid)='app.prep_queue_acceptance_touch') then raise exception 'DB3B-RB: acceptance trigger structure differs — refuse'; end if;
  if not exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_unit_one_active_per_employee_idx' and ix.indrelid=to_regclass('public.prep_unit') and am.amname='btree' and ix.indisunique and ix.indisvalid and ix.indisready and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['claimed_by']::text[] and regexp_replace(regexp_replace(lower(coalesce(pg_get_expr(ix.indpred,ix.indrelid),'')),'\s|::text','','g'),'[()]','','g')='workflow_generation=2andunit_mode=''per_cup''andprep_status=anyarray[''claimed'',''preparing'',''qc_required'',''qc_passed'']andclaimed_byisnotnull') then raise exception 'DB3B-RB: one-active index structure/predicate differs — refuse'; end if;
  if not exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_unit_actionable_route_idx' and ix.indrelid=to_regclass('public.prep_unit') and am.amname='btree' and not ix.indisunique and ix.indisvalid and ix.indisready and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['branch_id','station_type','order_id','order_item_id','unit_index']::text[] and regexp_replace(regexp_replace(lower(coalesce(pg_get_expr(ix.indpred,ix.indrelid),'')),'\s|::text','','g'),'[()]','','g')='workflow_generation=2andactionableandunit_mode=''per_cup''andprep_status=''waiting''') then raise exception 'DB3B-RB: route index structure/predicate differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.prep_event') and c.conname='prep_event_prep_unit_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.prep_unit') and c.confupdtype::text='a' and c.confdeltype::text='c' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['prep_unit_id']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id']::text[]) then raise exception 'DB3B-RB: prep_event_prep_unit_fk structure differs — refuse'; end if;
  if not exists(select 1 from pg_index ix join pg_class ic on ic.oid=ix.indexrelid join pg_am am on am.oid=ic.relam join pg_namespace nn on nn.oid=ic.relnamespace where nn.nspname='public' and ic.relname='prep_event_unit_occurred_idx' and ix.indrelid=to_regclass('public.prep_event') and am.amname='btree' and not ix.indisunique and ix.indisvalid and ix.indisready and ix.indpred is null and (select array_agg(att.attname::text order by k.ord) from unnest(string_to_array(ix.indkey::text,' ')::int[]) with ordinality k(an,ord) join pg_attribute att on att.attrelid=ix.indrelid and att.attnum=k.an)=array['prep_unit_id','occurred_at']::text[]) then raise exception 'DB3B-RB: prep_event_unit_occurred_idx structure differs — refuse'; end if;
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id' and not attisdropped and format_type(atttypid,atttypmod)='uuid' and not attnotnull and not atthasdef) then raise exception 'DB3B-RB: prep_event.prep_unit_id type/null/default differs — refuse'; end if;
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_by' and not attisdropped and format_type(atttypid,atttypmod)='uuid' and not attnotnull and not atthasdef) then raise exception 'DB3B-RB: qr_order.ready_by type/null/default differs — refuse'; end if;
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_at' and not attisdropped and format_type(atttypid,atttypmod)='timestamp with time zone' and not attnotnull and not atthasdef) then raise exception 'DB3B-RB: qr_order.ready_at type/null/default differs — refuse'; end if;
  if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.qr_order') and c.conname='qr_order_ready_actor_fk' and c.contype::text='f' and c.confrelid=to_regclass('public.employee') and c.confupdtype::text='a' and c.confdeltype::text='r' and c.convalidated and (select array_agg(att.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.conrelid and att.attnum=k.an)=array['ready_by']::text[] and (select array_agg(att.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(an,ord) join pg_attribute att on att.attrelid=c.confrelid and att.attnum=k.an)=array['id']::text[]) then raise exception 'DB3B-RB: qr_order_ready_actor_fk structure differs — refuse'; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.qr_order') and conname='qr_order_ready_actor_consistency' and contype::text='c' and convalidated and regexp_replace(regexp_replace(lower(pg_get_constraintdef(oid)),'\s','','g'),'[()]','','g')='checkready_byisnull=ready_atisnull') then raise exception 'DB3B-RB: qr_order_ready_actor_consistency meaning differs — refuse'; end if;
  -- every DB-3B routine present at exact signature; exact overload counts (no unexpected extras)
  foreach v_sig in array v_new loop if to_regprocedure(v_sig) is null then raise exception 'DB3B-RB: DB-3B routine missing/wrong-signature: %', v_sig; end loop;
  foreach v_fam in array array['qr_accept_queue','qr_available_unit_work','qr_claim_unit','qr_start_preparing_unit','qr_start_qc_unit','qr_qc_fail_unit','qr_pass_qc_unit','qr_complete_unit','qr_release_unit','qr_unit_ready_rollup','qr_bind_actor','qr_emit_unit_event','prep_queue_acceptance_touch'] loop
    v_exp := case when v_fam in ('qr_bind_actor','qr_emit_unit_event','prep_queue_acceptance_touch') then 1 else 2 end;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and p.proname=v_fam) <> v_exp then raise exception 'DB3B-RB: unexpected overload count for % — refuse', v_fam; end if;
  end loop;
  -- ── EXACT new-DB-3B-routine manifest (same expected metadata+ACL VERIFY enforces; refuse on any mismatch) ──
  if exists(
    select 1 from (values
      ('app.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_available_unit_work(uuid,uuid)',true,'s','record',true,'plpgsql',true,true),
      ('app.qr_claim_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_start_qc_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_complete_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_release_unit(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)',true,'v','jsonb',false,'plpgsql',true,true),
      ('app.qr_bind_actor(uuid,uuid)',true,'s','uuid',false,'plpgsql',false,false),
      ('app.qr_emit_unit_event(text,uuid,uuid,inet,text,text,text,jsonb)',true,'v','void',false,'plpgsql',false,false),
      ('app.prep_queue_acceptance_touch()',true,'v','trigger',false,'plpgsql',false,false),
      ('public.qr_accept_queue(uuid,uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_available_unit_work(uuid,uuid)',false,'v','record',true,'sql',true,true),
      ('public.qr_claim_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_start_preparing_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_start_qc_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_qc_fail_unit(uuid,uuid,text,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_pass_qc_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_complete_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_release_unit(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true),
      ('public.qr_unit_ready_rollup(uuid,uuid,inet,text,text,text)',false,'v','jsonb',false,'sql',true,true)
    ) t(reg,def,vol,ret,setof,lang,authx,svcx)
    cross join lateral (select to_regprocedure(t.reg) oid) r
    where r.oid is null
       or (select prosecdef from pg_proc where oid=r.oid)<>t.def
       or (select provolatile::text from pg_proc where oid=r.oid)<>t.vol
       or (select format_type(prorettype,null) from pg_proc where oid=r.oid)<>t.ret
       or (select proretset from pg_proc where oid=r.oid)<>t.setof
       or (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=r.oid)<>t.lang
       or (select pg_get_userbyid(proowner) from pg_proc where oid=r.oid)<>(select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
       or coalesce((select array_length(proconfig,1) from pg_proc where oid=r.oid),0)<>1
       or replace(coalesce((select proconfig[1] from pg_proc where oid=r.oid),''),'"','')<>'search_path='
       or (case when (select proacl from pg_proc where oid=r.oid) is null then true else exists(select 1 from aclexplode((select proacl from pg_proc where oid=r.oid)) a where a.grantee=0 and a.privilege_type='EXECUTE') end)
       or has_function_privilege('anon',r.oid,'EXECUTE')
       or (t.authx <> has_function_privilege('authenticated',r.oid,'EXECUTE'))
       or (t.svcx <> has_function_privilege('service_role',r.oid,'EXECUTE'))
  ) then raise exception 'DB3B-RB: DB-3B routine metadata/ACL differs from expected manifest — refuse'; end if;
  -- ── EXACT acceptance-table security (owner/RLS/force/policies/ACL matrix) ──
  if not ((select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.prep_queue_acceptance'))='postgres'
     and (select relrowsecurity from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
     and not (select relforcerowsecurity from pg_class where oid=to_regclass('public.prep_queue_acceptance'))
     and (select count(*) from pg_policies where schemaname='public' and tablename='prep_queue_acceptance')=0
     and not exists(select 1 from aclexplode((select relacl from pg_class where oid=to_regclass('public.prep_queue_acceptance'))) where grantee=0)
     and (select bool_and(has_table_privilege(rn,to_regclass('public.prep_queue_acceptance'),p)=false) from (values ('anon'),('authenticated')) r(rn), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
     and (select bool_and(has_table_privilege('service_role',to_regclass('public.prep_queue_acceptance'),p)) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
     and (select bool_and(has_table_privilege('postgres',to_regclass('public.prep_queue_acceptance'),p)) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
     and not exists(select 1 from aclexplode((select relacl from pg_class where oid=to_regclass('public.prep_queue_acceptance'))) a where a.grantee<>0 and a.grantee<>(select relowner from pg_class where oid=to_regclass('public.prep_queue_acceptance')) and a.grantee<>(select oid from pg_roles where rolname='service_role'))
    ) then raise exception 'DB3B-RB: acceptance-table security differs (owner/RLS/force/policies/ACL) — refuse'; end if;

  -- ── DB-3B business-data refusals (proven present above => parse-safe) ──
  if exists(select 1 from public.prep_queue_acceptance) then raise exception 'DB3B-RB: acceptance rows exist — refuse'; end if;
  if exists(select 1 from public.prep_unit where workflow_generation=2 or actionable or quarantined_at is not null) then raise exception 'DB3B-RB: gen2/actionable/quarantined rows exist — refuse'; end if;
  if exists(select 1 from public.qr_order where ready_by is not null or ready_at is not null) then raise exception 'DB3B-RB: ready_by/ready_at data exists — refuse'; end if;
  if exists(select 1 from public.prep_event where prep_unit_id is not null) then raise exception 'DB3B-RB: prep_event.prep_unit_id values exist — refuse'; end if;
  if exists(select 1 from public.prep_event where event_type in ('unit_claimed','unit_completed')) then raise exception 'DB3B-RB: DB-3B event labels in use — refuse'; end if;

  -- ── external / DB-3C dependency checks ──
  select array_agg(oid) into v_oids from (
    select to_regclass('public.prep_queue_acceptance')::oid oid
    union all select t.oid from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='prep_queue_state' and n.nspname='public'
    union all select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and p.proname in ('qr_accept_queue','qr_available_unit_work','qr_claim_unit','qr_start_preparing_unit','qr_start_qc_unit','qr_qc_fail_unit','qr_pass_qc_unit','qr_complete_unit','qr_release_unit','qr_unit_ready_rollup','qr_bind_actor','qr_emit_unit_event','prep_queue_acceptance_touch')
    union all select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('prep_unit_one_active_per_employee_idx','prep_unit_actionable_route_idx','prep_queue_acceptance_branch_idx','prep_event_unit_occurred_idx')
    union all select con.oid from pg_constraint con where con.conrelid=to_regclass('public.prep_queue_acceptance') and con.conname in ('prep_queue_acceptance_pkey','prep_queue_acceptance_order_key','prep_queue_acceptance_branch_day_queue_key','prep_queue_acceptance_scope_fk','prep_queue_acceptance_employee_fk','prep_queue_acceptance_ts_check')
    union all select con.oid from pg_constraint con where con.conrelid=to_regclass('public.prep_event') and con.conname in ('prep_event_prep_unit_fk','prep_event_event_type_check')
    union all select con.oid from pg_constraint con where con.conrelid=to_regclass('public.qr_order') and con.conname in ('qr_order_ready_actor_fk','qr_order_ready_actor_consistency')
    union all select tg.oid from pg_trigger tg where tg.tgrelid=to_regclass('public.prep_queue_acceptance') and tg.tgname='prep_queue_acceptance_set_updated_at' and not tg.tgisinternal
  ) s;
  if exists(select 1 from pg_attribute a where a.atttypid=(select t.oid from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='prep_queue_state' and n.nspname='public') and a.attrelid<>to_regclass('public.prep_queue_acceptance') and not a.attisdropped) then raise exception 'DB3B-RB: prep_queue_state used by external column — refuse'; end if;
  if exists(
    select 1 from pg_depend d
    where d.refobjid = any(v_oids) and d.deptype::text in ('n','a')
      and d.classid in ('pg_proc'::regclass,'pg_rewrite'::regclass,'pg_trigger'::regclass,'pg_constraint'::regclass,'pg_attrdef'::regclass,'pg_policy'::regclass,'pg_class'::regclass,'pg_type'::regclass)
      and not (d.objid = any(v_oids))
      and not (d.classid='pg_constraint'::regclass and (select conrelid from pg_constraint where oid=d.objid)=to_regclass('public.prep_queue_acceptance'))
      and not (d.classid='pg_trigger'::regclass and (select tgrelid from pg_trigger where oid=d.objid)=to_regclass('public.prep_queue_acceptance'))
  ) then raise exception 'DB3B-RB: external/DB-3C dependency on a DB-3B object — refuse'; end if;
  if exists(
    select 1 from pg_depend d
    join (values
      (to_regclass('public.prep_event')::oid, (select attnum from pg_attribute where attrelid=to_regclass('public.prep_event') and attname='prep_unit_id')),
      (to_regclass('public.qr_order')::oid, (select attnum from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_by')),
      (to_regclass('public.qr_order')::oid, (select attnum from pg_attribute where attrelid=to_regclass('public.qr_order') and attname='ready_at'))
    ) c(relid,attn) on d.refobjid=c.relid and d.refobjsubid=c.attn
    where d.deptype::text in ('n','a')
      and not (d.classid='pg_constraint'::regclass and d.objid in (select oid from pg_constraint where conname in ('prep_event_prep_unit_fk','qr_order_ready_actor_fk','qr_order_ready_actor_consistency')))
      and not (d.classid='pg_class'::regclass and d.objid = to_regclass('public.prep_event_unit_occurred_idx'))
  ) then raise exception 'DB3B-RB: external dependency on a DB-3B-added column — refuse'; end if;
end
$refuse$;

-- ── DROP in dependency order (NO CASCADE; exact signatures; presence proven by the preflight) ──
drop function public.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text);
drop function public.qr_available_unit_work(uuid, uuid);
drop function public.qr_claim_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_start_preparing_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_start_qc_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text);
drop function public.qr_pass_qc_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_complete_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_release_unit(uuid, uuid, inet, text, text, text);
drop function public.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text);
drop function app.qr_accept_queue(uuid, uuid, uuid, inet, text, text, text);
drop function app.qr_available_unit_work(uuid, uuid);
drop function app.qr_claim_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_start_preparing_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_start_qc_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_qc_fail_unit(uuid, uuid, text, inet, text, text, text);
drop function app.qr_pass_qc_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_complete_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_release_unit(uuid, uuid, inet, text, text, text);
drop function app.qr_unit_ready_rollup(uuid, uuid, inet, text, text, text);
drop function app.qr_emit_unit_event(text, uuid, uuid, inet, text, text, text, jsonb);
drop function app.qr_bind_actor(uuid, uuid);
drop trigger prep_queue_acceptance_set_updated_at on public.prep_queue_acceptance;
drop table public.prep_queue_acceptance;
drop function app.prep_queue_acceptance_touch();
drop type public.prep_queue_state;
drop index public.prep_unit_one_active_per_employee_idx;
drop index public.prep_unit_actionable_route_idx;
drop index public.prep_event_unit_occurred_idx;
alter table public.prep_event drop constraint prep_event_prep_unit_fk;
alter table public.prep_event drop column prep_unit_id;
alter table public.prep_event drop constraint prep_event_event_type_check;
alter table public.prep_event add constraint prep_event_event_type_check check (event_type = any (array['preparing_started','qc_started','qc_failed','qc_passed','rework_started','claim_released']::text[]));
alter table public.qr_order drop constraint qr_order_ready_actor_consistency;
alter table public.qr_order drop constraint qr_order_ready_actor_fk;
alter table public.qr_order drop column ready_by;
alter table public.qr_order drop column ready_at;

commit;
