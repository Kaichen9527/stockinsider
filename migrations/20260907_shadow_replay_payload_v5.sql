BEGIN;

-- Shadow v5 preserves the exact ordered classifier input used by the final
-- publication.  It is an additive audit plane: existing manifests, attempts,
-- observations and public snapshots remain untouched.
CREATE TABLE IF NOT EXISTS public.candidate_shadow_replay_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL REFERENCES public.candidate_shadow_manifests(id) ON DELETE RESTRICT,
  final_publication_id UUID NOT NULL,
  session_date DATE NOT NULL,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  publication_phase TEXT NOT NULL CHECK (publication_phase = 'final'),
  session_kind TEXT NOT NULL CHECK (session_kind = 'official_trading'),
  manifest_hash TEXT NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  final_publication_hash TEXT NOT NULL CHECK (final_publication_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  verifier_version TEXT NOT NULL DEFAULT 'candidate-shadow-replay-v5',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (manifest_id, final_publication_id),
  UNIQUE (session_date, ruleset_version, model_version, manifest_hash, final_publication_hash)
);

CREATE INDEX IF NOT EXISTS idx_candidate_shadow_replay_payloads_session
  ON public.candidate_shadow_replay_payloads (ruleset_version, model_version, session_date DESC);

-- The payload is the replay authority.  Verification may append its timestamp
-- after an independent runner finishes, but no producer can rewrite cards,
-- version controls or publication binding after the initial insert.
CREATE OR REPLACE FUNCTION public.enforce_candidate_shadow_replay_payload_immutable_v5()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
    OR NEW.final_publication_id IS DISTINCT FROM OLD.final_publication_id
    OR NEW.session_date IS DISTINCT FROM OLD.session_date
    OR NEW.ruleset_version IS DISTINCT FROM OLD.ruleset_version
    OR NEW.model_version IS DISTINCT FROM OLD.model_version
    OR NEW.publication_phase IS DISTINCT FROM OLD.publication_phase
    OR NEW.session_kind IS DISTINCT FROM OLD.session_kind
    OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
    OR NEW.final_publication_hash IS DISTINCT FROM OLD.final_publication_hash
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.verifier_version IS DISTINCT FROM OLD.verifier_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'candidate_shadow_replay_payload_immutable_v5' USING ERRCODE = '55000';
  END IF;
  IF OLD.verified_at IS NOT NULL AND NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'candidate_shadow_replay_payload_already_verified_v5' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_candidate_shadow_replay_payload_immutable_v5
  ON public.candidate_shadow_replay_payloads;
CREATE TRIGGER trg_candidate_shadow_replay_payload_immutable_v5
  BEFORE UPDATE ON public.candidate_shadow_replay_payloads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_shadow_replay_payload_immutable_v5();

ALTER TABLE public.candidate_shadow_replay_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_shadow_replay_payloads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.candidate_shadow_replay_payloads TO service_role;
REVOKE ALL ON FUNCTION public.enforce_candidate_shadow_replay_payload_immutable_v5()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_candidate_shadow_replay_payload_immutable_v5() TO service_role;

COMMIT;
