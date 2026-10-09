BEGIN;
GRANT EXECUTE ON FUNCTION public.research_complete_canonical_v2(jsonb,integer),public.research_complete_hash_v2(jsonb) TO research_observed_rpc_owner;
-- Exclude concurrent original author insert throughout backfill and trigger install.
LOCK TABLE public.research_author_results_v2 IN ACCESS EXCLUSIVE MODE;
CREATE TABLE public.research_execution_invocations_v2 (
 invocation_id text PRIMARY KEY CHECK(length(invocation_id) BETWEEN 1 AND 200),
 role text NOT NULL CHECK(role IN ('author','reviewer')),
 result_id uuid NOT NULL UNIQUE,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$')
);
ALTER TABLE public.research_execution_invocations_v2 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_execution_invocations_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_execution_invocations_v2 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_research_execution_invocation_v2 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_execution_invocations_v2
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
INSERT INTO public.research_execution_invocations_v2 SELECT invocation_id,'author',result_id,result_hash FROM public.research_author_results_v2;

CREATE TABLE public.research_reviewer_results_v2 (
 result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL UNIQUE REFERENCES public.research_reviewer_assignments_v2(assignment_id),
 invocation_id text NOT NULL UNIQUE CHECK(length(invocation_id) BETWEEN 1 AND 200),
 result_hash text NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),
 logical_bytes integer NOT NULL CHECK(logical_bytes BETWEEN 1 AND 1048576),
 received_at timestamptz NOT NULL CHECK(isfinite(received_at)),payload jsonb NOT NULL
);
ALTER TABLE public.research_reviewer_results_v2 OWNER TO research_observed_rpc_owner;
ALTER TABLE public.research_reviewer_results_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_reviewer_results_v2 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.research_reviewer_results_v2 TO research_input_preparation_owner_v2;
CREATE POLICY reviewer_result_context_read_v2 ON public.research_reviewer_results_v2 FOR SELECT TO research_input_preparation_owner_v2 USING(true);
CREATE TRIGGER immutable_research_reviewer_result_v2 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_reviewer_results_v2
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
CREATE FUNCTION public.fence_research_execution_invocation_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('research_author_results_v2','research_reviewer_results_v2')
  OR NEW.invocation_id IS DISTINCT FROM NEW.payload->'observation'->>'invocationId'
  OR NEW.result_hash IS DISTINCT FROM public.research_complete_hash_v2(NEW.payload)
 THEN RAISE EXCEPTION 'research_invocation_binding'; END IF;
 INSERT INTO public.research_execution_invocations_v2 VALUES(NEW.invocation_id,
  CASE WHEN TG_TABLE_NAME='research_author_results_v2' THEN 'author' ELSE 'reviewer' END,NEW.result_id,NEW.result_hash);
 RETURN NEW;
END $$;
ALTER FUNCTION public.fence_research_execution_invocation_v2() OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.fence_research_execution_invocation_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_author_invocation_v2 BEFORE INSERT ON public.research_author_results_v2 FOR EACH ROW EXECUTE FUNCTION public.fence_research_execution_invocation_v2();
CREATE TRIGGER research_reviewer_invocation_v2 BEFORE INSERT ON public.research_reviewer_results_v2 FOR EACH ROW EXECUTE FUNCTION public.fence_research_execution_invocation_v2();

CREATE FUNCTION public.read_research_reviewer_result_context_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; a jsonb; ra public.research_reviewer_assignments_v2; r public.research_model_reservations_v1;
 saved public.research_reviewer_results_v2;c public.research_model_completions_v1;n timestamptz;
