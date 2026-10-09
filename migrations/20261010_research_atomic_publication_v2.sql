BEGIN;
-- Same publication storage. These branches never grant investment eligibility.
ALTER TABLE public.candidate_research_dossiers
 ADD COLUMN revision_kind text NOT NULL DEFAULT 'legacy_detail_v1',
 ADD COLUMN research_input_revision_id uuid REFERENCES public.research_article_input_revisions_v2(revision_id) ON DELETE RESTRICT,
 ADD COLUMN research_company_id uuid REFERENCES public.research_observed_companies_v1(research_company_id) ON DELETE RESTRICT,
 ADD COLUMN research_snapshot_hash text,
 ADD COLUMN research_author_result_id uuid REFERENCES public.research_author_results_v2(result_id) ON DELETE RESTRICT,
 ADD COLUMN research_reviewer_result_id uuid REFERENCES public.research_reviewer_results_v2(result_id) ON DELETE RESTRICT,
 ADD COLUMN source_seal_id uuid REFERENCES public.research_source_seals_v2(seal_id) ON DELETE RESTRICT,
 ALTER COLUMN detail_snapshot_id DROP NOT NULL,
 ADD CONSTRAINT research_dossier_revision_union_v2 CHECK(
  (revision_kind='legacy_detail_v1' AND detail_snapshot_id IS NOT NULL
   AND research_input_revision_id IS NULL AND research_company_id IS NULL AND research_snapshot_hash IS NULL
   AND research_author_result_id IS NULL AND research_reviewer_result_id IS NULL AND source_seal_id IS NULL)
  OR (revision_kind='research_input_v2' AND detail_snapshot_id IS NULL AND narrative_kind='codex_enriched'
   AND validation_status='valid' AND bundle_id IS NOT NULL AND input_hash IS NOT NULL
   AND research_input_revision_id IS NOT NULL AND research_company_id IS NOT NULL
   AND research_snapshot_hash IS NOT NULL AND research_snapshot_hash ~ '^[a-f0-9]{64}$'
   AND research_author_result_id IS NOT NULL AND research_reviewer_result_id IS NOT NULL AND source_seal_id IS NOT NULL));
