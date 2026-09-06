BEGIN;

-- Shadow is an experiment ledger. These additions do not participate in the
-- candidate-stage classifier or in the public recommendation write path.
ALTER TABLE public.candidate_shadow_manifests
  ADD COLUMN IF NOT EXISTS ruleset_version TEXT NOT NULL DEFAULT 'legacy-unversioned',
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'legacy-unversioned',
  ADD COLUMN IF NOT EXISTS cohort_key TEXT NOT NULL DEFAULT 'legacy-unversioned',
  ADD COLUMN IF NOT EXISTS canonical_input_hashes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.candidate_shadow_attempts
  ADD COLUMN IF NOT EXISTS cohort_key TEXT,
  ADD COLUMN IF NOT EXISTS canonical_input_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS blocker_schema_version TEXT NOT NULL DEFAULT 'shadow-blockers-v1',
  ADD COLUMN IF NOT EXISTS attempt_blockers JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.candidate_shadow_session_observations
  ADD COLUMN IF NOT EXISTS cohort_key TEXT,
  ADD COLUMN IF NOT EXISTS canonical_input_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS blocker_schema_version TEXT NOT NULL DEFAULT 'shadow-blockers-v1',
  ADD COLUMN IF NOT EXISTS attempt_blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_blockers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- A cohort identity always carries all three policy controls. `cohort_key` is
-- stored for audit/readability while this unique index is the enforceable key.
ALTER TABLE public.candidate_shadow_manifests
  DROP CONSTRAINT IF EXISTS candidate_shadow_manifests_session_date_policy_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_shadow_manifest_cohort_v4
  ON public.candidate_shadow_manifests (session_date, policy_version, ruleset_version, model_version);
CREATE INDEX IF NOT EXISTS idx_candidate_shadow_attempt_cohort_v4
  ON public.candidate_shadow_attempts (cohort_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_shadow_observation_cohort_v4
  ON public.candidate_shadow_session_observations (cohort_key, session_date DESC);

ALTER TABLE public.candidate_shadow_manifests
  DROP CONSTRAINT IF EXISTS candidate_shadow_manifests_canonical_hashes_object_v4,
  DROP CONSTRAINT IF EXISTS candidate_shadow_manifests_cohort_key_v4;
ALTER TABLE public.candidate_shadow_manifests
  ADD CONSTRAINT candidate_shadow_manifests_canonical_hashes_object_v4
  CHECK (jsonb_typeof(canonical_input_hashes) = 'object'),
  ADD CONSTRAINT candidate_shadow_manifests_cohort_key_v4
  CHECK (
    (ruleset_version = 'legacy-unversioned' AND model_version = 'legacy-unversioned' AND cohort_key = 'legacy-unversioned')
    OR cohort_key = policy_version || ':' || ruleset_version || ':' || model_version
  );
ALTER TABLE public.candidate_shadow_attempts
  DROP CONSTRAINT IF EXISTS candidate_shadow_attempts_blockers_array_v4;
ALTER TABLE public.candidate_shadow_attempts
  ADD CONSTRAINT candidate_shadow_attempts_blockers_array_v4
  CHECK (jsonb_typeof(canonical_input_hashes) = 'object'
    AND jsonb_typeof(attempt_blockers) = 'array');
ALTER TABLE public.candidate_shadow_session_observations
  DROP CONSTRAINT IF EXISTS candidate_shadow_observations_blockers_array_v4;
ALTER TABLE public.candidate_shadow_session_observations
  ADD CONSTRAINT candidate_shadow_observations_blockers_array_v4
  CHECK (jsonb_typeof(canonical_input_hashes) = 'object'
    AND jsonb_typeof(attempt_blockers) = 'array'
    AND jsonb_typeof(current_blockers) = 'array');

-- A frozen manifest is its evidence boundary. Retry metadata and the current
-- outcome may change, but a retry cannot silently mutate the input universe,
-- its canonical hashes, or the cohort controls.
CREATE OR REPLACE FUNCTION public.enforce_candidate_shadow_manifest_immutable_v4()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.session_date IS DISTINCT FROM OLD.session_date
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.ruleset_version IS DISTINCT FROM OLD.ruleset_version
    OR NEW.model_version IS DISTINCT FROM OLD.model_version
    OR NEW.cohort_key IS DISTINCT FROM OLD.cohort_key
    OR NEW.candidate_symbols IS DISTINCT FROM OLD.candidate_symbols
    OR NEW.input_versions IS DISTINCT FROM OLD.input_versions
    OR NEW.canonical_input_hashes IS DISTINCT FROM OLD.canonical_input_hashes
    OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
    OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at THEN
    RAISE EXCEPTION 'candidate_shadow_manifest_immutable_v4' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_candidate_shadow_manifest_immutable_v4 ON public.candidate_shadow_manifests;
CREATE TRIGGER trg_candidate_shadow_manifest_immutable_v4
  BEFORE UPDATE ON public.candidate_shadow_manifests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_shadow_manifest_immutable_v4();

-- Attempts and observations are mutable operational records, but their cohort
-- and canonical input hashes are not. Blockers are intentionally mutable: an
-- attempt captures what blocked that run, while current blockers describe the
-- latest experiment badge state.
CREATE OR REPLACE FUNCTION public.enforce_candidate_shadow_identity_immutable_v4()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.cohort_key IS DISTINCT FROM OLD.cohort_key
    OR NEW.canonical_input_hashes IS DISTINCT FROM OLD.canonical_input_hashes THEN
    RAISE EXCEPTION 'candidate_shadow_input_identity_immutable_v4' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_candidate_shadow_attempt_identity_immutable_v4 ON public.candidate_shadow_attempts;
CREATE TRIGGER trg_candidate_shadow_attempt_identity_immutable_v4
  BEFORE UPDATE ON public.candidate_shadow_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_shadow_identity_immutable_v4();
DROP TRIGGER IF EXISTS trg_candidate_shadow_observation_identity_immutable_v4 ON public.candidate_shadow_session_observations;
CREATE TRIGGER trg_candidate_shadow_observation_identity_immutable_v4
  BEFORE UPDATE ON public.candidate_shadow_session_observations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_shadow_identity_immutable_v4();

ALTER TABLE public.candidate_shadow_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_shadow_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_shadow_session_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_shadow_manifests, public.candidate_shadow_attempts,
  public.candidate_shadow_session_observations FROM anon, authenticated;
GRANT ALL ON public.candidate_shadow_manifests, public.candidate_shadow_attempts,
  public.candidate_shadow_session_observations TO service_role;
REVOKE ALL ON FUNCTION public.enforce_candidate_shadow_manifest_immutable_v4() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_candidate_shadow_manifest_immutable_v4() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_candidate_shadow_identity_immutable_v4() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_candidate_shadow_identity_immutable_v4() TO service_role;

COMMIT;
