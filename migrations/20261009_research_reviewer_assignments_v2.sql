BEGIN;
CREATE TABLE public.research_reviewer_assignments_v2 (
 assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_assignment_id uuid NOT NULL UNIQUE REFERENCES public.research_author_assignments_v2(assignment_id),
 author_result_id uuid NOT NULL UNIQUE REFERENCES public.research_author_results_v2(result_id),
 author_result_hash text NOT NULL CHECK(author_result_hash ~ '^[a-f0-9]{64}$'),
 job_id uuid NOT NULL REFERENCES public.research_deep_jobs_v1(job_id),
 attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 input_revision_id uuid NOT NULL REFERENCES public.research_article_input_revisions_v2(revision_id),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 reviewer_principal text NOT NULL CHECK(reviewer_principal ~ '^[a-f0-9]{64}$'),
 work_owner text NOT NULL CHECK(work_owner ~ '^[A-Za-z0-9:_-]{3,120}$'),
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.research_model_reservations_v1(reservation_id),
 reservation_started_at timestamptz NOT NULL CHECK(isfinite(reservation_started_at)),
 reservation_expires_at timestamptz NOT NULL CHECK(isfinite(reservation_expires_at)),
 original_job_deadline timestamptz NOT NULL CHECK(isfinite(original_job_deadline)),
 assigned_at timestamptz NOT NULL CHECK(isfinite(assigned_at)),
 CHECK(assigned_at>=reservation_started_at AND assigned_at<least(reservation_expires_at,original_job_deadline)),
 UNIQUE(job_id,attempt)
);
ALTER TABLE public.research_reviewer_assignments_v2 OWNER TO research_observed_rpc_owner;
ALTER TABLE public.research_reviewer_assignments_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_reviewer_assignments_v2 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.research_reviewer_assignments_v2 TO research_input_preparation_owner_v2;
CREATE POLICY reviewer_assignment_context_read_v2 ON public.research_reviewer_assignments_v2 FOR SELECT TO research_input_preparation_owner_v2 USING(true);
CREATE TRIGGER immutable_research_reviewer_assignment_v2 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_reviewer_assignments_v2
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();

CREATE FUNCTION public.read_research_reviewer_context_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; a jsonb; saved public.research_reviewer_assignments_v2; r public.research_model_reservations_v1; n timestamptz;
BEGIN
 IF p_reviewer_principal IS NULL OR p_reviewer_principal !~ '^[a-f0-9]{64}$'
  OR p_author_principal IS NULL OR p_author_principal !~ '^[a-f0-9]{64}$'
  OR p_reviewer_principal=p_author_principal THEN RAISE EXCEPTION 'research_reviewer_principal_invalid'; END IF;
 -- p_author_principal is server configuration-derived, never the stored fallback.
 h:=public.read_research_author_handoff_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_result_id,p_result_hash);
 IF h->'completion' IS NULL OR h->'completion'='null'::jsonb THEN RAISE EXCEPTION 'research_reviewer_author_handoff_missing'; END IF;
 a:=h->'assignment';
 SELECT * INTO saved FROM public.research_reviewer_assignments_v2 WHERE job_id=(a->>'job_id')::uuid AND attempt=(a->>'attempt')::integer;
 IF NOT FOUND THEN RETURN jsonb_build_object('authorContext',h,'reviewerAssignment',NULL); END IF;
 SELECT * INTO r FROM public.research_model_reservations_v1 WHERE reservation_id=saved.reservation_id;n:=clock_timestamp();
 IF saved.author_assignment_id::text IS DISTINCT FROM a->>'assignment_id' OR saved.author_result_id IS DISTINCT FROM p_result_id
  OR saved.author_result_hash IS DISTINCT FROM p_result_hash OR saved.input_revision_id IS DISTINCT FROM p_revision_id
  OR saved.input_hash IS DISTINCT FROM p_input_hash OR saved.reviewer_principal IS DISTINCT FROM p_reviewer_principal
  OR saved.work_owner IS DISTINCT FROM a->>'work_owner'
  OR saved.original_job_deadline IS DISTINCT FROM (a->>'original_job_deadline')::timestamptz
  OR r.reservation_id IS NULL OR r.role IS DISTINCT FROM 'counter_review' OR r.owner IS DISTINCT FROM saved.work_owner
  OR r.work_key IS DISTINCT FROM 'deep-review-v2:'||saved.job_id||':'||saved.attempt||':'||saved.author_result_id
  OR r.started_at IS DISTINCT FROM saved.reservation_started_at OR r.lease_expires_at IS DISTINCT FROM saved.reservation_expires_at
  OR NOT isfinite(r.started_at) OR NOT isfinite(r.lease_expires_at)
  OR r.lease_expires_at>r.started_at+interval '30 minutes' OR r.started_at>saved.assigned_at
  OR saved.assigned_at>n OR saved.reservation_started_at<(h->'completion'->>'finished_at')::timestamptz
  OR EXISTS(SELECT FROM public.research_model_completions_v1 WHERE reservation_id=r.reservation_id)
  OR n>=least(saved.original_job_deadline,saved.reservation_expires_at)
 THEN RAISE EXCEPTION 'research_reviewer_assignment_fence_lost'; END IF;
 IF clock_timestamp()>=least(saved.original_job_deadline,saved.reservation_expires_at) THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
 RETURN jsonb_build_object('authorContext',h,'reviewerAssignment',to_jsonb(saved));
