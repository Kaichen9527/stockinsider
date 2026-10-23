-- Additive SOURCE CANDIDATE. Original v3 estimates remain estimates.
-- No annual/4Q/NTM inference, denominator fabrication, model call or new budget.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
CREATE TEMP TABLE vnext_forecast_install_before_v1(value jsonb NOT NULL,codec_acl jsonb) ON COMMIT DROP;
DO $snapshot$
DECLARE snapshot jsonb;
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
 EXECUTE catalog_sql INTO snapshot USING ARRAY[to_regprocedure('public.vnext_source_evidence_current_v1(jsonb,text)')::oid,to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)')::oid],ARRAY[]::oid[],'{}'::jsonb;
 INSERT INTO vnext_forecast_install_before_v1 SELECT snapshot,to_jsonb(p)->'proacl' FROM pg_proc p WHERE p.oid='public.vnext_catalog_canonical_v1(jsonb)'::regprocedure;
END $snapshot$;
DO $pre$
BEGIN
 IF to_regclass('public.vnext_forecast_rights_v1') IS NOT NULL THEN RAISE EXCEPTION 'vnext_forecast_first_install_required';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_catalog_canonical_v1(jsonb)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND NOT prosecdef AND provolatile='i' AND proconfig=ARRAY['search_path=pg_catalog'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='597081dda160ac0e369b5f5306bee102caac5b78b19cd82583e0e9408cc4f464') THEN RAISE EXCEPTION 'vnext_forecast_codec_body';END IF;
 IF has_function_privilege('opportunity_v3_rpc_owner','public.vnext_catalog_canonical_v1(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'vnext_forecast_codec_predecessor_privilege';END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='opportunity_v3_rpc_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls) OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls) THEN RAISE EXCEPTION 'vnext_forecast_owner_profile';END IF;
 IF EXISTS(SELECT FROM pg_proc WHERE oid=ANY(ARRAY['public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure::oid,'public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure::oid]) AND (pg_get_userbyid(proowner)<>'stockinsider_vnext_owner' OR NOT prosecdef OR provolatile<>'s' OR prorettype<>'boolean'::regtype OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR proargtypes<>'3802 25'::oidvector)) THEN RAISE EXCEPTION 'vnext_forecast_source_profiles';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_source_evidence_current_v1(jsonb,text)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='712c701f18809a44fb788453e5e12a9d98b93f28ee3573973606d94bb739f0e8') THEN RAISE EXCEPTION 'vnext_forecast_source_predecessor';END IF;
END $pre$;
-- The existing pure canonical codec is the only added dependency privilege.
GRANT EXECUTE ON FUNCTION public.vnext_catalog_canonical_v1(jsonb) TO opportunity_v3_rpc_owner;
-- Private, explicit per-publication metadata-use configuration. No HTTP/model
-- request can insert it. An allow is unusable without original current v3
-- identity/publisher/revision/manifest authority. Revocation is permanent.
CREATE TABLE public.vnext_forecast_rights_v1(
 policy_id uuid PRIMARY KEY,stock_id uuid NOT NULL REFERENCES public.stocks(id),verification_id uuid NOT NULL REFERENCES public.source_publication_verifications_v3(verification_id),
 operation text NOT NULL CHECK(operation IN('allow','revoke')),
 license_basis text NOT NULL CHECK(license_basis IN('public_issuer_guidance','licensed_forecast_metadata')),
 permitted_use text NOT NULL CHECK(permitted_use='structured_numeric_forecast'),
 rights_evidence_ref text NOT NULL CHECK(rights_evidence_ref ~ '^https://[^[:space:]@#?]+/[^[:cntrl:]]*$' AND octet_length(rights_evidence_ref)<=2048),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,CHECK(valid_until>valid_from),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(verification_id,operation)
);
ALTER TABLE public.vnext_forecast_rights_v1 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.vnext_forecast_rights_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_forecast_rights_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_forecast_rights_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'vnext_forecast_rights_append_only';END IF;
 NEW.recorded_at:=clock_timestamp();
 IF NEW.operation='allow' AND EXISTS(SELECT FROM public.vnext_forecast_rights_v1 WHERE verification_id=NEW.verification_id AND operation='revoke') THEN RAISE EXCEPTION 'vnext_forecast_rights_revoked';END IF;
 RETURN NEW;
