-- SOURCE CANDIDATE: exact known v5 frozen-packet compatibility only.
-- No corporate-action price/share inference, target change, grant or guard relaxation.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $target_profiles$
DECLARE target oid:=to_regprocedure('public.vnext_target_current_v1(text,uuid,text)');original text;changed text;definition text;metadata jsonb;before_namespace jsonb;after_namespace jsonb;
 catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT FROM jsonb_each($3) edge WHERE a.attrelid=to_regclass('public.'||edge.key) AND edge.value ? a.attname) THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_target_read_v1' AND EXISTS(SELECT FROM jsonb_each($3) edge WHERE p.polrelid=to_regclass('public.'||edge.key)))),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR target IS NULL THEN RAISE EXCEPTION 'vnext_target_profile_prerequisites';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language language ON language.oid=p.prolang WHERE p.oid=target AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prokind='f' AND language.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargs=3 AND p.proargtypes='25 2950 25'::oidvector AND p.proargnames=ARRAY['p_symbol','p_revision','p_input_hash'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provolatile='s' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL) THEN RAISE EXCEPTION 'vnext_target_profile_metadata';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target AND (acl.grantor<>p.proowner OR acl.grantee<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)) THEN RAISE EXCEPTION 'vnext_target_profile_acl';END IF;
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'bc3fecc3f5c28480f3d18f6073ac39b72a3969e6d7fcf6d19601d45b04b4147b' OR octet_length(convert_to(original,'UTF8'))<>14356 THEN RAISE EXCEPTION 'vnext_target_profile_predecessor';END IF;
 EXECUTE catalog_sql INTO before_namespace USING ARRAY[target],ARRAY[]::oid[],'{}'::jsonb;
 changed:=original;
 IF (length(changed)-length(replace(changed,$old0$author_call.prompt_version='vnext-research-worker-v3'$old0$,'')))<>length($old0$author_call.prompt_version='vnext-research-worker-v3'$old0$) THEN RAISE EXCEPTION 'vnext_target_profile_single_seam';END IF;
 changed:=replace(changed,$old0$author_call.prompt_version='vnext-research-worker-v3'$old0$,$new0$author_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5')$new0$);
 IF (length(changed)-length(replace(changed,$old1$reviewer_call.prompt_version='vnext-research-worker-v3'$old1$,'')))<>length($old1$reviewer_call.prompt_version='vnext-research-worker-v3'$old1$) THEN RAISE EXCEPTION 'vnext_target_profile_single_seam';END IF;
 changed:=replace(changed,$old1$reviewer_call.prompt_version='vnext-research-worker-v3'$old1$,$new1$reviewer_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5')$new1$);
 IF replace(replace(changed,$new1$reviewer_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5')$new1$,$old1$reviewer_call.prompt_version='vnext-research-worker-v3'$old1$),$new0$author_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5')$new0$,$old0$author_call.prompt_version='vnext-research-worker-v3'$old0$) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '36c4904a11c58981e11264294500d161a86655495f512868a712ded08a30f3fb' OR octet_length(convert_to(changed,'UTF8'))<>14418 THEN RAISE EXCEPTION 'vnext_target_profile_inverse';END IF;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_target_current_v1(text,uuid,text)')::oid IS DISTINCT FROM target OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_target_profile_post_metadata';END IF;
 EXECUTE catalog_sql INTO after_namespace USING ARRAY[target],ARRAY[]::oid[],'{}'::jsonb;
 IF after_namespace IS DISTINCT FROM before_namespace THEN RAISE EXCEPTION 'vnext_target_profile_namespace';END IF;
END $target_profiles$;
COMMIT;
