-- Additive source candidate: dimensionless scalar arithmetic only.
-- No unit relabelling, numeric source authority, grant or entry/publication gate change.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $dimensionless$
DECLARE target oid:=to_regprocedure('public.vnext_validate_claims_v1(jsonb,jsonb)');original text;changed text;inverse text;definition text;before_metadata jsonb;before_namespace jsonb;after_namespace jsonb;
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
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR target IS NULL THEN RAISE EXCEPTION 'vnext_dimensionless_prerequisites_missing';END IF;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,before_metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'b177e0010a25b9ff27ef25f59a81c44cce47f0b297ea0061d478afbce424b1b8'
  OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND NOT p.prosecdef AND p.prokind='f' AND l.lanname='plpgsql' AND p.prorettype='void'::regtype AND NOT p.proretset AND p.pronargs=2 AND p.proargtypes='3802 3802'::oidvector AND p.proargnames=ARRAY['a','evidence'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provolatile='i' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL)
 THEN RAISE EXCEPTION 'vnext_dimensionless_predecessor_changed';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target AND (acl.grantee<>p.proowner OR acl.grantor<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)) OR has_function_privilege('service_role',target,'EXECUTE') OR has_function_privilege('anon',target,'EXECUTE') OR has_function_privilege('authenticated',target,'EXECUTE') THEN RAISE EXCEPTION 'vnext_dimensionless_acl_changed';END IF;
 changed:=original;
 IF (length(changed)-length(replace(changed,$old_0$u NOT IN('ratio','multiple')$old_0$,'')))<>length($old_0$u NOT IN('ratio','multiple')$old_0$) THEN RAISE EXCEPTION 'vnext_dimensionless_single_fragment_required:0';END IF;
 changed:=replace(changed,$old_0$u NOT IN('ratio','multiple')$old_0$,$new_0$u NOT IN('ratio','multiple','dimensionless')$new_0$);
 IF (length(changed)-length(replace(changed,$old_1$NOT(num->>'unit'=ANY(units))$old_1$,'')))<>length($old_1$NOT(num->>'unit'=ANY(units))$old_1$) THEN RAISE EXCEPTION 'vnext_dimensionless_single_fragment_required:1';END IF;
 changed:=replace(changed,$old_1$NOT(num->>'unit'=ANY(units))$old_1$,$new_1$NOT EXISTS(SELECT FROM unnest(units) scalar_unit WHERE scalar_unit NOT IN('ratio','multiple','dimensionless') AND scalar_unit=num->>'unit')$new_1$);
 IF (length(changed)-length(replace(changed,$old_2$units[2] IN('ratio','multiple')$old_2$,'')))<>length($old_2$units[2] IN('ratio','multiple')$old_2$) THEN RAISE EXCEPTION 'vnext_dimensionless_single_fragment_required:2';END IF;
 changed:=replace(changed,$old_2$units[2] IN('ratio','multiple')$old_2$,$new_2$units[2] IN('ratio','multiple','dimensionless')$new_2$);
 inverse:=changed;
 inverse:=replace(inverse,$new_2$units[2] IN('ratio','multiple','dimensionless')$new_2$,$old_2$units[2] IN('ratio','multiple')$old_2$);
 inverse:=replace(inverse,$new_1$NOT EXISTS(SELECT FROM unnest(units) scalar_unit WHERE scalar_unit NOT IN('ratio','multiple','dimensionless') AND scalar_unit=num->>'unit')$new_1$,$old_1$NOT(num->>'unit'=ANY(units))$old_1$);
 inverse:=replace(inverse,$new_0$u NOT IN('ratio','multiple','dimensionless')$new_0$,$old_0$u NOT IN('ratio','multiple')$old_0$);
 IF inverse IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex')<>'1f8224bd0cec907bb56f8b4cd273edf3bef50da1dae56b3b2b1ceb78f6897f54' THEN RAISE EXCEPTION 'vnext_dimensionless_inverse_parity_failed';END IF;
 EXECUTE catalog_sql INTO before_namespace USING target;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_validate_claims_v1(jsonb,jsonb)')::oid IS DISTINCT FROM target OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM before_metadata THEN RAISE EXCEPTION 'vnext_dimensionless_metadata_changed';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'1f8224bd0cec907bb56f8b4cd273edf3bef50da1dae56b3b2b1ceb78f6897f54' THEN RAISE EXCEPTION 'vnext_dimensionless_post_body_changed';END IF;
 EXECUTE catalog_sql INTO after_namespace USING target;
 IF before_namespace IS DISTINCT FROM after_namespace THEN RAISE EXCEPTION 'vnext_dimensionless_namespace_changed';END IF;
END $dimensionless$;
COMMIT;
