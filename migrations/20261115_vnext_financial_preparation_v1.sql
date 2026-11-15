-- SOURCE ONLY / NOT APPLIED. Purpose-specific private preparation, not research,
-- financial qualification, publication, ranking or an installation authority.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $preflight$
DECLARE owner_id oid; signature text;expected_hash text;expected_owner text;
BEGIN
 IF to_regclass('public.financial_preparation_attempts_v1') IS NOT NULL THEN RAISE EXCEPTION 'financial_preparation_first_install_required';END IF;
 SELECT relowner INTO owner_id FROM pg_class WHERE oid=to_regclass('public.private_artifact_receipts_v1');
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_forecast_stock_id_internal_v1(text)') AND prosecdef
 AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d1508916a64a8e9414dad908c730da4f7abaeb9b1e83920b7143ac6bf6283f26' AND has_function_privilege('stockinsider_vnext_owner',oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'financial_preparation_original_stock_getter_required';END IF;

 IF NOT has_column_privilege(current_user,'public.official_financial_validation_receipts','id','REFERENCES') THEN RAISE EXCEPTION 'financial_preparation_migration_reference_authority_required';END IF;
 IF owner_id IS NULL OR to_regclass('public.vnext_mode_v1') IS NULL OR to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'financial_preparation_existing_authority_missing';END IF;
 FOR signature,expected_hash,expected_owner IN SELECT * FROM(VALUES
  ('public.assert_stockinsider_backend_request_v1(boolean)','23f9db45de277921113fc088fb3f9fe2e46474fe7aafbc84163f89351188e453','artifact'),
  ('public.register_private_artifact_receipt_v1(text,bigint,text,text,jsonb)','0e4c72c288d5041b770f78315018b0a724b1814a51c75eb10c06b4606644798f','artifact'),
  ('public.record_candidate_financial_document_receipt_v6(uuid,uuid,text,text,date,timestamptz,text,text,text,integer,jsonb)','ce0d617bc0bc583f33175c9a86969d028dbd01d7b1f0d0509904780e6e063ade','artifact'),
  ('public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)','b5121d364e7523879e6eda8570a430943616165953e75743b714dec34892e8ec','artifact'),
  ('public.complete_candidate_financial_acquisition_job_v4(uuid,text,uuid,jsonb,text,integer,timestamptz)','1245aa3e6d451a4f6c0da1a2a37c51a0716bb139916e32e500069549b18cc974','artifact'),
  ('public.complete_candidate_financial_document_receipt_parser_v8(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)','2aef0a0b8b49f6e8617bd2afe607c4468da22c9d33f365c1ca9c8bb15c0c6374','artifact'),
  ('public.complete_candidate_financial_document_receipt_parser_v10(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)','3ead0d5245f7c6864d3532bb1ee6174a1b60759bdce5298defb4ec5f5db7279f','artifact'),
  ('public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)','b506712e9f05b22736fd76c8ec9fe85f70418f4fdca76d998a30ecd4ea4f2754','opportunity_v3_rpc_owner'),
  ('public.finalize_candidate_financial_document_validation_v8(uuid,uuid,timestamptz)','a9659c701f9206a60a996bb87353a0af1eb50eddcee74b237db2fdba0f983ef5','artifact'),
  ('public.reconcile_candidate_financial_document_job_v9(uuid,uuid,uuid)','fcdde0360c4db124ae7a27b56713b7b8353ccf696eced5a6379db388973f816a','artifact'),
  ('public.fail_candidate_financial_acquisition_job_v6(uuid,text,text,timestamptz,boolean,boolean)','b115e62b7ec3a27fd248ed38d1eb5e215e1b8ea8cc6913bd5b3bc1d6fe77900a','artifact')) dependencies(signature,body_hash,owner_kind) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure(signature) AND prosecdef AND has_function_privilege(owner_id,oid,'EXECUTE')
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=expected_hash
   AND CASE WHEN expected_owner='artifact' THEN proowner=owner_id ELSE pg_get_userbyid(proowner)=expected_owner END)
  THEN RAISE EXCEPTION 'financial_preparation_dependency_owner_changed:%',signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.assert_stockinsider_backend_request_v1(boolean)')
 AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='23f9db45de277921113fc088fb3f9fe2e46474fe7aafbc84163f89351188e453')
 THEN RAISE EXCEPTION 'financial_preparation_backend_guard_changed';END IF;
END $preflight$;