BEGIN
 IF p_reviewer_principal IS NULL OR p_reviewer_principal !~ '^[a-f0-9]{64}$' OR p_reviewer_principal=p_author_principal THEN RAISE EXCEPTION 'research_reviewer_result_principal'; END IF;
 h:=public.read_research_author_handoff_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_result_id,p_result_hash);
 IF h->'completion'='null'::jsonb THEN RAISE EXCEPTION 'research_reviewer_result_author_incomplete'; END IF;
 a:=h->'assignment';
 SELECT * INTO ra FROM public.research_reviewer_assignments_v2 WHERE job_id=(a->>'job_id')::uuid AND attempt=(a->>'attempt')::integer;
 SELECT * INTO r FROM public.research_model_reservations_v1 WHERE reservation_id=ra.reservation_id;n:=clock_timestamp();
 IF ra.assignment_id IS NULL OR ra.author_assignment_id::text IS DISTINCT FROM a->>'assignment_id'
  OR ra.author_result_id IS DISTINCT FROM p_result_id OR ra.author_result_hash IS DISTINCT FROM p_result_hash
  OR ra.input_revision_id IS DISTINCT FROM p_revision_id OR ra.input_hash IS DISTINCT FROM p_input_hash
  OR ra.reviewer_principal IS DISTINCT FROM p_reviewer_principal OR ra.work_owner IS DISTINCT FROM a->>'work_owner'
  OR ra.original_job_deadline IS DISTINCT FROM (a->>'original_job_deadline')::timestamptz
  OR r.reservation_id IS NULL OR r.role IS DISTINCT FROM 'counter_review' OR r.owner IS DISTINCT FROM ra.work_owner
  OR r.work_key IS DISTINCT FROM 'deep-review-v2:'||ra.job_id||':'||ra.attempt||':'||ra.author_result_id
  OR r.started_at IS DISTINCT FROM ra.reservation_started_at OR r.lease_expires_at IS DISTINCT FROM ra.reservation_expires_at
  OR NOT isfinite(r.started_at) OR NOT isfinite(r.lease_expires_at) OR r.lease_expires_at>r.started_at+interval '30 minutes'
  OR ra.assigned_at<r.started_at OR ra.assigned_at>n OR ra.reservation_started_at<(h->'completion'->>'finished_at')::timestamptz
  OR n>=least(ra.original_job_deadline,ra.reservation_expires_at)
 THEN RAISE EXCEPTION 'research_reviewer_result_original_fence'; END IF;
 SELECT * INTO saved FROM public.research_reviewer_results_v2 WHERE assignment_id=ra.assignment_id;
 SELECT * INTO c FROM public.research_model_completions_v1 WHERE reservation_id=ra.reservation_id;
 IF saved.result_id IS NULL THEN
  IF c.reservation_id IS NOT NULL THEN RAISE EXCEPTION 'research_reviewer_result_completion_without_result'; END IF;
  PERFORM public.read_research_reviewer_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 ELSE
  IF saved.result_hash IS DISTINCT FROM public.research_complete_hash_v2(saved.payload)
   OR saved.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(saved.payload),'UTF8'))
   OR saved.payload->>'assignmentId' IS DISTINCT FROM ra.assignment_id::text
   OR saved.payload->'observation'->>'invocationId' IS DISTINCT FROM saved.invocation_id
   OR saved.received_at<ra.assigned_at OR saved.received_at>n
   OR c.reservation_id IS NULL OR c.owner IS DISTINCT FROM ra.work_owner OR c.outcome IS DISTINCT FROM 'completed'
   OR c.result_hash IS DISTINCT FROM saved.result_hash OR c.finished_at IS NULL OR NOT isfinite(c.finished_at)
   OR c.finished_at<saved.received_at OR c.finished_at>n OR c.finished_at>=least(ra.original_job_deadline,ra.reservation_expires_at)
   OR NOT EXISTS(SELECT FROM public.research_execution_invocations_v2 i WHERE i.invocation_id=saved.invocation_id
    AND i.role='reviewer' AND i.result_id=saved.result_id AND i.payload_hash=saved.result_hash)
  THEN RAISE EXCEPTION 'research_reviewer_result_completion_conflict'; END IF;
 END IF;
 IF clock_timestamp()>=least(ra.original_job_deadline,ra.reservation_expires_at) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
 RETURN jsonb_build_object('authorContext',h,'reviewerAssignment',to_jsonb(ra),'reviewResult',CASE WHEN saved.result_id IS NULL THEN NULL ELSE to_jsonb(saved)-'invocation_id' END,
  'reviewCompletion',CASE WHEN c.reservation_id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
ALTER FUNCTION public.read_research_reviewer_result_context_v2(jsonb,uuid,text,text,text,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_reviewer_result_context_v2(jsonb,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_reviewer_result_context_v2(jsonb,uuid,text,text,text,uuid,text) TO service_role,research_observed_rpc_owner;

CREATE FUNCTION public.receive_research_reviewer_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text,p_result jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb;ra jsonb;o jsonb;v jsonb;review jsonb;packet jsonb;h jsonb;old jsonb;
 saved public.research_reviewer_results_v2;bytes integer;n timestamptz;started timestamptz;ended timestamptz;reviewed timestamptz;
BEGIN
 context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 ra:=context->'reviewerAssignment';h:=context->'authorContext';
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
  IS DISTINCT FROM ARRAY['assignmentId','authorResultHash','authorResultId','inputHash','inputRevisionId','observation','packet','packetHash','rawReview','schemaVersion','validatedReview']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v2'
  OR p_result->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id' OR p_result->>'authorResultId' IS DISTINCT FROM p_result_id::text
  OR p_result->>'authorResultHash' IS DISTINCT FROM p_result_hash OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash THEN RAISE EXCEPTION 'research_reviewer_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_reviewer_result_bound'; END IF;
 packet:=p_result->'packet';o:=p_result->'observation';v:=p_result->'validatedReview';review:=p_result->'rawReview';
 IF jsonb_typeof(packet) IS DISTINCT FROM 'object' OR jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object'
  OR p_result->>'packetHash' IS DISTINCT FROM public.research_complete_hash_v2(packet)
  OR packet->>'reviewerAssignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR packet->>'authorResultId' IS DISTINCT FROM p_result_id::text OR packet->>'authorResultHash' IS DISTINCT FROM p_result_hash
  OR packet->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR packet->>'inputHash' IS DISTINCT FROM p_input_hash
  OR packet->'article' IS DISTINCT FROM h->'result'->'payload'->'rawArticle'
  OR packet->>'articleHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'articleHash'
  OR packet->'tables' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'tables'
  OR packet->'valuations' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'valuations'
  OR packet->>'calculatorExecutionHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'calculatorExecutionHash'
  OR review->>'schemaVersion' IS DISTINCT FROM 'research-editorial-review-v2' OR review->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR review->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR review->>'decision' IS NULL OR review->>'decision' NOT IN ('accepted','revision_required','rejected')
  OR octet_length(review::text)>65536 OR v->>'schemaVersion' IS DISTINCT FROM 'validated-editorial-review-v2'
  OR v->'review' IS DISTINCT FROM review OR v->>'reviewHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR v->>'articleHash' IS DISTINCT FROM packet->>'articleHash' OR v->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only' OR v->'controllerReportOnly' IS DISTINCT FROM 'true'::jsonb
  OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb
  OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_reviewer_result_review_binding'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2' OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation'
  OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat' OR o->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR o->>'jobId' IS DISTINCT FROM ra->>'job_id' OR o->'attempt' IS DISTINCT FROM ra->'attempt'
  OR o->>'reservationId' IS DISTINCT FROM ra->>'reservation_id' OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR o->>'inputHash' IS DISTINCT FROM p_input_hash OR o->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR o->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string' OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR o->>'threadId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'threadId'
  OR o->>'invocationId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'invocationId'
  OR o->>'dispatchObservationHash' IS NULL OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$'
  OR o->>'completionObservationHash' IS NULL OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]' OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
 THEN RAISE EXCEPTION 'research_reviewer_result_observation'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz;ended:=(o->>'controllerObservedEndAt')::timestamptz;reviewed:=(review->>'reviewedAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR reviewed IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(reviewed)
  OR started<(ra->>'assigned_at')::timestamptz OR started<(h->'result'->'payload'->'observation'->>'controllerObservedEndAt')::timestamptz
  OR reviewed<started OR reviewed>ended OR ended>n OR n>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_reviewer_result_clock'; END IF;
 old:=context->'reviewResult';
 IF old<>'null'::jsonb THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_reviewer_result_replay_conflict'; END IF;
  IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_reviewer_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((ra->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 VALUES((ra->>'reservation_id')::uuid,ra->>'work_owner','completed',saved.result_hash);
 IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;
ALTER FUNCTION public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.read_research_reviewer_result_sources_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; revision jsonb; payload jsonb; seal public.research_source_seals_v2;
 item jsonb; doc jsonb; m jsonb; descriptor jsonb; sources jsonb:='[]'; result jsonb;
 observed timestamptz; collected timestamptz; cutoff timestamptz; symbol text;
BEGIN
 context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 IF context->'reviewerAssignment'='null'::jsonb THEN RAISE EXCEPTION 'research_reviewer_assignment_missing'; END IF;
 revision:=context->'authorContext'->'revision';
 payload:=revision->'canonical_payload';symbol:=payload->'researchIdentity'->>'symbol';
 cutoff:=(payload->'clocks'->>'researchCutoff')::timestamptz;
 IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>clock_timestamp()
  OR jsonb_typeof(payload->'sources'->'manifest') IS DISTINCT FROM 'array'
  OR jsonb_array_length(payload->'sources'->'manifest')>30 THEN
  RAISE EXCEPTION 'research_author_packet_source_shape'; END IF;
 IF jsonb_array_length(payload->'sources'->'manifest')>0 THEN
  SELECT * INTO seal FROM public.research_source_seals_v2
   WHERE seal_id=(payload->'sources'->>'sealId')::uuid;
  IF seal.seal_id IS NULL OR seal.received_at IS NULL OR NOT isfinite(seal.received_at)
   OR seal.received_at>cutoff OR seal.documents IS DISTINCT FROM payload->'sources'->'manifest'
   THEN RAISE EXCEPTION 'research_author_packet_seal_clock'; END IF;
 END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(payload->'sources'->'manifest') x ORDER BY x->>'id' LOOP
  SELECT to_jsonb(d) INTO doc FROM public.source_raw_documents d WHERE id=(item->>'id')::uuid;
  IF doc IS NULL OR encode(sha256(convert_to(doc::text,'UTF8')),'hex') IS DISTINCT FROM item->>'rowHash'
   THEN RAISE EXCEPTION 'research_author_packet_source_changed'; END IF;
  m:=doc->'metadata';
  IF m->>'rights_boundary' IS DISTINCT FROM 'public_citation' OR m->>'visibility' IS DISTINCT FROM 'public'
   OR m->>'subject_scope' IS NULL OR m->>'subject_scope' NOT IN ('company_mentions','industry_context')
   OR jsonb_typeof(doc->'symbols') IS DISTINCT FROM 'array'
   OR jsonb_array_length(doc->'symbols')>50
   OR EXISTS(SELECT FROM jsonb_array_elements(doc->'symbols') x
    WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}')!~'^[0-9]{4}$')
   OR (m->>'subject_scope'='company_mentions' AND NOT(doc->'symbols' @> jsonb_build_array(symbol)))
   OR (m->>'subject_scope'='industry_context' AND doc->'symbols'<>'[]'::jsonb)
   OR NULLIF(m->>'retracted_at','') IS NOT NULL OR m->>'withdrawn'='true'
   OR m->>'claim_status' IS NULL OR m->>'claim_status' NOT IN ('rumor','reported','confirmed')
   THEN RAISE EXCEPTION 'research_author_packet_source_rights_or_scope'; END IF;
  IF jsonb_typeof(doc->'title') IS DISTINCT FROM 'string' OR octet_length(doc->>'title') NOT BETWEEN 1 AND 512
   OR jsonb_typeof(doc->'summary') IS DISTINCT FROM 'string' OR octet_length(doc->>'summary') NOT BETWEEN 1 AND 4096
   OR jsonb_typeof(m->'catalyst') IS DISTINCT FROM 'string' OR octet_length(m->>'catalyst') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(m->'risk') IS DISTINCT FROM 'string' OR octet_length(m->>'risk') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(doc->'platform') IS DISTINCT FROM 'string' OR octet_length(doc->>'platform') NOT BETWEEN 1 AND 80
   OR jsonb_typeof(m->'canonical_url') IS DISTINCT FROM 'string' OR octet_length(m->>'canonical_url') NOT BETWEEN 1 AND 800
   OR jsonb_typeof(m->'first_observed_at') IS DISTINCT FROM 'string' OR octet_length(m->>'first_observed_at') NOT BETWEEN 1 AND 100
   THEN RAISE EXCEPTION 'research_author_packet_content_bound'; END IF;
  observed:=(m->>'first_observed_at')::timestamptz;collected:=(doc->>'collected_at')::timestamptz;
  IF observed IS NULL OR collected IS NULL OR NOT isfinite(observed) OR NOT isfinite(collected)
   OR observed>collected OR collected>seal.received_at
   OR (doc->>'published_at')::timestamptz>observed
   OR ((doc->>'published_at') IS NOT NULL AND NOT isfinite((doc->>'published_at')::timestamptz))
   THEN RAISE EXCEPTION 'research_author_packet_source_clock'; END IF;
  descriptor:=jsonb_build_object('id',item->'id','rowHash',item->'rowHash','url',m->'canonical_url',
   'observedAt',m->'first_observed_at','admittedAt',seal.received_at,
   'publication',jsonb_build_object('precision','unknown','raw',NULL,'timezone',NULL,'instant',NULL),
   'scope',m->'subject_scope','symbols',doc->'symbols','rights','public_summary_only','retracted',false,'superseded',false);
  sources:=sources||jsonb_build_array(jsonb_build_object('descriptor',descriptor,
   'title',doc->'title','summary',doc->'summary','catalyst',m->'catalyst','risk',m->'risk',
   'platform',doc->'platform','sourceClaimStatus',m->'claim_status','collectedAt',doc->'collected_at',
   'unverifiedPublicationClaim',doc->'published_at','untrustedEvidence',true));
  IF octet_length(sources::text)>307200 THEN RAISE EXCEPTION 'research_author_packet_sources_bound'; END IF;
 END LOOP;

 IF public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash) IS DISTINCT FROM context
 THEN RAISE EXCEPTION 'research_reviewer_context_changed'; END IF;
 result:=jsonb_build_object('sourceSealReceivedAt',seal.received_at,'sources',sources);
 IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'research_reviewer_sources_bound'; END IF;
 IF clock_timestamp()>=least((context->'reviewerAssignment'->>'original_job_deadline')::timestamptz,(context->'reviewerAssignment'->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.read_research_reviewer_result_sources_v2(jsonb,uuid,text,text,text,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_reviewer_result_sources_v2(jsonb,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_reviewer_result_sources_v2(jsonb,uuid,text,text,text,uuid,text) TO service_role;
COMMIT;
