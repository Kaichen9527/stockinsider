BEGIN;
-- Existing publication tables only. No v2 publication writer or eligibility.
ALTER TABLE public.candidate_dossier_bundles
 ADD COLUMN revision_kind text NOT NULL DEFAULT 'legacy_detail_v1',
 ADD COLUMN research_input_revision_id uuid REFERENCES public.research_article_input_revisions_v2(revision_id) ON DELETE RESTRICT,
 ADD COLUMN research_company_id uuid REFERENCES public.research_observed_companies_v1(research_company_id) ON DELETE RESTRICT,
 ADD COLUMN research_snapshot_hash text,
 ALTER COLUMN revision_id DROP NOT NULL, ALTER COLUMN published_revision_id DROP NOT NULL,
 ADD CONSTRAINT research_bundle_revision_union_v2 CHECK(
  (revision_kind='legacy_detail_v1' AND revision_id IS NOT NULL AND published_revision_id IS NOT NULL
   AND revision_id=published_revision_id AND research_input_revision_id IS NULL AND research_company_id IS NULL AND research_snapshot_hash IS NULL)
  OR (revision_kind='research_input_v2' AND revision_id IS NULL AND published_revision_id IS NULL
   AND research_input_revision_id IS NOT NULL AND research_company_id IS NOT NULL
   AND research_snapshot_hash IS NOT NULL AND research_snapshot_hash ~ '^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX research_bundle_input_unique_v2 ON public.candidate_dossier_bundles(research_input_revision_id,input_hash)
 WHERE revision_kind='research_input_v2';
ALTER TABLE public.candidate_dossier_outbox_v5
 ADD COLUMN revision_kind text NOT NULL DEFAULT 'legacy_detail_v1',
 ADD COLUMN research_input_revision_id uuid REFERENCES public.research_article_input_revisions_v2(revision_id) ON DELETE RESTRICT,
 ADD COLUMN research_company_id uuid REFERENCES public.research_observed_companies_v1(research_company_id) ON DELETE RESTRICT,
 ADD COLUMN research_snapshot_hash text,
 ALTER COLUMN revision_id DROP NOT NULL,
 ADD CONSTRAINT research_outbox_revision_union_v2 CHECK(
  (revision_kind='legacy_detail_v1' AND revision_id IS NOT NULL AND research_input_revision_id IS NULL
   AND research_company_id IS NULL AND research_snapshot_hash IS NULL)
  OR (revision_kind='research_input_v2' AND revision_id IS NULL AND publication_kind='deep'
   AND deep_job_id IS NOT NULL AND deep_attempt IS NOT NULL AND deep_attempt BETWEEN 1 AND 3
   AND research_input_revision_id IS NOT NULL AND research_company_id IS NOT NULL
   AND research_snapshot_hash IS NOT NULL AND research_snapshot_hash ~ '^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX research_outbox_input_unique_v2 ON public.candidate_dossier_outbox_v5(research_input_revision_id,input_hash,publication_kind)
 WHERE revision_kind='research_input_v2';

-- current_user is the actual writer. Never change this function to DEFINER.
CREATE FUNCTION public.fence_research_publication_lineage_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE i public.research_article_input_revisions_v2; b public.candidate_dossier_bundles;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.revision_kind='research_input_v2' THEN RAISE EXCEPTION 'research_publication_v2_inert';END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revision_kind IS DISTINCT FROM NEW.revision_kind THEN RAISE EXCEPTION 'research_publication_branch_immutable';END IF;
  IF OLD.revision_kind='research_input_v2' THEN RAISE EXCEPTION 'research_publication_v2_inert';END IF;
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
ALTER FUNCTION public.fence_research_publication_lineage_v2() OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.fence_research_publication_lineage_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_bundle_lineage_v2 BEFORE INSERT ON public.candidate_dossier_bundles
 FOR EACH ROW EXECUTE FUNCTION public.fence_research_publication_lineage_v2();
CREATE TRIGGER research_outbox_lineage_v2 BEFORE INSERT OR UPDATE OR DELETE ON public.candidate_dossier_outbox_v5
 FOR EACH ROW EXECUTE FUNCTION public.fence_research_publication_lineage_v2();

-- TRUNCATE is not MVCC safe. In old-snapshot isolation we cannot prove absence.
-- VOLATILE fresh RC snapshot runs after TRUNCATE's ACCESS EXCLUSIVE table lock.
CREATE FUNCTION public.fence_research_publication_truncate_v2() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'research_publication_truncate_isolation';END IF;
 IF (TG_TABLE_NAME='candidate_dossier_bundles' AND EXISTS(SELECT FROM public.candidate_dossier_bundles WHERE revision_kind='research_input_v2'))
  OR (TG_TABLE_NAME='candidate_dossier_outbox_v5' AND EXISTS(SELECT FROM public.candidate_dossier_outbox_v5 WHERE revision_kind='research_input_v2'))
 THEN RAISE EXCEPTION 'research_publication_v2_inert';END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION public.fence_research_publication_truncate_v2() OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.fence_research_publication_truncate_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_bundle_truncate_v2 BEFORE TRUNCATE ON public.candidate_dossier_bundles
 FOR EACH STATEMENT EXECUTE FUNCTION public.fence_research_publication_truncate_v2();
CREATE TRIGGER research_outbox_truncate_v2 BEFORE TRUNCATE ON public.candidate_dossier_outbox_v5
 FOR EACH STATEMENT EXECUTE FUNCTION public.fence_research_publication_truncate_v2();

GRANT SELECT,INSERT ON public.candidate_dossier_bundles TO research_input_preparation_owner_v2;
GRANT SELECT ON public.candidate_dossier_bundles TO research_observed_rpc_owner;
CREATE POLICY research_bundle_lineage_read_v2 ON public.candidate_dossier_bundles FOR SELECT
 TO research_input_preparation_owner_v2,research_observed_rpc_owner USING(true);
CREATE POLICY research_bundle_lineage_insert_v2 ON public.candidate_dossier_bundles FOR INSERT
 TO research_input_preparation_owner_v2 WITH CHECK(revision_kind='research_input_v2');
GRANT SELECT,INSERT ON public.candidate_dossier_outbox_v5 TO research_observed_rpc_owner;
GRANT SELECT ON public.candidate_dossier_outbox_v5 TO research_input_preparation_owner_v2;
CREATE POLICY research_outbox_lineage_read_v2 ON public.candidate_dossier_outbox_v5 FOR SELECT
 TO research_input_preparation_owner_v2,research_observed_rpc_owner USING(true);
CREATE POLICY research_outbox_lineage_insert_v2 ON public.candidate_dossier_outbox_v5 FOR INSERT
 TO research_observed_rpc_owner WITH CHECK(revision_kind='research_input_v2');
GRANT SELECT ON public.research_article_input_revisions_v2 TO research_observed_rpc_owner;
CREATE POLICY research_input_lineage_read_v2 ON public.research_article_input_revisions_v2 FOR SELECT TO research_observed_rpc_owner USING(true);
COMMIT;