END $guard$;
ALTER FUNCTION public.vnext_forecast_rights_guard_v1() OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_forecast_rights_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_forecast_rights_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_forecast_rights_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_forecast_rights_guard_v1();
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_forecast_rights_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_forecast_current_internal_v1(p_stock uuid,p_symbol text,p_cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $reader$
DECLARE symbol_value text;fact record;verification public.source_publication_verifications_v3;revision public.source_document_revisions_v3;publisher public.publisher_verification_authorities_v3;identity_row public.source_identity_authorities_v3;policy public.vnext_forecast_rights_v1;manifest public.opportunity_manifests_v3;
 evidence jsonb:='[]'::jsonb;receipts jsonb:='[]'::jsonb;gaps jsonb:='[]'::jsonb;item jsonb;receipt jsonb;url text;term text;start_day date;end_day date;latest_time timestamptz;known_at timestamptz;observed_at timestamptz:=statement_timestamp();amount integer:=0;
BEGIN
 IF p_stock IS NULL OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>observed_at THEN RAISE EXCEPTION 'vnext_forecast_scope';END IF;
 -- Only the stock-owning private composition may supply this closed identity.
 -- The source owner receives no SELECT grant on stocks.
 symbol_value:=p_symbol;IF symbol_value IS NULL OR symbol_value !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'vnext_forecast_issuer';END IF;
 FOR fact IN SELECT f.* FROM public.opportunity_financial_facts_v3 f WHERE f.stock_id=p_stock AND f.estimate_kind IN('analyst_estimate','broker_consensus') AND f.recorded_at<=p_cutoff AND f.filing_published_at<=p_cutoff AND f.source_timestamp<=p_cutoff AND f.collected_at<=p_cutoff ORDER BY f.recorded_at DESC,f.fact_id LIMIT 201 LOOP
  amount:=amount+1;IF amount>200 THEN RAISE EXCEPTION 'vnext_forecast_fact_bound';END IF;
  -- Unknown periods/bases are not normalized to annual EPS, forward4Q or NTM.
  IF fact.unit::text<>'TWD_per_share' OR fact.value::text IN('NaN','Infinity','-Infinity') OR (fact.value<>0 AND (abs(fact.value)<0.000001 OR abs(fact.value)>=1e21)) OR fact.period_start IS NULL OR fact.period_start>fact.period_end OR fact.filing_published_at>fact.source_timestamp OR fact.source_timestamp>fact.collected_at OR fact.collected_at>fact.recorded_at THEN gaps:=gaps||'"forecast_original_period_or_unit_unavailable"'::jsonb;CONTINUE;END IF;
  IF fact.estimate_kind::text='analyst_estimate' AND fact.estimate_horizon::text='next_twelve_months' AND fact.fact_key::text='quarterly_diluted_eps' AND fact.duration_kind::text='quarterly' AND fact.period_end>(p_cutoff AT TIME ZONE 'Asia/Taipei')::date AND fact.period_end<=((fact.filing_published_at AT TIME ZONE 'Asia/Taipei')::date+interval'1 year')::date AND fact.period_start=date_trunc('quarter',fact.period_start)::date AND fact.period_end=(fact.period_start+interval'3 months'-interval'1 day')::date THEN term:='source_quarterly_diluted_eps_estimate';
  ELSIF fact.estimate_kind::text='broker_consensus' AND fact.estimate_horizon::text='target_12m' AND fact.fact_key::text='broker_target_price' AND fact.value>0 AND fact.period_end>(p_cutoff AT TIME ZONE 'Asia/Taipei')::date THEN
   start_day:=(fact.filing_published_at AT TIME ZONE 'Asia/Taipei')::date;end_day:=(start_day+interval'1 year'-interval'1 day')::date;
   IF fact.period_start IS DISTINCT FROM start_day OR fact.period_end IS DISTINCT FROM end_day THEN gaps:=gaps||'"forecast_target_horizon_unavailable"'::jsonb;CONTINUE;END IF;term:='source_target_price_12m';
  ELSE gaps:=gaps||'"forecast_horizon_not_supported"'::jsonb;CONTINUE;END IF;
  IF (SELECT count(*) FROM public.source_publication_verifications_v3 v WHERE v.evidence_ref=fact.source_ref AND v.recorded_at<=p_cutoff AND v.collected_at<=p_cutoff)<>1 THEN gaps:=gaps||'"forecast_publication_binding_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO verification FROM public.source_publication_verifications_v3 v WHERE v.evidence_ref=fact.source_ref AND v.recorded_at<=p_cutoff AND v.collected_at<=p_cutoff;
  SELECT * INTO policy FROM public.vnext_forecast_rights_v1 r WHERE r.verification_id=verification.verification_id AND r.stock_id=p_stock AND r.operation='allow' AND r.recorded_at<=p_cutoff AND r.valid_from<=p_cutoff AND r.valid_until>observed_at AND NOT EXISTS(SELECT FROM public.vnext_forecast_rights_v1 revoked WHERE revoked.verification_id=r.verification_id AND revoked.operation='revoke');
  IF policy.policy_id IS NULL THEN gaps:=gaps||'"forecast_current_use_permission_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO revision FROM public.source_document_revisions_v3 d WHERE d.revision_id=verification.revision_id;
  IF revision.revision_id IS NULL OR NOT EXISTS(SELECT FROM public.source_revision_family_registry_v3 family WHERE family.source_key=revision.source_key AND family.revision_family_key=revision.revision_family_key AND family.approved_source_identity_id=revision.approved_source_identity_id AND family.stable_connector_document_id=revision.stable_connector_document_id AND family.registered_at<=p_cutoff) OR revision.acquisition_status::text<>'complete' OR revision.source_key::text NOT IN('public_broker_research','earnings_call','mops_material_event') OR revision.ingestion_canonical_content_hash_v3 IS DISTINCT FROM verification.canonical_content_hash OR revision.approved_source_identity_id IS DISTINCT FROM verification.publisher_identity_id OR revision.recorded_at>p_cutoff OR revision.collected_at>p_cutoff OR revision.published_at IS NULL OR revision.published_at>revision.collected_at OR verification.published_at IS DISTINCT FROM revision.published_at OR fact.filing_published_at IS DISTINCT FROM verification.published_at OR observed_at-verification.published_at>interval'90 days'
   OR EXISTS(SELECT FROM public.source_document_revisions_v3 newer WHERE newer.source_key=revision.source_key AND newer.revision_family_key=revision.revision_family_key AND (newer.recorded_at,newer.revision_id)>(revision.recorded_at,revision.revision_id)) THEN gaps:=gaps||'"forecast_revision_or_source_window_unavailable"'::jsonb;CONTINUE;END IF;
  url:=revision.canonical_url_candidate;
  IF url IS NULL OR url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+/[^[:space:]@#?]*$' OR url ~* '(paid|member|premium|subscription|login|authenticate|telegram|investanchors|\.invalid|\.local|localhost)' THEN gaps:=gaps||'"forecast_permitted_citation_missing"'::jsonb;CONTINUE;END IF;
  SELECT max(recorded_at) INTO latest_time FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id;
  IF (SELECT count(*) FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"forecast_publisher_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO publisher FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time;
  SELECT max(recorded_at) INTO latest_time FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key;
  IF (SELECT count(*) FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"forecast_identity_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO identity_row FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time;
  IF publisher.status::text<>'active' OR identity_row.status::text<>'active' OR publisher.recorded_at>p_cutoff OR identity_row.recorded_at>p_cutoff OR publisher.approved_at>p_cutoff OR identity_row.approved_at>p_cutoff OR publisher.valid_from>p_cutoff OR identity_row.valid_from>p_cutoff OR publisher.valid_to<=observed_at OR identity_row.valid_to<=observed_at OR identity_row.authority_id IS DISTINCT FROM revision.source_identity_authority_id OR publisher.institution_identity IS DISTINCT FROM verification.institution_identity OR verification.institution_identity IS NULL OR publisher.source_class::text NOT IN('official','public_research') OR identity_row.source_class IS DISTINCT FROM publisher.source_class OR NOT(substring(url FROM '^https://([^/]+)/')=ANY(publisher.domains))
   OR (policy.license_basis='public_issuer_guidance' AND publisher.source_class::text<>'official') THEN gaps:=gaps||'"forecast_current_publisher_or_identity_unavailable"'::jsonb;CONTINUE;END IF;
  SELECT * INTO manifest FROM public.opportunity_manifests_v3 WHERE manifest_id=verification.publisher_manifest_id;
  IF manifest.status::text IS DISTINCT FROM 'complete' OR manifest.manifest_kind::text IS DISTINCT FROM 'publisher_verification_allowlist' OR manifest.contract_version IS DISTINCT FROM 'source-publisher-allowlist-v3.0' OR manifest.terminal_at>p_cutoff OR manifest.source_cutoff>p_cutoff OR manifest.manifest_hash IS DISTINCT FROM encode(sha256(manifest.root_canonical),'hex') OR NOT EXISTS(SELECT FROM public.opportunity_manifest_rows_v3 row_item WHERE row_item.manifest_id=manifest.manifest_id AND row_item.section_key::text='rows' AND row_item.payload_json->>0=publisher.authority_id::text AND row_item.payload_json->>1=publisher.publisher_identity_id::text AND row_item.payload_json->>5=publisher.institution_identity AND row_item.payload_json->>10='active' AND row_item.recorded_at<=p_cutoff AND row_item.payload_hash=encode(sha256(row_item.payload_canonical),'hex') AND convert_from(row_item.payload_canonical,'UTF8')::jsonb=row_item.payload_json) THEN gaps:=gaps||'"forecast_manifest_binding_missing"'::jsonb;CONTINUE;END IF;
  -- Revisions and corrections from the same institution must not coexist as
  -- selectively chosen competing scalar values for the same period.
  IF EXISTS(SELECT FROM public.opportunity_financial_facts_v3 newer JOIN public.source_publication_verifications_v3 v ON v.evidence_ref=newer.source_ref WHERE newer.stock_id=p_stock AND newer.fact_key=fact.fact_key AND newer.period_start IS NOT DISTINCT FROM fact.period_start AND newer.period_end=fact.period_end AND newer.estimate_kind=fact.estimate_kind AND v.institution_identity=verification.institution_identity AND (newer.source_timestamp,newer.recorded_at,newer.fact_id)>(fact.source_timestamp,fact.recorded_at,fact.fact_id)) THEN CONTINUE;END IF;
  IF EXISTS(SELECT FROM public.opportunity_financial_facts_v3 tied JOIN public.source_publication_verifications_v3 v ON v.evidence_ref=tied.source_ref WHERE tied.stock_id=p_stock AND tied.fact_key=fact.fact_key AND tied.period_start IS NOT DISTINCT FROM fact.period_start AND tied.period_end=fact.period_end AND tied.estimate_kind=fact.estimate_kind AND v.institution_identity=verification.institution_identity AND tied.source_timestamp=fact.source_timestamp AND tied.recorded_at=fact.recorded_at AND (tied.value IS DISTINCT FROM fact.value OR tied.unit IS DISTINCT FROM fact.unit)) THEN gaps:=gaps||'"forecast_conflicting_current_values"'::jsonb;CONTINUE;END IF;
  known_at:=greatest(fact.recorded_at,verification.recorded_at,revision.recorded_at,publisher.recorded_at,identity_row.recorded_at,policy.recorded_at,manifest.terminal_at);
  item:=jsonb_build_object('id','forecast:'||fact.fact_id::text||':'||verification.verification_id::text,'key',term,'value',fact.value,'unit','TWD_per_share','period',fact.period_start::text||'/'||fact.period_end::text,'contentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(fact)),'UTF8')),'hex'),'source',url,'sourceTier','public','kind','assumption','eventAt',fact.filing_published_at,'availableAt',known_at);
  receipt:=jsonb_build_object('schemaVersion','vnext-forecast-source-receipt-v1','stockId',p_stock,'symbol',symbol_value,'evidenceHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(item),'UTF8')),'hex'),'classification','source_estimate_not_reported_or_fair_value','verificationId',verification.verification_id,'revisionId',revision.revision_id,'sourceHash',verification.canonical_content_hash,'publisherAuthorityId',publisher.authority_id,'sourceAuthorityId',identity_row.authority_id,'policyId',policy.policy_id,'manifestHash',manifest.manifest_hash,'estimateKind',fact.estimate_kind,'estimateHorizon',fact.estimate_horizon,'shareBasis',CASE WHEN term='source_quarterly_diluted_eps_estimate' THEN 'source_diluted_eps_denominator_not_supplied' ELSE 'not_applicable_price_target' END,'denominatorShares',NULL,'annualEps',NULL,'nextFourQuarterEps',NULL);
  evidence:=evidence||jsonb_build_array(item);receipts:=receipts||jsonb_build_array(receipt);IF jsonb_array_length(evidence)>32 THEN RAISE EXCEPTION 'vnext_forecast_projection_bound';END IF;
 END LOOP;
 RETURN jsonb_build_object('schemaVersion','vnext-current-forecasts-v1','stockId',p_stock,'symbol',symbol_value,'asOf',p_cutoff,'evidence',evidence,'receipts',receipts,'gaps',(SELECT coalesce(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(gaps||'["forecast_annual_and_four_quarter_share_basis_unavailable"]'::jsonb)));
END $reader$;
ALTER FUNCTION public.vnext_forecast_current_internal_v1(uuid,text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_forecast_current_internal_v1(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_forecast_current_internal_v1(uuid,text,timestamptz) TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_forecast_evidence_current_internal_v1(item jsonb,p_symbol text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $check$
DECLARE stock uuid; projection jsonb;
BEGIN
 IF coalesce(item->>'id','') !~ '^forecast:[a-f0-9-]{36}:[a-f0-9-]{36}$' OR p_symbol !~ '^[0-9]{4}$' THEN RETURN false;END IF;
 SELECT id INTO stock FROM public.stocks WHERE symbol=p_symbol AND market='TW';IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,statement_timestamp());
 RETURN EXISTS(SELECT FROM jsonb_array_elements(projection->'evidence') current_item WHERE current_item=item);
END $check$;
ALTER FUNCTION public.vnext_forecast_evidence_current_internal_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_forecast_evidence_current_internal_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_forecast_evidence_current_internal_v1(jsonb,text) TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_forecast_read_v1(p_principal text,p_job uuid,p_execution uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $public_reader$
DECLARE context jsonb;stock uuid;job public.vnext_jobs_v1;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required';END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled AND role='author') THEN RAISE EXCEPTION 'vnext_forecast_author_required';END IF;
 context:=public.vnext_command_v1(p_principal,'work-context',jsonb_build_object('jobId',p_job,'executionId',p_execution));
 SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=p_job;
 IF job.state IS DISTINCT FROM 'running' OR job.execution_id IS DISTINCT FROM p_execution OR job.author_principal IS DISTINCT FROM p_principal OR job.deadline_at<=clock_timestamp() OR context->>'inputHash' IS DISTINCT FROM job.input_hash THEN RAISE EXCEPTION 'vnext_forecast_active_execution_required';END IF;
 SELECT id INTO stock FROM public.stocks WHERE symbol=job.symbol AND market='TW';
 RETURN public.vnext_forecast_current_internal_v1(stock,job.symbol,statement_timestamp());
END $public_reader$;
ALTER FUNCTION public.vnext_forecast_read_v1(text,uuid,uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_forecast_read_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_forecast_read_v1(text,uuid,uuid) TO service_role;
DO $source_patch$
DECLARE target oid:='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'712c701f18809a44fb788453e5e12a9d98b93f28ee3573973606d94bb739f0e8' THEN RAISE EXCEPTION 'vnext_forecast_source_predecessor';END IF;
 changed:='SELECT CASE WHEN left(item->>''id'',9)=''forecast:'' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE ('||original||') END';
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_forecast_source_metadata';END IF;
END $source_patch$;
CREATE FUNCTION public.vnext_forecast_input_current_internal_v1(input jsonb,p_symbol text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $input_check$
DECLARE stock uuid; projection jsonb; frozen_items jsonb;cutoff timestamptz;
BEGIN
 IF NOT(input ? 'forecastSourceReceipts') AND NOT(input ? 'forecastSourceAsOf') THEN RETURN NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') e WHERE left(e->>'id',9)='forecast:');END IF;
 IF jsonb_typeof(input->'forecastSourceReceipts') IS DISTINCT FROM 'array' OR jsonb_array_length(input->'forecastSourceReceipts')>32 OR jsonb_typeof(input->'forecastSourceAsOf') IS DISTINCT FROM 'string' OR input->>'forecastSourceAsOf' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' OR input->>'cutoff' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RETURN false;END IF;
 cutoff:=(input->>'forecastSourceAsOf')::timestamptz;
 IF NOT isfinite(cutoff) OR cutoff>statement_timestamp() OR cutoff>(input->>'cutoff')::timestamptz THEN RETURN false;END IF;
 SELECT id INTO stock FROM public.stocks WHERE symbol=p_symbol AND market='TW';IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,cutoff);
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO frozen_items FROM jsonb_array_elements(input->'evidence') WITH ORDINALITY item(value,ordinal) WHERE left(value->>'id',9)='forecast:';
 RETURN frozen_items=projection->'evidence' AND input->'forecastSourceReceipts'=projection->'receipts';
END $input_check$;
ALTER FUNCTION public.vnext_forecast_input_current_internal_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_forecast_input_current_internal_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_forecast_input_current_internal_v1(jsonb,text) TO stockinsider_vnext_owner;
DO $input_patch$
DECLARE target oid:='public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'2e6a155ce7148f2ab550c414297bae42519339e9a4b7bad2ab658ce9a4ab398a' THEN RAISE EXCEPTION 'vnext_forecast_input_predecessor';END IF;
 changed:='SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND ('||original||')';
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_forecast_input_metadata';END IF;
END $input_patch$;
DO $post$
DECLARE before_snapshot jsonb;after_snapshot jsonb;before_normal jsonb;after_normal jsonb;entry record;old_row jsonb;new_row jsonb;owner_oid oid:='opportunity_v3_rpc_owner'::regrole;stock_owner oid:='stockinsider_vnext_owner'::regrole;relation oid:='public.vnext_forecast_rights_v1'::regclass;codec oid:='public.vnext_catalog_canonical_v1(jsonb)'::regprocedure;
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
 SELECT value INTO before_snapshot FROM vnext_forecast_install_before_v1;
 EXECUTE catalog_sql INTO after_snapshot USING ARRAY[to_regprocedure('public.vnext_source_evidence_current_v1(jsonb,text)')::oid,to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)')::oid],ARRAY[]::oid[],'{}'::jsonb;
 -- Canonical codec ACL has precisely the one declared new EXECUTE edge. All
 -- its other fields and both modified routines' complete nonbody metadata stay.
 SELECT jsonb_agg(CASE WHEN (v->>'oid')::oid=codec THEN v-'proacl' ELSE v END ORDER BY (v->>'oid')::oid) INTO before_normal FROM jsonb_array_elements(before_snapshot->'routines')v;
 SELECT jsonb_agg(CASE WHEN (v->>'oid')::oid=codec THEN v-'proacl' ELSE v END ORDER BY (v->>'oid')::oid) INTO after_normal FROM jsonb_array_elements(after_snapshot->'routines')v;
 before_snapshot:=jsonb_set(before_snapshot,'{routines}',before_normal);after_snapshot:=jsonb_set(after_snapshot,'{routines}',after_normal);
 FOR entry IN SELECT key,value FROM jsonb_each(before_snapshot) LOOP
  IF jsonb_typeof(entry.value)<>'array' THEN
   IF after_snapshot->entry.key IS DISTINCT FROM entry.value THEN RAISE EXCEPTION 'vnext_forecast_original_catalog_changed:%',entry.key;END IF;
   CONTINUE;
  END IF;
  FOR old_row IN SELECT value FROM jsonb_array_elements(entry.value) LOOP
   IF NOT((after_snapshot->entry.key) @> jsonb_build_array(old_row)) THEN RAISE EXCEPTION 'vnext_forecast_original_catalog_changed:%',entry.key;END IF;
  END LOOP;
  FOR new_row IN SELECT value FROM jsonb_array_elements(after_snapshot->entry.key) WHERE NOT(entry.value @> jsonb_build_array(value)) LOOP
   IF entry.key='routines' AND new_row->>'proname' IN('vnext_forecast_rights_guard_v1','vnext_forecast_current_internal_v1','vnext_forecast_evidence_current_internal_v1','vnext_forecast_input_current_internal_v1','vnext_forecast_read_v1') THEN CONTINUE;
   ELSIF entry.key='relations' AND new_row->>'relname' IN('vnext_forecast_rights_v1','vnext_forecast_rights_v1_pkey','vnext_forecast_rights_v1_verification_id_operation_key') THEN CONTINUE;
   ELSIF entry.key='types' AND new_row->>'typname' IN('vnext_forecast_rights_v1','_vnext_forecast_rights_v1') THEN CONTINUE;
   ELSIF entry.key='columns' AND (new_row->>'attrelid')::oid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('vnext_forecast_rights_v1','vnext_forecast_rights_v1_pkey','vnext_forecast_rights_v1_verification_id_operation_key')) THEN CONTINUE;
   ELSIF entry.key='constraints' AND (new_row->>'conrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='defaults' AND (new_row->>'adrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='indexes' AND (new_row->>'indrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='triggers' AND ((new_row->>'tgrelid')::oid=relation OR (new_row->>'tgconstraint')::oid IN(SELECT oid FROM pg_constraint WHERE conrelid=relation AND contype='f')) THEN CONTINUE;
   ELSE RAISE EXCEPTION 'vnext_forecast_undeclared_catalog_delta:%',entry.key;END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('vnext_forecast_rights_guard_v1','vnext_forecast_current_internal_v1','vnext_forecast_evidence_current_internal_v1','vnext_forecast_input_current_internal_v1','vnext_forecast_read_v1'))<>5 THEN RAISE EXCEPTION 'vnext_forecast_routine_count';END IF;
 IF NOT EXISTS(SELECT FROM pg_class WHERE oid=relation AND relowner=owner_oid AND relrowsecurity AND NOT relforcerowsecurity) OR EXISTS(SELECT FROM pg_policy WHERE polrelid=relation) OR has_table_privilege('service_role',relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('service_role',relation,'SELECT,INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'vnext_forecast_private_rights_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=codec)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=codec AND (a.grantee NOT IN(stock_owner,owner_oid) OR a.grantor<>stock_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_forecast_codec_acl_changed';END IF;
 IF EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='public'::regnamespace AND p.proname IN('vnext_forecast_rights_guard_v1','vnext_forecast_current_internal_v1','vnext_forecast_evidence_current_internal_v1','vnext_forecast_input_current_internal_v1','vnext_forecast_read_v1') AND (a.grantee NOT IN(p.proowner,CASE WHEN p.proname='vnext_forecast_read_v1' THEN 'service_role'::regrole::oid ELSE stock_owner END) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_forecast_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_rights_guard_v1()'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=false AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='6d90196a6ccaf0fdbc296ad196ae8c2525a7cd9febc504a5431d8d3322f4e414') THEN RAISE EXCEPTION 'vnext_forecast_new_routine_profile';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_current_internal_v1(uuid,text,timestamp with time zone)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=true AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='507f6e7ffb24af6cc6a4dbd34090b79065ae566fdb3831b9a0fa3e0588268016') THEN RAISE EXCEPTION 'vnext_forecast_new_routine_profile';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ea56374732dbbd7ddc191b935550ff93a9a5bc30da9f878812d91019d06d8dac') THEN RAISE EXCEPTION 'vnext_forecast_new_routine_profile';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_read_v1(text,uuid,uuid)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='8fb85bec6e37309f030495d223b51c00e9105a221df07a8025c61f9418b282be') THEN RAISE EXCEPTION 'vnext_forecast_new_routine_profile';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='5d183e682d372658b061f055b597b7fb5d15c2946ad2b02e4d9c75131ed0d4d0') THEN RAISE EXCEPTION 'vnext_forecast_new_routine_profile';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure) IS DISTINCT FROM '440d0dcee04334f57a2ee9e8fdc920b09d3329d3c3c26e859c7a19e9789c292b' THEN RAISE EXCEPTION 'vnext_forecast_successor_body';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure) IS DISTINCT FROM 'ce58e3b7f1a98fcac4dbcb537ba4336e7bbb3c9c7247e1354d6a07bf2bcc8008' THEN RAISE EXCEPTION 'vnext_forecast_successor_body';END IF;
END $post$;
COMMIT;
