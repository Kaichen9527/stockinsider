BEGIN;
-- Additive observed-only claim, using the same immutable 30m/120m/global1 model budget.
GRANT SELECT,UPDATE ON public.research_deep_jobs_v1 TO research_observed_rpc_owner;
GRANT SELECT,INSERT ON public.research_deep_job_attempts_v1 TO research_observed_rpc_owner;
GRANT INSERT ON public.research_model_completions_v1 TO research_observed_rpc_owner;
CREATE POLICY observed_attempt_rpc ON public.research_deep_job_attempts_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
CREATE POLICY observed_reservation_rpc ON public.research_model_reservations_v1 FOR SELECT TO research_observed_rpc_owner USING(true);
CREATE POLICY observed_completion_rpc ON public.research_model_completions_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
GRANT SELECT ON public.research_model_reservations_v1,public.research_model_completions_v1 TO research_observed_rpc_owner;
GRANT EXECUTE ON FUNCTION public.reserve_research_model_v1(text,text,text) TO research_observed_rpc_owner;
CREATE FUNCTION public.read_research_observed_claim_v2(p_owner text,p_snapshot_hash text,p_job_id uuid DEFAULT NULL,p_attempt integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.research_deep_jobs_v1;r public.research_priority_runs_v1;s public.research_observed_roster_snapshots_v1;a public.research_deep_job_attempts_v1;m public.research_model_reservations_v1;done public.research_model_completions_v1;n timestamptz:=clock_timestamp();
BEGIN
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9:_-]{3,120}$' OR p_snapshot_hash IS NULL OR p_snapshot_hash !~ '^[a-f0-9]{64}$' OR (p_job_id IS NULL)<>(p_attempt IS NULL) OR p_attempt NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'observed_claim_identity_invalid';END IF;
 IF (SELECT count(*)FROM public.research_deep_jobs_v1 WHERE research_scope='research_observed_v1'AND observed_snapshot_hash=p_snapshot_hash AND lease_owner=p_owner AND status='running'AND lease_expires_at>n AND(p_job_id IS NULL OR(job_id=p_job_id AND attempts=p_attempt)))>1 THEN RAISE EXCEPTION 'observed_claim_ambiguous';END IF;
 SELECT *INTO j FROM public.research_deep_jobs_v1 WHERE research_scope='research_observed_v1'AND observed_snapshot_hash=p_snapshot_hash AND lease_owner=p_owner AND status='running'AND lease_expires_at>n AND(p_job_id IS NULL OR(job_id=p_job_id AND attempts=p_attempt));IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT *INTO r FROM public.research_priority_runs_v1 WHERE run_id=j.priority_run_id AND research_scope=j.research_scope AND observed_snapshot_hash=j.observed_snapshot_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'observed_claim_run_changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.research_observed_priority_store_receipts_v1 receipt WHERE receipt.run_id=r.run_id AND receipt.stored_run_hash=encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'))THEN RAISE EXCEPTION 'observed_claim_store_lineage_missing';END IF;
 SELECT *INTO s FROM public.research_observed_roster_snapshots_v1 WHERE snapshot_hash=j.observed_snapshot_hash;
 IF NOT FOUND OR s.received_at>r.as_of OR s.latest_observed_at>r.as_of OR r.as_of>n OR NOT EXISTS(SELECT 1 FROM public.research_observed_roster_members_v1 WHERE snapshot_hash=j.observed_snapshot_hash AND research_company_id=j.research_company_id AND symbol=j.symbol) OR NOT EXISTS(SELECT 1 FROM public.research_deep_admission_charges_v1 WHERE job_id=j.job_id AND issuer_key='TW:'||j.symbol) THEN RAISE EXCEPTION 'observed_claim_membership_changed';END IF;
 IF j.stock_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stocks WHERE id=j.stock_id AND symbol=j.symbol AND market='TW')THEN RAISE EXCEPTION 'observed_claim_mapping_changed';END IF;
 SELECT *INTO a FROM public.research_deep_job_attempts_v1 WHERE job_id=j.job_id AND attempt=j.attempts AND owner=p_owner;
 IF NOT FOUND OR a.lease_expires_at<>j.lease_expires_at THEN RAISE EXCEPTION 'observed_claim_attempt_changed';END IF;
 SELECT *INTO m FROM public.research_model_reservations_v1 WHERE role='company_research'AND owner=p_owner AND work_key='deep:'||j.job_id||':'||j.attempts;
 IF NOT FOUND OR a.claimed_at<m.started_at OR a.claimed_at>n OR j.lease_expires_at<>m.lease_expires_at THEN RAISE EXCEPTION 'observed_claim_reservation_changed';END IF;
 SELECT *INTO done FROM public.research_model_completions_v1 WHERE reservation_id=m.reservation_id;
 IF FOUND AND(done.owner<>p_owner OR done.finished_at<m.started_at OR done.finished_at>=m.lease_expires_at OR done.finished_at>n)THEN RAISE EXCEPTION 'observed_claim_completion_changed';END IF;
 IF done.reservation_id IS NULL AND m.lease_expires_at<=n THEN RAISE EXCEPTION 'observed_claim_expired';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.research_deep_jobs_v1 x WHERE x.job_id=j.job_id AND to_jsonb(x)=to_jsonb(j)) THEN RAISE EXCEPTION 'observed_claim_changed_during_read';END IF;
 RETURN jsonb_build_object('schemaVersion','research-deep-claim-context-v2','observedAt',n,'job',jsonb_build_object('jobId',j.job_id,'symbol',j.symbol,'priorityRunId',j.priority_run_id,'attempt',j.attempts,'owner',j.lease_owner,'leaseExpiresAt',j.lease_expires_at),'modelReservation',jsonb_build_object('reservationId',m.reservation_id,'role',m.role,'owner',m.owner,'workKey',m.work_key,'startedAt',m.started_at,'leaseExpiresAt',m.lease_expires_at),'modelCompletion',CASE WHEN done.reservation_id IS NULL THEN NULL ELSE jsonb_build_object('outcome',done.outcome,'resultHash',done.result_hash,'completedAt',done.finished_at)END,'researchIdentity',jsonb_build_object('scope','research_observed_v1','researchCompanyId',j.research_company_id,'snapshotHash',j.observed_snapshot_hash,'mappingDigest',s.mapping_digest,'stockId',j.stock_id,'priorityInputHash',r.input_hash,'snapshotReceivedAt',s.received_at,'snapshotObservedAt',s.latest_observed_at,'priorityAsOf',r.as_of));