ALTER TABLE public.candidate_dossier_submission_receipts
 ADD COLUMN revision_kind text NOT NULL DEFAULT 'legacy_detail_v1',
 ADD COLUMN research_input_revision_id uuid REFERENCES public.research_article_input_revisions_v2(revision_id) ON DELETE RESTRICT,
 ADD COLUMN research_company_id uuid REFERENCES public.research_observed_companies_v1(research_company_id) ON DELETE RESTRICT,
 ADD COLUMN research_snapshot_hash text,
 ADD COLUMN research_author_result_id uuid REFERENCES public.research_author_results_v2(result_id) ON DELETE RESTRICT,
 ADD COLUMN research_reviewer_result_id uuid REFERENCES public.research_reviewer_results_v2(result_id) ON DELETE RESTRICT,
 ADD COLUMN source_seal_id uuid REFERENCES public.research_source_seals_v2(seal_id) ON DELETE RESTRICT,
 ADD COLUMN research_request_hash text,
 ALTER COLUMN revision_id DROP NOT NULL,
 ADD CONSTRAINT research_receipt_revision_union_v2 CHECK(
  (revision_kind='legacy_detail_v1' AND revision_id IS NOT NULL
   AND research_input_revision_id IS NULL AND research_company_id IS NULL AND research_snapshot_hash IS NULL
   AND research_author_result_id IS NULL AND research_reviewer_result_id IS NULL AND source_seal_id IS NULL AND research_request_hash IS NULL)
  OR (revision_kind='research_input_v2' AND revision_id IS NULL AND status='accepted'
   AND research_input_revision_id IS NOT NULL AND research_company_id IS NOT NULL
   AND research_snapshot_hash IS NOT NULL AND research_snapshot_hash ~ '^[a-f0-9]{64}$'
   AND research_author_result_id IS NOT NULL AND research_reviewer_result_id IS NOT NULL AND source_seal_id IS NOT NULL
   AND research_request_hash IS NOT NULL AND research_request_hash ~ '^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX research_dossier_exact_input_v2 ON public.candidate_research_dossiers(research_input_revision_id,input_hash)
 WHERE revision_kind='research_input_v2';
CREATE UNIQUE INDEX research_receipt_exact_input_v2 ON public.candidate_dossier_submission_receipts(research_input_revision_id,input_hash)
 WHERE revision_kind='research_input_v2';
ALTER TABLE public.research_deep_jobs_v1
 ADD COLUMN completion_reviewer_result_id uuid REFERENCES public.research_reviewer_results_v2(result_id) ON DELETE RESTRICT;

-- This material is reconstructed from immutable, already received results. It
-- contains no principal, owner, private observations or source raw content.
CREATE FUNCTION public.research_publication_content_v2(author_payload jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schemaVersion','research-publication-v2','deepResearch',
  jsonb_build_object('schemaVersion','research-published-v2','articleHash',author_payload->'validatedArticle'->'articleHash',
   'article',author_payload->'rawArticle','tables',author_payload->'validatedArticle'->'tables',
   'valuations',author_payload->'validatedArticle'->'valuations',
   'originalModelCutoff',author_payload->'validatedArticle'->'originalModelCutoff',
   'researchCutoff',author_payload->'validatedArticle'->'researchCutoff',
   'limitations',author_payload->'validatedArticle'->'limitations',
   'researchQualified',false,'strategyApproved',false,'entryEligible',false))
$$;
ALTER FUNCTION public.research_publication_content_v2(jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_publication_content_v2(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.research_publication_content_v2(jsonb) TO research_observed_rpc_owner;

CREATE FUNCTION public.ensure_research_publication_bundle_v2(p_revision uuid,p_hash text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.research_article_input_revisions_v2;b public.candidate_dossier_bundles;v jsonb;
BEGIN
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=p_revision;
 IF NOT FOUND OR i.input_hash IS DISTINCT FROM p_hash OR i.research_scope<>'research_observed_v1'
 THEN RAISE EXCEPTION 'research_publication_input_missing';END IF;
 v:=jsonb_build_object('schemaVersion','research-bundle-lineage-v2','inputRevisionId',i.revision_id,'inputHash',i.input_hash,
  'researchCompanyId',i.research_company_id,'snapshotHash',i.snapshot_hash,'publishableResearch',false,
  'researchQualified',false,'strategyApproved',false,'entryEligible',false);
 INSERT INTO public.candidate_dossier_bundles(bundle_id,revision_kind,research_input_revision_id,research_company_id,research_snapshot_hash,input_hash,symbol,payload)
 VALUES(gen_random_uuid(),'research_input_v2',i.revision_id,i.research_company_id,i.snapshot_hash,i.input_hash,i.canonical_payload->'researchIdentity'->>'symbol',v)
 ON CONFLICT(research_input_revision_id,input_hash) WHERE revision_kind='research_input_v2' DO NOTHING;
 SELECT * INTO b FROM public.candidate_dossier_bundles WHERE revision_kind='research_input_v2' AND research_input_revision_id=i.revision_id AND input_hash=i.input_hash;
 IF b.bundle_id IS NULL OR b.payload IS DISTINCT FROM v THEN RAISE EXCEPTION 'research_publication_bundle_conflict';END IF;
 RETURN b.bundle_id;
END $$;
ALTER FUNCTION public.ensure_research_publication_bundle_v2(uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.ensure_research_publication_bundle_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ensure_research_publication_bundle_v2(uuid,text) TO research_observed_rpc_owner;

-- Caller/owner and full stored input lineage defend v2 INSERT even against an
-- RLS-bypassing service role. The legacy writer keeps its original behavior.
CREATE FUNCTION public.fence_research_dossier_insert_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE i public.research_article_input_revisions_v2;a public.research_author_results_v2;r public.research_reviewer_results_v2;
 b public.candidate_dossier_bundles;d public.candidate_research_dossiers;
BEGIN
 IF NEW.revision_kind='legacy_detail_v1' THEN RETURN NEW;END IF;
 IF NEW.revision_kind IS DISTINCT FROM 'research_input_v2' OR current_user<>'research_observed_rpc_owner'
 THEN RAISE EXCEPTION 'research_publication_writer_required';END IF;
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=NEW.research_input_revision_id;
 SELECT * INTO a FROM public.research_author_results_v2 WHERE result_id=NEW.research_author_result_id;
 SELECT * INTO r FROM public.research_reviewer_results_v2 WHERE result_id=NEW.research_reviewer_result_id;
 SELECT * INTO b FROM public.candidate_dossier_bundles WHERE bundle_id=NEW.bundle_id;
 IF i.revision_id IS NULL OR a.result_id IS NULL OR r.result_id IS NULL OR b.bundle_id IS NULL
  OR b.revision_kind IS DISTINCT FROM 'research_input_v2' OR b.research_input_revision_id IS DISTINCT FROM i.revision_id
  OR b.research_company_id IS DISTINCT FROM i.research_company_id OR b.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR b.input_hash IS DISTINCT FROM i.input_hash OR NEW.input_hash IS DISTINCT FROM i.input_hash
  OR NEW.research_company_id IS DISTINCT FROM i.research_company_id OR NEW.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR NEW.source_seal_id IS DISTINCT FROM i.source_seal_id OR NEW.source_seal_id IS NULL
  OR a.payload->>'inputRevisionId' IS DISTINCT FROM i.revision_id::text OR a.payload->>'inputHash' IS DISTINCT FROM i.input_hash
  OR r.payload->>'authorResultId' IS DISTINCT FROM a.result_id::text OR r.payload->>'authorResultHash' IS DISTINCT FROM a.result_hash
  OR r.payload->>'inputRevisionId' IS DISTINCT FROM i.revision_id::text OR r.payload->>'inputHash' IS DISTINCT FROM i.input_hash
 THEN RAISE EXCEPTION 'research_publication_storage_binding';END IF;
 IF TG_TABLE_NAME='candidate_research_dossiers' THEN
  IF NEW.content IS DISTINCT FROM public.research_publication_content_v2(a.payload)
   OR NEW.source_references IS DISTINCT FROM a.payload->'validatedArticle'->'sources'
  THEN RAISE EXCEPTION 'research_publication_content_binding';END IF;
 ELSE
  SELECT * INTO d FROM public.candidate_research_dossiers WHERE id=NEW.dossier_id;
  IF d.id IS NULL OR d.revision_kind IS DISTINCT FROM 'research_input_v2' OR d.bundle_id IS DISTINCT FROM NEW.bundle_id
   OR d.research_input_revision_id IS DISTINCT FROM i.revision_id OR d.research_author_result_id IS DISTINCT FROM a.result_id
   OR d.research_reviewer_result_id IS DISTINCT FROM r.result_id OR d.source_seal_id IS DISTINCT FROM NEW.source_seal_id
  THEN RAISE EXCEPTION 'research_publication_receipt_binding';END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.fence_research_dossier_insert_v2() OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.fence_research_dossier_insert_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_dossier_insert_v2 BEFORE INSERT ON public.candidate_research_dossiers FOR EACH ROW EXECUTE FUNCTION public.fence_research_dossier_insert_v2();
CREATE TRIGGER research_receipt_insert_v2 BEFORE INSERT ON public.candidate_dossier_submission_receipts FOR EACH ROW EXECUTE FUNCTION public.fence_research_dossier_insert_v2();
CREATE FUNCTION public.fence_research_dossier_truncate_v2() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'research_publication_truncate_isolation';END IF;
 IF (TG_TABLE_NAME='candidate_research_dossiers' AND EXISTS(SELECT FROM public.candidate_research_dossiers WHERE revision_kind='research_input_v2'))
  OR (TG_TABLE_NAME='candidate_dossier_submission_receipts' AND EXISTS(SELECT FROM public.candidate_dossier_submission_receipts WHERE revision_kind='research_input_v2'))
 THEN RAISE EXCEPTION 'research_publication_truncate_forbidden';END IF;RETURN NULL;
END $$;
ALTER FUNCTION public.fence_research_dossier_truncate_v2() OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.fence_research_dossier_truncate_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_dossier_truncate_v2 BEFORE TRUNCATE ON public.candidate_research_dossiers FOR EACH STATEMENT EXECUTE FUNCTION public.fence_research_dossier_truncate_v2();
CREATE TRIGGER research_receipt_truncate_v2 BEFORE TRUNCATE ON public.candidate_dossier_submission_receipts FOR EACH STATEMENT EXECUTE FUNCTION public.fence_research_dossier_truncate_v2();
-- Existing append-only UPDATE/DELETE triggers and paid-content check remain.
GRANT SELECT,INSERT ON public.candidate_research_dossiers,public.candidate_dossier_submission_receipts TO research_observed_rpc_owner;
CREATE POLICY research_publication_dossier_read_v2 ON public.candidate_research_dossiers FOR SELECT TO research_observed_rpc_owner USING(true);
CREATE POLICY research_publication_dossier_insert_v2 ON public.candidate_research_dossiers FOR INSERT TO research_observed_rpc_owner WITH CHECK(revision_kind='research_input_v2');
CREATE POLICY research_publication_receipt_read_v2 ON public.candidate_dossier_submission_receipts FOR SELECT TO research_observed_rpc_owner USING(true);
CREATE POLICY research_publication_receipt_insert_v2 ON public.candidate_dossier_submission_receipts FOR INSERT TO research_observed_rpc_owner WITH CHECK(revision_kind='research_input_v2');
GRANT SELECT ON public.research_author_results_v2,public.research_reviewer_results_v2 TO research_observed_rpc_owner;
CREATE POLICY research_publication_author_read_v2 ON public.research_author_results_v2 FOR SELECT TO research_observed_rpc_owner USING(true);
GRANT EXECUTE ON FUNCTION public.assert_research_source_seal_v2(uuid),public.research_complete_hash_v2(jsonb),public.research_complete_canonical_v2(jsonb,integer),public.assert_research_editorial_review_v2(jsonb,jsonb)
 TO research_observed_rpc_owner;
CREATE OR REPLACE FUNCTION public.fence_research_publication_lineage_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE i public.research_article_input_revisions_v2; b public.candidate_dossier_bundles; j public.research_deep_jobs_v1; c public.candidate_dossier_submission_receipts;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.revision_kind='research_input_v2' THEN RAISE EXCEPTION 'research_publication_v2_inert';END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revision_kind IS DISTINCT FROM NEW.revision_kind THEN RAISE EXCEPTION 'research_publication_branch_immutable';END IF;
  IF OLD.revision_kind='research_input_v2' THEN
   IF TG_TABLE_NAME<>'candidate_dossier_outbox_v5' OR current_user<>'research_observed_rpc_owner'
    OR (to_jsonb(OLD)-ARRAY['status','attempts','lease_owner','lease_expires_at','receipt_id','last_submission_hash','updated_at'])
      IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','attempts','lease_owner','lease_expires_at','receipt_id','last_submission_hash','updated_at'])
   THEN RAISE EXCEPTION 'research_publication_transition_writer';END IF;
   SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=OLD.deep_job_id;
   IF j.job_id IS NULL OR j.research_scope IS DISTINCT FROM 'research_observed_v1'
    OR j.status IS DISTINCT FROM 'running' OR j.attempts IS DISTINCT FROM OLD.deep_attempt
    OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'research_publication_transition_job';END IF;
   IF OLD.status='queued' AND OLD.attempts=0 AND NEW.status='running' AND NEW.attempts=1
    AND NEW.lease_owner IS NOT DISTINCT FROM j.lease_owner AND NEW.lease_owner IS NOT NULL
    AND NEW.lease_expires_at IS NOT NULL AND NEW.lease_expires_at>clock_timestamp() AND NEW.lease_expires_at<=j.lease_expires_at
    AND NEW.receipt_id IS NULL AND NEW.last_submission_hash IS NULL THEN RETURN NEW;END IF;
   IF OLD.status='running' AND OLD.attempts=1 AND NEW.status='accepted' AND NEW.attempts=1
    AND OLD.lease_owner IS NOT DISTINCT FROM j.lease_owner AND OLD.lease_expires_at>clock_timestamp()
    AND NEW.lease_owner IS NULL AND NEW.lease_expires_at IS NULL AND NEW.receipt_id IS NOT NULL THEN
    SELECT * INTO c FROM public.candidate_dossier_submission_receipts WHERE submission_id=NEW.receipt_id;
    IF c.status='accepted' AND c.revision_kind='research_input_v2' AND c.bundle_id=OLD.bundle_id
     AND c.research_input_revision_id=OLD.research_input_revision_id AND c.input_hash=OLD.input_hash
     AND c.research_company_id=OLD.research_company_id AND c.research_snapshot_hash=OLD.research_snapshot_hash
     AND c.submission_hash=NEW.last_submission_hash THEN RETURN NEW;END IF;
   END IF;
   RAISE EXCEPTION 'research_publication_transition_invalid';
  END IF;
  -- Preserve v1 delivery transitions, but never rebind to a v2 bundle.
  IF EXISTS(SELECT FROM public.candidate_dossier_bundles WHERE bundle_id=NEW.bundle_id AND revision_kind<>'legacy_detail_v1')
  THEN RAISE EXCEPTION 'research_publication_branch_mismatch';END IF;
  RETURN NEW;
 END IF;
 IF NEW.revision_kind='legacy_detail_v1' THEN
  -- Outbox cannot disguise a v2 bundle as v1, even before a future writer exists.
  IF TG_TABLE_NAME='candidate_dossier_outbox_v5' AND EXISTS(
   SELECT FROM public.candidate_dossier_bundles WHERE bundle_id=NEW.bundle_id AND revision_kind<>'legacy_detail_v1')
  THEN RAISE EXCEPTION 'research_publication_branch_mismatch';END IF;
  RETURN NEW;
 END IF;
 IF NEW.revision_kind IS DISTINCT FROM 'research_input_v2' THEN RAISE EXCEPTION 'research_publication_branch_invalid';END IF;
 IF (TG_TABLE_NAME='candidate_dossier_bundles' AND current_user<>'research_input_preparation_owner_v2')
  OR (TG_TABLE_NAME='candidate_dossier_outbox_v5' AND current_user<>'research_observed_rpc_owner')
 THEN RAISE EXCEPTION 'research_publication_writer_required';END IF;
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=NEW.research_input_revision_id;
 IF NOT FOUND OR i.research_scope<>'research_observed_v1' OR NEW.research_company_id IS DISTINCT FROM i.research_company_id
  OR NEW.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash OR NEW.input_hash IS DISTINCT FROM i.input_hash
 THEN RAISE EXCEPTION 'research_publication_input_binding';END IF;
 IF TG_TABLE_NAME='candidate_dossier_bundles' THEN
  IF NEW.symbol IS DISTINCT FROM i.canonical_payload->'researchIdentity'->>'symbol'
   OR NEW.payload IS DISTINCT FROM jsonb_build_object('schemaVersion','research-bundle-lineage-v2',
    'inputRevisionId',i.revision_id,'inputHash',i.input_hash,'researchCompanyId',i.research_company_id,
    'snapshotHash',i.snapshot_hash,'publishableResearch',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false)
  THEN RAISE EXCEPTION 'research_publication_bundle_payload';END IF;
 ELSE
  SELECT * INTO b FROM public.candidate_dossier_bundles WHERE bundle_id=NEW.bundle_id;
  IF NOT FOUND OR b.revision_kind IS DISTINCT FROM 'research_input_v2'
   OR b.research_input_revision_id IS DISTINCT FROM NEW.research_input_revision_id
   OR b.research_company_id IS DISTINCT FROM NEW.research_company_id OR b.research_snapshot_hash IS DISTINCT FROM NEW.research_snapshot_hash
   OR b.input_hash IS DISTINCT FROM NEW.input_hash OR NEW.deep_job_id IS DISTINCT FROM i.job_id OR NEW.deep_attempt IS DISTINCT FROM i.attempt
   OR NEW.publication_kind IS DISTINCT FROM 'deep' OR NEW.status IS DISTINCT FROM 'queued'
   OR NEW.attempts IS DISTINCT FROM 0 OR NEW.receipt_id IS NOT NULL OR NEW.lease_owner IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
   OR NEW.last_submission_hash IS NOT NULL OR NEW.last_error IS NOT NULL OR NEW.next_attempt_at IS NOT NULL
  THEN RAISE EXCEPTION 'research_publication_outbox_binding';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.research_publication_source_state_v2(p_seal uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=p_seal)
 THEN 'withdrawn' ELSE 'published' END
$$;
ALTER FUNCTION public.research_publication_source_state_v2(uuid) OWNER TO research_source_fence_owner_v2;
REVOKE ALL ON FUNCTION public.research_publication_source_state_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.research_publication_source_state_v2(uuid) TO research_observed_rpc_owner;

CREATE FUNCTION public.read_completed_research_publication_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,
 p_author_result_id uuid,p_author_result_hash text,p_reviewer_result_id uuid,p_reviewer_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.research_article_input_revisions_v2;a public.research_author_assignments_v2;ra public.research_reviewer_assignments_v2;
 ar public.research_author_results_v2;rr public.research_reviewer_results_v2;j public.research_deep_jobs_v1;
 o public.candidate_dossier_outbox_v5;d public.candidate_research_dossiers;c public.candidate_dossier_submission_receipts;
 rh text;sh text;ch text;ac public.research_model_completions_v1;rc public.research_model_completions_v1;
 am public.research_model_reservations_v1;rm public.research_model_reservations_v1;b public.candidate_dossier_bundles;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'research_publication_read_committed_required';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
  OR p_revision_id IS NULL OR p_author_result_id IS NULL OR p_reviewer_result_id IS NULL
  OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
  OR p_author_result_hash IS NULL OR p_author_result_hash !~ '^[a-f0-9]{64}$'
  OR p_reviewer_result_hash IS NULL OR p_reviewer_result_hash !~ '^[a-f0-9]{64}$'
  OR p_author_principal IS NULL OR p_author_principal !~ '^[a-f0-9]{64}$'
  OR p_reviewer_principal IS NULL OR p_reviewer_principal !~ '^[a-f0-9]{64}$' OR p_author_principal=p_reviewer_principal
 THEN RAISE EXCEPTION 'research_publication_request';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=p_revision_id;
 SELECT * INTO a FROM public.research_author_assignments_v2 WHERE input_revision_id=p_revision_id;
 SELECT * INTO ar FROM public.research_author_results_v2 WHERE result_id=p_author_result_id;
 SELECT * INTO rr FROM public.research_reviewer_results_v2 WHERE result_id=p_reviewer_result_id;
 SELECT * INTO ra FROM public.research_reviewer_assignments_v2 WHERE assignment_id=rr.assignment_id;
 IF i.revision_id IS NULL OR a.assignment_id IS NULL OR ar.result_id IS NULL OR rr.result_id IS NULL OR ra.assignment_id IS NULL
  OR i.research_scope IS DISTINCT FROM 'research_observed_v1' OR i.canonical_request IS DISTINCT FROM p_request
  OR i.input_hash IS DISTINCT FROM p_input_hash OR a.canonical_request IS DISTINCT FROM p_request
  OR a.controller_principal IS DISTINCT FROM p_author_principal OR ra.reviewer_principal IS DISTINCT FROM p_reviewer_principal
  OR a.input_revision_id IS DISTINCT FROM i.revision_id OR a.input_hash IS DISTINCT FROM i.input_hash
  OR a.job_id IS DISTINCT FROM i.job_id OR a.attempt IS DISTINCT FROM i.attempt
  OR ar.assignment_id IS DISTINCT FROM a.assignment_id OR ar.result_hash IS DISTINCT FROM p_author_result_hash
  OR ra.author_assignment_id IS DISTINCT FROM a.assignment_id OR ra.author_result_id IS DISTINCT FROM ar.result_id
  OR ra.author_result_hash IS DISTINCT FROM ar.result_hash OR ra.input_revision_id IS DISTINCT FROM i.revision_id OR ra.input_hash IS DISTINCT FROM i.input_hash
  OR rr.result_hash IS DISTINCT FROM p_reviewer_result_hash OR rr.payload->>'authorResultId' IS DISTINCT FROM ar.result_id::text
  OR ar.result_hash IS DISTINCT FROM public.research_complete_hash_v2(ar.payload) OR rr.result_hash IS DISTINCT FROM public.research_complete_hash_v2(rr.payload)
 THEN RAISE EXCEPTION 'research_publication_binding';END IF;
 SELECT * INTO ac FROM public.research_model_completions_v1 WHERE reservation_id=a.reservation_id;
 SELECT * INTO rc FROM public.research_model_completions_v1 WHERE reservation_id=ra.reservation_id;
 SELECT * INTO am FROM public.research_model_reservations_v1 WHERE reservation_id=a.reservation_id;
 SELECT * INTO rm FROM public.research_model_reservations_v1 WHERE reservation_id=ra.reservation_id;
 IF i.input_hash IS DISTINCT FROM public.research_complete_hash_v2(i.canonical_payload)
  OR ar.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(ar.payload),'UTF8'))
  OR rr.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(rr.payload),'UTF8'))
  OR ar.payload->>'assignmentId' IS DISTINCT FROM a.assignment_id::text OR rr.payload->>'assignmentId' IS DISTINCT FROM ra.assignment_id::text
  OR ar.payload->'observation'->>'invocationId' IS DISTINCT FROM ar.invocation_id OR rr.payload->'observation'->>'invocationId' IS DISTINCT FROM rr.invocation_id
  OR am.reservation_id IS NULL OR rm.reservation_id IS NULL OR ac.reservation_id IS NULL OR rc.reservation_id IS NULL
  OR am.role IS DISTINCT FROM 'company_research' OR rm.role IS DISTINCT FROM 'counter_review'
  OR am.work_key IS DISTINCT FROM 'deep:'||a.job_id||':'||a.attempt
  OR rm.work_key IS DISTINCT FROM 'deep-review-v2:'||ra.job_id||':'||ra.attempt||':'||ar.result_id
  OR am.owner IS DISTINCT FROM a.work_owner OR rm.owner IS DISTINCT FROM a.work_owner OR ra.work_owner IS DISTINCT FROM a.work_owner
  OR am.started_at IS DISTINCT FROM a.reservation_started_at OR am.lease_expires_at IS DISTINCT FROM a.reservation_expires_at
  OR rm.started_at IS DISTINCT FROM ra.reservation_started_at OR rm.lease_expires_at IS DISTINCT FROM ra.reservation_expires_at
  OR ra.job_id IS DISTINCT FROM a.job_id OR ra.attempt IS DISTINCT FROM a.attempt OR ra.original_job_deadline IS DISTINCT FROM a.original_job_deadline
  OR ac.owner IS DISTINCT FROM a.work_owner OR rc.owner IS DISTINCT FROM ra.work_owner
  OR ac.outcome IS DISTINCT FROM 'completed' OR rc.outcome IS DISTINCT FROM 'completed'
  OR ac.result_hash IS DISTINCT FROM ar.payload->'validatedArticle'->>'articleHash' OR rc.result_hash IS DISTINCT FROM rr.result_hash
  OR ac.finished_at IS NULL OR rc.finished_at IS NULL OR NOT isfinite(ac.finished_at) OR NOT isfinite(rc.finished_at)
  OR ar.received_at<a.assigned_at OR rr.received_at<ra.assigned_at OR ac.finished_at<ar.received_at OR rc.finished_at<rr.received_at
  OR ac.finished_at>=least(a.original_job_deadline,a.reservation_expires_at) OR rc.finished_at>=least(ra.original_job_deadline,ra.reservation_expires_at)
  OR ac.finished_at>clock_timestamp() OR rc.finished_at>clock_timestamp() OR ra.reservation_started_at<ac.finished_at
  OR NOT EXISTS(SELECT FROM public.research_execution_invocations_v2 x WHERE x.invocation_id=ar.invocation_id AND x.role='author' AND x.result_id=ar.result_id AND x.payload_hash=ar.result_hash)
  OR NOT EXISTS(SELECT FROM public.research_execution_invocations_v2 x WHERE x.invocation_id=rr.invocation_id AND x.role='reviewer' AND x.result_id=rr.result_id AND x.payload_hash=rr.result_hash)
 THEN RAISE EXCEPTION 'research_publication_original_completion';END IF;
 SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=i.job_id FOR UPDATE;
 IF j.job_id IS NULL THEN RAISE EXCEPTION 'research_publication_job_missing';END IF;
 IF j.status IS DISTINCT FROM 'completed' THEN RETURN NULL;END IF;
 SELECT * INTO c FROM public.candidate_dossier_submission_receipts WHERE submission_id=j.receipt_id;
 SELECT * INTO d FROM public.candidate_research_dossiers WHERE id=c.dossier_id;
 SELECT * INTO o FROM public.candidate_dossier_outbox_v5 WHERE job_id=j.completion_outbox_job_id;
 SELECT * INTO b FROM public.candidate_dossier_bundles WHERE bundle_id=c.bundle_id;
 rh:=public.research_complete_hash_v2(jsonb_build_object('domain','research-publication-request-v2','input',p_request,
  'inputRevisionId',p_revision_id,'inputHash',p_input_hash,'authorResultId',p_author_result_id,'authorResultHash',p_author_result_hash,
  'reviewerResultId',p_reviewer_result_id,'reviewerResultHash',p_reviewer_result_hash));
 ch:=public.research_complete_hash_v2(public.research_publication_content_v2(ar.payload));
 sh:=public.research_complete_hash_v2(jsonb_build_object('domain','research-publication-v2','requestHash',rh,
  'researchCompanyId',i.research_company_id,'snapshotHash',i.snapshot_hash,'bundleId',c.bundle_id,'contentHash',ch));
 IF c.submission_id IS NULL OR d.id IS NULL OR o.job_id IS NULL OR b.bundle_id IS NULL
  OR b.revision_kind IS DISTINCT FROM 'research_input_v2' OR b.research_input_revision_id IS DISTINCT FROM i.revision_id
  OR b.research_company_id IS DISTINCT FROM i.research_company_id OR b.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR b.input_hash IS DISTINCT FROM i.input_hash OR o.revision_kind IS DISTINCT FROM 'research_input_v2'
  OR o.research_company_id IS DISTINCT FROM i.research_company_id OR o.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR o.input_hash IS DISTINCT FROM i.input_hash OR o.publication_kind IS DISTINCT FROM 'deep'
  OR c.revision_kind IS DISTINCT FROM 'research_input_v2' OR d.revision_kind IS DISTINCT FROM 'research_input_v2'
  OR c.research_request_hash IS DISTINCT FROM rh OR c.submission_hash IS DISTINCT FROM sh OR c.status IS DISTINCT FROM 'accepted'
  OR c.research_input_revision_id IS DISTINCT FROM i.revision_id OR c.input_hash IS DISTINCT FROM i.input_hash
  OR c.research_company_id IS DISTINCT FROM i.research_company_id OR c.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR c.research_author_result_id IS DISTINCT FROM ar.result_id OR c.research_reviewer_result_id IS DISTINCT FROM rr.result_id
  OR c.source_seal_id IS DISTINCT FROM i.source_seal_id
  OR d.research_input_revision_id IS DISTINCT FROM i.revision_id OR d.input_hash IS DISTINCT FROM i.input_hash
  OR d.research_company_id IS DISTINCT FROM i.research_company_id OR d.research_snapshot_hash IS DISTINCT FROM i.snapshot_hash
  OR d.research_author_result_id IS DISTINCT FROM ar.result_id OR d.research_reviewer_result_id IS DISTINCT FROM rr.result_id
  OR d.source_seal_id IS DISTINCT FROM i.source_seal_id OR d.bundle_id IS DISTINCT FROM c.bundle_id
  OR d.content IS DISTINCT FROM public.research_publication_content_v2(ar.payload)
  OR d.source_references IS DISTINCT FROM ar.payload->'validatedArticle'->'sources'
  OR j.attempts IS DISTINCT FROM i.attempt OR j.completion_owner IS DISTINCT FROM a.work_owner
  OR j.completion_outbox_owner IS DISTINCT FROM a.work_owner OR j.completion_reviewer_result_id IS DISTINCT FROM rr.result_id
  OR j.completion_article_hash IS DISTINCT FROM ar.payload->'validatedArticle'->>'articleHash'
  OR j.completion_submission_hash IS DISTINCT FROM sh
  OR o.status IS DISTINCT FROM 'accepted' OR o.receipt_id IS DISTINCT FROM c.submission_id
  OR o.bundle_id IS DISTINCT FROM c.bundle_id OR o.research_input_revision_id IS DISTINCT FROM i.revision_id
  OR o.deep_job_id IS DISTINCT FROM j.job_id OR o.deep_attempt IS DISTINCT FROM i.attempt
  OR o.last_submission_hash IS DISTINCT FROM sh
 THEN RAISE EXCEPTION 'research_publication_completed_conflict';END IF;
 RETURN jsonb_build_object('schemaVersion','research-publication-receipt-v2','receipt',jsonb_build_object(
  'submissionId',c.submission_id,'dossierId',d.id,'bundleId',c.bundle_id,'inputRevisionId',i.revision_id,'inputHash',i.input_hash,
  'authorResultId',ar.result_id,'authorResultHash',ar.result_hash,'reviewerResultId',rr.result_id,'reviewerResultHash',rr.result_hash,
  'submissionHash',sh,'contentHash',ch,'receivedAt',c.received_at),
  'content',d.content,'sourceReferences',d.source_references,'researchState',public.research_publication_source_state_v2(i.source_seal_id),
  'researchQualified',false,'strategyApproved',false,'entryEligible',false,'idempotentReplay',true);
END $$;
ALTER FUNCTION public.read_completed_research_publication_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.read_completed_research_publication_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_completed_research_publication_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text) TO service_role;

CREATE FUNCTION public.publish_research_article_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,
 p_author_result_id uuid,p_author_result_hash text,p_reviewer_result_id uuid,p_reviewer_result_hash text,p_content_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prior jsonb;ctx jsonb;i public.research_article_input_revisions_v2;j public.research_deep_jobs_v1;
 a public.research_author_assignments_v2;ra public.research_reviewer_assignments_v2;
 ar public.research_author_results_v2;rr public.research_reviewer_results_v2;
 o public.candidate_dossier_outbox_v5;b uuid;d uuid;c uuid;content jsonb;rh text;sh text;expiry timestamptz;
BEGIN
 -- Historical replay is checked before any live claim/source assertion.
 prior:=public.read_completed_research_publication_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,
  p_author_result_id,p_author_result_hash,p_reviewer_result_id,p_reviewer_result_hash);
 IF prior IS NOT NULL THEN
  IF p_content_hash IS DISTINCT FROM prior->'receipt'->>'contentHash' THEN RAISE EXCEPTION 'research_publication_replay_content';END IF;
  RETURN prior;
 END IF;
 -- The completed reader already holds source→global→original job locks.
 ctx:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_author_result_id,p_author_result_hash);
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=p_revision_id;
 SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=i.job_id FOR UPDATE;
 SELECT * INTO a FROM public.research_author_assignments_v2 WHERE input_revision_id=i.revision_id;
 SELECT * INTO ar FROM public.research_author_results_v2 WHERE result_id=p_author_result_id;
 SELECT * INTO rr FROM public.research_reviewer_results_v2 WHERE result_id=p_reviewer_result_id;
 SELECT * INTO ra FROM public.research_reviewer_assignments_v2 WHERE assignment_id=rr.assignment_id;
 IF i.source_seal_id IS NULL OR j.status IS DISTINCT FROM 'running' OR j.attempts IS DISTINCT FROM i.attempt
  OR j.lease_owner IS DISTINCT FROM a.work_owner OR j.lease_expires_at IS DISTINCT FROM a.original_job_deadline
  OR ctx->'reviewResult'->>'result_id' IS DISTINCT FROM rr.result_id::text
  OR ctx->'reviewResult'->>'result_hash' IS DISTINCT FROM rr.result_hash
  OR rr.payload->'rawReview'->>'decision' IS DISTINCT FROM 'accepted'
 THEN RAISE EXCEPTION 'research_publication_live_fence';END IF;
 PERFORM public.assert_research_source_seal_v2(i.source_seal_id);
 PERFORM public.assert_research_editorial_review_v2(rr.payload->'packet',rr.payload->'rawReview');
 IF rr.payload->>'packetHash' IS DISTINCT FROM public.research_complete_hash_v2(rr.payload->'packet')
  OR rr.payload->'packet'->>'articleHash' IS DISTINCT FROM ar.payload->'validatedArticle'->>'articleHash'
  OR rr.payload->'packet'->'article' IS DISTINCT FROM ar.payload->'rawArticle'
  OR rr.payload->'packet'->'tables' IS DISTINCT FROM ar.payload->'validatedArticle'->'tables'
  OR rr.payload->'packet'->'valuations' IS DISTINCT FROM ar.payload->'validatedArticle'->'valuations'
 THEN RAISE EXCEPTION 'research_publication_packet_conflict';END IF;
 content:=public.research_publication_content_v2(ar.payload);
 IF p_content_hash IS NULL OR p_content_hash !~ '^[a-f0-9]{64}$' OR public.research_complete_hash_v2(content) IS DISTINCT FROM p_content_hash
 THEN RAISE EXCEPTION 'research_publication_content_hash';END IF;
 expiry:=least(j.lease_expires_at,ra.reservation_expires_at,a.reservation_expires_at);
 IF clock_timestamp()>=expiry THEN RAISE EXCEPTION 'research_publication_expired';END IF;
 b:=public.ensure_research_publication_bundle_v2(i.revision_id,i.input_hash);
 INSERT INTO public.candidate_dossier_outbox_v5(bundle_id,revision_kind,research_input_revision_id,research_company_id,research_snapshot_hash,input_hash,publication_kind,deep_job_id,deep_attempt)
 VALUES(b,'research_input_v2',i.revision_id,i.research_company_id,i.snapshot_hash,i.input_hash,'deep',j.job_id,i.attempt)
 ON CONFLICT(research_input_revision_id,input_hash,publication_kind) WHERE revision_kind='research_input_v2' DO NOTHING;
 SELECT * INTO o FROM public.candidate_dossier_outbox_v5 WHERE revision_kind='research_input_v2'
  AND research_input_revision_id=i.revision_id AND input_hash=i.input_hash AND publication_kind='deep' FOR UPDATE;
 IF o.bundle_id IS DISTINCT FROM b OR o.deep_job_id IS DISTINCT FROM j.job_id OR o.deep_attempt IS DISTINCT FROM i.attempt
  OR o.status IS DISTINCT FROM 'queued' OR o.attempts IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'research_publication_outbox_conflict';END IF;
 PERFORM 1 FROM public.candidate_dossier_bundles WHERE bundle_id=b FOR UPDATE;
 UPDATE public.candidate_dossier_outbox_v5 SET status='running',attempts=1,lease_owner=a.work_owner,lease_expires_at=expiry,updated_at=clock_timestamp() WHERE job_id=o.job_id;
 rh:=public.research_complete_hash_v2(jsonb_build_object('domain','research-publication-request-v2','input',p_request,
  'inputRevisionId',p_revision_id,'inputHash',p_input_hash,'authorResultId',p_author_result_id,'authorResultHash',p_author_result_hash,
  'reviewerResultId',p_reviewer_result_id,'reviewerResultHash',p_reviewer_result_hash));
 sh:=public.research_complete_hash_v2(jsonb_build_object('domain','research-publication-v2','requestHash',rh,
  'researchCompanyId',i.research_company_id,'snapshotHash',i.snapshot_hash,'bundleId',b,'contentHash',p_content_hash));
 INSERT INTO public.candidate_research_dossiers(narrative_kind,content,validation_status,bundle_hash,detail_payload_hash,bundle_id,input_hash,
  claims,source_references,claim_fact_map,published_at,revision_kind,research_input_revision_id,research_company_id,research_snapshot_hash,
  research_author_result_id,research_reviewer_result_id,source_seal_id)
 VALUES('codex_enriched',content,'valid',i.input_hash,i.input_hash,b,i.input_hash,'[]',ar.payload->'validatedArticle'->'sources','{}',clock_timestamp(),
  'research_input_v2',i.revision_id,i.research_company_id,i.snapshot_hash,ar.result_id,rr.result_id,i.source_seal_id) RETURNING id INTO d;
 INSERT INTO public.candidate_dossier_submission_receipts(bundle_id,input_hash,dossier_id,submission_hash,status,revision_kind,
  research_input_revision_id,research_company_id,research_snapshot_hash,research_author_result_id,research_reviewer_result_id,source_seal_id,research_request_hash)
 VALUES(b,i.input_hash,d,sh,'accepted','research_input_v2',i.revision_id,i.research_company_id,i.snapshot_hash,ar.result_id,rr.result_id,i.source_seal_id,rh) RETURNING submission_id INTO c;
 IF clock_timestamp()>=expiry THEN RAISE EXCEPTION 'research_publication_expired';END IF;
 UPDATE public.candidate_dossier_outbox_v5 SET status='accepted',lease_owner=NULL,lease_expires_at=NULL,receipt_id=c,last_submission_hash=sh,updated_at=clock_timestamp() WHERE job_id=o.job_id;
 UPDATE public.research_deep_jobs_v1 SET status='completed',lease_owner=NULL,lease_expires_at=NULL,receipt_id=c,completion_owner=a.work_owner,
  completion_outbox_owner=a.work_owner,completion_outbox_job_id=o.job_id,completion_reviewer_result_id=rr.result_id,
  completion_article_hash=ar.payload->'validatedArticle'->>'articleHash',completion_submission_hash=sh,terminal_reason=NULL,finished_at=clock_timestamp()
 WHERE job_id=j.job_id;
 IF clock_timestamp()>=expiry THEN RAISE EXCEPTION 'research_publication_expired';END IF;
 prior:=public.read_completed_research_publication_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,
  p_author_result_id,p_author_result_hash,p_reviewer_result_id,p_reviewer_result_hash);
 IF prior IS NULL THEN RAISE EXCEPTION 'research_publication_receipt_missing';END IF;
 RETURN jsonb_set(prior,'{idempotentReplay}','false');
