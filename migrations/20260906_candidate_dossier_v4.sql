BEGIN;

-- A detail is a revision, not a mutable daily cache row. Existing rows receive
-- a deterministic audit hash; new writers supply a content hash and may append
-- another revision for the same stock/session/model when inputs change.
ALTER TABLE public.candidate_detail_snapshots
  ADD COLUMN IF NOT EXISTS revision_hash TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_revision_id UUID REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT;
UPDATE public.candidate_detail_snapshots
SET revision_hash = md5(id::text) || md5(id::text)
WHERE revision_hash IS NULL;
ALTER TABLE public.candidate_detail_snapshots
  ALTER COLUMN revision_hash SET NOT NULL;
ALTER TABLE public.candidate_detail_snapshots
  DROP CONSTRAINT IF EXISTS candidate_detail_snapshots_revision_hash_check;
ALTER TABLE public.candidate_detail_snapshots
  ADD CONSTRAINT candidate_detail_snapshots_revision_hash_check CHECK (revision_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.candidate_detail_snapshots
  DROP CONSTRAINT IF EXISTS candidate_detail_snapshots_stock_id_session_date_model_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_detail_revision_hash_v4
  ON public.candidate_detail_snapshots (stock_id, session_date, model_version, revision_hash);

CREATE TABLE IF NOT EXISTS public.candidate_dossier_bundles (
  bundle_id UUID PRIMARY KEY,
  revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  published_revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  symbol TEXT NOT NULL CHECK (symbol ~ '^[0-9]{4}$'),
  payload JSONB NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (revision_id = published_revision_id),
  UNIQUE (revision_id, input_hash)
);
CREATE INDEX IF NOT EXISTS idx_candidate_dossier_bundles_queue
  ON public.candidate_dossier_bundles (queued_at, bundle_id);

ALTER TABLE public.candidate_research_dossiers
  ADD COLUMN IF NOT EXISTS bundle_hash TEXT,
  ADD COLUMN IF NOT EXISTS detail_payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS bundle_id UUID REFERENCES public.candidate_dossier_bundles(bundle_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersedes_dossier_id UUID REFERENCES public.candidate_research_dossiers(id) ON DELETE RESTRICT;

ALTER TABLE public.candidate_research_dossiers
  DROP CONSTRAINT IF EXISTS candidate_research_dossiers_input_hash_check;
ALTER TABLE public.candidate_research_dossiers
  ADD CONSTRAINT candidate_research_dossiers_input_hash_check
    CHECK (input_hash IS NULL OR input_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.candidate_research_dossiers
  DROP CONSTRAINT IF EXISTS candidate_research_dossiers_claims_array_check;
ALTER TABLE public.candidate_research_dossiers
  ADD CONSTRAINT candidate_research_dossiers_claims_array_check
    CHECK (jsonb_typeof(claims) = 'array');
ALTER TABLE public.candidate_research_dossiers
  DROP CONSTRAINT IF EXISTS candidate_research_dossiers_source_refs_array_check;
ALTER TABLE public.candidate_research_dossiers
  ADD CONSTRAINT candidate_research_dossiers_source_refs_array_check
    CHECK (jsonb_typeof(source_references) = 'array');
ALTER TABLE public.candidate_research_dossiers
  DROP CONSTRAINT IF EXISTS candidate_research_dossiers_paid_content_check;
ALTER TABLE public.candidate_research_dossiers
  ADD CONSTRAINT candidate_research_dossiers_paid_content_check CHECK (
    content::text !~* '(investanchors|investanchor|定錨投資|定錨會員)'
  ) NOT VALID;
ALTER TABLE public.candidate_research_dossiers
  DROP CONSTRAINT IF EXISTS candidate_research_dossiers_bundle_binding_check;
ALTER TABLE public.candidate_research_dossiers
  ADD CONSTRAINT candidate_research_dossiers_bundle_binding_check CHECK (
    (bundle_id IS NULL AND input_hash IS NULL)
    OR (bundle_id IS NOT NULL AND input_hash IS NOT NULL AND bundle_hash = input_hash AND detail_payload_hash = input_hash)
  );

CREATE TABLE IF NOT EXISTS public.candidate_dossier_submission_receipts (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.candidate_dossier_bundles(bundle_id) ON DELETE RESTRICT,
  revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  dossier_id UUID NOT NULL REFERENCES public.candidate_research_dossiers(id) ON DELETE RESTRICT,
  submission_hash TEXT NOT NULL CHECK (submission_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('accepted','rejected')),
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rejection_reasons) = 'array'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_dossier_receipt_submission_hash_v4
  ON public.candidate_dossier_submission_receipts (submission_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_dossier_input_revision_v4
  ON public.candidate_research_dossiers (detail_snapshot_id, narrative_kind, input_hash)
  WHERE input_hash IS NOT NULL AND validation_status = 'valid';
CREATE INDEX IF NOT EXISTS idx_candidate_dossier_receipts_revision
  ON public.candidate_dossier_submission_receipts (revision_id, received_at DESC);

CREATE OR REPLACE FUNCTION public.record_candidate_dossier_submission_v4(
  p_bundle_id uuid,
  p_revision_id uuid,
  p_input_hash text,
  p_submission_hash text,
  p_content jsonb,
  p_claims jsonb,
  p_source_references jsonb,
  p_claim_fact_map jsonb,
  p_validation_status text,
  p_rejection_reasons jsonb
)
RETURNS TABLE(submission_id uuid, dossier_id uuid, status text, rejection_reasons jsonb, idempotent_replay boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_dossier_id uuid;
  v_submission_id uuid;
BEGIN
  IF p_input_hash !~ '^[0-9a-f]{64}$' OR p_submission_hash !~ '^[0-9a-f]{64}$'
    OR p_validation_status NOT IN ('valid','rejected')
    OR jsonb_typeof(p_claims) <> 'array' OR jsonb_typeof(p_source_references) <> 'array'
    OR jsonb_typeof(p_claim_fact_map) <> 'object' OR jsonb_typeof(p_rejection_reasons) <> 'array' THEN
    RAISE EXCEPTION 'invalid_candidate_dossier_persistence_input';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.candidate_dossier_bundles bundle
    WHERE bundle.bundle_id = p_bundle_id AND bundle.revision_id = p_revision_id
      AND bundle.published_revision_id = p_revision_id AND bundle.input_hash = p_input_hash
  ) OR NOT EXISTS (
    SELECT 1 FROM public.candidate_daily_stage_snapshots stage WHERE stage.detail_revision_id = p_revision_id
  ) THEN
    RAISE EXCEPTION 'candidate_dossier_revision_not_published';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_submission_hash, 0));
  RETURN QUERY
  SELECT receipt.submission_id, receipt.dossier_id, receipt.status, receipt.rejection_reasons, TRUE
  FROM public.candidate_dossier_submission_receipts receipt
  WHERE receipt.submission_hash = p_submission_hash;
  IF FOUND THEN RETURN; END IF;

  INSERT INTO public.candidate_research_dossiers (
    detail_snapshot_id,narrative_kind,bundle_id,input_hash,content,claims,source_references,
    claim_fact_map,validation_status,rejection_reasons,bundle_hash,detail_payload_hash,published_at
  ) VALUES (
    p_revision_id,'codex_enriched',p_bundle_id,p_input_hash,p_content,p_claims,p_source_references,
    p_claim_fact_map,p_validation_status,p_rejection_reasons,p_input_hash,p_input_hash,
    CASE WHEN p_validation_status = 'valid' THEN clock_timestamp() ELSE NULL END
  ) RETURNING id INTO v_dossier_id;

  INSERT INTO public.candidate_dossier_submission_receipts (
    bundle_id,revision_id,input_hash,dossier_id,submission_hash,status,rejection_reasons
  ) VALUES (
    p_bundle_id,p_revision_id,p_input_hash,v_dossier_id,p_submission_hash,
    CASE WHEN p_validation_status = 'valid' THEN 'accepted' ELSE 'rejected' END,p_rejection_reasons
  ) RETURNING candidate_dossier_submission_receipts.submission_id INTO v_submission_id;

  RETURN QUERY SELECT v_submission_id, v_dossier_id,
    CASE WHEN p_validation_status = 'valid' THEN 'accepted' ELSE 'rejected' END,
    p_rejection_reasons, FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_candidate_dossier_revision_mutation_v4()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'candidate_dossier_revisions_are_append_only';
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_dossier_bundles_append_only_v4 ON public.candidate_dossier_bundles;
CREATE TRIGGER trg_candidate_dossier_bundles_append_only_v4
  BEFORE UPDATE OR DELETE ON public.candidate_dossier_bundles
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

DROP TRIGGER IF EXISTS trg_candidate_research_dossiers_append_only_v4 ON public.candidate_research_dossiers;
CREATE TRIGGER trg_candidate_research_dossiers_append_only_v4
  BEFORE UPDATE OR DELETE ON public.candidate_research_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

DROP TRIGGER IF EXISTS trg_candidate_dossier_receipts_append_only_v4 ON public.candidate_dossier_submission_receipts;
CREATE TRIGGER trg_candidate_dossier_receipts_append_only_v4
  BEFORE UPDATE OR DELETE ON public.candidate_dossier_submission_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE OR REPLACE FUNCTION public.protect_published_candidate_detail_revision_v4()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidate_dossier_bundles WHERE revision_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.candidate_daily_stage_snapshots WHERE detail_revision_id = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'published_candidate_detail_revisions_are_append_only';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_detail_published_append_only_v4 ON public.candidate_detail_snapshots;
CREATE TRIGGER trg_candidate_detail_published_append_only_v4
  BEFORE UPDATE OR DELETE ON public.candidate_detail_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_candidate_detail_revision_v4();

ALTER TABLE public.candidate_dossier_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_dossier_submission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_dossier_bundles, public.candidate_dossier_submission_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.candidate_dossier_bundles, public.candidate_dossier_submission_receipts TO service_role;
REVOKE ALL ON FUNCTION public.reject_candidate_dossier_revision_mutation_v4() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_published_candidate_detail_revision_v4() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)
  TO service_role;

COMMIT;
