-- Additive vNext SOURCE CANDIDATE; actual native/production installation is not implied.
-- Disable unsupported semantic checklist authority and recompute current scores
-- from immutable audit inputs. Historical audit/publication rows stay unchanged.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $semantic_score_candidate$
DECLARE
 targets oid[]:=ARRAY[to_regprocedure('public.vnext_deep_score_v1(jsonb)')::oid,to_regprocedure('public.vnext_thesis_project_v1(jsonb)')::oid];
 target oid; spec record; original text; changed text; definition text; metadata jsonb;
 before_namespace jsonb; after_namespace jsonb;
 catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),
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
  'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_semantic_score_read_committed_required'; END IF;
 IF cardinality(targets)<>2 OR array_position(targets,NULL) IS NOT NULL OR targets[1]=targets[2] THEN RAISE EXCEPTION 'vnext_semantic_score_targets_missing'; END IF;
 EXECUTE catalog_sql INTO before_namespace USING targets;
 FOR spec IN SELECT * FROM(VALUES
  ('public.vnext_deep_score_v1(jsonb)','9c03345b2b4588c8361baa23dc605898dbb57f2441ef7987e18044aba3dfef62','12b3cf00b3558c1e80008c7ba905e6482e7c9ef4fc7f5f50df71fd644a27044c',3266,3296,'i',false,'input',$old_vnext_deep_score_v1$  ELSE
   required:=$old_vnext_deep_score_v1$,$new_vnext_deep_score_v1$  ELSIF factor='technicalChips' THEN
   required:=$new_vnext_deep_score_v1$),
  ('public.vnext_thesis_project_v1(jsonb)','1db7fcabaa3fe6d01e4c7074f7a0d4c8a46fd3d062ef2651f662c3c2655fc248','20d07606f16769c3db8db6ec9a3cc2838f9a1009829d8194ada9f7e20adeb5eb',3086,3200,'s',true,'document',$old_vnext_thesis_project_v1$'deepScore',CASE WHEN current_sources THEN latest_report->'deepScore' ELSE NULL END$old_vnext_thesis_project_v1$,$new_vnext_thesis_project_v1$'deepScore',CASE WHEN current_sources AND latest_report IS NOT NULL AND jsonb_typeof(latest_report->'deepInputs')='object' THEN public.vnext_deep_score_v1(latest_report->'deepInputs') ELSE NULL END$new_vnext_thesis_project_v1$)
 ) patch(signature,predecessor_hash,successor_hash,predecessor_bytes,successor_bytes,volatility,security_definer,argument_name,old_fragment,new_fragment) LOOP
  target:=to_regprocedure(spec.signature)::oid;
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM spec.predecessor_hash OR octet_length(convert_to(original,'UTF8'))<>spec.predecessor_bytes
   OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner'
    AND p.prokind='f' AND NOT p.proretset AND p.prorettype='jsonb'::regtype AND p.pronargs=1 AND p.proargtypes='3802'::oidvector AND p.proargnames=ARRAY[spec.argument_name]
    AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provariadic=0 AND p.prosupport=0 AND p.protrftypes IS NULL
    AND l.lanname='plpgsql' AND p.prosecdef=spec.security_definer AND p.provolatile::text=spec.volatility AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
    AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL AND p.proconfig=ARRAY['search_path=pg_catalog, public'])
  THEN RAISE EXCEPTION 'vnext_semantic_score_predecessor_changed:%',spec.signature; END IF;
  IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target)<>1
   OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target
    AND (a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR NOT has_function_privilege('stockinsider_vnext_owner',target,'EXECUTE')
   OR has_function_privilege('service_role',target,'EXECUTE') OR has_function_privilege('anon',target,'EXECUTE') OR has_function_privilege('authenticated',target,'EXECUTE')
  THEN RAISE EXCEPTION 'vnext_semantic_score_private_acl_changed:%',spec.signature; END IF;
  IF (length(original)-length(replace(original,spec.old_fragment,'')))<>length(spec.old_fragment) THEN RAISE EXCEPTION 'vnext_semantic_score_single_fragment_required:%',spec.signature; END IF;
  changed:=replace(original,spec.old_fragment,spec.new_fragment);
  IF replace(changed,spec.new_fragment,spec.old_fragment) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM spec.successor_hash OR octet_length(convert_to(changed,'UTF8'))<>spec.successor_bytes
  THEN RAISE EXCEPTION 'vnext_semantic_score_inverse_parity_failed:%',spec.signature; END IF;
  -- The only persistent changes are these two existing routine bodies. No
  -- routine/role/ACL/table/row/default/weight/source authority is created.
  EXECUTE replace(definition,original,changed);
  IF to_regprocedure(spec.signature)::oid IS DISTINCT FROM target OR NOT(target=ANY(targets))
   OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
   OR (SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM spec.successor_hash
  THEN RAISE EXCEPTION 'vnext_semantic_score_postcondition_failed:%',spec.signature; END IF;
 END LOOP;
 EXECUTE catalog_sql INTO after_namespace USING targets;
 IF after_namespace IS DISTINCT FROM before_namespace THEN RAISE EXCEPTION 'vnext_semantic_score_namespace_or_authority_changed'; END IF;
END $semantic_score_candidate$;
COMMIT;
