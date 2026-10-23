-- Additive vNext SOURCE CANDIDATE; no production/native approval is implied.
-- Repair ONLY the obsolete cast reintroduced by the exact v10 predecessor.
-- The broader 20260912_02 hotfix is provenance, not an installer dependency:
-- its ownership/revocation statements are intentionally not executed here.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $status_text_candidate$
DECLARE
 target oid:=to_regprocedure('public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)');
 original text; changed text; definition text; before_metadata jsonb; before_namespace jsonb; after_namespace jsonb;
 old_assignment constant text:='validation_status=(v_effective->>''validation_status'')::public.financial_validation_status_v3,';
 new_assignment constant text:='validation_status=(v_effective->>''validation_status'')::text,';
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
  'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_status_text_read_committed_required'; END IF;
 IF target IS NULL THEN RAISE EXCEPTION 'vnext_status_text_writer_missing'; END IF;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,before_metadata FROM pg_proc p WHERE p.oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'b506712e9f05b22736fd76c8ec9fe85f70418f4fdca76d998a30ecd4ea4f2754'
  OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND pg_get_userbyid(p.proowner)='opportunity_v3_rpc_owner' AND p.prosecdef AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proconfig=ARRAY['search_path=""'])
 THEN RAISE EXCEPTION 'vnext_status_text_writer_predecessor_changed'; END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target)<>2
  OR NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND a.grantee='opportunity_v3_rpc_owner'::regrole::oid)
  OR NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND a.grantee='service_role'::regrole::oid)
  OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND (a.grantee NOT IN('opportunity_v3_rpc_owner'::regrole::oid,'service_role'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
  OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN RAISE EXCEPTION 'vnext_status_text_writer_acl_changed'; END IF;
 IF to_regtype('public.financial_validation_status_v3') IS NOT NULL
  OR NOT EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid='public.opportunity_financial_facts_v3'::regclass AND pg_get_userbyid(c.relowner)='opportunity_v3_rpc_owner' AND a.attname='validation_status' AND a.atttypid='pg_catalog.text'::regtype AND a.attnotnull AND NOT a.attisdropped)
  OR NOT EXISTS(SELECT FROM pg_constraint c WHERE c.conrelid='public.opportunity_financial_facts_v3'::regclass AND c.conname='opportunity_financial_facts_v3_validation_status_check' AND c.contype='c' AND NOT c.convalidated AND pg_get_expr(c.conbin,c.conrelid)=$checked_text$(validation_status = ANY (ARRAY['validated'::text, 'pending'::text, 'rejected'::text, 'stale'::text, 'conflict'::text]))$checked_text$)
 THEN RAISE EXCEPTION 'vnext_status_text_checked_column_profile_changed'; END IF;
 IF (length(original)-length(replace(original,old_assignment,'')))<>length(old_assignment) THEN RAISE EXCEPTION 'vnext_status_text_single_assignment_required'; END IF;
 changed:=replace(original,old_assignment,new_assignment);
 IF replace(changed,new_assignment,old_assignment) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex')<>'99b05c8cd70214b976da8e4946ee7f62f52f45f067abc14dda28a53040636d73' THEN RAISE EXCEPTION 'vnext_status_text_inverse_parity_failed'; END IF;
 EXECUTE catalog_sql INTO before_namespace USING target;
 -- This is the only persistent change. No ALTER OWNER, GRANT, REVOKE, enum,
 -- table/row rewrite, new routine, original lock or authority change occurs.
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)')::oid IS DISTINCT FROM target
  OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM before_metadata
  OR (SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') FROM pg_proc p WHERE p.oid=target)<>'99b05c8cd70214b976da8e4946ee7f62f52f45f067abc14dda28a53040636d73' THEN RAISE EXCEPTION 'vnext_status_text_writer_postcondition_failed'; END IF;
 EXECUTE catalog_sql INTO after_namespace USING target;
 IF after_namespace IS DISTINCT FROM before_namespace THEN RAISE EXCEPTION 'vnext_status_text_namespace_or_authority_changed'; END IF;
END $status_text_candidate$;
COMMIT;
