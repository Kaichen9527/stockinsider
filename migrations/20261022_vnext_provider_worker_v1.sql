BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
-- Additive candidate only. Existing admission/publication routines are unchanged.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('public.vnext_command_v1(text,text,jsonb)') AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND p.prosecdef
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='328cb1ed871d94dcb92ca67759eb731ca9082db99547de2b5eb3b62794798af5') THEN RAISE EXCEPTION 'vnext_worker_core_predecessor_changed'; END IF;
 IF to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') IS NULL OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE legacy_fenced) THEN RAISE EXCEPTION 'vnext_worker_legacy_fence_required'; END IF;
END $$;
CREATE TABLE public.vnext_provider_bindings_v1(principal text PRIMARY KEY REFERENCES public.vnext_principals_v1,task text NOT NULL CHECK(task IN('author','reviewer')),provider text NOT NULL CHECK(provider='openai-responses'),
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160),model_version text NOT NULL CHECK(length(model_version) BETWEEN 1 AND 160),credential_identity text NOT NULL CHECK(credential_identity ~ '^[a-f0-9]{64}$'),
 prompt_version text NOT NULL CHECK(prompt_version='vnext-research-worker-v1'),instructions text NOT NULL CHECK(length(instructions) BETWEEN 100 AND 16000),enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.vnext_provider_invocations_v1(invocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.vnext_jobs_v1,task text NOT NULL CHECK(task IN('author','reviewer')),
 execution_id uuid NOT NULL,principal text NOT NULL,input_hash text NOT NULL,provider text NOT NULL,model text NOT NULL,model_version text NOT NULL,credential_identity text NOT NULL,prompt_version text NOT NULL,
 frozen_request jsonb NOT NULL,request_hash text NOT NULL,state text NOT NULL CHECK(state IN('dispatching','uncertain','pending','completed','failed')),
 provider_response_id text,raw_response jsonb,raw_output jsonb,normalized_output jsonb,error text,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,settled_at timestamptz,
 UNIQUE(job_id,task));
CREATE UNIQUE INDEX vnext_provider_response_identity_v1 ON public.vnext_provider_invocations_v1(provider,provider_response_id) WHERE provider_response_id IS NOT NULL;
CREATE TABLE public.vnext_provider_events_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,invocation_id uuid REFERENCES public.vnext_provider_invocations_v1,principal text NOT NULL,event text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['vnext_provider_bindings_v1','vnext_provider_invocations_v1','vnext_provider_events_v1'] LOOP
 EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',t);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',t);
 END LOOP; END $$;
