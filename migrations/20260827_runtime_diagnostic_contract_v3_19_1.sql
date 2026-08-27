BEGIN;

-- The runtime has emitted this closed typed outcome since V3.16.21, but the
-- V3.14 persistence constraint predates it. Keep the append-only diagnostic
-- plane aligned so a projection conflict cannot be masked by a second CHECK
-- violation while the producer is failing closed.
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  DROP CONSTRAINT IF EXISTS legacy_runtime_failure_diagnostics_v3_14_invariant_code_check;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_invariant_code_check
  CHECK (invariant_code IN (
    'candidate_seed_membership_missing',
    'database_constraint_rejected',
    'provider_timeout',
    'authentication_rejected',
    'projection_supersession_conflict',
    'data_integrity_failure'
  ));

COMMIT;