END $$;
CREATE FUNCTION public.claim_research_observed_job_v2(p_owner text,p_snapshot_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.research_deep_jobs_v1;m public.research_model_reservations_v1;
BEGIN
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9:_-]{3,120}$' OR p_snapshot_hash IS NULL OR p_snapshot_hash !~ '^[a-f0-9]{64}$'THEN RAISE EXCEPTION 'observed_claim_identity_invalid';END IF;
 PERFORM pg_advisory_xact_lock(2409,6002);
 PERFORM public.reap_expired_research_deep_jobs_v2();
 IF EXISTS(SELECT 1 FROM public.research_deep_jobs_v1 WHERE status='running'AND lease_expires_at>clock_timestamp())THEN RETURN NULL;END IF;
 SELECT *INTO j FROM public.research_deep_jobs_v1 WHERE research_scope='research_observed_v1'AND observed_snapshot_hash=p_snapshot_hash AND status='queued'AND attempts<3 ORDER BY week_start,queue_rank,created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT *INTO m FROM public.reserve_research_model_v1('company_research',p_owner,'deep:'||j.job_id||':'||(j.attempts+1));IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.research_deep_jobs_v1 SET status='running',attempts=attempts+1,lease_owner=p_owner,lease_expires_at=m.lease_expires_at WHERE job_id=j.job_id RETURNING *INTO j;
 INSERT INTO public.research_deep_job_attempts_v1(job_id,attempt,owner,lease_expires_at)VALUES(j.job_id,j.attempts,p_owner,j.lease_expires_at);
 RETURN public.read_research_observed_claim_v2(p_owner,p_snapshot_hash,j.job_id,j.attempts);
