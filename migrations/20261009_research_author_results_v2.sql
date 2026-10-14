BEGIN;
-- Private draft storage only. No model completion, job handoff or publication.
CREATE TABLE public.research_author_results_v2 (
 result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL UNIQUE REFERENCES public.research_author_assignments_v2(assignment_id),
 invocation_id text NOT NULL UNIQUE CHECK(length(invocation_id) BETWEEN 1 AND 200),
 result_hash text NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),
 logical_bytes integer NOT NULL CHECK(logical_bytes BETWEEN 1 AND 1048576),
 received_at timestamptz NOT NULL CHECK(isfinite(received_at)),
 payload jsonb NOT NULL
);
ALTER TABLE public.research_author_results_v2 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_author_results_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_author_results_v2 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_research_author_result_v2 BEFORE UPDATE OR DELETE OR TRUNCATE
 ON public.research_author_results_v2 FOR EACH STATEMENT
 EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();

CREATE FUNCTION public.read_research_author_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; saved public.research_author_results_v2;
BEGIN
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_result_assignment_missing'; END IF;
 SELECT * INTO saved FROM public.research_author_results_v2 WHERE assignment_id=(a->>'assignment_id')::uuid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;

CREATE FUNCTION public.receive_research_author_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text,p_result jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; revision jsonb; old jsonb; saved public.research_author_results_v2;
 o jsonb; v jsonb; article jsonb; packet jsonb; bytes integer; n timestamptz; started timestamptz; ended timestamptz; authored timestamptz;
BEGIN
 -- Existing live context acquires source then global-deep locks, and holds both.
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_result_assignment_missing'; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object'
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
   IS DISTINCT FROM ARRAY['assignmentId','inputHash','inputRevisionId','observation','rawArticle','schemaVersion','validatedArticle']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-author-result-v2'
  OR p_result->>'assignmentId' IS DISTINCT FROM a->>'assignment_id'
  OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_author_result_bound'; END IF;
 o:=p_result->'observation';v:=p_result->'validatedArticle';article:=p_result->'rawArticle';
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(article) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 packet:=public.read_research_author_packet_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) IS DISTINCT FROM
  ARRAY['article','articleHash','calculation','calculatorExecutionHash','entryEligible','financialVerified','limitations','originalModelCutoff',
   'publishableResearch','researchCutoff','researchQualified','schemaVersion','sourceClosureHash','sources','strategyApproved','tables','validationStatus','validatorVersion','valuations']
  OR v->'calculation' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'calculation'
  OR v->>'sourceClosureHash' IS DISTINCT FROM revision->'canonical_payload'->'hashes'->>'sourceClosureHash'
  OR v->'sources' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->'descriptor' ORDER BY x->'descriptor'->>'id'),'[]'::jsonb) FROM jsonb_array_elements(packet->'sources') x)
 THEN RAISE EXCEPTION 'research_author_result_validated_context'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2'
  OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation' OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat'
  OR o->>'assignmentId' IS DISTINCT FROM a->>'assignment_id' OR o->>'jobId' IS DISTINCT FROM a->>'job_id'
  OR o->'attempt' IS DISTINCT FROM a->'attempt' OR o->>'reservationId' IS DISTINCT FROM a->>'reservation_id'
  OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR o->>'inputHash' IS DISTINCT FROM p_input_hash
  OR o->'reviewPackHash' IS DISTINCT FROM 'null'::jsonb
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string'
  OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(o->'dispatchObservationHash') IS DISTINCT FROM 'string'
  OR jsonb_typeof(o->'completionObservationHash') IS DISTINCT FROM 'string'
  OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$' OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]'
    OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
  OR v->>'schemaVersion' IS DISTINCT FROM 'validated-business-article-v2'
  OR v->>'validatorVersion' IS DISTINCT FROM 'business-article-contract-v2.1'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only'
  OR v->'article' IS DISTINCT FROM article OR v->>'articleHash' IS DISTINCT FROM public.research_complete_hash_v2(v-'articleHash')
  OR o->>'articleHash' IS DISTINCT FROM v->>'articleHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(article)
  OR article->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR article->>'inputHash' IS DISTINCT FROM p_input_hash
  OR article->>'researchCompanyId' IS DISTINCT FROM a->>'research_company_id'
  OR article->>'symbol' IS DISTINCT FROM revision->'canonical_payload'->'researchIdentity'->>'symbol'
  OR article->>'evidenceCutoffAt' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'researchCutoff'
  OR v->'financialVerified' IS DISTINCT FROM 'false'::jsonb OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb
  OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb
  OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_author_result_binding'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz; ended:=(o->>'controllerObservedEndAt')::timestamptz;
 authored:=(article->>'authoredAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR authored IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(authored)
  OR started<(a->>'assigned_at')::timestamptz OR started<(revision->'canonical_payload'->'clocks'->>'researchCutoff')::timestamptz
  OR ended<started OR authored<started OR authored>ended OR ended>n
  OR n>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_clock'; END IF;
 old:=public.read_research_author_result_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF old IS NOT NULL THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_author_result_replay_conflict'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_author_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((a->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;

ALTER FUNCTION public.read_research_author_result_v2(jsonb,uuid,text,text) OWNER TO research_input_preparation_owner_v2;
ALTER FUNCTION public.receive_research_author_result_v2(jsonb,uuid,text,text,jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_author_result_v2(jsonb,uuid,text,text),public.receive_research_author_result_v2(jsonb,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_author_result_v2(jsonb,uuid,text,text),public.receive_research_author_result_v2(jsonb,uuid,text,text,jsonb) TO service_role;
COMMIT;