CREATE FUNCTION public.vnext_provider_envelope_v1(value jsonb,depth integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE item jsonb;
BEGIN
 IF value IS NULL OR depth>12 OR depth=0 AND octet_length(convert_to(value::text,'UTF8'))>1048576 THEN RETURN false; END IF;
 IF jsonb_typeof(value)='array' THEN FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP IF NOT public.vnext_provider_envelope_v1(item,depth+1) THEN RETURN false; END IF; END LOOP;
 ELSIF jsonb_typeof(value)='object' THEN FOR item IN SELECT member FROM jsonb_each(value) field(key,member) LOOP IF NOT public.vnext_provider_envelope_v1(item,depth+1) THEN RETURN false; END IF; END LOOP; END IF; RETURN true;
END $$;
ALTER FUNCTION public.vnext_provider_envelope_v1(jsonb,integer) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_provider_envelope_v1(jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_provider_json_codec_v1(value jsonb,depth integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; numeric_value numeric; field record;
BEGIN
 IF depth>12 THEN RETURN false; END IF;
 IF jsonb_typeof(value)='number' THEN numeric_value:=(value::text)::numeric; RETURN numeric_value=0 OR abs(numeric_value)>=0.000001 AND abs(numeric_value)<1000000000000000000000;
 ELSIF jsonb_typeof(value)='array' THEN FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP IF NOT public.vnext_provider_json_codec_v1(item,depth+1) THEN RETURN false; END IF; END LOOP;
 ELSIF jsonb_typeof(value)='object' THEN FOR field IN SELECT * FROM jsonb_each(value) LOOP IF field.key !~ '^[A-Za-z][A-Za-z0-9]*$' OR NOT public.vnext_provider_json_codec_v1(field.value,depth+1) THEN RETURN false; END IF; END LOOP; END IF; RETURN true;
END $$;
ALTER FUNCTION public.vnext_provider_json_codec_v1(jsonb,integer) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_provider_json_codec_v1(jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_provider_command_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE actor text; j public.vnext_jobs_v1; member public.vnext_members_v1; binding public.vnext_provider_bindings_v1; invocation public.vnext_provider_invocations_v1; document jsonb; request jsonb; normalized jsonb; expected_execution uuid; result jsonb; role_task text;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_worker_request_too_large'; END IF;
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) THEN RAISE EXCEPTION 'vnext_database_mode_not_enabled'; END IF;
 SELECT role INTO actor FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled;
 IF actor NOT IN('author','reviewer') OR actor IS NULL THEN RAISE EXCEPTION 'vnext_worker_role_required'; END IF;
 SELECT * INTO binding FROM public.vnext_provider_bindings_v1 WHERE principal=p_principal AND task=actor AND enabled;
 IF binding.principal IS NULL THEN RAISE EXCEPTION 'vnext_provider_binding_missing'; END IF;
 IF p_command='binding' THEN RETURN to_jsonb(binding); END IF;
 SELECT * INTO j FROM public.vnext_jobs_v1 WHERE job_id=(p_request->>'jobId')::uuid FOR UPDATE;
 IF j.job_id IS NULL THEN RAISE EXCEPTION 'vnext_job_missing'; END IF;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=j.symbol;
 IF p_command='inspect' THEN
  IF actor='author' AND j.author_principal IS NOT NULL AND j.author_principal<>p_principal OR actor='reviewer' AND j.reviewer_principal IS NOT NULL AND j.reviewer_principal<>p_principal THEN RAISE EXCEPTION 'vnext_worker_principal_binding'; END IF;
  RETURN jsonb_build_object('jobId',j.job_id,'state',j.state,'symbol',j.symbol,'inputHash',j.input_hash,'executionId',j.execution_id,'reviewerExecutionId',j.reviewer_execution,'deadline',j.deadline_at,
   'prepared',EXISTS(SELECT FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),'authorArtifact',j.author_result,'review',j.reviewer_result,
   'revisionId',(SELECT revision_id FROM public.vnext_publications_v1 WHERE job_id=j.job_id));
 END IF;
 role_task:=actor;
 expected_execution:=CASE WHEN actor='author' THEN j.execution_id ELSE j.reviewer_execution END;
 IF expected_execution IS NULL OR expected_execution::text IS DISTINCT FROM p_request->>'executionId'
  OR (actor='author' AND j.author_principal IS DISTINCT FROM p_principal) OR (actor='reviewer' AND (j.reviewer_principal IS DISTINCT FROM p_principal OR j.author_principal=p_principal OR j.execution_id=j.reviewer_execution)) THEN RAISE EXCEPTION 'vnext_worker_execution_binding'; END IF;
 SELECT * INTO invocation FROM public.vnext_provider_invocations_v1 WHERE job_id=j.job_id AND task=role_task;
 IF invocation.invocation_id IS NOT NULL AND (invocation.execution_id<>expected_execution OR invocation.principal<>p_principal OR invocation.input_hash<>j.input_hash) THEN RAISE EXCEPTION 'vnext_worker_journal_binding'; END IF;
 IF p_command='read' THEN RETURN coalesce(to_jsonb(invocation),'{}'::jsonb)||jsonb_build_object('dispatch',false); END IF;
 IF p_command='reserve' THEN
  IF invocation.invocation_id IS NOT NULL THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;
  IF j.deadline_at IS NULL OR j.deadline_at<=clock_timestamp() OR member.state='exited' OR member.contraindication OR member.input_hash<>j.input_hash THEN RAISE EXCEPTION 'vnext_worker_admission_stale'; END IF;
  IF actor='author' AND (j.state<>'running' OR NOT EXISTS(SELECT FROM public.vnext_preparations_v1 WHERE job_id=j.job_id AND input_hash=j.input_hash))
    OR actor='reviewer' AND (j.state<>'reviewing' OR j.sources_read_at IS NULL OR j.author_result IS NULL) THEN RAISE EXCEPTION 'vnext_worker_original_preparation_required'; END IF;
  IF (SELECT count(*) FROM public.vnext_provider_invocations_v1 WHERE state IN('dispatching','uncertain','pending'))>=4 THEN RETURN jsonb_build_object('dispatch',false,'deferred','global_external_slots'); END IF;
  -- Until a separately approved content producer supplies rights receipts, send
  -- only original, typed official financial facts. Operator assumptions, raw
  -- channel text and arbitrary normalizedInput metadata never reach the model.
  IF jsonb_typeof(member.evidence->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(member.evidence->'evidence')=0 OR EXISTS(
   SELECT FROM jsonb_array_elements(member.evidence->'evidence') fact WHERE fact->>'sourceTier' IS DISTINCT FROM 'official' OR fact->>'kind' IS DISTINCT FROM 'fact'
    OR jsonb_typeof(fact->'value') IS DISTINCT FROM 'number' OR coalesce(fact->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(fact->>'contentHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR nullif(fact->>'key','') IS NULL OR nullif(fact->>'unit','') IS NULL OR nullif(fact->>'period','') IS NULL
    OR nullif(fact->>'eventAt','') IS NULL OR nullif(fact->>'availableAt','') IS NULL OR nullif(member.evidence->>'cutoff','') IS NULL
    OR (fact->>'eventAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz OR (fact->>'availableAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz
    OR EXISTS(SELECT FROM jsonb_object_keys(fact) fact_key WHERE fact_key NOT IN('id','key','value','unit','period','source','sourceTier','kind','contentHash','eventAt','availableAt'))
   ) THEN RAISE EXCEPTION 'vnext_worker_approved_original_sources_required'; END IF;
  document:=jsonb_build_object('schemaVersion','vnext-worker-input-v1','task',actor,'jobId',j.job_id,'executionId',expected_execution,'inputHash',j.input_hash,'evidence',jsonb_build_object('cutoff',member.evidence->'cutoff','evidence',member.evidence->'evidence'));
  IF actor='reviewer' THEN document:=document||jsonb_build_object('authorArtifact',j.author_result); END IF;
  request:=jsonb_build_object('model',binding.model,'instructions',binding.instructions,'input',public.vnext_catalog_canonical_v1(document),'store',true,'max_output_tokens',CASE WHEN actor='author' THEN 8000 ELSE 6000 END,'text',jsonb_build_object('format',jsonb_build_object('type','json_object')));
  IF NOT public.vnext_provider_envelope_v1(document) OR NOT public.vnext_provider_envelope_v1(request) THEN RAISE EXCEPTION 'vnext_worker_frozen_request_too_large_or_deep'; END IF;
  INSERT INTO public.vnext_provider_invocations_v1(job_id,task,execution_id,principal,input_hash,provider,model,model_version,credential_identity,prompt_version,frozen_request,request_hash,state,deadline_at)
   VALUES(j.job_id,actor,expected_execution,p_principal,j.input_hash,binding.provider,binding.model,binding.model_version,binding.credential_identity,binding.prompt_version,request,encode(sha256(convert_to(public.vnext_catalog_canonical_v1(request),'UTF8')),'hex'),'dispatching',j.deadline_at) RETURNING * INTO invocation;
  INSERT INTO public.vnext_provider_events_v1(invocation_id,principal,event,detail) VALUES(invocation.invocation_id,p_principal,'reserved',jsonb_build_object('requestHash',invocation.request_hash,'deadline',invocation.deadline_at));
  RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',true);
 END IF;
 IF invocation.invocation_id IS NULL OR invocation.invocation_id::text IS DISTINCT FROM p_request->>'invocationId' THEN RAISE EXCEPTION 'vnext_worker_invocation_missing'; END IF;
 IF invocation.state IN('completed','failed') THEN
  IF p_command='settle' AND invocation.raw_response IS NOT DISTINCT FROM p_request->'raw' AND invocation.raw_output IS NOT DISTINCT FROM p_request->'output' AND invocation.provider_response_id IS NOT DISTINCT FROM p_request->>'responseId' THEN RETURN to_jsonb(invocation)||jsonb_build_object('replay',true); END IF;
  RAISE EXCEPTION 'vnext_worker_settlement_conflict';
 END IF;
 IF p_command='uncertain' THEN
  UPDATE public.vnext_provider_invocations_v1 SET state='uncertain',error='transport_outcome_uncertain' WHERE vnext_provider_invocations_v1.invocation_id=invocation.invocation_id;
 ELSIF p_command='settle' THEN
  IF p_request->>'status' NOT IN('completed','failed','pending') OR p_request->>'status' IS NULL OR jsonb_typeof(p_request->'raw') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_worker_provider_result_invalid'; END IF;
  IF p_request->>'status'<>'failed' AND coalesce(p_request->>'responseId','') !~ '^resp_[A-Za-z0-9_-]{1,180}$' THEN RAISE EXCEPTION 'vnext_worker_provider_identity_required'; END IF;
  IF invocation.provider_response_id IS NOT NULL AND invocation.provider_response_id IS DISTINCT FROM p_request->>'responseId' THEN RAISE EXCEPTION 'vnext_worker_provider_identity_changed'; END IF;
  IF p_request->>'status'='completed' THEN
   IF jsonb_typeof(p_request->'output') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_worker_output_object_required'; END IF;
   normalized:=p_request->'output';
   IF NOT public.vnext_provider_json_codec_v1(normalized) THEN RAISE EXCEPTION 'vnext_worker_output_codec_unsupported'; END IF;
   IF actor='author' THEN
    IF EXISTS(SELECT FROM jsonb_object_keys(normalized) key WHERE key NOT IN('sections','claims','quoteDate','valuationDate','annualEps','nextFourQuarterEps','gaps')) THEN RAISE EXCEPTION 'vnext_worker_author_output_fields'; END IF;
    normalized:=normalized||jsonb_build_object('schemaVersion','stockinsider-vnext-research-v1','model',invocation.model,'modelVersion',invocation.model_version,'inputHash',invocation.input_hash);
    normalized:=normalized||jsonb_build_object('outputHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(normalized),'UTF8')),'hex'));
   ELSE
    IF EXISTS(SELECT FROM jsonb_object_keys(normalized) key WHERE key NOT IN('approved','findings','factsChecked','valuationChecked','claimsChecked','claimChecks')) THEN RAISE EXCEPTION 'vnext_worker_review_output_fields'; END IF;
    normalized:=normalized||jsonb_build_object('modelVersion',invocation.model_version,'authorOutputHash',j.author_result->>'outputHash');
   END IF;
  END IF;
  UPDATE public.vnext_provider_invocations_v1 SET state=p_request->>'status',provider_response_id=p_request->>'responseId',raw_response=p_request->'raw',raw_output=p_request->'output',normalized_output=normalized,
   error=CASE WHEN p_request->>'status'='failed' THEN coalesce(p_request->>'reason','provider_failed') END,settled_at=CASE WHEN p_request->>'status' IN('completed','failed') THEN clock_timestamp() END WHERE vnext_provider_invocations_v1.invocation_id=invocation.invocation_id;
  -- Definite terminal failure consumes the existing admitted attempt exactly once.
  IF p_request->>'status'='failed' AND (actor='author' AND j.state='running' OR actor='reviewer' AND j.state='reviewing' AND j.reviewer_result IS NULL) THEN
   PERFORM public.vnext_command_v1(p_principal,CASE WHEN actor='author' THEN 'fail' ELSE 'review-fail' END,jsonb_build_object('jobId',j.job_id,'executionId',expected_execution,'reason',coalesce(p_request->>'reason','provider_failed'),'permanent',false));
  END IF;
 ELSE RAISE EXCEPTION 'vnext_worker_command_unsupported'; END IF;
 INSERT INTO public.vnext_provider_events_v1(invocation_id,principal,event,detail) VALUES(invocation.invocation_id,p_principal,p_command,jsonb_build_object('status',p_request->>'status','responseId',p_request->>'responseId'));
 SELECT * INTO invocation FROM public.vnext_provider_invocations_v1 WHERE vnext_provider_invocations_v1.invocation_id=invocation.invocation_id;
 RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false);
END $$;
ALTER FUNCTION public.vnext_provider_command_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_provider_command_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_provider_command_v1(text,text,jsonb) TO service_role;
CREATE FUNCTION public.vnext_require_provider_receipt_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF TG_TABLE_NAME='vnext_mode_v1' THEN
  IF NEW.enabled IS DISTINCT FROM OLD.enabled AND EXISTS(SELECT FROM public.vnext_provider_invocations_v1 WHERE state IN('dispatching','uncertain','pending')) THEN RAISE EXCEPTION 'vnext_provider_outcome_unsettled'; END IF; RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.retry_of IS NOT NULL AND EXISTS(SELECT FROM public.vnext_provider_invocations_v1 WHERE job_id=NEW.retry_of AND state IN('dispatching','uncertain','pending')) THEN RAISE EXCEPTION 'vnext_provider_outcome_unsettled'; END IF; RETURN NEW;
 END IF;
 IF NEW.state='running' AND OLD.state='queued' AND (SELECT count(*) FROM public.vnext_jobs_v1 active_job WHERE active_job.job_id<>NEW.job_id AND ((active_job.state IN('running','authored','reviewing') AND active_job.deadline_at>clock_timestamp()) OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 pending_call WHERE pending_call.job_id=active_job.job_id AND pending_call.state IN('dispatching','uncertain','pending'))))>=4 THEN RAISE EXCEPTION 'vnext_global_research_slots_full'; END IF;
 IF NEW.author_result IS DISTINCT FROM OLD.author_result AND NEW.author_result IS NOT NULL AND NOT EXISTS(SELECT FROM public.vnext_provider_invocations_v1 WHERE job_id=NEW.job_id AND task='author' AND execution_id=NEW.execution_id AND principal=NEW.author_principal AND input_hash=NEW.input_hash AND state='completed' AND normalized_output=NEW.author_result) THEN RAISE EXCEPTION 'vnext_author_provider_receipt_required'; END IF;
 IF NEW.reviewer_result IS DISTINCT FROM OLD.reviewer_result AND NEW.reviewer_result IS NOT NULL AND NEW.reviewer_result->>'validationRejected' IS DISTINCT FROM 'true' AND NOT EXISTS(SELECT FROM public.vnext_provider_invocations_v1 WHERE job_id=NEW.job_id AND task='reviewer' AND execution_id=NEW.reviewer_execution AND principal=NEW.reviewer_principal AND input_hash=NEW.input_hash AND state='completed' AND normalized_output=NEW.reviewer_result) THEN RAISE EXCEPTION 'vnext_reviewer_provider_receipt_required'; END IF;
 IF NEW.state='published' AND OLD.state<>'published' AND (NEW.execution_id=NEW.reviewer_execution OR (SELECT count(*) FROM public.vnext_provider_invocations_v1 WHERE job_id=NEW.job_id AND input_hash=NEW.input_hash AND state='completed' AND (task='author' AND normalized_output=NEW.author_result OR task='reviewer' AND normalized_output=NEW.reviewer_result))<>2) THEN RAISE EXCEPTION 'vnext_publication_provider_receipts_required'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_require_provider_receipt_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_require_provider_receipt_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_provider_receipts BEFORE INSERT OR UPDATE ON public.vnext_jobs_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_require_provider_receipt_v1();
CREATE TRIGGER vnext_provider_mode_idle BEFORE UPDATE ON public.vnext_mode_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_require_provider_receipt_v1();
COMMIT;
