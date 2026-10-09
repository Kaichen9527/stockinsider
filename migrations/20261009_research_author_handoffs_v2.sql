BEGIN;
-- Complete only the original observed author reservation. No reviewer dispatch,
-- job renewal, publication or claim that a controller report is attestation.
GRANT EXECUTE ON FUNCTION public.read_research_observed_claim_v2(text,text,uuid,integer)
 TO research_input_preparation_owner_v2;

CREATE FUNCTION public.read_research_author_handoff_context_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text,p_result_id uuid,p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.research_author_assignments_v2; v public.research_article_input_revisions_v2;
 p public.research_input_preparations_v2; r public.research_author_results_v2;
 c public.research_model_completions_v1; claim jsonb; payload jsonb; n timestamptz; live jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'research_author_handoff_read_committed_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
  OR p_revision_id IS NULL OR p_result_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
  OR p_result_hash IS NULL OR p_result_hash !~ '^[a-f0-9]{64}$' OR p_principal IS NULL OR p_principal !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'research_author_handoff_identity'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO a FROM public.research_author_assignments_v2 WHERE input_revision_id=p_revision_id;
 SELECT * INTO v FROM public.research_article_input_revisions_v2 WHERE revision_id=p_revision_id;
 SELECT * INTO r FROM public.research_author_results_v2 WHERE result_id=p_result_id;
 SELECT * INTO p FROM public.research_input_preparations_v2 WHERE preparation_id=v.preparation_id;
 IF a.assignment_id IS NULL OR v.revision_id IS NULL OR r.result_id IS NULL OR p.preparation_id IS NULL
  OR a.canonical_request IS DISTINCT FROM p_request OR v.canonical_request IS DISTINCT FROM p_request
  OR a.controller_principal IS DISTINCT FROM p_principal OR a.input_hash IS DISTINCT FROM p_input_hash
  OR v.input_hash IS DISTINCT FROM p_input_hash OR r.assignment_id IS DISTINCT FROM a.assignment_id
  OR r.result_hash IS DISTINCT FROM p_result_hash OR r.result_hash IS DISTINCT FROM public.research_complete_hash_v2(r.payload)
  OR r.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(r.payload),'UTF8'))
  OR v.input_hash IS DISTINCT FROM public.research_complete_hash_v2(v.canonical_payload)
  OR v.job_id IS DISTINCT FROM a.job_id OR v.attempt IS DISTINCT FROM a.attempt
  OR v.reservation_id IS DISTINCT FROM a.reservation_id OR v.research_company_id IS DISTINCT FROM a.research_company_id
  OR v.snapshot_hash IS DISTINCT FROM a.snapshot_hash OR v.research_scope IS DISTINCT FROM 'research_observed_v1'
  OR p.job_id IS DISTINCT FROM a.job_id OR p.attempt IS DISTINCT FROM a.attempt OR p.reservation_id IS DISTINCT FROM a.reservation_id
  OR p.input_hash IS DISTINCT FROM p_request->>'preparationHash' OR p.preparation_id::text IS DISTINCT FROM p_request->>'preparationId'
  OR p.source_seal_id IS DISTINCT FROM v.source_seal_id
  OR r.payload->>'assignmentId' IS DISTINCT FROM a.assignment_id::text
  OR r.payload->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR r.payload->>'inputHash' IS DISTINCT FROM p_input_hash
  OR r.payload->'observation'->>'invocationId' IS DISTINCT FROM r.invocation_id
  OR r.payload->'validatedArticle'->>'articleHash' IS DISTINCT FROM public.research_complete_hash_v2((r.payload->'validatedArticle')-'articleHash')
 THEN RAISE EXCEPTION 'research_author_handoff_binding'; END IF;
 IF v.source_seal_id IS NOT NULL THEN PERFORM public.assert_research_source_seal_v2(v.source_seal_id); END IF;
 claim:=public.read_research_observed_claim_v2(a.work_owner,a.snapshot_hash,a.job_id,a.attempt);
 IF claim IS NULL OR claim->'job'->>'jobId' IS DISTINCT FROM a.job_id::text
  OR claim->'job'->'attempt' IS DISTINCT FROM to_jsonb(a.attempt)
  OR claim->'job'->>'owner' IS DISTINCT FROM a.work_owner
  OR claim->'modelReservation'->>'reservationId' IS DISTINCT FROM a.reservation_id::text
  OR claim->'modelReservation'->>'role' IS DISTINCT FROM 'company_research'
  OR claim->'modelReservation'->>'owner' IS DISTINCT FROM a.work_owner
  OR claim->'researchIdentity'->>'researchCompanyId' IS DISTINCT FROM a.research_company_id::text
  OR claim->'researchIdentity'->>'scope' IS DISTINCT FROM 'research_observed_v1'
  OR claim->'researchIdentity'->>'snapshotHash' IS DISTINCT FROM a.snapshot_hash
  OR NOT EXISTS(SELECT FROM public.research_observed_roster_members_v1 m JOIN public.research_observed_companies_v1 co USING(research_company_id)
    WHERE m.snapshot_hash=a.snapshot_hash AND m.research_company_id=a.research_company_id
      AND m.symbol=claim->'job'->>'symbol' AND co.symbol=m.symbol)
 THEN RAISE EXCEPTION 'research_author_handoff_claim'; END IF;
 payload:=v.canonical_payload;n:=clock_timestamp();
 IF payload->'originalJob' IS DISTINCT FROM jsonb_build_object('jobId',a.job_id,'attempt',a.attempt,'owner',a.work_owner,'leaseExpiresAt',a.original_job_deadline)
  OR payload->'originalReservation' IS DISTINCT FROM jsonb_build_object('reservationId',a.reservation_id,'startedAt',a.reservation_started_at,'leaseExpiresAt',a.reservation_expires_at)
  OR (claim->'job'->>'leaseExpiresAt')::timestamptz IS DISTINCT FROM a.original_job_deadline
  OR (claim->'modelReservation'->>'startedAt')::timestamptz IS DISTINCT FROM a.reservation_started_at
  OR (claim->'modelReservation'->>'leaseExpiresAt')::timestamptz IS DISTINCT FROM a.reservation_expires_at
  OR payload->'researchIdentity'->>'symbol' IS DISTINCT FROM claim->'job'->>'symbol'
  OR NOT isfinite(a.original_job_deadline) OR NOT isfinite(a.reservation_expires_at) OR NOT isfinite(a.reservation_started_at)
  OR a.reservation_started_at>n OR a.reservation_expires_at>a.reservation_started_at+interval '30 minutes'
  OR n>=least(a.original_job_deadline,a.reservation_expires_at)
  OR r.received_at<a.assigned_at OR r.received_at>n
 THEN RAISE EXCEPTION 'research_author_handoff_original_fence'; END IF;
 SELECT * INTO c FROM public.research_model_completions_v1 WHERE reservation_id=a.reservation_id;
 IF FOUND THEN
  IF c.owner IS DISTINCT FROM a.work_owner OR c.outcome IS DISTINCT FROM 'completed'
   OR c.result_hash IS DISTINCT FROM r.payload->'validatedArticle'->>'articleHash'
   OR c.finished_at IS NULL OR NOT isfinite(c.finished_at) OR c.finished_at<r.received_at OR c.finished_at>n
   OR c.finished_at>=least(a.original_job_deadline,a.reservation_expires_at)
  THEN RAISE EXCEPTION 'research_author_handoff_completion_conflict'; END IF;
 ELSE
  -- Preserve all original active-work fences before the first completion.
  live:=public.read_research_author_result_v2(p_request,p_revision_id,p_input_hash,p_principal);
  IF live->>'result_id' IS DISTINCT FROM p_result_id::text OR live->>'result_hash' IS DISTINCT FROM p_result_hash
   THEN RAISE EXCEPTION 'research_author_handoff_result_missing'; END IF;
 END IF;
 IF clock_timestamp()>=least(a.original_job_deadline,a.reservation_expires_at) THEN RAISE EXCEPTION 'research_author_handoff_expired'; END IF;
 RETURN jsonb_build_object('assignment',to_jsonb(a),'result',to_jsonb(r)-'invocation_id',
  'revision',to_jsonb(v)||jsonb_build_object('status','sealed','dispatchReady',false),
  'completion',CASE WHEN c.reservation_id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
ALTER FUNCTION public.read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text) TO service_role,research_observed_rpc_owner;

CREATE FUNCTION public.commit_research_author_handoff_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text,p_result_id uuid,p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; a jsonb; receipt public.research_model_completions_v1;
BEGIN
 context:=public.read_research_author_handoff_context_v2(p_request,p_revision_id,p_input_hash,p_principal,p_result_id,p_result_hash);
 a:=context->'assignment';
 IF context->'completion'<>'null'::jsonb THEN
  IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
   THEN RAISE EXCEPTION 'research_author_handoff_expired'; END IF;
  RETURN context->'completion';
 END IF;
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 VALUES((a->>'reservation_id')::uuid,a->>'work_owner','completed',context->'result'->'payload'->'validatedArticle'->>'articleHash')
 RETURNING * INTO receipt;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_handoff_expired'; END IF;
 RETURN to_jsonb(receipt);
END $$;
ALTER FUNCTION public.commit_research_author_handoff_v2(jsonb,uuid,text,text,uuid,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.commit_research_author_handoff_v2(jsonb,uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_research_author_handoff_v2(jsonb,uuid,text,text,uuid,text) TO service_role;
COMMIT;
