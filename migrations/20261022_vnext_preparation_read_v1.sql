-- Finite source candidate: make original work-context a genuine READ.
-- All original mode/principal/source/member/input/execution/deadline guards run.
-- No lease around READ, owner/ACL/role/argument/return or other branch changes.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $preparation_read$
DECLARE target oid:=to_regprocedure('public.vnext_command_v1(text,text,jsonb)');original text;changed text;definition text;metadata jsonb;before_namespace jsonb;after_namespace jsonb;
 catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=$1 THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR target IS NULL THEN RAISE EXCEPTION 'vnext_preparation_read_prerequisite_missing';END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL) OR EXISTS(SELECT FROM pg_auth_members WHERE member='stockinsider_vnext_owner'::regrole OR roleid='stockinsider_vnext_owner'::regrole) OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole='stockinsider_vnext_owner'::regrole AND setconfig IS NOT NULL) THEN RAISE EXCEPTION 'vnext_preparation_read_owner_profile_changed';END IF;
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'b99885487f46bc01bd9375fb285620058eddda1aa23eb3c3043ce89ec6ca2a17' OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prosecdef AND p.prokind='f' AND NOT p.proretset AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.pronargs=3 AND p.proargtypes='25 25 3802'::oidvector AND p.proargnames=ARRAY['p_principal','p_command','p_request'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL) THEN RAISE EXCEPTION 'vnext_preparation_read_predecessor_changed';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND (a.grantee NOT IN(p.proowner,'service_role'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN RAISE EXCEPTION 'vnext_preparation_read_acl_changed';END IF;
 IF (length(original)-length(replace(original,$old$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);$old$,'')))<>length($old$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);$old$) THEN RAISE EXCEPTION 'vnext_preparation_read_single_branch_required';END IF;
 changed:=replace(original,$old$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);$old$,$new$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);
   IF p_command='work-context' THEN RETURN answer; END IF;$new$);
 IF replace(changed,$new$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);
   IF p_command='work-context' THEN RETURN answer; END IF;$new$,$old$   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);$old$) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex')<>'63f40aa176395df6a06dc7a50875e251f90714545fd20670b2e34eb39438f016' THEN RAISE EXCEPTION 'vnext_preparation_read_inverse_parity_failed';END IF;
 EXECUTE catalog_sql INTO before_namespace USING target;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_command_v1(text,text,jsonb)')::oid IS DISTINCT FROM target OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_preparation_read_metadata_changed';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'63f40aa176395df6a06dc7a50875e251f90714545fd20670b2e34eb39438f016' THEN RAISE EXCEPTION 'vnext_preparation_read_successor_changed';END IF;
 EXECUTE catalog_sql INTO after_namespace USING target;
 IF before_namespace IS DISTINCT FROM after_namespace THEN RAISE EXCEPTION 'vnext_preparation_read_namespace_changed';END IF;
END $preparation_read$;
COMMIT;
