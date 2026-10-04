-- Additive upgrade for both fresh v1 installations and existing immutable rows.
-- Apply only through the reviewed research-agent extension with writers drained.
BEGIN;
LOCK TABLE public.candidate_technical_decisions_v1 IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.candidate_technical_decisions_v1 ADD COLUMN IF NOT EXISTS decision_input_hash text;
-- Only the new identity column changes. Historical snapshots and timestamps
-- remain intact; legacy identities cannot masquerade as current input hashes.
DROP TRIGGER IF EXISTS trg_candidate_technical_decisions_immutable_v1 ON public.candidate_technical_decisions_v1;
UPDATE public.candidate_technical_decisions_v1
SET decision_input_hash=encode(public.digest(convert_to(
  jsonb_build_array('legacy-technical-input-v1',id,stock_id,thesis_qualification_id,
    session_date,market_dataset_hash,calendar_hash,feature_version,strategy_version,snapshot,observed_at,created_at)::text,'UTF8'),'sha256'),'hex')
WHERE decision_input_hash IS NULL;
ALTER TABLE public.candidate_technical_decisions_v1 ALTER COLUMN decision_input_hash SET NOT NULL;
DO $upgrade$
DECLARE v_constraint record;
BEGIN
  FOR v_constraint IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.candidate_technical_decisions_v1'::regclass AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (stock_id, thesis_qualification_id, session_date, market_dataset_hash, strategy_version)'
  LOOP
    EXECUTE format('ALTER TABLE public.candidate_technical_decisions_v1 DROP CONSTRAINT %I',v_constraint.conname);
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.candidate_technical_decisions_v1'::regclass
    AND conname='candidate_technical_input_hash_v2') THEN
    ALTER TABLE public.candidate_technical_decisions_v1 ADD CONSTRAINT candidate_technical_input_hash_v2
      CHECK(decision_input_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $upgrade$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_technical_input_v2
  ON public.candidate_technical_decisions_v1(stock_id,decision_input_hash);
CREATE OR REPLACE TRIGGER trg_candidate_technical_decisions_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_technical_decisions_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
COMMENT ON COLUMN public.candidate_technical_decisions_v1.decision_input_hash
  IS 'Current canonical input identity; legacy backfill is domain-separated and is not a live-input attestation.';
COMMIT;
