-- Additive SOURCE CANDIDATE ONLY; NOT APPLIED / native HOLD unchanged.
-- Civil session/valuation dates remain civil. New current derivation requires
-- source observation and knowledge instants; no date-to-midnight conversion.
-- Only one existing private routine body changes; weights/owners/ACL/history
-- remain exact. Missing new clocks makes current derivation unavailable.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $weekly_quote_clock$
DECLARE target oid:=to_regprocedure('public.vnext_deep_score_v1(jsonb)')::oid;
 targets oid[];original text;changed text;definition text;metadata jsonb;old_fragment text;new_fragment text;
 before_namespace jsonb;after_namespace jsonb;
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
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR target IS NULL THEN RAISE EXCEPTION 'weekly_quote_clock_precondition';END IF;
 targets:=ARRAY[target];EXECUTE catalog_sql INTO before_namespace USING targets;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE p.oid=target;
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target
  AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prokind='f' AND NOT p.proretset AND p.prorettype='jsonb'::regtype
  AND p.pronargs=1 AND p.proargtypes='3802'::oidvector AND p.proargnames=ARRAY['input'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL
  AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provariadic=0 AND p.prosupport=0 AND p.protrftypes IS NULL
  AND l.lanname='plpgsql' AND NOT p.prosecdef AND p.provolatile='i' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
  AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL AND p.proconfig=ARRAY['search_path=pg_catalog, public'])
  OR encode(sha256(convert_to(original,'UTF8')),'hex')<>'12b3cf00b3558c1e80008c7ba905e6482e7c9ef4fc7f5f50df71fd644a27044c'
  OR octet_length(convert_to(original,'UTF8'))<>3296 THEN RAISE EXCEPTION 'weekly_quote_clock_predecessor_changed';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target)<>1
  OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target
   AND(a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
  OR NOT has_function_privilege('stockinsider_vnext_owner',target,'EXECUTE') OR has_function_privilege('service_role',target,'EXECUTE')
  OR has_function_privilege('anon',target,'EXECUTE') OR has_function_privilege('authenticated',target,'EXECUTE')
 THEN RAISE EXCEPTION 'weekly_quote_clock_private_acl_changed';END IF;
 changed:=original;
 old_fragment:=$old0$AND nullif(v->>'quoteAt','') IS NOT NULL AND nullif(v->>'valuationAt','') IS NOT NULL AND (v->>'quoteAt')::timestamptz<=(input->>'cutoff')::timestamptz AND (v->>'valuationAt')::timestamptz<=(input->>'cutoff')::timestamptz$old0$;new_fragment:=$new0$AND v->>'quoteClockVersion'='vnext-audit-quote-clock-v1'
    AND coalesce(v->>'quoteObservedAt','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' AND coalesce(v->>'quoteKnownAt','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    AND coalesce(input->>'cutoff','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    AND (v->>'quoteObservedAt')::timestamptz<=(v->>'quoteKnownAt')::timestamptz AND (v->>'quoteKnownAt')::timestamptz<=(input->>'cutoff')::timestamptz
    AND coalesce(v->>'quoteAt','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' AND coalesce(v->>'valuationAt','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    AND (v->>'quoteAt')::date<=(v->>'valuationAt')::date AND (v->>'valuationAt')::date<=((input->>'cutoff')::timestamptz AT TIME ZONE 'Asia/Taipei')::date$new0$;
 IF (length(changed)-length(replace(changed,old_fragment,'')))<>length(old_fragment) THEN RAISE EXCEPTION 'weekly_quote_clock_single_fragment:0';END IF;
 changed:=replace(changed,old_fragment,new_fragment);
 old_fragment:=$old1$valid:=jsonb_typeof(checks)='array';met_count:=0;$old1$;new_fragment:=$new1$valid:=jsonb_typeof(checks)='array' AND coalesce(input->>'cutoff','')~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';met_count:=0;$new1$;
 IF (length(changed)-length(replace(changed,old_fragment,'')))<>length(old_fragment) THEN RAISE EXCEPTION 'weekly_quote_clock_single_fragment:1';END IF;
 changed:=replace(changed,old_fragment,new_fragment);
 old_fragment:=$old2$nullif(check_item->>'observedAt','') IS NULL OR (check_item->>'observedAt')::timestamptz>$old2$;new_fragment:=$new2$coalesce(check_item->>'observedAt','')!~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' OR (check_item->>'observedAt')::timestamptz>$new2$;
 IF (length(changed)-length(replace(changed,old_fragment,'')))<>length(old_fragment) THEN RAISE EXCEPTION 'weekly_quote_clock_single_fragment:2';END IF;
 changed:=replace(changed,old_fragment,new_fragment);
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'fa2aea3377a3cc60d7e69ecd567d4ca10d596789e89e097d936798d01695044e' OR octet_length(convert_to(changed,'UTF8'))<>4496 THEN RAISE EXCEPTION 'weekly_quote_clock_successor_mismatch';END IF;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_deep_score_v1(jsonb)')::oid IS DISTINCT FROM target
  OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
  OR (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM changed THEN RAISE EXCEPTION 'weekly_quote_clock_metadata_changed';END IF;
 EXECUTE catalog_sql INTO after_namespace USING targets;
 IF after_namespace IS DISTINCT FROM before_namespace THEN RAISE EXCEPTION 'weekly_quote_clock_namespace_changed';END IF;
END $weekly_quote_clock$;
COMMIT;