CREATE TABLE public.financial_preparation_attempts_v1(
 attempt_id uuid PRIMARY KEY,operation text NOT NULL CHECK(operation IN('acquire','parse')),
 mode text NOT NULL CHECK(mode IN('legacy_off','vnext_on')),operator_principal text,
 backend_id uuid NOT NULL REFERENCES public.stockinsider_backend_identities_v1,
 release_id text NOT NULL CHECK(release_id~'^[a-f0-9]{40}$'),runner_principal uuid NOT NULL,
 job_id uuid REFERENCES public.candidate_financial_acquisition_jobs_v4,
 receipt_id uuid REFERENCES public.candidate_financial_document_receipts_v6,
 stock_id uuid NOT NULL REFERENCES public.stocks,symbol text NOT NULL CHECK(symbol~'^[0-9]{4,6}$'),
 exchange text NOT NULL CHECK(exchange IN('TWSE','TPEX')),statement_kind text NOT NULL CHECK(statement_kind IN('general','broker','financial')),
 period_end date NOT NULL,source_url text NOT NULL,profile text NOT NULL,job_binding jsonb NOT NULL,
 member_input_hash text,rights_binding_hash text NOT NULL CHECK(rights_binding_hash~'^[a-f0-9]{64}$'),
 artifact jsonb,claimed_at timestamptz NOT NULL,deadline timestamptz NOT NULL,
 CHECK(deadline>claimed_at AND deadline<=claimed_at+interval '90 seconds'),
 CHECK((operation='acquire' AND job_id IS NOT NULL AND receipt_id IS NULL AND artifact IS NULL)
 OR(operation='parse' AND receipt_id IS NOT NULL AND artifact IS NOT NULL)),
 CHECK(mode<>'vnext_on' OR(operator_principal IS NOT NULL AND member_input_hash IS NOT NULL AND member_input_hash~'^[a-f0-9]{64}$'))
);
CREATE TABLE public.financial_preparation_commits_v1(
 attempt_id uuid PRIMARY KEY REFERENCES public.financial_preparation_attempts_v1,
 artifact_hash text NOT NULL REFERENCES public.private_artifact_receipts_v1,
 receipt_id uuid REFERENCES public.candidate_financial_document_receipts_v6,
 subject_identities jsonb NOT NULL CHECK(jsonb_typeof(subject_identities)='array' AND jsonb_array_length(subject_identities)<=128),
 payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),observed_at timestamptz NOT NULL,
 created_xid bigint NOT NULL DEFAULT txid_current(),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.financial_preparation_validations_v1(
 attempt_id uuid NOT NULL REFERENCES public.financial_preparation_attempts_v1,
 fact_id uuid NOT NULL,fact_recorded_at timestamptz NOT NULL,input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 receipt_id uuid NOT NULL REFERENCES public.official_financial_validation_receipts(id),receipt_sequence bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(attempt_id,fact_id,fact_recorded_at,receipt_id)
);
CREATE TABLE public.financial_preparation_outcomes_v1(
 attempt_id uuid PRIMARY KEY REFERENCES public.financial_preparation_attempts_v1,
 status text NOT NULL CHECK(status IN('validated','acquired_pending_parse','partial','rejected','deferred')),
 created_xid bigint NOT NULL DEFAULT txid_current(),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.financial_preparation_knowledge_v1(
 attempt_id uuid PRIMARY KEY REFERENCES public.financial_preparation_outcomes_v1,
 outcome_xid bigint NOT NULL,witness_xid bigint NOT NULL DEFAULT txid_current(),
 known_at timestamptz NOT NULL,available_at timestamptz NOT NULL,CHECK(outcome_xid<>witness_xid AND available_at>=known_at)
);
CREATE FUNCTION public.financial_preparation_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'financial_preparation_immutable';END $$;
DO $tables$
DECLARE table_name text;owner_name text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public.private_artifact_receipts_v1'::regclass;
 FOREACH table_name IN ARRAY ARRAY['financial_preparation_attempts_v1','financial_preparation_commits_v1','financial_preparation_outcomes_v1','financial_preparation_knowledge_v1','financial_preparation_validations_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO %I',table_name,owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.financial_preparation_immutable_v1()',table_name);
  EXECUTE format('CREATE TRIGGER writer_fence BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',table_name);
 END LOOP;
END $tables$;

CREATE FUNCTION public.financial_preparation_exact_v1(value jsonb,keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(value)='object' AND value ?& keys
 AND NOT EXISTS(SELECT FROM jsonb_object_keys(value) k WHERE NOT k=ANY(keys)),false)
$$;
-- Existing independently authorized private acquisition/resource contracts only.
-- This does NOT attach Gov1.0/public redistribution rights to MOPS/JSON/IR.
CREATE FUNCTION public.financial_preparation_resource_v1(symbol text,exchange text,period_end date,source_url text,statement_kind text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE quarter integer;expected text;endpoint text;provider text;
BEGIN
 IF symbol!~'^[0-9]{4,6}$' OR exchange NOT IN('TWSE','TPEX') OR extract(year FROM period_end) NOT BETWEEN 2013 AND 2200
 OR to_char(period_end,'MM-DD') NOT IN('03-31','06-30','09-30','12-31') THEN RETURN NULL;END IF;
 quarter:=extract(quarter FROM period_end);
 expected:='https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id='||symbol||'&year='||extract(year FROM period_end)::integer||'&season='||quarter;
 IF source_url=expected THEN RETURN 'mops-attachment-v1';END IF;
 provider:=lower(exchange);
 FOR endpoint,expected IN SELECT * FROM(VALUES
 ('generalIncome',CASE exchange WHEN 'TWSE' THEN 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci' ELSE 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci' END),
 ('brokerIncome',CASE exchange WHEN 'TWSE' THEN 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_bd' ELSE 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_bd' END),
 ('generalBalance',CASE exchange WHEN 'TWSE' THEN 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci' ELSE 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci' END),
 ('brokerBalance',CASE exchange WHEN 'TWSE' THEN 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_bd' ELSE 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_bd' END)) v(endpoint,url) LOOP
  IF source_url=expected AND endpoint LIKE statement_kind||'%' THEN RETURN provider||'-'||endpoint||'-v1';END IF;
 END LOOP;
 RETURN NULL;
END $$;
-- Private gate remains under the original vnext owner. No old ACL is widened.
CREATE FUNCTION public.vnext_financial_preparation_scope_v1(operator text,stock uuid DEFAULT NULL,expected_input text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mode_row public.vnext_mode_v1;member public.vnext_members_v1;instrument record;
 mode_name text;policies jsonb;head_count integer;
BEGIN
 SELECT * INTO mode_row FROM public.vnext_mode_v1;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_preparation_mode_missing';END IF;
 mode_name:=CASE WHEN mode_row.enabled THEN 'vnext_on' ELSE 'legacy_off' END;
 IF mode_row.enabled THEN
  IF NOT mode_row.legacy_fenced OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 p WHERE p.principal=operator AND p.enabled AND p.role='operator')
  THEN RAISE EXCEPTION 'financial_preparation_active_operator_required';END IF;
 END IF;
 IF stock IS NULL THEN
  IF mode_row.enabled AND(SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited')>20 THEN RAISE EXCEPTION 'financial_preparation_pool_unbounded';END IF;
  RETURN jsonb_build_object('mode',mode_name,'poolStockIds',CASE WHEN mode_row.enabled THEN coalesce((SELECT jsonb_agg(public.vnext_forecast_stock_id_internal_v1(m.symbol) ORDER BY m.symbol) FROM public.vnext_members_v1 m WHERE m.state<>'exited'),'[]'::jsonb) ELSE NULL END);
 END IF;
 IF NOT mode_row.enabled THEN RETURN jsonb_build_object('mode',mode_name,'inputHash',NULL,'rightsHash',encode(sha256(convert_to(jsonb_build_object('stock',stock,'mode',mode_name,'purpose','existing_private_financial_preparation_v1')::text,'UTF8')),'hex'));END IF;
 IF mode_row.enabled THEN
  IF (SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited')>20 THEN RAISE EXCEPTION 'financial_preparation_pool_unbounded';END IF;
  SELECT * INTO member FROM public.vnext_members_v1 WHERE state<>'exited' AND public.vnext_forecast_stock_id_internal_v1(symbol)=stock FOR SHARE;
  IF member.symbol IS NULL OR expected_input IS NOT NULL AND member.input_hash IS DISTINCT FROM expected_input
  OR public.vnext_input_sources_current_v1(member.evidence,member.symbol) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'financial_preparation_current_admission_or_rights_required';END IF;
  -- Resolve the as-of head BEFORE active/common-stock filtering. Ties fail closed.
  SELECT instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at INTO instrument FROM public.stock_instruments_v3 i WHERE (i.stock_id=stock OR i.symbol=member.symbol)
   AND i.recorded_at<=clock_timestamp() AND i.source_timestamp<=clock_timestamp()
   ORDER BY i.recorded_at DESC,i.source_timestamp DESC LIMIT 1;
  SELECT count(*) INTO head_count FROM public.stock_instruments_v3 i WHERE (i.stock_id=stock OR i.symbol=member.symbol)
   AND i.recorded_at=instrument.recorded_at AND i.source_timestamp=instrument.source_timestamp;
  IF head_count<>1 OR instrument.stock_id IS DISTINCT FROM stock OR instrument.symbol IS DISTINCT FROM member.symbol
  OR instrument.listing_status IS DISTINCT FROM 'active' OR instrument.instrument_type IS DISTINCT FROM 'common_stock'
  OR instrument.exchange IS NULL OR instrument.exchange NOT IN('TWSE','TPEX') OR instrument.provider::text IS DISTINCT FROM lower(instrument.exchange::text) OR instrument.roster_version IS DISTINCT FROM 'tw-instrument-roster-v3.0'
  OR instrument.valid_from IS NULL OR instrument.valid_from>clock_timestamp() OR instrument.source_timestamp>instrument.recorded_at OR instrument.valid_to<=clock_timestamp()
  THEN RAISE EXCEPTION 'financial_preparation_current_instrument_required';END IF;
  PERFORM 1 FROM public.vnext_source_policies_v1 FOR SHARE;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY source,scope) INTO policies FROM public.vnext_source_policies_v1 p;
 END IF;
 RETURN jsonb_build_object('mode',mode_name,'inputHash',member.input_hash,
 'rightsHash',encode(sha256(convert_to(jsonb_build_object('mode',mode_name,'member',CASE WHEN mode_row.enabled THEN to_jsonb(member) ELSE NULL END,
 'instrument',CASE WHEN mode_row.enabled THEN to_jsonb(instrument) ELSE NULL END,'currentPolicies',policies,'purpose','existing_private_financial_preparation_v1')::text,'UTF8')),'hex'));
END $$;
ALTER FUNCTION public.vnext_financial_preparation_scope_v1(text,uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_preparation_scope_v1(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.financial_preparation_backend_v1(operator text,lease_owner uuid DEFAULT NULL,require_lease boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE backend uuid;headers jsonb;runner uuid;release text;scope jsonb;
BEGIN
 backend:=public.assert_stockinsider_backend_request_v1(require_lease);
 IF backend IS NULL THEN RAISE EXCEPTION 'financial_preparation_nonnull_backend_required';END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 runner:=(headers->>'x-stockinsider-runner-principal')::uuid;release:=headers->>'x-stockinsider-writer-release';
 IF NOT EXISTS(SELECT FROM public.production_writer_releases WHERE active AND writer_kind='vps' AND release_id=release)
 THEN RAISE EXCEPTION 'financial_preparation_active_release_required';END IF;
 IF require_lease THEN
  PERFORM 1 FROM public.production_write_leases WHERE lease_key='production-data-plane' AND owner_id=lease_owner AND expires_at>clock_timestamp() FOR SHARE;
  IF NOT FOUND OR lease_owner IS NULL THEN RAISE EXCEPTION 'financial_preparation_exact_owned_lease_required';END IF;
 END IF;
 scope:=public.vnext_financial_preparation_scope_v1(operator);
 RETURN jsonb_build_object('schemaVersion','financial-preparation-context-v1','mode',scope->>'mode','backendId',backend,'releaseId',release,'runnerPrincipal',runner);
END $$;
CREATE FUNCTION public.financial_preparation_attempt_dto_v1(a public.financial_preparation_attempts_v1) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('attemptId',a.attempt_id,'operation',a.operation,'mode',a.mode,'backendId',a.backend_id,'releaseId',a.release_id,'runnerPrincipal',a.runner_principal,
 'jobId',a.job_id,'receiptId',a.receipt_id,'stockId',a.stock_id,'symbol',a.symbol,'exchange',a.exchange,'statementKind',a.statement_kind,'periodEnd',a.period_end,
 'sourceUrl',a.source_url,'profile',a.profile,'memberInputHash',a.member_input_hash,'rightsBindingHash',a.rights_binding_hash,'deadline',a.deadline,'artifact',a.artifact)
$$;

CREATE FUNCTION public.vnext_financial_preparation_v1(p_operator text,p_command text,p_request jsonb,p_lease_owner uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE context jsonb;gate jsonb;a public.financial_preparation_attempts_v1;j public.candidate_financial_acquisition_jobs_v4;r public.candidate_financial_document_receipts_v6;
 commit_row public.financial_preparation_commits_v1;outcome public.financial_preparation_outcomes_v1;knowledge public.financial_preparation_knowledge_v1;
 stock public.stocks;requested_operation text;profile text;statement_kind text;attempt uuid;claimed record;receipt_result record;binding jsonb;artifact jsonb;subjects jsonb;payload jsonb;item jsonb;
 candidate_ids uuid[];endpoint text;pending jsonb:='[]'::jsonb;known jsonb:='[]'::jsonb;blocked integer:=0;scanned integer:=0;recovery record;inspected jsonb;hash text;bytes integer;media text;observed timestamptz;validation_row public.official_financial_validation_receipts;all_validated boolean;procedure_result boolean;status text;at timestamptz;fact_row public.opportunity_financial_facts_v3;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>4194304
 THEN RAISE EXCEPTION 'financial_preparation_envelope_invalid';END IF;
 IF p_command NOT IN('context','claim-acquire','claim-parse','recover-acquire','recover-parse','inspect','commit-check','commit-acquire','commit-parse','validation-write','validation-ack','finish','witness','settle-failure') THEN RAISE EXCEPTION 'financial_preparation_command_invalid';END IF;
 IF p_command NOT IN('context','inspect') THEN PERFORM pg_advisory_xact_lock(64221022);END IF;
 context:=public.financial_preparation_backend_v1(p_operator,p_lease_owner,p_command NOT IN('context','inspect'));
 IF p_command='context' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY[]::text[]) THEN RAISE EXCEPTION 'financial_preparation_closed_context';END IF;RETURN context;
 END IF;
 IF p_command IN('recover-acquire','recover-parse') THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['limit']) OR jsonb_typeof(p_request->'limit') IS DISTINCT FROM 'number' OR p_request->>'limit'!~'^[1-9][0-9]*$' OR(p_request->>'limit')::integer NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'financial_preparation_closed_recovery';END IF;
  requested_operation:=CASE p_command WHEN 'recover-acquire' THEN 'acquire' ELSE 'parse' END;
  FOR recovery IN SELECT attempt_row.attempt_id,attempt_row.backend_id,attempt_row.release_id,attempt_row.mode,attempt_row.operator_principal,k.available_at,o.status
   FROM public.financial_preparation_attempts_v1 attempt_row LEFT JOIN public.financial_preparation_commits_v1 c USING(attempt_id)
   LEFT JOIN public.financial_preparation_outcomes_v1 o USING(attempt_id) LEFT JOIN public.financial_preparation_knowledge_v1 k USING(attempt_id)
   WHERE attempt_row.operation=requested_operation AND k.attempt_id IS NULL AND(c.attempt_id IS NOT NULL OR o.attempt_id IS NOT NULL) ORDER BY coalesce(o.recorded_at,c.recorded_at),attempt_row.attempt_id LIMIT 41 LOOP
   scanned:=scanned+1;IF scanned>40 THEN blocked:=blocked+1;EXIT;END IF;
   IF recovery.backend_id::text IS DISTINCT FROM context->>'backendId' OR recovery.release_id IS DISTINCT FROM context->>'releaseId' OR recovery.mode IS DISTINCT FROM context->>'mode' OR recovery.operator_principal IS DISTINCT FROM p_operator THEN
    IF recovery.available_at IS NULL THEN blocked:=blocked+1;END IF;CONTINUE;
   END IF;
   BEGIN
    inspected:=public.vnext_financial_preparation_v1(p_operator,'inspect',jsonb_build_object('attemptId',recovery.attempt_id),NULL);
   EXCEPTION WHEN OTHERS THEN blocked:=blocked+1;CONTINUE;END;
   IF jsonb_array_length(pending)<(p_request->>'limit')::integer THEN
    SELECT * INTO a FROM public.financial_preparation_attempts_v1 WHERE attempt_id=recovery.attempt_id;
    pending:=pending||jsonb_build_array(jsonb_build_object('attempt',public.financial_preparation_attempt_dto_v1(a),'commit',inspected->'commit','state',inspected->>'state'));
   END IF;
  END LOOP;
  -- Ordinary successful history is a separate bounded read, never a backlog.
  FOR recovery IN SELECT attempt_row.attempt_id,k.available_at,o.status FROM public.financial_preparation_attempts_v1 attempt_row
   JOIN public.financial_preparation_outcomes_v1 o USING(attempt_id) JOIN public.financial_preparation_knowledge_v1 k USING(attempt_id)
   WHERE attempt_row.operation=requested_operation AND attempt_row.backend_id::text=context->>'backendId' AND attempt_row.release_id=context->>'releaseId'
   AND attempt_row.mode=context->>'mode' AND attempt_row.operator_principal IS NOT DISTINCT FROM p_operator
   ORDER BY k.available_at DESC,attempt_row.attempt_id LIMIT 20 LOOP
   BEGIN inspected:=public.vnext_financial_preparation_v1(p_operator,'inspect',jsonb_build_object('attemptId',recovery.attempt_id),NULL);
   EXCEPTION WHEN OTHERS THEN CONTINUE;END;
   known:=known||jsonb_build_array(jsonb_build_object('attemptId',recovery.attempt_id,'status',recovery.status,'availableAt',recovery.available_at));
  END LOOP;
  RETURN jsonb_build_object('context',context,'pending',pending,'known',known,'blockedCount',blocked);
 END IF;
 IF p_command IN('claim-acquire','claim-parse') THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['limit']) OR jsonb_typeof(p_request->'limit') IS DISTINCT FROM 'number' OR p_request->>'limit'!~'^[1-9][0-9]*$' OR(p_request->>'limit')::integer NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'financial_preparation_closed_claim';END IF;
  requested_operation:=CASE p_command WHEN 'claim-acquire' THEN 'acquire' ELSE 'parse' END;
  gate:=public.vnext_financial_preparation_scope_v1(p_operator);attempt:=gen_random_uuid();at:=clock_timestamp();
  IF requested_operation='acquire' THEN
   SELECT array_agg(stock_id) INTO candidate_ids FROM(
    SELECT job.stock_id,min(job.created_at) first_job FROM public.candidate_financial_acquisition_jobs_v4 job
    WHERE job.endpoint_key IN('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance')
    AND((job.status='queued' AND(job.next_attempt_at IS NULL OR job.next_attempt_at<=at)) OR(job.status='running' AND job.lease_expires_at<at))
    AND(context->>'mode'='legacy_off' OR job.stock_id IN(SELECT value::uuid FROM jsonb_array_elements_text(gate->'poolStockIds')))
    GROUP BY job.stock_id ORDER BY first_job,job.stock_id LIMIT 240) bounded;
   FOREACH endpoint IN ARRAY ARRAY['mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance'] LOOP
    -- Original claim owns fairness, pending linked receipts and retry selection.
    SELECT * INTO claimed FROM public.claim_candidate_financial_acquisition_jobs_v4(coalesce(candidate_ids,ARRAY[]::uuid[]),endpoint,1,attempt::text,at,at+interval '90 seconds');
    IF claimed.job_id IS NOT NULL THEN SELECT * INTO j FROM public.candidate_financial_acquisition_jobs_v4 WHERE job_id=claimed.job_id;EXIT;END IF;
   END LOOP;
   IF j.job_id IS NULL THEN RETURN jsonb_build_object('context',context,'attempts','[]'::jsonb);END IF;
   SELECT * INTO stock FROM public.stocks WHERE id=j.stock_id;
  ELSE
   SELECT receipt.* INTO r FROM public.candidate_financial_document_receipts_v6 receipt JOIN public.stocks s ON s.id=receipt.stock_id
    WHERE(receipt.parser_status='queued' OR(receipt.parser_status='running' AND receipt.parser_lease_expires_at<clock_timestamp()))
    AND(context->>'mode'='legacy_off' OR receipt.stock_id IN(SELECT value::uuid FROM jsonb_array_elements_text(gate->'poolStockIds')))
    ORDER BY receipt.accepted_at,receipt.receipt_id FOR UPDATE OF receipt SKIP LOCKED LIMIT 1;
   IF r.receipt_id IS NULL THEN
    IF EXISTS(SELECT FROM public.candidate_financial_document_receipts_v6 receipt
      WHERE receipt.parser_status='complete' AND receipt.financial_validation_status='pending'
      AND(context->>'mode'='legacy_off' OR receipt.stock_id IN(SELECT value::uuid FROM jsonb_array_elements_text(gate->'poolStockIds')))
      AND NOT EXISTS(SELECT FROM public.financial_preparation_commits_v1 c WHERE c.receipt_id=receipt.receipt_id))
    THEN RAISE EXCEPTION 'financial_preparation_legacy_validation_bridge_missing';END IF;
    RETURN jsonb_build_object('context',context,'attempts','[]'::jsonb);
   END IF;
   SELECT * INTO stock FROM public.stocks WHERE id=r.stock_id;
  END IF;
  statement_kind:=CASE WHEN coalesce(stock.name,'')||' '||coalesce(stock.sector,'') ~* '(證券|期貨|securities|futures)' THEN 'broker' ELSE 'general' END;
  profile:=public.financial_preparation_resource_v1(stock.symbol,CASE requested_operation WHEN 'acquire' THEN j.exchange ELSE r.exchange END,
   CASE requested_operation WHEN 'acquire' THEN j.period_end ELSE r.period_end END,CASE requested_operation WHEN 'acquire' THEN j.source_url ELSE r.source_url END,statement_kind);
  IF profile IS NULL OR(requested_operation='parse' AND profile<>'mops-attachment-v1') THEN RAISE EXCEPTION 'financial_preparation_resource_unmapped';END IF;
  gate:=public.vnext_financial_preparation_scope_v1(p_operator,stock.id);
  IF requested_operation='acquire' THEN
   binding:=jsonb_build_object('jobId',j.job_id,'stockId',j.stock_id,'exchange',j.exchange,'endpointKey',j.endpoint_key,'periodEnd',j.period_end,'cursorKey',j.cursor_key,'sourceUrl',j.source_url,'requiredFactKeys',j.required_fact_keys);
  ELSE
   UPDATE public.candidate_financial_document_receipts_v6 SET parser_status='running',parser_owner=attempt::text,parser_lease_expires_at=at+interval '90 seconds' WHERE receipt_id=r.receipt_id AND(parser_status='queued' OR parser_lease_expires_at<at);
   IF NOT FOUND THEN RAISE EXCEPTION 'financial_preparation_parser_claim_lost';END IF;
   binding:=jsonb_build_object('receiptId',r.receipt_id,'stockId',r.stock_id,'jobId',r.acquisition_job_id,'sourceUrl',r.source_url,'periodEnd',r.period_end,'exchange',r.exchange,'hash',r.document_sha256,'objectKey',r.object_key,'bytes',r.byte_length,'mediaType',r.content_type);
   artifact:=jsonb_build_object('hash',r.document_sha256,'bytes',r.byte_length,'mediaType',r.content_type,'objectKey',r.object_key);
  END IF;
  INSERT INTO public.financial_preparation_attempts_v1 VALUES(attempt,requested_operation,context->>'mode',p_operator,(context->>'backendId')::uuid,context->>'releaseId',(context->>'runnerPrincipal')::uuid,
   CASE requested_operation WHEN 'acquire' THEN j.job_id ELSE r.acquisition_job_id END,CASE requested_operation WHEN 'parse' THEN r.receipt_id ELSE NULL END,stock.id,stock.symbol,
   CASE requested_operation WHEN 'acquire' THEN j.exchange ELSE r.exchange END,statement_kind,CASE requested_operation WHEN 'acquire' THEN j.period_end ELSE r.period_end END,
   CASE requested_operation WHEN 'acquire' THEN j.source_url ELSE r.source_url END,profile,binding,gate->>'inputHash',
   encode(sha256(convert_to(jsonb_build_object('scope',gate,'profile',profile,'source',CASE requested_operation WHEN 'acquire' THEN j.source_url ELSE r.source_url END)::text,'UTF8')),'hex'),artifact,at,at+interval '90 seconds') RETURNING * INTO a;
  RETURN jsonb_build_object('context',context,'attempts',jsonb_build_array(public.financial_preparation_attempt_dto_v1(a)));
 END IF;
 IF p_request->>'attemptId' IS NULL THEN RAISE EXCEPTION 'financial_preparation_attempt_required';END IF;
 SELECT * INTO a FROM public.financial_preparation_attempts_v1 WHERE attempt_id=(p_request->>'attemptId')::uuid FOR SHARE;
 IF a.attempt_id IS NULL OR a.backend_id::text IS DISTINCT FROM context->>'backendId' OR a.release_id IS DISTINCT FROM context->>'releaseId' OR a.runner_principal::text IS DISTINCT FROM context->>'runnerPrincipal'
 OR a.mode IS DISTINCT FROM context->>'mode' OR a.operator_principal IS DISTINCT FROM p_operator THEN RAISE EXCEPTION 'financial_preparation_attempt_context_changed';END IF;
 gate:=public.vnext_financial_preparation_scope_v1(p_operator,a.stock_id,a.member_input_hash);
 hash:=encode(sha256(convert_to(jsonb_build_object('scope',gate,'profile',a.profile,'source',a.source_url)::text,'UTF8')),'hex');
 IF hash IS DISTINCT FROM a.rights_binding_hash OR public.financial_preparation_resource_v1(a.symbol,a.exchange,a.period_end,a.source_url,a.statement_kind) IS DISTINCT FROM a.profile
 THEN RAISE EXCEPTION 'financial_preparation_current_rights_or_resource_changed';END IF;
 SELECT * INTO commit_row FROM public.financial_preparation_commits_v1 WHERE attempt_id=a.attempt_id;
 SELECT * INTO outcome FROM public.financial_preparation_outcomes_v1 WHERE attempt_id=a.attempt_id;
 SELECT * INTO knowledge FROM public.financial_preparation_knowledge_v1 WHERE attempt_id=a.attempt_id;
 IF p_command='inspect' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId']) THEN RAISE EXCEPTION 'financial_preparation_closed_inspection';END IF;
  RETURN jsonb_build_object('context',context,'attemptId',a.attempt_id,'state',CASE WHEN knowledge.attempt_id IS NOT NULL THEN 'known' WHEN outcome.attempt_id IS NOT NULL THEN 'finished' WHEN commit_row.attempt_id IS NOT NULL THEN 'committed' WHEN a.deadline<=clock_timestamp() THEN 'expired' ELSE 'claimed' END,
   'commit',CASE WHEN commit_row.attempt_id IS NULL THEN NULL ELSE jsonb_build_object('attemptId',a.attempt_id,'receiptId',commit_row.receipt_id,'subjectIdentities',commit_row.subject_identities) END);
 END IF;
 IF p_command IN('commit-check','commit-acquire','commit-parse','settle-failure') AND commit_row.attempt_id IS NULL THEN
  IF a.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'financial_preparation_claim_expired';END IF;
  IF a.operation='acquire' THEN
   SELECT * INTO j FROM public.candidate_financial_acquisition_jobs_v4 WHERE job_id=a.job_id FOR UPDATE;
   binding:=jsonb_build_object('jobId',j.job_id,'stockId',j.stock_id,'exchange',j.exchange,'endpointKey',j.endpoint_key,'periodEnd',j.period_end,'cursorKey',j.cursor_key,'sourceUrl',j.source_url,'requiredFactKeys',j.required_fact_keys);
   IF j.status IS DISTINCT FROM 'running' OR j.lease_owner IS DISTINCT FROM a.attempt_id::text OR j.lease_expires_at<=clock_timestamp() OR binding IS DISTINCT FROM a.job_binding THEN RAISE EXCEPTION 'financial_preparation_exact_job_owner_required';END IF;
  ELSE
   SELECT * INTO r FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id=a.receipt_id FOR UPDATE;
   binding:=jsonb_build_object('receiptId',r.receipt_id,'stockId',r.stock_id,'jobId',r.acquisition_job_id,'sourceUrl',r.source_url,'periodEnd',r.period_end,'exchange',r.exchange,'hash',r.document_sha256,'objectKey',r.object_key,'bytes',r.byte_length,'mediaType',r.content_type);
   IF r.parser_status IS DISTINCT FROM 'running' OR r.parser_owner IS DISTINCT FROM a.attempt_id::text OR r.parser_lease_expires_at<=clock_timestamp() OR binding IS DISTINCT FROM a.job_binding THEN RAISE EXCEPTION 'financial_preparation_exact_parser_owner_required';END IF;
  END IF;
 END IF;
 IF p_command='commit-check' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId']) OR commit_row.attempt_id IS NOT NULL THEN RAISE EXCEPTION 'financial_preparation_closed_commit_check';END IF;
  RETURN jsonb_build_object('context',context,'attemptId',a.attempt_id,'state','claimed','commit',NULL);
 ELSIF p_command IN('commit-acquire','commit-parse') THEN
  IF p_command IS DISTINCT FROM 'commit-'||a.operation THEN RAISE EXCEPTION 'financial_preparation_operation_changed';END IF;
  IF NOT public.financial_preparation_exact_v1(p_request,CASE a.operation WHEN 'acquire' THEN ARRAY['attemptId','artifactHash','byteLength','mediaType','observedAt','facts'] ELSE ARRAY['attemptId','artifactHash','byteLength','mediaType','observedAt','payload'] END)
  THEN RAISE EXCEPTION 'financial_preparation_closed_commit';END IF;
  hash:=p_request->>'artifactHash';bytes:=(p_request->>'byteLength')::integer;media:=p_request->>'mediaType';observed:=(p_request->>'observedAt')::timestamptz;
  IF hash IS NULL OR bytes IS NULL OR media IS NULL OR observed IS NULL OR hash!~'^[a-f0-9]{64}$' OR bytes NOT BETWEEN 1 AND CASE a.operation WHEN 'acquire' THEN 12000000 ELSE 52428800 END OR observed<a.claimed_at OR observed>clock_timestamp()
  OR(a.operation='parse' AND(hash IS DISTINCT FROM a.artifact->>'hash' OR bytes IS DISTINCT FROM(a.artifact->>'bytes')::integer OR media IS DISTINCT FROM a.artifact->>'mediaType')) THEN RAISE EXCEPTION 'financial_preparation_raw_binding_invalid';END IF;
  IF commit_row.attempt_id IS NOT NULL THEN
   IF commit_row.payload_hash IS DISTINCT FROM encode(sha256(convert_to(p_request::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'financial_preparation_commit_conflict';END IF;
   RETURN jsonb_build_object('attemptId',a.attempt_id,'receiptId',commit_row.receipt_id,'subjectIdentities',commit_row.subject_identities);
  END IF;
  PERFORM * FROM public.register_private_artifact_receipt_v1(hash,bytes,media,'financial_document',jsonb_build_object('storage','private_hash_store_v1','financialPreparationAttempt',a.attempt_id));
  IF a.operation='acquire' AND a.profile='mops-attachment-v1' THEN
   IF p_request->'facts' IS DISTINCT FROM 'null'::jsonb OR media NOT IN('application/xhtml+xml','application/xml','text/xml','text/html') THEN RAISE EXCEPTION 'financial_preparation_mops_document_required';END IF;
   SELECT * INTO receipt_result FROM public.record_candidate_financial_document_receipt_v6(a.stock_id,a.job_id,a.source_url,a.exchange,a.period_end,NULL,media,hash,'issuer/'||a.stock_id||'/'||a.period_end||'/'||hash,bytes,jsonb_build_object('writer_release_id',a.release_id,'acquisition','official_download','publication_time_basis','unknown_first_observed_is_available_at'));
   subjects:='[]'::jsonb;
  ELSE
   IF a.operation='parse' THEN
    payload:=p_request->'payload';
    IF NOT public.financial_preparation_exact_v1(payload,ARRAY['facts','locators','evidence','missing','rejections']) OR payload->'evidence'->>'documentSha256' IS DISTINCT FROM hash THEN RAISE EXCEPTION 'financial_preparation_closed_parser_protocol';END IF;
   ELSE payload:=jsonb_build_object('facts',p_request->'facts');END IF;
   IF jsonb_typeof(payload->'facts') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'facts')>128 THEN RAISE EXCEPTION 'financial_preparation_fact_bounds';END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(payload->'facts') LOOP
    IF item->'input'->>'stock_id' IS DISTINCT FROM a.stock_id::text OR item->'input'->>'period_end' IS DISTINCT FROM a.period_end::text
    OR item->'input'->>'provider' IS DISTINCT FROM CASE WHEN a.profile='mops-attachment-v1' THEN 'mops' ELSE lower(a.exchange) END
    OR item->'input'->>'authority_tier' IS DISTINCT FROM 'official_filing' OR item->'input'->>'estimate_kind' IS DISTINCT FROM 'reported' OR item->'input'->>'estimate_horizon' IS DISTINCT FROM 'reported_period'
    OR(item->'input'->>'collected_at')::timestamptz IS DISTINCT FROM observed OR(item->'input'->>'source_timestamp')::timestamptz>observed
    THEN RAISE EXCEPTION 'financial_preparation_fact_source_period_binding';END IF;
   END LOOP;
   IF a.operation='acquire' THEN
    IF media IS DISTINCT FROM 'application/json' OR jsonb_array_length(payload->'facts')=0 THEN RAISE EXCEPTION 'financial_preparation_full_json_required';END IF;
    PERFORM * FROM public.complete_candidate_financial_acquisition_job_v4(a.job_id,a.attempt_id::text,a.runner_principal,payload->'facts',hash,bytes,observed);
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('factId',f.fact_id,'recordedAt',f.recorded_at)),'[]'::jsonb) INTO subjects
     FROM public.candidate_financial_fact_provenance_v4 p JOIN public.opportunity_financial_facts_v3 f ON f.fact_id=p.fact_id WHERE p.acquisition_job_id=a.job_id AND p.source_sha256=hash AND f.stock_id=a.stock_id AND f.period_end=a.period_end;
   ELSE
    IF payload->'evidence'->>'schema'='candidate-financial-parser-evidence-v10' THEN
     PERFORM * FROM public.complete_candidate_financial_document_receipt_parser_v10(a.receipt_id,a.attempt_id::text,a.runner_principal,payload->'facts',payload->'locators',payload->'evidence',payload->'missing',payload->'rejections',observed);
    ELSIF payload->'evidence'->>'schema'='candidate-financial-parser-evidence-v8' THEN
     PERFORM * FROM public.complete_candidate_financial_document_receipt_parser_v8(a.receipt_id,a.attempt_id::text,a.runner_principal,payload->'facts',payload->'locators',payload->'evidence',payload->'missing',payload->'rejections',observed);
    ELSE RAISE EXCEPTION 'financial_preparation_existing_parser_protocol_required';END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('factId',fact_id,'recordedAt',fact_recorded_at)),'[]'::jsonb) INTO subjects FROM public.candidate_financial_document_fact_links_v8 WHERE receipt_id=a.receipt_id;
   END IF;
  END IF;
  IF clock_timestamp()>a.deadline THEN RAISE EXCEPTION 'financial_preparation_commit_deadline';END IF;
  INSERT INTO public.financial_preparation_commits_v1(attempt_id,artifact_hash,receipt_id,subject_identities,payload_hash,observed_at)
   VALUES(a.attempt_id,hash,CASE WHEN a.operation='parse' THEN a.receipt_id WHEN a.profile='mops-attachment-v1' THEN receipt_result.receipt_id ELSE NULL END,subjects,encode(sha256(convert_to(p_request::text,'UTF8')),'hex'),observed) RETURNING * INTO commit_row;
  RETURN jsonb_build_object('attemptId',a.attempt_id,'receiptId',commit_row.receipt_id,'subjectIdentities',commit_row.subject_identities);
 ELSIF p_command IN('validation-write','validation-ack') THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId','payload']) OR commit_row.attempt_id IS NULL OR outcome.attempt_id IS NOT NULL THEN RAISE EXCEPTION 'financial_preparation_validation_not_bound';END IF;
  payload:=p_request->'payload';
  IF NOT public.financial_preparation_exact_v1(payload,CASE p_command WHEN 'validation-write' THEN ARRAY['p_fact_id','p_recorded_at','p_source_sha256','p_input_hash','p_validation','p_validator_principal'] ELSE ARRAY['p_fact_id','p_recorded_at','p_source_sha256','p_input_hash'] END)
  OR(p_command='validation-write' AND payload->>'p_validator_principal' IS DISTINCT FROM a.runner_principal::text) OR payload->>'p_source_sha256' IS DISTINCT FROM commit_row.artifact_hash
  OR NOT EXISTS(SELECT FROM jsonb_array_elements(commit_row.subject_identities) s WHERE s->>'factId'=payload->>'p_fact_id' AND(s->>'recordedAt')::timestamptz=(payload->>'p_recorded_at')::timestamptz)
  THEN RAISE EXCEPTION 'financial_preparation_exact_validation_subject_required';END IF;
  SELECT * INTO fact_row FROM public.opportunity_financial_facts_v3 WHERE fact_id=(payload->>'p_fact_id')::uuid AND recorded_at=(payload->>'p_recorded_at')::timestamptz FOR SHARE;
  IF fact_row.stock_id IS DISTINCT FROM a.stock_id OR fact_row.period_end IS DISTINCT FROM a.period_end THEN RAISE EXCEPTION 'financial_preparation_validation_fact_drift';END IF;
  IF p_command='validation-write' THEN
   procedure_result:=public.record_official_financial_validation(fact_row.fact_id,fact_row.recorded_at,payload->>'p_source_sha256',payload->>'p_input_hash',payload->'p_validation',a.runner_principal);
  ELSE procedure_result:=true;END IF;
  SELECT * INTO validation_row FROM public.official_financial_validation_receipts WHERE fact_id=fact_row.fact_id AND validator_version='official-financial-v2' AND validator_principal IS NOT NULL ORDER BY validated_at DESC,receipt_sequence DESC LIMIT 1;
  IF procedure_result THEN
   IF validation_row.receipt_sequence IS NULL OR validation_row.source_sha256 IS DISTINCT FROM commit_row.artifact_hash OR validation_row.input_hash IS DISTINCT FROM payload->>'p_input_hash'
   OR validation_row.effective_validation->>'validation_status' IS DISTINCT FROM 'validated' OR validation_row.effective_validation->>'schema_valid' IS DISTINCT FROM 'true'
   OR validation_row.effective_validation->>'unit_valid' IS DISTINCT FROM 'true' OR validation_row.effective_validation->>'point_in_time_valid' IS DISTINCT FROM 'true' OR validation_row.effective_validation->>'consistency_valid' IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'financial_preparation_current_validation_receipt_required';END IF;
   INSERT INTO public.financial_preparation_validations_v1(attempt_id,fact_id,fact_recorded_at,input_hash,receipt_id,receipt_sequence) VALUES(a.attempt_id,fact_row.fact_id,fact_row.recorded_at,validation_row.input_hash,validation_row.id,validation_row.receipt_sequence) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('procedureResult',procedure_result);
 ELSIF p_command='finish' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId']) OR commit_row.attempt_id IS NULL THEN RAISE EXCEPTION 'financial_preparation_finish_not_committed';END IF;
  IF outcome.attempt_id IS NOT NULL THEN RETURN jsonb_build_object('attemptId',a.attempt_id,'status',outcome.status);END IF;
  all_validated:=jsonb_array_length(commit_row.subject_identities)>0 AND NOT EXISTS(
   SELECT FROM jsonb_array_elements(commit_row.subject_identities) subject LEFT JOIN LATERAL(
    SELECT v.receipt_sequence FROM public.official_financial_validation_receipts v
    JOIN public.financial_preparation_validations_v1 link ON link.attempt_id=a.attempt_id AND link.fact_id=v.fact_id AND link.fact_recorded_at=(subject->>'recordedAt')::timestamptz AND link.receipt_id=v.id AND link.receipt_sequence=v.receipt_sequence AND link.input_hash=v.input_hash
    WHERE v.fact_id=(subject->>'factId')::uuid AND v.source_sha256=commit_row.artifact_hash AND v.validator_version='official-financial-v2' AND v.validator_principal IS NOT NULL
     AND v.effective_validation->>'validation_status'='validated' AND v.effective_validation->>'schema_valid'='true' AND v.effective_validation->>'unit_valid'='true' AND v.effective_validation->>'point_in_time_valid'='true' AND v.effective_validation->>'consistency_valid'='true'
     AND NOT EXISTS(SELECT FROM public.official_financial_validation_receipts newer WHERE newer.fact_id=v.fact_id AND newer.validator_version='official-financial-v2' AND newer.validator_principal IS NOT NULL AND(newer.validated_at,newer.receipt_sequence)>(v.validated_at,v.receipt_sequence))
   ) bound ON true WHERE bound.receipt_sequence IS NULL);
  status:='partial';
  IF a.operation='acquire' AND a.profile='mops-attachment-v1' THEN status:='acquired_pending_parse';
  ELSIF commit_row.receipt_id IS NOT NULL THEN
   PERFORM * FROM public.finalize_candidate_financial_document_validation_v8(commit_row.receipt_id,a.runner_principal,clock_timestamp());
   -- Keep the existing per-document links/required fields; never combine filings.
   FOR item IN SELECT to_jsonb(l) FROM public.candidate_financial_document_job_links_v9 l WHERE receipt_id=commit_row.receipt_id LOOP
    PERFORM * FROM public.reconcile_candidate_financial_document_job_v9(commit_row.receipt_id,(item->>'job_id')::uuid,a.runner_principal);
   END LOOP;
   SELECT * INTO r FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id=commit_row.receipt_id;
   status:=CASE WHEN r.receipt_status='rejected' THEN 'rejected' WHEN r.receipt_status='accepted' AND r.financial_validation_status='validated' AND r.missing_requirements='[]'::jsonb AND all_validated THEN 'validated' ELSE 'partial' END;
  ELSIF all_validated THEN status:='validated';END IF;
  INSERT INTO public.financial_preparation_outcomes_v1(attempt_id,status) VALUES(a.attempt_id,status);
  RETURN jsonb_build_object('attemptId',a.attempt_id,'status',status);
 ELSIF p_command='witness' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId']) OR outcome.attempt_id IS NULL OR outcome.created_xid=txid_current() THEN RAISE EXCEPTION 'financial_preparation_separate_committed_outcome_required';END IF;
  -- Observe the committed result before sampling the DB clock. No client clock.
  SELECT * INTO outcome FROM public.financial_preparation_outcomes_v1 WHERE attempt_id=a.attempt_id FOR SHARE;at:=clock_timestamp();
  INSERT INTO public.financial_preparation_knowledge_v1(attempt_id,outcome_xid,known_at,available_at)
   VALUES(a.attempt_id,outcome.created_xid,at,greatest(at,outcome.recorded_at,commit_row.observed_at,commit_row.recorded_at)) ON CONFLICT DO NOTHING;
  SELECT * INTO knowledge FROM public.financial_preparation_knowledge_v1 WHERE attempt_id=a.attempt_id;
  RETURN jsonb_build_object('attemptId',a.attempt_id,'status',outcome.status,'availableAt',knowledge.available_at);
 ELSIF p_command='settle-failure' THEN
  IF NOT public.financial_preparation_exact_v1(p_request,ARRAY['attemptId','reason']) OR commit_row.attempt_id IS NOT NULL OR outcome.attempt_id IS NOT NULL
  OR jsonb_typeof(p_request->'reason') IS DISTINCT FROM 'string' OR p_request->>'reason' NOT IN('official_transport_failed','official_schema_unrecognized','parser_unavailable','artifact_integrity_failed','requested_period_missing') THEN RAISE EXCEPTION 'financial_preparation_closed_failure';END IF;
  IF p_request->>'reason'='requested_period_missing' THEN
   -- A mapped complete JSON response without this requested period is a
   -- coverage deferral, not transport failure or an authoritative empty filing.
   IF a.operation<>'acquire' OR a.profile='mops-attachment-v1' THEN RAISE EXCEPTION 'financial_preparation_period_deferral_profile';END IF;
   UPDATE public.candidate_financial_acquisition_jobs_v4 SET status='queued',lease_owner=NULL,lease_expires_at=NULL,terminal_reason=NULL,
    terminal_detail='requested_period_missing',next_attempt_at=clock_timestamp()+interval '6 hours',updated_at=clock_timestamp()
    WHERE job_id=a.job_id AND status='running' AND lease_owner=a.attempt_id::text;
   IF NOT FOUND THEN RAISE EXCEPTION 'financial_preparation_exact_job_owner_required';END IF;
  ELSIF a.operation='acquire' THEN PERFORM * FROM public.fail_candidate_financial_acquisition_job_v6(a.job_id,a.attempt_id::text,p_request->>'reason',clock_timestamp(),true,false);
  ELSE UPDATE public.candidate_financial_document_receipts_v6 SET parser_status='queued',parser_owner=NULL,parser_lease_expires_at=NULL WHERE receipt_id=a.receipt_id AND parser_owner=a.attempt_id::text;END IF;
  INSERT INTO public.financial_preparation_outcomes_v1(attempt_id,status) VALUES(a.attempt_id,'deferred');RETURN jsonb_build_object('attemptId',a.attempt_id,'status','deferred');
 END IF;
 RAISE EXCEPTION 'financial_preparation_command_unhandled';
END $$;
DO $owners$
DECLARE owner_name text;f record;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public.private_artifact_receipts_v1'::regclass;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_financial_preparation_scope_v1(text,uuid,text) TO %I',owner_name);
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN('financial_preparation_immutable_v1','financial_preparation_exact_v1','financial_preparation_resource_v1','financial_preparation_backend_v1','financial_preparation_attempt_dto_v1','vnext_financial_preparation_v1') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',f.signature,owner_name);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $owners$;
GRANT EXECUTE ON FUNCTION public.vnext_financial_preparation_v1(text,text,jsonb,uuid) TO service_role;
COMMIT;
