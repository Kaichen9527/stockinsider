-- SOURCE CANDIDATE ONLY: finite new read authority, subject to normal PR review.
-- No production install, catalog OID or native verification is implied.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
CREATE TEMP TABLE vnext_ir_source_install_before_v1(kind text PRIMARY KEY,value jsonb) ON COMMIT DROP;
INSERT INTO vnext_ir_source_install_before_v1 VALUES
 ('roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r)),
 ('memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]'::jsonb) FROM pg_auth_members m)),
 ('tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN('r','p','S','v','m','f'))),
 ('columns',(SELECT jsonb_agg(jsonb_build_object('table',a.attrelid,'column',a.attnum,'acl',a.attacl) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped)),
 ('policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace))),
 ('structural_metadata',(SELECT to_jsonb(p)-'proacl' FROM pg_proc p WHERE oid='public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)'::regprocedure)),
 ('structural_acl',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable),'[]'::jsonb) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)'::regprocedure));
DO $preconditions$
DECLARE relation regclass; dependency record;
BEGIN
 IF to_regprocedure('public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text)') IS NOT NULL THEN RAISE EXCEPTION 'vnext_ir_candidate_already_present'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='opportunity_v3_rpc_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'vnext_ir_financial_owner_profile_changed'; END IF;
 FOR dependency IN SELECT * FROM (VALUES
  ('public.vnext_provider_command_v1(text,text,jsonb)','stockinsider_vnext_owner',true,'47fdb26746e2d20a2d85348d2e15cf288c8e1e1af84b7b4b6b780d150811288d'),
  ('public.vnext_input_sources_current_v1(jsonb,text)','stockinsider_vnext_owner',true,'dd72f52bd54c6f708e4be68953ae689779340aa69d8d9df775dcb7c43c3cd043'),
  ('public.read_financial_facts_for_stocks_as_of(timestamptz,uuid[])','opportunity_v3_rpc_owner',false,'220620b91b5c0ffb41a8e33547b5fdc18642c477036dbdd8da8c619ba3b2d2f2'),
  ('public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)','postgres',true,'67b36db42304d076c38c582070a5cb67408a9417439124ac3593d3c8959ec8f6')
 ) expected(signature,owner_name,definer,body_hash) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(dependency.signature) AND pg_get_userbyid(p.proowner)=dependency.owner_name AND p.prosecdef=dependency.definer AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=dependency.body_hash) THEN RAISE EXCEPTION 'vnext_ir_source_predecessor_changed:%',dependency.signature; END IF;
 END LOOP;
 IF has_function_privilege('opportunity_v3_rpc_owner','public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'vnext_ir_structural_predecessor_privilege_changed'; END IF;
 FOREACH relation IN ARRAY ARRAY['public.candidate_financial_document_fact_links_v8'::regclass,'public.candidate_financial_parser_evidence_v8'::regclass,'public.candidate_issuer_ir_document_queue_v4'::regclass] LOOP
  IF NOT EXISTS(SELECT FROM pg_class WHERE oid=relation AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND NOT relforcerowsecurity)
   OR EXISTS(SELECT FROM pg_policy WHERE polrelid=relation)
   OR has_any_column_privilege('opportunity_v3_rpc_owner',relation,'SELECT,INSERT,UPDATE,REFERENCES')
   OR has_table_privilege('opportunity_v3_rpc_owner',relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'vnext_ir_read_predecessor_privilege_changed:%',relation; END IF;
 END LOOP;
END $preconditions$;
GRANT SELECT(receipt_id,fact_id,fact_recorded_at,evidence_id,created_at) ON public.candidate_financial_document_fact_links_v8 TO opportunity_v3_rpc_owner;
GRANT SELECT(evidence_id,receipt_id,document_sha256,manifest_sha256,recorded_at) ON public.candidate_financial_parser_evidence_v8 TO opportunity_v3_rpc_owner;
GRANT SELECT(document_id,stock_id,document_url,document_sha256,acquisition_status,collected_at,recorded_at) ON public.candidate_issuer_ir_document_queue_v4 TO opportunity_v3_rpc_owner;
CREATE POLICY vnext_ir_source_read_v1 ON public.candidate_financial_document_fact_links_v8 FOR SELECT TO opportunity_v3_rpc_owner USING(true);
CREATE POLICY vnext_ir_source_read_v1 ON public.candidate_financial_parser_evidence_v8 FOR SELECT TO opportunity_v3_rpc_owner USING(true);
CREATE POLICY vnext_ir_source_read_v1 ON public.candidate_issuer_ir_document_queue_v4 FOR SELECT TO opportunity_v3_rpc_owner USING(true);
GRANT EXECUTE ON FUNCTION public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz) TO opportunity_v3_rpc_owner;
CREATE FUNCTION public.vnext_issuer_financial_evidence_current_v1(p_source jsonb,p_input jsonb,p_symbol text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='30s' SET lock_timeout='2s' SET timezone='UTC' AS $checker$
DECLARE descriptor jsonb; cutoff timestamptz; v_stock_id uuid; original public.opportunity_financial_facts_v3; current_fact public.opportunity_financial_facts_v3; approval record;
BEGIN
 IF p_symbol !~ '^[0-9]{4}$' OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR octet_length(convert_to(p_input::text,'UTF8'))>1048576 OR jsonb_typeof(p_input->'financialSourceReceipts') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_input->'financialSourceReceipts')>2000 OR p_source->>'kind' IS DISTINCT FROM 'fact' OR p_source->>'sourceTier' IS DISTINCT FROM 'official'
  OR jsonb_typeof(p_source->'value') IS DISTINCT FROM 'number' OR coalesce(p_source->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR coalesce(p_source->>'contentHash','') !~ '^[a-f0-9]{64}$' OR nullif(p_input->>'cutoff','') IS NULL THEN RETURN false; END IF;
 cutoff:=(p_input->>'cutoff')::timestamptz;
 IF NOT isfinite(cutoff) OR cutoff>clock_timestamp() OR (SELECT count(*) FROM jsonb_array_elements(p_input->'financialSourceReceipts') d WHERE d->>'factId'=p_source->>'id' AND d->>'sourceKind'='approved_issuer_ir')<>1 THEN RETURN false; END IF;
 SELECT value INTO descriptor FROM jsonb_array_elements(p_input->'financialSourceReceipts') WHERE value->>'factId'=p_source->>'id' AND value->>'sourceKind'='approved_issuer_ir';
 SELECT id INTO v_stock_id FROM public.stocks WHERE symbol=p_symbol;
 IF v_stock_id IS NULL OR descriptor->>'sourceUrl' IS DISTINCT FROM p_source->>'source' OR descriptor->>'sourceSha256' !~ '^[a-f0-9]{64}$'
  OR descriptor->>'sourceRef' !~ ('^issuer-document:'||(descriptor->>'sourceSha256')||':[a-f0-9]+$')
  OR descriptor->'issuerApproval'->>'stockId' IS DISTINCT FROM v_stock_id::text OR descriptor->>'sourceUrl' !~ '^https://[a-z0-9][a-z0-9.-]+/[^#]+$'
  OR descriptor->>'sourceUrl' ~ '[@:#]' AND descriptor->>'sourceUrl' !~ '^https://[^:@#/]+/[^#]*$' THEN RETURN false; END IF;
 SELECT d.stock_id,d.host,d.approved_at INTO approval FROM public.candidate_issuer_document_domains_v6 d
  WHERE d.stock_id=v_stock_id AND d.host=substring(descriptor->>'sourceUrl' FROM '^https://([^/]+)/') AND d.approved_at<=cutoff;
 IF approval.stock_id IS NULL OR descriptor->'issuerApproval'->>'host' IS DISTINCT FROM approval.host
  OR (descriptor->'issuerApproval'->>'approvedAt')::timestamptz IS DISTINCT FROM approval.approved_at THEN RETURN false; END IF;
 SELECT f.* INTO original FROM public.read_financial_facts_for_stocks_as_of(cutoff,ARRAY[v_stock_id]) f WHERE f.fact_id=(p_source->>'id')::uuid AND f.recorded_at=(descriptor->>'factRecordedAt')::timestamptz;
 IF original.fact_id IS NULL OR descriptor->'originalFact' IS DISTINCT FROM to_jsonb(original)
  OR original.provider<>'mops' OR original.authority_tier<>'official_filing' OR original.estimate_kind<>'reported' OR original.estimate_horizon<>'reported_period'
  OR original.validation_status<>'validated' OR original.schema_valid IS DISTINCT FROM true OR original.unit_valid IS DISTINCT FROM true OR original.point_in_time_valid IS DISTINCT FROM true OR original.consistency_valid IS DISTINCT FROM true
  OR original.source_ref IS DISTINCT FROM descriptor->>'sourceRef' OR original.fact_key::text IS DISTINCT FROM p_source->>'key' OR original.unit::text IS DISTINCT FROM p_source->>'unit' OR original.period_end::text IS DISTINCT FROM p_source->>'period'
  OR original.value::numeric IS DISTINCT FROM (p_source->>'value')::numeric OR original.source_timestamp IS DISTINCT FROM (p_source->>'eventAt')::timestamptz
  OR original.recorded_at>(p_source->>'availableAt')::timestamptz OR (p_source->>'availableAt')::timestamptz>cutoff THEN RETURN false; END IF;
 SELECT f.* INTO current_fact FROM public.read_financial_facts_for_stocks_as_of(clock_timestamp(),ARRAY[v_stock_id]) f WHERE f.fact_id=original.fact_id AND f.recorded_at=original.recorded_at;
 IF current_fact.fact_id IS NULL OR current_fact.validation_status<>'validated' OR current_fact.schema_valid IS DISTINCT FROM true OR current_fact.unit_valid IS DISTINCT FROM true OR current_fact.point_in_time_valid IS DISTINCT FROM true OR current_fact.consistency_valid IS DISTINCT FROM true THEN RETURN false; END IF;
 RETURN EXISTS(
  SELECT FROM public.candidate_financial_fact_provenance_v4 provenance
  JOIN public.candidate_financial_document_fact_links_v8 link ON link.fact_id=original.fact_id AND link.fact_recorded_at=original.recorded_at AND link.receipt_id=(descriptor->>'receiptId')::uuid
  JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id AND receipt.stock_id=v_stock_id AND receipt.period_end=original.period_end
  JOIN public.candidate_financial_parser_evidence_v8 parser ON parser.evidence_id=link.evidence_id AND parser.receipt_id=receipt.receipt_id AND parser.document_sha256=receipt.document_sha256
  JOIN public.candidate_issuer_ir_document_queue_v4 document ON document.document_id=receipt.issuer_document_id AND document.stock_id=v_stock_id
  WHERE provenance.provenance_id=(descriptor->>'provenanceId')::uuid AND provenance.fact_id=original.fact_id AND provenance.issuer_document_id=receipt.issuer_document_id
   AND receipt.document_sha256=descriptor->>'sourceSha256' AND provenance.source_sha256=receipt.document_sha256 AND document.document_sha256=receipt.document_sha256
   AND receipt.source_url=descriptor->>'sourceUrl' AND provenance.source_url=receipt.source_url AND document.document_url=receipt.source_url AND document.acquisition_status='fetched'
   AND receipt.issuer_document_id::text=descriptor->>'issuerDocumentId' AND link.evidence_id::text=descriptor->>'parserEvidenceId' AND receipt.parser_evidence_id=link.evidence_id
   AND provenance.locator->>'parser_evidence_id'=link.evidence_id::text AND provenance.locator->>'manifest_sha256'=parser.manifest_sha256 AND parser.manifest_sha256=descriptor->>'manifestSha256' AND provenance.locator->>'response_url'=receipt.source_url
   AND receipt.receipt_status='accepted' AND receipt.parser_status='complete' AND receipt.financial_validation_status='validated'
   AND provenance.extracted_at<=cutoff AND provenance.recorded_at<=cutoff AND link.created_at<=cutoff AND parser.recorded_at<=cutoff AND document.collected_at<=cutoff AND document.recorded_at<=cutoff
   AND receipt.accepted_at<=cutoff AND receipt.completed_at<=cutoff AND (receipt.published_at IS NULL OR receipt.published_at<=cutoff)
   AND public.candidate_financial_fact_has_structural_proof_as_of_v10(original.fact_id,original.recorded_at,receipt.document_sha256,cutoff)
 );
END $checker$;
ALTER FUNCTION public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text) TO stockinsider_vnext_owner;
DO $provider_patch$
DECLARE original text; changed text; target oid:='public.vnext_provider_command_v1(text,text,jsonb)'::regprocedure; metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'47fdb26746e2d20a2d85348d2e15cf288c8e1e1af84b7b4b6b780d150811288d' THEN RAISE EXCEPTION 'vnext_ir_provider_predecessor'; END IF;
 changed:=replace(original,$old_url$coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)'$old_url$,$new_url$(coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' AND NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(member.evidence->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=fact->>'id' AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND fact->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex') AND public.vnext_issuer_financial_evidence_current_v1(fact,member.evidence,j.symbol)))$new_url$);
 changed:=replace(changed,$old_replay$ IF p_command='reserve' THEN
  IF invocation.invocation_id IS NOT NULL THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;$old_replay$,$new_replay$ IF p_command='reserve' THEN
  IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(member.evidence->'evidence','[]'::jsonb)) source_item WHERE source_item->>'sourceTier'='official' AND coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)') AND NOT public.vnext_input_sources_current_v1(member.evidence,j.symbol) THEN RAISE EXCEPTION 'vnext_ir_original_source_no_longer_current'; END IF;
  IF invocation.invocation_id IS NOT NULL THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;$new_replay$);
 IF changed=original OR position('vnext_ir_original_source_no_longer_current' IN changed)=0 OR position('public.vnext_issuer_financial_evidence_current_v1(fact,member.evidence,j.symbol)' IN changed)=0 THEN RAISE EXCEPTION 'vnext_ir_provider_seam_missing'; END IF;
 EXECUTE replace(pg_get_functiondef(target),original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_ir_provider_metadata_changed'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'0e8121100eb0781d27e46f54d667cce39bbd061daa05a10efc4ebbb29a0312bd' THEN RAISE EXCEPTION 'vnext_ir_provider_body_postcondition'; END IF;
END $provider_patch$;
DO $current_patch$
DECLARE original text; target oid:='public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure; metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'dd72f52bd54c6f708e4be68953ae689779340aa69d8d9df775dcb7c43c3cd043' THEN RAISE EXCEPTION 'vnext_ir_current_predecessor'; END IF;
 EXECUTE replace(pg_get_functiondef(target),original,$current_body$
 SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE
  CASE WHEN source_item->>'sourceTier'='official' THEN
   coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' AND NOT EXISTS(
    SELECT FROM jsonb_array_elements(coalesce(input->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=source_item->>'id'
     AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND source_item->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex')
     AND public.vnext_issuer_financial_evidence_current_v1(source_item,input,p_symbol))
  ELSE NOT public.vnext_source_evidence_current_v1(source_item,p_symbol) END),false)
$current_body$);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_ir_current_metadata_changed'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'83c21c7f7247045c0fe8f66d8d6ae5dbc88c72286ef38274ca8d8a11fe9ca352' THEN RAISE EXCEPTION 'vnext_ir_current_body_postcondition'; END IF;
END $current_patch$;
DO $postconditions$
DECLARE relation regclass; columns_before jsonb; expected_columns jsonb; actual_columns jsonb; column_row record; before_acl jsonb; actual_acl jsonb;
BEGIN
 IF (SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r) IS DISTINCT FROM (SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='roles') OR (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]'::jsonb) FROM pg_auth_members m) IS DISTINCT FROM (SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='memberships') THEN RAISE EXCEPTION 'vnext_ir_roles_changed'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN('r','p','S','v','m','f')) IS DISTINCT FROM (SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='tables') THEN RAISE EXCEPTION 'vnext_ir_table_authority_changed'; END IF;
 IF (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_ir_source_read_v1' AND p.polrelid IN('public.candidate_financial_document_fact_links_v8'::regclass,'public.candidate_financial_parser_evidence_v8'::regclass,'public.candidate_issuer_ir_document_queue_v4'::regclass))) IS DISTINCT FROM (SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='policies') THEN RAISE EXCEPTION 'vnext_ir_old_policy_changed'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polname='vnext_ir_source_read_v1' AND polcmd='r' AND polroles=ARRAY['opportunity_v3_rpc_owner'::regrole::oid] AND pg_get_expr(polqual,polrelid)='true' AND polwithcheck IS NULL AND polrelid IN('public.candidate_financial_document_fact_links_v8'::regclass,'public.candidate_financial_parser_evidence_v8'::regclass,'public.candidate_issuer_ir_document_queue_v4'::regclass))<>3 THEN RAISE EXCEPTION 'vnext_ir_read_policy_postcondition'; END IF;
 columns_before:=(SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='columns');
 FOR column_row IN SELECT a.attrelid,a.attnum,a.attname,a.attacl,c.relowner FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped LOOP
  SELECT value->'acl' INTO before_acl FROM jsonb_array_elements(columns_before) WHERE (value->>'table')::oid=column_row.attrelid AND (value->>'column')::integer=column_row.attnum;
  IF (column_row.attrelid='public.candidate_financial_document_fact_links_v8'::regclass AND column_row.attname IN('receipt_id','fact_id','fact_recorded_at','evidence_id','created_at'))
   OR (column_row.attrelid='public.candidate_financial_parser_evidence_v8'::regclass AND column_row.attname IN('evidence_id','receipt_id','document_sha256','manifest_sha256','recorded_at'))
   OR (column_row.attrelid='public.candidate_issuer_ir_document_queue_v4'::regclass AND column_row.attname IN('document_id','stock_id','document_url','document_sha256','acquisition_status','collected_at','recorded_at')) THEN
   SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO expected_columns FROM(SELECT value FROM jsonb_array_elements(CASE WHEN before_acl='null'::jsonb THEN '[]'::jsonb ELSE before_acl END) UNION ALL SELECT to_jsonb(makeaclitem('opportunity_v3_rpc_owner'::regrole::oid,column_row.relowner,'SELECT',false)::text)) allowed;
   SELECT coalesce(jsonb_agg(to_jsonb(item::text) ORDER BY item::text),'[]'::jsonb) INTO actual_columns FROM unnest(column_row.attacl) item;
   IF actual_columns IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'vnext_ir_column_read_postcondition:%',column_row.attname; END IF;
  ELSIF coalesce(to_jsonb(column_row.attacl),'null'::jsonb) IS DISTINCT FROM before_acl THEN RAISE EXCEPTION 'vnext_ir_unrelated_column_acl_changed'; END IF;
 END LOOP;
 IF (SELECT to_jsonb(p)-'proacl' FROM pg_proc p WHERE oid='public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)'::regprocedure) IS DISTINCT FROM (SELECT value FROM vnext_ir_source_install_before_v1 WHERE kind='structural_metadata') THEN RAISE EXCEPTION 'vnext_ir_structural_metadata_changed'; END IF;
 SELECT value INTO before_acl FROM vnext_ir_source_install_before_v1 WHERE kind='structural_acl';
 SELECT coalesce(jsonb_agg(value ORDER BY (value->>'grantor')::oid,(value->>'grantee')::oid,value->>'privilege_type',(value->>'is_grantable')::boolean),'[]'::jsonb) INTO expected_columns FROM(SELECT value FROM jsonb_array_elements(before_acl) UNION ALL SELECT jsonb_build_object('grantor',proowner,'grantee','opportunity_v3_rpc_owner'::regrole::oid,'privilege_type','EXECUTE','is_grantable',false) FROM pg_proc WHERE oid='public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)'::regprocedure) allowed;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable),'[]'::jsonb) INTO actual_acl FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)'::regprocedure;
 IF actual_acl IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'vnext_ir_structural_execute_delta_changed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE oid='public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef AND provolatile='s' AND proparallel='u' AND NOT proleakproof AND proconfig=ARRAY['search_path=""','statement_timeout=30s','lock_timeout=2s','TimeZone=UTC'])
  OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text)'::regprocedure AND (a.grantee NOT IN('opportunity_v3_rpc_owner'::regrole::oid,'stockinsider_vnext_owner'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
  OR NOT has_function_privilege('stockinsider_vnext_owner','public.vnext_issuer_financial_evidence_current_v1(jsonb,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'vnext_ir_private_checker_profile_changed'; END IF;
END $postconditions$;
COMMIT;