END $$;
ALTER FUNCTION public.read_research_reviewer_context_v2(jsonb,uuid,text,text,text,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_reviewer_context_v2(jsonb,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_reviewer_context_v2(jsonb,uuid,text,text,text,uuid,text) TO service_role,research_observed_rpc_owner;

CREATE FUNCTION public.assign_research_reviewer_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; a jsonb; existing jsonb; r public.research_model_reservations_v1; saved public.research_reviewer_assignments_v2;n timestamptz;
BEGIN
 context:=public.read_research_reviewer_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 existing:=context->'reviewerAssignment';
 IF existing<>'null'::jsonb THEN
  IF clock_timestamp()>=least((existing->>'original_job_deadline')::timestamptz,(existing->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
  RETURN existing;
 END IF;
 a:=context->'authorContext'->'assignment';
 SELECT * INTO r FROM public.reserve_research_model_v1('counter_review',a->>'work_owner',
  'deep-review-v2:'||(a->>'job_id')||':'||(a->>'attempt')||':'||p_result_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 n:=clock_timestamp();
 IF n>=least((a->>'original_job_deadline')::timestamptz,r.lease_expires_at) THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
 INSERT INTO public.research_reviewer_assignments_v2(author_assignment_id,author_result_id,author_result_hash,job_id,attempt,
  input_revision_id,input_hash,reviewer_principal,work_owner,reservation_id,reservation_started_at,reservation_expires_at,original_job_deadline,assigned_at)
 VALUES((a->>'assignment_id')::uuid,p_result_id,p_result_hash,(a->>'job_id')::uuid,(a->>'attempt')::integer,
  p_revision_id,p_input_hash,p_reviewer_principal,a->>'work_owner',r.reservation_id,r.started_at,r.lease_expires_at,(a->>'original_job_deadline')::timestamptz,n)
 RETURNING * INTO saved;
 context:=public.read_research_reviewer_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 IF context->'reviewerAssignment' IS DISTINCT FROM to_jsonb(saved) THEN RAISE EXCEPTION 'research_reviewer_assignment_changed'; END IF;
 IF clock_timestamp()>=least(saved.original_job_deadline,saved.reservation_expires_at) THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
 RETURN to_jsonb(saved);
END $$;
ALTER FUNCTION public.assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text) TO service_role;

-- Public-summary projection duplicated deliberately to leave the independently
-- accepted active author reader byte-equivalent. Both follow the same seal rules.
CREATE FUNCTION public.read_research_reviewer_sources_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; revision jsonb; payload jsonb; seal public.research_source_seals_v2;
 item jsonb; doc jsonb; m jsonb; descriptor jsonb; sources jsonb:='[]'; result jsonb;
 observed timestamptz; collected timestamptz; cutoff timestamptz; symbol text;
BEGIN
 context:=public.read_research_reviewer_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
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

 IF public.read_research_reviewer_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash) IS DISTINCT FROM context
 THEN RAISE EXCEPTION 'research_reviewer_context_changed'; END IF;
 result:=jsonb_build_object('sourceSealReceivedAt',seal.received_at,'sources',sources);
 IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'research_reviewer_sources_bound'; END IF;
 IF clock_timestamp()>=least((context->'reviewerAssignment'->>'original_job_deadline')::timestamptz,(context->'reviewerAssignment'->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_reviewer_assignment_expired'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.read_research_reviewer_sources_v2(jsonb,uuid,text,text,text,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_reviewer_sources_v2(jsonb,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_reviewer_sources_v2(jsonb,uuid,text,text,text,uuid,text) TO service_role;
COMMIT;
