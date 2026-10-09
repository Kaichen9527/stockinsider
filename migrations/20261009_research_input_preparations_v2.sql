BEGIN;
-- Preparation receipts only. No publication revision, execution identity or authority is granted.
CREATE ROLE research_input_preparation_owner_v2 NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE TABLE public.research_input_preparations_v2 (
 preparation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.research_deep_jobs_v1(job_id),
 attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 reservation_id uuid NOT NULL REFERENCES public.research_model_reservations_v1(reservation_id),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 request jsonb NOT NULL, input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL, logical_bytes integer NOT NULL CHECK(logical_bytes BETWEEN 1 AND 524288), source_seal_id uuid REFERENCES public.research_source_seals_v2(seal_id),
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(job_id,attempt,reservation_id,request_hash)
);
ALTER TABLE public.research_input_preparations_v2 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_input_preparations_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_input_preparations_v2 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_research_input_preparation_v2 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_input_preparations_v2 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
GRANT EXECUTE ON FUNCTION public.reject_research_source_receipt_mutation_v2(),public.research_observed_canonical_json_v1(jsonb),public.seal_research_sources_v2(jsonb,timestamptz),public.assert_research_source_seal_v2(uuid),public.research_source_root_v2(jsonb) TO research_input_preparation_owner_v2;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['research_deep_jobs_v1','research_deep_job_attempts_v1','research_model_reservations_v1','research_model_completions_v1','research_priority_runs_v1','research_observed_priority_store_receipts_v1','research_observed_companies_v1','research_observed_roster_snapshots_v1','research_observed_roster_members_v1','source_raw_documents'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO research_input_preparation_owner_v2',name);
  EXECUTE format('CREATE POLICY input_preparation_read_v2 ON public.%I FOR SELECT TO research_input_preparation_owner_v2 USING(true)',name);
 END LOOP;
END $$;
-- PostgreSQL row-locking SELECT requires UPDATE privilege on at least one column.
-- This NOLOGIN owner exposes no mutation API; service_role receives neither grant.
GRANT UPDATE(job_id) ON public.research_deep_jobs_v1 TO research_input_preparation_owner_v2;
GRANT UPDATE(reservation_id) ON public.research_model_reservations_v1 TO research_input_preparation_owner_v2;
-- FOR SHARE needs the UPDATE USING policy; WITH CHECK(false) forbids actual changes.
CREATE POLICY input_preparation_lock_v2 ON public.research_deep_jobs_v1 FOR UPDATE TO research_input_preparation_owner_v2 USING(true) WITH CHECK(false);
CREATE POLICY input_preparation_lock_v2 ON public.research_model_reservations_v1 FOR UPDATE TO research_input_preparation_owner_v2 USING(true) WITH CHECK(false);
CREATE POLICY input_preparation_source_sealer_v2 ON public.source_raw_documents FOR SELECT TO research_source_fence_owner_v2 USING(true);
-- Fixed full canonical UTF-8 serialization, not PostgreSQL physical storage or WAL.
CREATE FUNCTION public.research_input_preparation_bytes_v2(p_request jsonb,p_payload jsonb,p_new_seal jsonb) RETURNS integer
 LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
 SELECT octet_length(convert_to(public.research_observed_canonical_json_v1(p_request),'UTF8'))
  +octet_length(convert_to(public.research_observed_canonical_json_v1(p_payload),'UTF8'))
  +CASE WHEN p_new_seal='null'::jsonb THEN 0 ELSE octet_length(convert_to(public.research_observed_canonical_json_v1(p_new_seal),'UTF8')) END
 $$;
ALTER FUNCTION public.research_input_preparation_bytes_v2(jsonb,jsonb,jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_input_preparation_bytes_v2(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.research_source_seals_v2 TO research_input_preparation_owner_v2;
CREATE POLICY input_preparation_seal_read_v2 ON public.research_source_seals_v2 FOR SELECT TO research_input_preparation_owner_v2 USING(true);
CREATE FUNCTION public.prepare_research_input_v2(p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.research_deep_jobs_v1; r public.research_model_reservations_v1;
 pri public.research_priority_runs_v1; snap public.research_observed_roster_snapshots_v1;
 old public.research_input_preparations_v2; saved public.research_input_preparations_v2;
 rh text; n timestamptz; docs jsonb; seal jsonb; material jsonb;
 used_count bigint; used_bytes bigint; charged_bytes integer; seal_manifest jsonb; seal_hash text; new_seal boolean:=false;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'input_preparation_read_committed_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_request) key) IS DISTINCT FROM ARRAY['attempt','bundleId','jobId','owner','reservationId','scope','snapshotHash','sourceDocumentIds']
  OR p_request->>'scope' IS DISTINCT FROM 'research_observed_v1' OR p_request->'bundleId' IS DISTINCT FROM 'null'::jsonb
  OR jsonb_typeof(p_request->'owner') IS DISTINCT FROM 'string' OR p_request->>'owner' !~ '^[A-Za-z0-9:_-]{3,120}$'
  OR jsonb_typeof(p_request->'attempt') IS DISTINCT FROM 'number' OR p_request->>'attempt' !~ '^[1-3]$'
  OR jsonb_typeof(p_request->'sourceDocumentIds') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'input_preparation_shape'; END IF;
 IF jsonb_array_length(p_request->'sourceDocumentIds')>30 OR EXISTS(SELECT FROM jsonb_array_elements(p_request->'sourceDocumentIds') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_request->'sourceDocumentIds') x)<>jsonb_array_length(p_request->'sourceDocumentIds')
  OR jsonb_typeof(p_request->'jobId') IS DISTINCT FROM 'string' OR p_request->>'jobId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_request->'reservationId') IS DISTINCT FROM 'string' OR p_request->>'reservationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_request->'snapshotHash') IS DISTINCT FROM 'string' OR p_request->>'snapshotHash' !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'input_preparation_shape'; END IF;
 -- One order: stable source fence, then existing global deep-job/model slot.
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=(p_request->>'jobId')::uuid FOR SHARE;
 SELECT * INTO r FROM public.research_model_reservations_v1 WHERE reservation_id=(p_request->>'reservationId')::uuid FOR SHARE;
 n:=clock_timestamp();
 IF j.job_id IS NULL OR r.reservation_id IS NULL OR j.research_scope IS DISTINCT FROM 'research_observed_v1'
  OR j.status IS DISTINCT FROM 'running' OR j.attempts IS DISTINCT FROM (p_request->>'attempt')::integer
  OR j.lease_owner IS DISTINCT FROM p_request->>'owner' OR j.observed_snapshot_hash IS DISTINCT FROM p_request->>'snapshotHash'
  OR j.lease_expires_at IS NULL OR NOT isfinite(j.lease_expires_at) OR j.lease_expires_at<=n
  OR r.role IS DISTINCT FROM 'company_research' OR r.owner IS DISTINCT FROM j.lease_owner
  OR r.work_key IS DISTINCT FROM 'deep:'||j.job_id||':'||j.attempts
  OR r.started_at IS NULL OR NOT isfinite(r.started_at) OR r.started_at>n
  OR r.lease_expires_at IS NULL OR NOT isfinite(r.lease_expires_at) OR r.lease_expires_at<=n
  OR r.lease_expires_at>r.started_at+interval '30 minutes'
  OR NOT EXISTS(SELECT FROM public.research_deep_job_attempts_v1 a WHERE a.job_id=j.job_id AND a.attempt=j.attempts AND a.owner=j.lease_owner AND a.lease_expires_at=j.lease_expires_at AND a.claimed_at<=n)
  OR EXISTS(SELECT FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id)
 THEN RAISE EXCEPTION 'input_preparation_original_lease_lost'; END IF;
 SELECT * INTO pri FROM public.research_priority_runs_v1 WHERE run_id=j.priority_run_id;
 SELECT * INTO snap FROM public.research_observed_roster_snapshots_v1 WHERE snapshot_hash=j.observed_snapshot_hash;
 IF pri.run_id IS NULL OR pri.research_scope IS DISTINCT FROM j.research_scope OR pri.observed_snapshot_hash IS DISTINCT FROM j.observed_snapshot_hash
  OR pri.as_of IS NULL OR NOT isfinite(pri.as_of) OR pri.as_of>n OR snap.snapshot_hash IS NULL OR snap.received_at IS NULL OR NOT isfinite(snap.received_at) OR snap.latest_observed_at IS NULL OR NOT isfinite(snap.latest_observed_at) OR snap.received_at>pri.as_of OR snap.latest_observed_at>pri.as_of
  OR NOT EXISTS(SELECT FROM public.research_observed_priority_store_receipts_v1 s WHERE s.run_id=pri.run_id AND s.stored_run_hash=encode(sha256(convert_to(to_jsonb(pri)::text,'UTF8')),'hex'))
  OR NOT EXISTS(SELECT FROM public.research_observed_roster_members_v1 m JOIN public.research_observed_companies_v1 c USING(research_company_id) WHERE m.snapshot_hash=snap.snapshot_hash AND m.research_company_id=j.research_company_id AND m.symbol=j.symbol AND c.symbol=j.symbol)
 THEN RAISE EXCEPTION 'input_preparation_lineage'; END IF;
 rh:=encode(sha256(convert_to(public.research_observed_canonical_json_v1(p_request),'UTF8')),'hex');
 SELECT * INTO old FROM public.research_input_preparations_v2 WHERE job_id=j.job_id AND attempt=j.attempts AND reservation_id=r.reservation_id AND request_hash=rh;
 IF FOUND THEN
  IF old.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'input_preparation_replay_mismatch'; END IF;
  IF old.source_seal_id IS NOT NULL THEN PERFORM public.assert_research_source_seal_v2(old.source_seal_id); END IF;
  IF clock_timestamp()>=least(j.lease_expires_at,r.lease_expires_at) THEN RAISE EXCEPTION 'input_preparation_original_lease_lost'; END IF;
  RETURN to_jsonb(old)||jsonb_build_object('replay',true,'dispatchReady',false);
 END IF;
 -- Original-unit history is permanent: expiry, invalidation and takeover never refund it.
 SELECT count(*),coalesce(sum(logical_bytes),0) INTO used_count,used_bytes FROM public.research_input_preparations_v2
  WHERE job_id=j.job_id AND attempt=j.attempts AND reservation_id=r.reservation_id;
 IF used_count>=4 THEN RAISE EXCEPTION 'input_preparation_count_bound'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'rowHash',encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex')) ORDER BY d.id),'[]') INTO docs FROM public.source_raw_documents d WHERE p_request->'sourceDocumentIds' @> jsonb_build_array(d.id::text);
 IF jsonb_array_length(docs)<>jsonb_array_length(p_request->'sourceDocumentIds') THEN RAISE EXCEPTION 'input_preparation_source_missing'; END IF;
 IF jsonb_array_length(docs)>0 THEN
  -- Exact existing-seal lookup under the shared source fence; full receipt is charged only when new.
  SELECT jsonb_agg(jsonb_build_object('id',d.id::text,'rowHash',encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex'),
   'root',public.research_source_root_v2(to_jsonb(d)),'publishedAt',to_jsonb(d)->'published_at',
   'observedAt',to_jsonb(d)->'collected_at','rights',d.metadata->>'rights_boundary') ORDER BY d.id) INTO seal_manifest
   FROM public.source_raw_documents d WHERE p_request->'sourceDocumentIds' @> jsonb_build_array(d.id::text);
  seal_hash:=encode(sha256(convert_to(jsonb_build_object('documents',seal_manifest,'cutoff',n)::text,'UTF8')),'hex');
  new_seal:=NOT EXISTS(SELECT FROM public.research_source_seals_v2 WHERE request_hash=seal_hash);
  seal:=public.seal_research_sources_v2(docs,n);
  IF seal->>'request_hash' IS DISTINCT FROM seal_hash THEN RAISE EXCEPTION 'input_preparation_seal_projection_changed'; END IF;
 END IF;
 -- Freeze DB-derived manifests; full original rows remain behind the private source seal.
 -- No supplied model output, financial facts, calculator or role identity is accepted here.
 material:=jsonb_build_object('schemaVersion','research-input-preparation-v2','researchCompanyId',j.research_company_id,'symbol',j.symbol,
  'scope',j.research_scope,'snapshotHash',snap.snapshot_hash,'mappingDigest',snap.mapping_digest,'stockId',j.stock_id,
  'priorityRunId',pri.run_id,'priorityInputHash',pri.input_hash,'discoveryCutoff',pri.as_of,'originalModelCutoff',NULL,'researchCutoff',n,
  'originalJob',jsonb_build_object('jobId',j.job_id,'attempt',j.attempts,'owner',j.lease_owner,'leaseExpiresAt',j.lease_expires_at),
  'originalReservation',jsonb_build_object('reservationId',r.reservation_id,'startedAt',r.started_at,'leaseExpiresAt',r.lease_expires_at),
  'sourceManifest',coalesce(seal->'documents','[]'),'sourceSelectionComplete',false,'financial',NULL,'calculator',NULL,
  'status','draft_incomplete','gaps',jsonb_build_array('financial_input_revision_missing','trusted_calculator_not_bound','original_model_not_selected','trusted_execution_authority_unavailable')||CASE WHEN jsonb_array_length(docs)=0 THEN jsonb_build_array('sources_not_selected') ELSE '[]'::jsonb END,
  'modelDispatched',false,'publishableResearch',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false);
 charged_bytes:=public.research_input_preparation_bytes_v2(p_request,material,CASE WHEN new_seal THEN seal ELSE 'null'::jsonb END);
 IF used_bytes+charged_bytes>524288 THEN RAISE EXCEPTION 'input_preparation_byte_bound'; END IF;
 IF clock_timestamp()>=least(j.lease_expires_at,r.lease_expires_at) THEN RAISE EXCEPTION 'input_preparation_original_lease_lost'; END IF;
 INSERT INTO public.research_input_preparations_v2(job_id,attempt,reservation_id,request_hash,request,input_hash,payload,logical_bytes,source_seal_id,admitted_at)
 VALUES(j.job_id,j.attempts,r.reservation_id,rh,p_request,encode(sha256(convert_to(public.research_observed_canonical_json_v1(material),'UTF8')),'hex'),material,charged_bytes,(seal->>'seal_id')::uuid,n) RETURNING * INTO saved;
 RETURN to_jsonb(saved)||jsonb_build_object('replay',false,'dispatchReady',false);
END $$;
ALTER FUNCTION public.prepare_research_input_v2(jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.prepare_research_input_v2(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_research_input_v2(jsonb) TO service_role;
COMMIT;