END $$;
ALTER FUNCTION public.read_research_observed_claim_v2(text,text,uuid,integer) OWNER TO research_observed_rpc_owner;
ALTER FUNCTION public.claim_research_observed_job_v2(text,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.read_research_observed_claim_v2(text,text,uuid,integer),public.claim_research_observed_job_v2(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_observed_claim_v2(text,text,uuid,integer),public.claim_research_observed_job_v2(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.handoff_research_deep_model_v1(
  p_job_id UUID,p_owner TEXT,p_attempt INTEGER,p_article_hash TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1; v_reservation uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(2409,6002);
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 WHERE job_id=p_job_id AND research_scope='formal_v1' FOR UPDATE;
  IF NOT FOUND OR v_job.status<>'running' OR v_job.lease_owner IS DISTINCT FROM p_owner
    OR v_job.attempts<>p_attempt OR v_job.lease_expires_at<=clock_timestamp()
    OR p_article_hash IS NULL OR p_article_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'research_deep_handoff_fence_lost'; END IF;
  SELECT reservation_id INTO v_reservation FROM public.research_model_reservations_v1
    WHERE role='company_research' AND owner=p_owner AND work_key='deep:'||p_job_id||':'||p_attempt::text;
  IF v_reservation IS NULL THEN RAISE EXCEPTION 'research_deep_model_reservation_missing'; END IF;
  RETURN public.finish_research_model_v1(v_reservation,p_owner,'completed',p_article_hash);
END $function$;
CREATE FUNCTION public.fence_observed_model_completion_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user<>'research_observed_rpc_owner' AND EXISTS(SELECT 1 FROM public.research_model_reservations_v1 r JOIN public.research_deep_jobs_v1 j ON r.work_key='deep:'||j.job_id||':'||j.attempts WHERE r.reservation_id=NEW.reservation_id AND r.role='company_research'AND j.research_scope='research_observed_v1')THEN RAISE EXCEPTION 'observed_completion_requires_scoped_controller';END IF;RETURN NEW;
END $$;
CREATE TRIGGER observed_model_completion_scope_v2 BEFORE INSERT ON public.research_model_completions_v1 FOR EACH ROW EXECUTE FUNCTION public.fence_observed_model_completion_v2();
REVOKE ALL ON FUNCTION public.handoff_research_deep_model_v1(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_research_deep_model_v1(uuid,text,integer,text) TO service_role;

-- Existing v1 publication/review routines remain byte-equivalent except explicit formal lookup fences.
CREATE OR REPLACE FUNCTION public.record_budgeted_deep_review_v1(
  p_job_id UUID,p_attempt INTEGER,p_reservation_id UUID,p_review JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1; v_model public.research_model_reservations_v1; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(2409,6002);
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 WHERE job_id=p_job_id AND research_scope='formal_v1' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'research_deep_review_scope_invalid'; END IF;
  SELECT * INTO v_model FROM public.research_model_reservations_v1 WHERE reservation_id=p_reservation_id;
  IF v_model.role IS DISTINCT FROM 'counter_review'
    OR v_model.owner IS DISTINCT FROM p_review->>'reviewer_id'
    OR v_model.work_key IS DISTINCT FROM 'deep-review:'||p_job_id||':'||p_attempt||':'||(p_review->>'article_hash')
    OR p_review->>'author_id'=p_review->>'reviewer_id'
    OR NOT EXISTS(SELECT 1 FROM public.research_model_reservations_v1 r
      JOIN public.research_model_completions_v1 c USING(reservation_id)
      WHERE r.role='company_research' AND r.work_key='deep:'||p_job_id||':'||p_attempt
        AND c.outcome='completed' AND c.result_hash=p_review->>'article_hash')
    OR NOT EXISTS(SELECT 1 FROM public.candidate_detail_snapshots d
      WHERE d.id=(p_review->>'revision_id')::uuid AND d.stock_id=v_job.stock_id)
    THEN RAISE EXCEPTION 'research_deep_review_model_binding_invalid'; END IF;
  SELECT id INTO v_id FROM public.candidate_deep_article_reviews_v1
    WHERE revision_id=(p_review->>'revision_id')::uuid AND input_hash=p_review->>'input_hash'
      AND article_hash=p_review->>'article_hash' AND reviewer_id=p_review->>'reviewer_id'
      AND decision=p_review->>'decision' AND findings=p_review->'findings'
      AND author_id=p_review->>'author_id' AND source_document_ids=p_review->'source_document_ids'
      AND reviewed_at=(p_review->>'reviewed_at')::timestamptz
      AND model_reservation_id=p_reservation_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF v_job.status IS DISTINCT FROM 'running' OR v_job.attempts IS DISTINCT FROM p_attempt
    OR v_job.lease_expires_at<=clock_timestamp()
    OR v_model.lease_expires_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM public.research_model_completions_v1
    WHERE reservation_id=p_reservation_id) THEN RAISE EXCEPTION 'research_deep_review_model_lease_lost'; END IF;
  INSERT INTO public.candidate_deep_article_reviews_v1(revision_id,input_hash,article_hash,author_id,reviewer_id,
    decision,findings,source_document_ids,reviewed_at,model_reservation_id)
  VALUES((p_review->>'revision_id')::uuid,p_review->>'input_hash',p_review->>'article_hash',p_review->>'author_id',
    p_review->>'reviewer_id',p_review->>'decision',p_review->'findings',p_review->'source_document_ids',
    (p_review->>'reviewed_at')::timestamptz,p_reservation_id) RETURNING id INTO v_id;
  PERFORM public.finish_research_model_v1(p_reservation_id,v_model.owner,'completed',p_review->>'article_hash');
  RETURN v_id;
END $function$;
CREATE OR REPLACE FUNCTION public.claim_candidate_deep_outbox_v1(
  p_deep_job_id UUID, p_deep_owner TEXT, p_deep_attempt INTEGER,
  p_revision_id UUID, p_input_hash TEXT, p_outbox_owner TEXT
)
RETURNS TABLE(job_id UUID, bundle_id UUID, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.research_deep_jobs_v1;
  v_outbox public.candidate_dossier_outbox_v5;
  v_stock UUID;
BEGIN
  SELECT * INTO v_job FROM public.research_deep_jobs_v1
    WHERE research_deep_jobs_v1.job_id=p_deep_job_id AND research_scope='formal_v1' FOR UPDATE;
  IF NOT FOUND OR v_job.status<>'running' OR v_job.lease_owner IS DISTINCT FROM p_deep_owner
    OR v_job.attempts<>p_deep_attempt OR v_job.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'research_deep_job_lease_lost';
  END IF;
  IF p_outbox_owner IS NULL OR length(trim(p_outbox_owner))<3 OR length(p_outbox_owner)>120 THEN
    RAISE EXCEPTION 'research_deep_outbox_owner_invalid';
  END IF;
  SELECT detail.stock_id INTO v_stock FROM public.candidate_detail_snapshots detail
    WHERE detail.id=p_revision_id;
  IF v_stock IS DISTINCT FROM v_job.stock_id THEN
    RAISE EXCEPTION 'research_deep_stock_revision_mismatch';
  END IF;
  INSERT INTO public.candidate_dossier_outbox_v5(bundle_id,revision_id,input_hash,publication_kind)
    SELECT bundle.bundle_id,bundle.revision_id,bundle.input_hash,'deep' FROM public.candidate_dossier_bundles bundle
    WHERE bundle.revision_id=p_revision_id AND bundle.input_hash=p_input_hash
    ON CONFLICT (revision_id,input_hash,publication_kind) DO NOTHING;
  SELECT * INTO v_outbox FROM public.candidate_dossier_outbox_v5 outbox
    WHERE outbox.revision_id=p_revision_id AND outbox.input_hash=p_input_hash
      AND outbox.publication_kind='deep' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research_deep_outbox_unavailable';
  END IF;
  IF v_outbox.status='running' AND v_outbox.deep_job_id=p_deep_job_id
    AND v_outbox.deep_attempt=p_deep_attempt
    AND v_outbox.lease_owner=p_outbox_owner AND v_outbox.lease_expires_at>clock_timestamp() THEN
    RETURN QUERY SELECT v_outbox.job_id,v_outbox.bundle_id,v_outbox.lease_expires_at;
    RETURN;
  END IF;
  IF NOT (v_outbox.status IN ('queued','rejected') OR
      (v_outbox.status='running' AND v_outbox.lease_expires_at<=clock_timestamp()
        AND v_outbox.deep_job_id=p_deep_job_id AND v_outbox.deep_attempt<=p_deep_attempt))
    OR v_outbox.attempts>=12
    OR (v_outbox.status='rejected' AND (p_deep_attempt<2 OR v_outbox.deep_job_id IS DISTINCT FROM p_deep_job_id
      OR v_outbox.deep_attempt>=p_deep_attempt))
    OR (v_outbox.next_attempt_at IS NOT NULL AND v_outbox.next_attempt_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'research_deep_outbox_lease_lost';
  END IF;
  UPDATE public.candidate_dossier_outbox_v5 outbox SET
    status='running', attempts=outbox.attempts+1, lease_owner=p_outbox_owner,
    lease_expires_at=LEAST(v_job.lease_expires_at,clock_timestamp()+interval '20 minutes'),
    deep_job_id=p_deep_job_id, deep_attempt=p_deep_attempt,
    next_attempt_at=NULL, updated_at=clock_timestamp()
    WHERE outbox.job_id=v_outbox.job_id RETURNING * INTO v_outbox;
  RETURN QUERY SELECT v_outbox.job_id,v_outbox.bundle_id,v_outbox.lease_expires_at;
END $function$;
CREATE OR REPLACE FUNCTION public.finish_research_deep_job_v2(
  p_job_id UUID, p_owner TEXT, p_attempt INTEGER,
  p_success BOOLEAN, p_receipt_id UUID, p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1;
BEGIN
  PERFORM pg_advisory_xact_lock(2409, 6002);
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 WHERE job_id=p_job_id AND research_scope='formal_v1' FOR UPDATE;
  IF FOUND AND p_success AND v_job.status='completed' AND v_job.receipt_id=p_receipt_id
    AND v_job.attempts=p_attempt AND v_job.completion_owner=p_owner THEN
    RETURN TRUE;
  END IF;
  IF NOT FOUND OR v_job.status <> 'running' OR v_job.lease_owner IS DISTINCT FROM p_owner
    OR v_job.attempts<>p_attempt OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'research_deep_job_lease_lost';
  END IF;
  IF p_success THEN RAISE EXCEPTION 'research_deep_publication_receipt_required'; END IF;
  -- Release the publication lease with the same deep attempt; a reported
  -- failure must not strand the next attempt behind an active old lease.
  UPDATE public.candidate_dossier_outbox_v5 SET
    status=CASE WHEN v_job.attempts<3 THEN 'queued' ELSE 'failed' END,
    lease_owner=NULL, lease_expires_at=NULL, next_attempt_at=NULL,
    last_error=left(coalesce(p_reason,'research_failed'),500), updated_at=clock_timestamp()
    WHERE publication_kind='deep' AND deep_job_id=p_job_id AND deep_attempt=p_attempt
      AND status='running';
  UPDATE public.research_deep_jobs_v1 SET
    status=CASE WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
    lease_owner=NULL,lease_expires_at=NULL,
    receipt_id=NULL,
    terminal_reason=left(coalesce(p_reason,'research_failed'),500),
    finished_at=CASE WHEN attempts >= 3 THEN clock_timestamp() ELSE NULL END
  WHERE research_deep_jobs_v1.job_id=p_job_id;
  PERFORM public.finish_research_model_v1(r.reservation_id,p_owner,
    CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    encode(sha256(convert_to(COALESCE(p_receipt_id::text,p_reason),'UTF8')),'hex'))
  FROM public.research_model_reservations_v1 r WHERE r.role='company_research'
    AND r.work_key='deep:'||p_job_id||':'||p_attempt::text
    AND NOT EXISTS(SELECT 1 FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id);
  RETURN TRUE;
END $function$;
CREATE OR REPLACE FUNCTION public.record_candidate_deep_submission_v1(
  p_deep_job_id UUID, p_deep_owner TEXT, p_deep_attempt INTEGER,
  p_deep_review_id UUID, p_article_hash TEXT,
  p_job_id UUID, p_owner TEXT, p_bundle_id UUID, p_revision_id UUID,
  p_input_hash TEXT, p_submission_hash TEXT, p_content JSONB, p_claims JSONB,
  p_source_references JSONB, p_claim_fact_map JSONB, p_validation_status TEXT,
  p_rejection_reasons JSONB
)
RETURNS TABLE(submission_id UUID, dossier_id UUID, status TEXT, rejection_reasons JSONB, idempotent_replay BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.research_deep_jobs_v1;
  v_outbox public.candidate_dossier_outbox_v5;
  v_stock UUID;
  v_receipt RECORD;
BEGIN
  SELECT * INTO v_job FROM public.research_deep_jobs_v1
    WHERE research_deep_jobs_v1.job_id=p_deep_job_id AND research_scope='formal_v1' FOR UPDATE;
  IF FOUND AND v_job.status='completed' AND v_job.attempts=p_deep_attempt
    AND v_job.completion_owner=p_deep_owner
    AND v_job.completion_outbox_owner=p_owner
    AND v_job.completion_outbox_job_id=p_job_id
    AND v_job.completion_review_id=p_deep_review_id
    AND v_job.completion_article_hash=p_article_hash
    AND v_job.completion_submission_hash=p_submission_hash
    AND p_validation_status='valid'
    AND p_content->'deepResearch'->>'articleHash'=p_article_hash THEN
    RETURN QUERY SELECT receipt.submission_id,receipt.dossier_id,receipt.status,
      receipt.rejection_reasons,TRUE
      FROM public.candidate_dossier_submission_receipts receipt
      JOIN public.candidate_research_dossiers dossier ON dossier.id=receipt.dossier_id
      WHERE receipt.submission_id=v_job.receipt_id AND receipt.revision_id=p_revision_id
        AND receipt.bundle_id=p_bundle_id AND receipt.input_hash=p_input_hash
        AND receipt.submission_hash=p_submission_hash AND receipt.status='accepted'
        AND dossier.content=p_content;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF NOT FOUND OR v_job.status<>'running' OR v_job.lease_owner IS DISTINCT FROM p_deep_owner
    OR v_job.attempts<>p_deep_attempt OR v_job.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'research_deep_job_lease_lost';
  END IF;
  SELECT * INTO v_outbox FROM public.candidate_dossier_outbox_v5 outbox
    WHERE outbox.job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_outbox.publication_kind<>'deep' OR v_outbox.status<>'running'
    OR v_outbox.lease_expires_at<=clock_timestamp() OR v_outbox.deep_job_id IS DISTINCT FROM p_deep_job_id
    OR v_outbox.deep_attempt IS DISTINCT FROM p_deep_attempt
    OR v_outbox.lease_owner IS DISTINCT FROM p_owner
    OR v_outbox.bundle_id IS DISTINCT FROM p_bundle_id
    OR v_outbox.revision_id IS DISTINCT FROM p_revision_id
    OR v_outbox.input_hash IS DISTINCT FROM p_input_hash THEN
    RAISE EXCEPTION 'research_deep_outbox_binding_missing';
  END IF;
  SELECT detail.stock_id INTO v_stock FROM public.candidate_detail_snapshots detail
    WHERE detail.id=p_revision_id;
  IF v_stock IS DISTINCT FROM v_job.stock_id THEN
    RAISE EXCEPTION 'research_deep_stock_revision_mismatch';
  END IF;
  IF p_validation_status='valid' AND (
    p_content->'deepResearch'->>'articleHash' IS DISTINCT FROM p_article_hash
    OR NOT EXISTS (
      SELECT 1 FROM public.candidate_deep_article_reviews_v1 review
      WHERE review.id=p_deep_review_id AND review.revision_id=p_revision_id
        AND review.input_hash=p_input_hash AND review.article_hash=p_article_hash
        AND review.decision='accepted' AND review.reviewed_at>=v_job.created_at
        AND EXISTS(SELECT 1 FROM public.research_model_completions_v1 c
          JOIN public.research_model_reservations_v1 r USING(reservation_id)
          WHERE c.reservation_id=review.model_reservation_id AND c.outcome='completed'
            AND c.result_hash=p_article_hash AND r.role='counter_review'
            AND r.work_key='deep-review:'||p_deep_job_id||':'||p_deep_attempt||':'||p_article_hash)
    )
  ) THEN
    RAISE EXCEPTION 'research_deep_exact_review_missing';
  END IF;
  SELECT * INTO v_receipt FROM public.record_candidate_dossier_submission_v4(
    p_bundle_id,p_revision_id,p_input_hash,p_submission_hash,p_content,
    p_claims,p_source_references,p_claim_fact_map,p_validation_status,p_rejection_reasons
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'research_deep_publication_receipt_missing'; END IF;
  UPDATE public.candidate_dossier_outbox_v5 SET
    status=v_receipt.status, lease_owner=NULL, lease_expires_at=NULL,
    receipt_id=CASE WHEN v_receipt.status='accepted' THEN v_receipt.submission_id ELSE NULL END,
    last_submission_hash=p_submission_hash,
    last_error=CASE WHEN v_receipt.status='rejected' THEN v_receipt.rejection_reasons::text ELSE NULL END,
    updated_at=clock_timestamp() WHERE job_id=p_job_id;
  UPDATE public.research_deep_jobs_v1 SET
    status=CASE WHEN v_receipt.status='accepted' THEN 'completed'
      WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
    lease_owner=NULL,lease_expires_at=NULL,
    receipt_id=CASE WHEN v_receipt.status='accepted' THEN v_receipt.submission_id ELSE NULL END,
    completion_owner=CASE WHEN v_receipt.status='accepted' THEN p_deep_owner ELSE NULL END,
    completion_outbox_owner=CASE WHEN v_receipt.status='accepted' THEN p_owner ELSE NULL END,
    completion_outbox_job_id=CASE WHEN v_receipt.status='accepted' THEN p_job_id ELSE NULL END,
    completion_review_id=CASE WHEN v_receipt.status='accepted' THEN p_deep_review_id ELSE NULL END,
    completion_article_hash=CASE WHEN v_receipt.status='accepted' THEN p_article_hash ELSE NULL END,
    completion_submission_hash=CASE WHEN v_receipt.status='accepted' THEN p_submission_hash ELSE NULL END,
    terminal_reason=CASE WHEN v_receipt.status='accepted' THEN NULL ELSE 'dossier_rejected' END,
    finished_at=CASE WHEN v_receipt.status='accepted' OR attempts>=3 THEN clock_timestamp() ELSE NULL END
    WHERE research_deep_jobs_v1.job_id=p_deep_job_id;
  PERFORM public.finish_research_model_v1(r.reservation_id,p_deep_owner,
    CASE WHEN v_receipt.status='accepted' THEN 'completed' ELSE 'failed' END,p_submission_hash)
  FROM public.research_model_reservations_v1 r WHERE r.role='company_research'
    AND r.work_key='deep:'||p_deep_job_id||':'||p_deep_attempt::text
    AND NOT EXISTS(SELECT 1 FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id);
  RETURN QUERY SELECT v_receipt.submission_id,v_receipt.dossier_id,v_receipt.status,
    v_receipt.rejection_reasons,v_receipt.idempotent_replay;
END $function$;
DO $$DECLARE routine record;BEGIN FOR routine IN SELECT p.proname,pg_get_function_identity_arguments(p.oid)args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['record_budgeted_deep_review_v1','claim_candidate_deep_outbox_v1','finish_research_deep_job_v2','record_candidate_deep_submission_v1'])LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',routine.proname,routine.args);EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',routine.proname,routine.args);END LOOP;END $$;
COMMIT;
