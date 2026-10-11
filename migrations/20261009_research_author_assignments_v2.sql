BEGIN;
-- Depends on accepted complete-input v2. No reservation/role execution is created here.
CREATE TABLE public.research_author_assignments_v2 (
 assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.research_deep_jobs_v1(job_id),
 attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 reservation_id uuid NOT NULL REFERENCES public.research_model_reservations_v1(reservation_id),
 input_revision_id uuid NOT NULL REFERENCES public.research_article_input_revisions_v2(revision_id),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 research_company_id uuid NOT NULL REFERENCES public.research_observed_companies_v1(research_company_id),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 controller_principal text NOT NULL CHECK(controller_principal ~ '^[a-f0-9]{64}$'),
 work_owner text NOT NULL CHECK(work_owner ~ '^[A-Za-z0-9:_-]{3,120}$'),
 canonical_request jsonb NOT NULL,
 assigned_at timestamptz NOT NULL,
 reservation_started_at timestamptz NOT NULL,
 reservation_expires_at timestamptz NOT NULL,
 original_job_deadline timestamptz NOT NULL,
 CHECK(isfinite(assigned_at) AND isfinite(reservation_started_at)
   AND isfinite(reservation_expires_at) AND isfinite(original_job_deadline)),
 CHECK(assigned_at >= reservation_started_at AND assigned_at < reservation_expires_at
   AND assigned_at < original_job_deadline),
 UNIQUE(job_id,attempt)
);
ALTER TABLE public.research_author_assignments_v2 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_author_assignments_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_author_assignments_v2 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_research_author_assignment_v2 BEFORE UPDATE OR DELETE OR TRUNCATE
 ON public.research_author_assignments_v2 FOR EACH STATEMENT
 EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();

-- Only a private RPC may load a live original assignment context. The HTTP adapter
-- must independently resolve the credential principal and current compiled mapping.
CREATE FUNCTION public.research_author_assignment_context_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE revision jsonb; payload jsonb; j public.research_deep_jobs_v1;
 r public.research_model_reservations_v1; n timestamptz;
BEGIN
 IF p_revision_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
  OR p_principal IS NULL OR p_principal !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'research_author_assignment_identity_invalid'; END IF;
 -- This retains the source-fence then global-deep locks across admission/read.
 revision:=public.read_research_article_input_revision_v2(p_request);
 payload:=revision->'canonical_payload';
 IF revision->>'status' IS DISTINCT FROM 'sealed'
  OR revision->>'revision_id' IS DISTINCT FROM p_revision_id::text
  OR revision->>'input_hash' IS DISTINCT FROM p_input_hash
  OR revision->'canonical_request' IS DISTINCT FROM p_request
  OR payload IS NULL OR public.research_complete_hash_v2(payload) IS DISTINCT FROM p_input_hash
  OR payload->>'schemaVersion' IS DISTINCT FROM 'research-article-input-v2'
  OR payload->'capabilities' IS DISTINCT FROM jsonb_build_object(
   'financialVerified',false,'dispatchReady',false,'modelDispatched',false,'publishableResearch',false,
   'researchQualified',false,'strategyApproved',false,'entryEligible',false,'historicalPITEligible',false)
  THEN RAISE EXCEPTION 'research_author_assignment_input_invalid'; END IF;
 SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=(p_request->>'jobId')::uuid FOR SHARE;
 SELECT * INTO r FROM public.research_model_reservations_v1 WHERE reservation_id=(p_request->>'reservationId')::uuid FOR SHARE;
 n:=clock_timestamp();
 IF j.job_id IS NULL OR r.reservation_id IS NULL
  OR j.research_scope IS DISTINCT FROM 'research_observed_v1' OR j.status IS DISTINCT FROM 'running'
  OR j.attempts IS DISTINCT FROM (p_request->>'attempt')::integer OR j.lease_owner IS DISTINCT FROM p_request->>'owner'
  OR j.observed_snapshot_hash IS DISTINCT FROM p_request->>'snapshotHash'
  OR r.owner IS DISTINCT FROM j.lease_owner OR r.role IS DISTINCT FROM 'company_research'
  OR r.work_key IS DISTINCT FROM 'deep:'||j.job_id||':'||j.attempts
  OR NOT isfinite(r.started_at) OR r.started_at>n OR r.started_at IS NULL
  OR r.lease_expires_at IS NULL OR NOT isfinite(r.lease_expires_at) OR r.lease_expires_at<=n
  OR r.lease_expires_at>r.started_at+interval '30 minutes'
  OR j.lease_expires_at IS NULL OR NOT isfinite(j.lease_expires_at) OR j.lease_expires_at<=n
  OR EXISTS(SELECT FROM public.research_model_completions_v1 WHERE reservation_id=r.reservation_id)
  OR revision->>'job_id' IS DISTINCT FROM j.job_id::text
  OR revision->>'attempt' IS DISTINCT FROM j.attempts::text
  OR revision->>'reservation_id' IS DISTINCT FROM r.reservation_id::text
  OR revision->>'research_company_id' IS DISTINCT FROM j.research_company_id::text
  OR revision->>'research_scope' IS DISTINCT FROM j.research_scope
  OR revision->>'snapshot_hash' IS DISTINCT FROM j.observed_snapshot_hash
  OR payload->'originalJob' IS DISTINCT FROM jsonb_build_object(
   'jobId',j.job_id,'attempt',j.attempts,'owner',j.lease_owner,'leaseExpiresAt',j.lease_expires_at)
  OR payload->'originalReservation' IS DISTINCT FROM jsonb_build_object(
   'reservationId',r.reservation_id,'startedAt',r.started_at,'leaseExpiresAt',r.lease_expires_at)
  OR payload->'researchIdentity'->>'researchCompanyId' IS DISTINCT FROM j.research_company_id::text
  OR payload->'researchIdentity'->>'symbol' IS DISTINCT FROM j.symbol
  OR payload->'researchIdentity'->>'scope' IS DISTINCT FROM j.research_scope
  OR payload->'researchIdentity'->>'snapshotHash' IS DISTINCT FROM j.observed_snapshot_hash
  THEN RAISE EXCEPTION 'research_author_assignment_original_fence_lost'; END IF;
 RETURN revision;
