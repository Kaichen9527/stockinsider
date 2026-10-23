-- SOURCE CANDIDATE ONLY: deterministic current official roster invalidity.
-- Reuses installed target read edge; no old table/role/policy/ACL mutation.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $trading_invalidity$
DECLARE target oid; routine record; original text; changed text; definition text; metadata jsonb; targets oid[]; additions oid[]:=ARRAY[]::oid[];before_namespace jsonb;after_namespace jsonb;attribute text;
 catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
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
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required';END IF;
 IF to_regprocedure('public.vnext_trading_invalid_current_v1(text,text)') IS NOT NULL THEN RAISE EXCEPTION 'vnext_trading_invalidity_first_install_required';END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL) OR EXISTS(SELECT FROM pg_auth_members WHERE member='stockinsider_vnext_owner'::regrole OR roleid='stockinsider_vnext_owner'::regrole) OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole='stockinsider_vnext_owner'::regrole AND setconfig IS NOT NULL) THEN RAISE EXCEPTION 'vnext_trading_invalidity_owner_profile_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_class WHERE oid='public.stock_instruments_v3'::regclass AND relkind='r' AND pg_get_userbyid(relowner)='opportunity_v3_rpc_owner' AND relrowsecurity AND NOT relforcerowsecurity)
  OR has_table_privilege('stockinsider_vnext_owner','public.stock_instruments_v3','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR (SELECT count(*) FROM pg_policy WHERE polrelid='public.stock_instruments_v3'::regclass)<>1
  OR NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='public.stock_instruments_v3'::regclass AND polname='vnext_target_read_v1' AND polcmd='r' AND polpermissive AND polroles=ARRAY['stockinsider_vnext_owner'::regrole::oid] AND pg_get_expr(polqual,polrelid)='true' AND polwithcheck IS NULL) THEN RAISE EXCEPTION 'vnext_trading_invalidity_existing_read_edge_changed';END IF;
 FOREACH attribute IN ARRAY ARRAY['instrument_authority_id','stock_id','symbol','exchange','instrument_type','listing_status','provider','source_timestamp','valid_from','valid_to','roster_version','recorded_at'] LOOP
  IF NOT EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid='public.stock_instruments_v3'::regclass AND a.attname=attribute AND NOT a.attisdropped AND a.atttypid=(CASE attribute WHEN 'instrument_authority_id' THEN 'uuid' WHEN 'stock_id' THEN 'uuid' WHEN 'symbol' THEN 'text' WHEN 'exchange' THEN 'public.stock_exchange_v3' WHEN 'instrument_type' THEN 'public.instrument_type_v3' WHEN 'listing_status' THEN 'public.listing_status_v3' WHEN 'provider' THEN 'public.official_roster_provider_v3' WHEN 'source_timestamp' THEN 'timestamp with time zone' WHEN 'valid_from' THEN 'timestamp with time zone' WHEN 'valid_to' THEN 'timestamp with time zone' WHEN 'roster_version' THEN 'text' WHEN 'recorded_at' THEN 'timestamp with time zone' END)::regtype AND a.attnotnull=(attribute<>'valid_to')) OR NOT has_column_privilege('stockinsider_vnext_owner','public.stock_instruments_v3',attribute,'SELECT') OR NOT EXISTS(SELECT FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attrelid='public.stock_instruments_v3'::regclass AND a.attname=attribute AND acl.grantee='stockinsider_vnext_owner'::regrole::oid AND acl.grantor='opportunity_v3_rpc_owner'::regrole::oid AND acl.privilege_type='SELECT' AND NOT acl.is_grantable) THEN RAISE EXCEPTION 'vnext_trading_invalidity_existing_column_edge_changed:%',attribute;END IF;
 END LOOP;
 targets:=ARRAY[to_regprocedure('public.vnext_command_v1(text,text,jsonb)')::oid,to_regprocedure('public.vnext_target_command_v1(text,jsonb)')::oid];
 IF array_position(targets,NULL) IS NOT NULL THEN RAISE EXCEPTION 'vnext_trading_invalidity_predecessor_missing';END IF;
 target:=to_regprocedure('public.vnext_command_v1(text,text,jsonb)');
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='63f40aa176395df6a06dc7a50875e251f90714545fd20670b2e34eb39438f016' AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prosecdef AND p.prokind='f' AND NOT p.proretset AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.pronargs=3 AND p.proargtypes='25 25 3802'::oidvector AND p.proargnames=ARRAY['p_principal','p_command','p_request'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL) THEN RAISE EXCEPTION 'vnext_trading_invalidity_predecessor_changed:%',target;END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target AND (acl.grantee NOT IN(p.proowner,'service_role'::regrole::oid) OR acl.grantor<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)) OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN RAISE EXCEPTION 'vnext_trading_invalidity_acl_changed:%',target;END IF;
 target:=to_regprocedure('public.vnext_target_command_v1(text,jsonb)');
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=target AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='e5601edb1d3d49a607bb4a66c18c0de165bf3d7c45e3e655bf035660df105472' AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prosecdef AND p.prokind='f' AND NOT p.proretset AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.pronargs=2 AND p.proargtypes='25 3802'::oidvector AND p.proargnames=ARRAY['p_principal','p_request'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND p.procost=100 AND p.prorows=0 AND p.probin IS NULL AND p.prosqlbody IS NULL) THEN RAISE EXCEPTION 'vnext_trading_invalidity_predecessor_changed:%',target;END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target AND (acl.grantee NOT IN(p.proowner,'service_role'::regrole::oid) OR acl.grantor<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)) OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN RAISE EXCEPTION 'vnext_trading_invalidity_acl_changed:%',target;END IF;
 EXECUTE catalog_sql INTO before_namespace USING targets,additions;
 EXECUTE $create_checker$CREATE FUNCTION public.vnext_trading_invalid_current_v1(p_symbol text,p_input_hash text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $checker$
DECLARE member public.vnext_members_v1; roster_rows jsonb; instrument jsonb; stock_ids integer; receipt jsonb; cutoff timestamptz:=statement_timestamp();
BEGIN
 IF p_symbol IS NULL OR p_symbol !~ '^[0-9]{4}$' OR coalesce(p_input_hash,'') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('deferred','trading_invalid_identity_missing');END IF;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=p_symbol;
 IF member.symbol IS NULL OR member.state='exited' OR member.input_hash IS DISTINCT FROM p_input_hash THEN RETURN jsonb_build_object('deferred','trading_invalid_current_member_input_unavailable');END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(roster) ORDER BY roster.recorded_at DESC,roster.source_timestamp DESC,roster.instrument_authority_id),'[]'::jsonb) INTO roster_rows
 FROM(SELECT instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at FROM public.stock_instruments_v3 WHERE symbol=p_symbol ORDER BY recorded_at DESC,source_timestamp DESC,instrument_authority_id LIMIT 1001)roster;
 IF jsonb_array_length(roster_rows)=0 OR jsonb_array_length(roster_rows)>1000 THEN RETURN jsonb_build_object('deferred','trading_invalid_roster_missing_or_unbounded');END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(roster_rows) row_item WHERE row_item->>'symbol' IS DISTINCT FROM p_symbol OR row_item->>'exchange' NOT IN('TWSE','TPEX') OR row_item->>'provider' IS DISTINCT FROM lower(row_item->>'exchange') OR row_item->>'roster_version' IS DISTINCT FROM 'tw-instrument-roster-v3.0' OR row_item->>'listing_status' NOT IN('active','suspended','delisted') OR row_item->>'instrument_type' IS DISTINCT FROM 'common_stock'
  OR NOT isfinite((row_item->>'source_timestamp')::timestamptz) OR NOT isfinite((row_item->>'recorded_at')::timestamptz) OR NOT isfinite((row_item->>'valid_from')::timestamptz)
  OR (row_item->>'source_timestamp')::timestamptz>cutoff OR (row_item->>'recorded_at')::timestamptz>cutoff OR (row_item->>'source_timestamp')::timestamptz>(row_item->>'recorded_at')::timestamptz
  OR (row_item->'valid_to'<>'null'::jsonb AND (NOT isfinite((row_item->>'valid_to')::timestamptz) OR (row_item->>'valid_to')::timestamptz<=(row_item->>'valid_from')::timestamptz))) THEN RETURN jsonb_build_object('deferred','trading_invalid_official_tuple_or_clock_unavailable');END IF;
 SELECT count(DISTINCT row_item->>'stock_id') INTO stock_ids FROM jsonb_array_elements(roster_rows) row_item;
 IF stock_ids<>1 THEN RETURN jsonb_build_object('deferred','trading_invalid_stock_identity_conflict');END IF;
 instrument:=roster_rows->0;
 IF EXISTS(SELECT FROM jsonb_array_elements(roster_rows) row_item WHERE row_item->>'recorded_at'=instrument->>'recorded_at' AND (row_item-'instrument_authority_id') IS DISTINCT FROM(instrument-'instrument_authority_id')) THEN RETURN jsonb_build_object('deferred','trading_invalid_latest_roster_conflict');END IF;
 IF (instrument->>'valid_from')::timestamptz>cutoff OR (instrument->'valid_to'<>'null'::jsonb AND (instrument->>'valid_to')::timestamptz<=cutoff) THEN RETURN jsonb_build_object('deferred','trading_invalid_current_interval_unavailable');END IF;
 IF EXISTS(SELECT FROM public.stock_instruments_v3 other WHERE other.stock_id=(instrument->>'stock_id')::uuid AND other.symbol<>p_symbol AND other.recorded_at<=cutoff AND other.source_timestamp<=cutoff AND other.valid_from<=cutoff AND (other.valid_to IS NULL OR other.valid_to>cutoff)) THEN RETURN jsonb_build_object('deferred','trading_invalid_symbol_identity_conflict');END IF;
 IF instrument->>'listing_status' NOT IN('suspended','delisted') THEN RETURN jsonb_build_object('deferred','trading_invalid_not_confirmed');END IF;
 receipt:=jsonb_build_object('schemaVersion','stockinsider-vnext-trading-invalidity-v1','symbol',member.symbol,'inputHash',member.input_hash,'memberState',member.state,'memberEvidenceHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(member.evidence),'UTF8')),'hex'),'instrument',instrument,'instrumentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(instrument),'UTF8')),'hex'));
 RETURN receipt||jsonb_build_object('proofHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(receipt),'UTF8')),'hex'));
END
$checker$;$create_checker$;
 ALTER FUNCTION public.vnext_trading_invalid_current_v1(text,text) OWNER TO stockinsider_vnext_owner;
 REVOKE ALL ON FUNCTION public.vnext_trading_invalid_current_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
 additions:=ARRAY[to_regprocedure('public.vnext_trading_invalid_current_v1(text,text)')::oid];
 target:=to_regprocedure('public.vnext_command_v1(text,text,jsonb)');SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;changed:=original;
 IF (length(changed)-length(replace(changed,$old0$ ELSIF p_command='exit' THEN
$old0$,'')))<>length($old0$ ELSIF p_command='exit' THEN
$old0$) THEN RAISE EXCEPTION 'vnext_trading_invalidity_single_seam_required';END IF;
 changed:=replace(changed,$old0$ ELSIF p_command='exit' THEN
$old0$,$new0$ ELSIF p_command='exit' THEN
  IF r->>'reason'='trading_invalid' THEN
   IF jsonb_typeof(r->'tradingInvalidityProof') IS DISTINCT FROM 'object' OR jsonb_typeof(r->'tradingInvalidityProof'->'inputHash') IS DISTINCT FROM 'string' OR coalesce(r->'tradingInvalidityProof'->>'inputHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_trading_invalid_current_authority_required';END IF;
   IF public.vnext_trading_invalid_current_v1(r->>'symbol',r->'tradingInvalidityProof'->>'inputHash') IS DISTINCT FROM r->'tradingInvalidityProof' OR NOT(r->'tradingInvalidityProof' ? 'proofHash') OR r->'evidence' IS DISTINCT FROM jsonb_build_array(r->'tradingInvalidityProof'->>'proofHash') THEN RAISE EXCEPTION 'vnext_trading_invalid_current_authority_required';END IF;
  END IF;
$new0$);
 IF replace(changed,$new0$ ELSIF p_command='exit' THEN
  IF r->>'reason'='trading_invalid' THEN
   IF jsonb_typeof(r->'tradingInvalidityProof') IS DISTINCT FROM 'object' OR jsonb_typeof(r->'tradingInvalidityProof'->'inputHash') IS DISTINCT FROM 'string' OR coalesce(r->'tradingInvalidityProof'->>'inputHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_trading_invalid_current_authority_required';END IF;
   IF public.vnext_trading_invalid_current_v1(r->>'symbol',r->'tradingInvalidityProof'->>'inputHash') IS DISTINCT FROM r->'tradingInvalidityProof' OR NOT(r->'tradingInvalidityProof' ? 'proofHash') OR r->'evidence' IS DISTINCT FROM jsonb_build_array(r->'tradingInvalidityProof'->>'proofHash') THEN RAISE EXCEPTION 'vnext_trading_invalid_current_authority_required';END IF;
  END IF;
$new0$,$old0$ ELSIF p_command='exit' THEN
$old0$) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex')<>'c2df728571a9b9914f87acc6cead6d444af2ea0c638e058db50da4bc74ef146c' THEN RAISE EXCEPTION 'vnext_trading_invalidity_inverse_failed';END IF;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_command_v1(text,text,jsonb)')::oid IS DISTINCT FROM target OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM changed THEN RAISE EXCEPTION 'vnext_trading_invalidity_metadata_changed';END IF;
 target:=to_regprocedure('public.vnext_target_command_v1(text,jsonb)');SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;changed:=original;
 IF (length(changed)-length(replace(changed,$old0$observations jsonb:='[]'::jsonb;$old0$,'')))<>length($old0$observations jsonb:='[]'::jsonb;$old0$) THEN RAISE EXCEPTION 'vnext_trading_invalidity_single_seam_required';END IF;
 changed:=replace(changed,$old0$observations jsonb:='[]'::jsonb;$old0$,$new0$observations jsonb:='[]'::jsonb; invalidity jsonb;$new0$);
 IF (length(changed)-length(replace(changed,$old1$  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$old1$,'')))<>length($old1$  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$old1$) THEN RAISE EXCEPTION 'vnext_trading_invalidity_single_seam_required';END IF;
 changed:=replace(changed,$old1$  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$old1$,$new1$  invalidity:=public.vnext_trading_invalid_current_v1(member.symbol,member.input_hash);
  IF invalidity ? 'proofHash' THEN
   result:=public.vnext_command_v1(p_principal,'exit',jsonb_build_object('symbol',member.symbol,'reason','trading_invalid','evidence',jsonb_build_array(invalidity->>'proofHash'),'tradingInvalidityProof',invalidity));
   observations:=observations||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'status','exited','reason','trading_invalid','revisionId',NULL,'inputHash',member.input_hash));
   CONTINUE;
  END IF;
  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$new1$);
 IF replace(replace(changed,$new1$  invalidity:=public.vnext_trading_invalid_current_v1(member.symbol,member.input_hash);
  IF invalidity ? 'proofHash' THEN
   result:=public.vnext_command_v1(p_principal,'exit',jsonb_build_object('symbol',member.symbol,'reason','trading_invalid','evidence',jsonb_build_array(invalidity->>'proofHash'),'tradingInvalidityProof',invalidity));
   observations:=observations||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'status','exited','reason','trading_invalid','revisionId',NULL,'inputHash',member.input_hash));
   CONTINUE;
  END IF;
  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$new1$,$old1$  SELECT * INTO pub FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;$old1$),$new0$observations jsonb:='[]'::jsonb; invalidity jsonb;$new0$,$old0$observations jsonb:='[]'::jsonb;$old0$) IS DISTINCT FROM original OR encode(sha256(convert_to(changed,'UTF8')),'hex')<>'dd7f1409efbafe0e6fa308c39580cd66838238879c0b6787ab22c7ab6adc1bea' THEN RAISE EXCEPTION 'vnext_trading_invalidity_inverse_failed';END IF;
 EXECUTE replace(definition,original,changed);
 IF to_regprocedure('public.vnext_target_command_v1(text,jsonb)')::oid IS DISTINCT FROM target OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM changed THEN RAISE EXCEPTION 'vnext_trading_invalidity_metadata_changed';END IF;
 target:=additions[1];
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=target AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='dac9ffaf049c8cabfe3f0fa166293447484f69c4daf06b4c6154f3179f396f58') OR (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=target AND (acl.grantee<>p.proowner OR acl.grantor<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)) THEN RAISE EXCEPTION 'vnext_trading_invalidity_private_checker_changed';END IF;
 EXECUTE catalog_sql INTO after_namespace USING targets,additions;
 IF before_namespace IS DISTINCT FROM after_namespace THEN RAISE EXCEPTION 'vnext_trading_invalidity_namespace_changed';END IF;
END $trading_invalidity$;
COMMIT;
