-- Known settled rejection/output-invalid releases a failed research slot. Only
-- observed429 has a separately charged retry; pending/uncertain never reach this branch.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $patch$ DECLARE original text; definition text; target oid:='public.vnext_provider_command_v1(text,text,jsonb)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'85951f8f64b236859f528044e15a875f7e86cdd2b0b77d6480fc0acd5a044156' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text THEN RAISE EXCEPTION 'vnext_terminal_slot_predecessor'; END IF;
 definition:=replace(pg_get_functiondef(target),original,$replacement$
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
  RETURN jsonb_build_object('jobId',j.job_id,'state',CASE WHEN j.state='published' AND NOT public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol) THEN 'published_historical' ELSE j.state END,'symbol',j.symbol,'inputHash',j.input_hash,'executionId',j.execution_id,'reviewerExecutionId',j.reviewer_execution,'deadline',j.deadline_at,
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
   SELECT FROM jsonb_array_elements(member.evidence->'evidence') fact WHERE (fact->>'sourceTier' IS DISTINCT FROM 'official' OR fact->>'kind' IS DISTINCT FROM 'fact'
    OR jsonb_typeof(fact->'value') IS DISTINCT FROM 'number' OR coalesce(fact->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(fact->>'contentHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR nullif(fact->>'key','') IS NULL OR nullif(fact->>'unit','') IS NULL OR nullif(fact->>'period','') IS NULL
    OR nullif(fact->>'eventAt','') IS NULL OR nullif(fact->>'availableAt','') IS NULL OR nullif(member.evidence->>'cutoff','') IS NULL
    OR (fact->>'eventAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz OR (fact->>'availableAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz
    OR EXISTS(SELECT FROM jsonb_object_keys(fact) fact_key WHERE fact_key NOT IN('id','key','value','unit','period','source','sourceTier','kind','contentHash','eventAt','availableAt'))
) AND NOT public.vnext_source_evidence_current_v1(fact,j.symbol)
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
   PERFORM public.vnext_command_v1(p_principal,CASE WHEN actor='author' THEN 'fail' ELSE 'review-fail' END,jsonb_build_object('jobId',j.job_id,'executionId',expected_execution,'reason',coalesce(p_request->>'reason','provider_failed'),'permanent',(p_request->>'reason' IS DISTINCT FROM 'provider_http_429')));
  END IF;
 ELSE RAISE EXCEPTION 'vnext_worker_command_unsupported'; END IF;
 INSERT INTO public.vnext_provider_events_v1(invocation_id,principal,event,detail) VALUES(invocation.invocation_id,p_principal,p_command,jsonb_build_object('status',p_request->>'status','responseId',p_request->>'responseId'));
 SELECT * INTO invocation FROM public.vnext_provider_invocations_v1 WHERE vnext_provider_invocations_v1.invocation_id=invocation.invocation_id;
 RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false);
END $replacement$);
 EXECUTE definition;
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'47fdb26746e2d20a2d85348d2e15cf288c8e1e1af84b7b4b6b780d150811288d' THEN RAISE EXCEPTION 'vnext_terminal_slot_postcondition'; END IF;
END $patch$;
DO $review_failure$ DECLARE original text; changed text; target oid:='public.vnext_command_v1(text,text,jsonb)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'e27aa373d4a3d8b444c7bbec2585380329e98c21e35189746b56e72d522e121a' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text THEN RAISE EXCEPTION 'vnext_review_terminal_slot_predecessor'; END IF;
 changed:=replace(original,$old_review$  ELSIF p_command='review-fail' THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' OR j.state<>'reviewing' THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   UPDATE public.vnext_jobs_v1 SET reviewer_result=jsonb_build_object('approved',false,'validationRejected',true),state='failed',error=r->>'reason',finished_at=clock_timestamp() WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,state=CASE WHEN failures>=1 THEN 'exited' ELSE 'waiting' END,
    exit_reason=CASE WHEN failures>=1 THEN 'research_failed' ELSE 'review_rejected_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('reviewRecorded',true,'approved',false,'attemptConsumed',true);
$old_review$,$new_review$  ELSIF p_command='review-fail' THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' OR j.state<>'reviewing' THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   UPDATE public.vnext_jobs_v1 SET reviewer_result=jsonb_build_object('approved',false,'validationRejected',true),state='failed',error=r->>'reason',finished_at=clock_timestamp() WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,state=CASE WHEN r->>'permanent'='true' OR failures>=1 THEN 'exited' ELSE 'waiting' END,
    exit_reason=CASE WHEN r->>'permanent'='true' OR failures>=1 THEN 'research_failed' ELSE 'review_rejected_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('reviewRecorded',true,'approved',false,'attemptConsumed',true);
$new_review$);
 IF changed=original THEN RAISE EXCEPTION 'vnext_review_terminal_slot_seam'; END IF;
 EXECUTE replace(pg_get_functiondef(target),original,changed);
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'47a8d220420b10ac931118262032aac74bc66e94d437d9ac381ad3ab50226074' THEN RAISE EXCEPTION 'vnext_review_terminal_slot_postcondition'; END IF;
END $review_failure$;
COMMIT;