END $$;

CREATE FUNCTION public.read_research_author_assignment_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE revision jsonb; saved public.research_author_assignments_v2;
BEGIN
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 SELECT * INTO saved FROM public.research_author_assignments_v2
  WHERE job_id=(p_request->>'jobId')::uuid AND attempt=(p_request->>'attempt')::integer;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF saved.canonical_request IS DISTINCT FROM p_request OR saved.input_revision_id IS DISTINCT FROM p_revision_id
  OR saved.input_hash IS DISTINCT FROM p_input_hash OR saved.controller_principal IS DISTINCT FROM p_principal
  OR saved.work_owner IS DISTINCT FROM p_request->>'owner'
  OR saved.reservation_id::text IS DISTINCT FROM p_request->>'reservationId'
  OR saved.research_company_id::text IS DISTINCT FROM revision->>'research_company_id'
  OR saved.snapshot_hash IS DISTINCT FROM revision->>'snapshot_hash'
  OR saved.reservation_started_at IS DISTINCT FROM (revision->'canonical_payload'->'originalReservation'->>'startedAt')::timestamptz
  OR saved.reservation_expires_at IS DISTINCT FROM (revision->'canonical_payload'->'originalReservation'->>'leaseExpiresAt')::timestamptz
  OR saved.original_job_deadline IS DISTINCT FROM (revision->'canonical_payload'->'originalJob'->>'leaseExpiresAt')::timestamptz
  THEN RAISE EXCEPTION 'research_author_assignment_replay_conflict'; END IF;
 IF clock_timestamp()>=least(saved.original_job_deadline,saved.reservation_expires_at) THEN
  RAISE EXCEPTION 'research_author_assignment_expired'; END IF;
 RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION public.assign_research_author_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE revision jsonb; existing jsonb; saved public.research_author_assignments_v2;
 payload jsonb; n timestamptz;
BEGIN
 -- Exact replay still passes every live original/source fence before returning.
 existing:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 payload:=revision->'canonical_payload';n:=clock_timestamp();
 INSERT INTO public.research_author_assignments_v2(job_id,attempt,reservation_id,input_revision_id,input_hash,
  research_company_id,snapshot_hash,controller_principal,work_owner,canonical_request,assigned_at,
  reservation_started_at,reservation_expires_at,original_job_deadline)
 VALUES((p_request->>'jobId')::uuid,(p_request->>'attempt')::integer,(p_request->>'reservationId')::uuid,
  p_revision_id,p_input_hash,(revision->>'research_company_id')::uuid,revision->>'snapshot_hash',p_principal,
  p_request->>'owner',p_request,n,(payload->'originalReservation'->>'startedAt')::timestamptz,
  (payload->'originalReservation'->>'leaseExpiresAt')::timestamptz,(payload->'originalJob'->>'leaseExpiresAt')::timestamptz)
 RETURNING * INTO saved;
 IF clock_timestamp()>=least(saved.original_job_deadline,saved.reservation_expires_at) THEN
  RAISE EXCEPTION 'research_author_assignment_expired'; END IF;
 RETURN to_jsonb(saved);
END $$;

ALTER FUNCTION public.research_author_assignment_context_v2(jsonb,uuid,text,text) OWNER TO research_input_preparation_owner_v2;
ALTER FUNCTION public.read_research_author_assignment_v2(jsonb,uuid,text,text) OWNER TO research_input_preparation_owner_v2;
ALTER FUNCTION public.assign_research_author_v2(jsonb,uuid,text,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_author_assignment_context_v2(jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_research_author_assignment_v2(jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assign_research_author_v2(jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_research_author_assignment_v2(jsonb,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_research_author_v2(jsonb,uuid,text,text) TO service_role;
COMMIT;