END $$;
ALTER FUNCTION public.publish_research_article_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.publish_research_article_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_research_article_v2(jsonb,uuid,text,text,text,uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_research_reviewer_result_sources_v2(jsonb,uuid,text,text,text,uuid,text) TO research_observed_rpc_owner;
GRANT SELECT ON public.research_author_assignments_v2,public.research_article_input_revisions_v2 TO research_observed_rpc_owner;
CREATE POLICY research_publication_assignment_read_v2 ON public.research_author_assignments_v2 FOR SELECT TO research_observed_rpc_owner USING(true);
GRANT UPDATE(status,attempts,lease_owner,lease_expires_at,receipt_id,last_submission_hash,updated_at) ON public.candidate_dossier_outbox_v5 TO research_observed_rpc_owner;
CREATE POLICY research_publication_outbox_update_v2 ON public.candidate_dossier_outbox_v5 FOR UPDATE TO research_observed_rpc_owner USING(revision_kind='research_input_v2') WITH CHECK(revision_kind='research_input_v2');
GRANT UPDATE(status,lease_owner,lease_expires_at,receipt_id,completion_owner,completion_outbox_owner,completion_outbox_job_id,completion_reviewer_result_id,completion_article_hash,completion_submission_hash,terminal_reason,finished_at)
 ON public.research_deep_jobs_v1 TO research_observed_rpc_owner;
CREATE POLICY research_publication_job_update_v2 ON public.research_deep_jobs_v1 FOR UPDATE TO research_observed_rpc_owner USING(research_scope='research_observed_v1') WITH CHECK(research_scope='research_observed_v1');
GRANT UPDATE(bundle_id) ON public.candidate_dossier_bundles TO research_observed_rpc_owner;
GRANT SELECT ON public.research_execution_invocations_v2 TO research_observed_rpc_owner;
CREATE POLICY research_publication_invocation_read_v2 ON public.research_execution_invocations_v2 FOR SELECT TO research_observed_rpc_owner USING(true);
COMMIT;
