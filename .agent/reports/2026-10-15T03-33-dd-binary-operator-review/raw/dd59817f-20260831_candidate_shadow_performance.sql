BEGIN;

CREATE TABLE IF NOT EXISTS public.candidate_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_at TIMESTAMPTZ NOT NULL,
  technical_session_date DATE,
  status TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  terminal_reason TEXT,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  pipeline_run_id UUID,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.production_write_leases (
  lease_key TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > acquired_at)
);

CREATE OR REPLACE FUNCTION public.acquire_production_write_lease(
  p_lease_key TEXT,
  p_owner_id UUID,
  p_ttl_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  acquired_owner UUID;
BEGIN
  IF p_ttl_seconds < 60 OR p_ttl_seconds > 10800 THEN
    RAISE EXCEPTION 'invalid_lease_ttl';
  END IF;
  INSERT INTO public.production_write_leases (lease_key, owner_id, acquired_at, expires_at)
  VALUES (p_lease_key, p_owner_id, NOW(), NOW() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (lease_key) DO UPDATE
  SET owner_id = EXCLUDED.owner_id, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
  WHERE public.production_write_leases.expires_at <= NOW()
     OR public.production_write_leases.owner_id = EXCLUDED.owner_id
  RETURNING owner_id INTO acquired_owner;
  RETURN acquired_owner = p_owner_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_production_write_lease(
  p_lease_key TEXT,
  p_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH deleted AS (
    DELETE FROM public.production_write_leases
    WHERE lease_key = p_lease_key AND owner_id = p_owner_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM deleted);
$function$;

CREATE INDEX IF NOT EXISTS idx_candidate_research_runs_started
  ON public.candidate_research_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_research_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.candidate_research_runs(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
  price_status TEXT NOT NULL,
  technical_status TEXT NOT NULL,
  fundamental_status TEXT NOT NULL,
  valuation_status TEXT NOT NULL,
  classification_status TEXT NOT NULL,
  lifecycle_stage TEXT CHECK (lifecycle_stage IN ('found','waiting','actionable')),
  terminal_reason TEXT,
  technical_session_date DATE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  UNIQUE (run_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_research_items_stock_finished
  ON public.candidate_research_run_items (stock_id, finished_at DESC);

ALTER TABLE public.valuation_snapshots
  ADD COLUMN IF NOT EXISTS session_date DATE;

-- Preserve every historical row. Where old releases produced duplicates for the
-- same session/model, only the newest row becomes the canonical dated row.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY stock_id, (as_of AT TIME ZONE 'Asia/Taipei')::date, model_version
      ORDER BY available_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM public.valuation_snapshots
  WHERE session_date IS NULL
)
UPDATE public.valuation_snapshots AS snapshots
SET session_date = (snapshots.as_of AT TIME ZONE 'Asia/Taipei')::date
FROM ranked
WHERE snapshots.id = ranked.id
  AND ranked.row_number = 1;

-- A composite unique key avoids a generated text expression. PostgreSQL's
-- date-to-text cast is locale/DateStyle dependent and therefore not immutable,
-- so it is invalid inside a stored generated column on production Postgres.
-- NULL session dates remain distinct for preserved historical rows; every new
-- candidate-research write supplies a non-null official session date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_valuation_snapshot_stock_session_model
  ON public.valuation_snapshots (stock_id, session_date, model_version);

CREATE TABLE IF NOT EXISTS public.candidate_shadow_session_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  pipeline_run_id UUID,
  publication_id UUID,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  waiting_count INTEGER NOT NULL DEFAULT 0 CHECK (waiting_count >= 0),
  actionable_count INTEGER NOT NULL DEFAULT 0 CHECK (actionable_count >= 0),
  completeness_pct NUMERIC NOT NULL CHECK (completeness_pct BETWEEN 0 AND 100),
  freshness_pct NUMERIC NOT NULL CHECK (freshness_pct BETWEEN 0 AND 100),
  active_source_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  canonical_input_hash TEXT NOT NULL,
  replay_hash TEXT NOT NULL,
  reproducibility_status TEXT NOT NULL CHECK (reproducibility_status IN ('matched','conflict','pending')),
  qualifying BOOLEAN NOT NULL DEFAULT FALSE,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  conflict_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_date, ruleset_version, model_version)
);

CREATE INDEX IF NOT EXISTS idx_candidate_shadow_qualifying_session
  ON public.candidate_shadow_session_observations (qualifying, session_date DESC);

CREATE OR REPLACE FUNCTION public.record_candidate_shadow_observation(
  p_session_date DATE,
  p_ruleset_version TEXT,
  p_model_version TEXT,
  p_pipeline_run_id UUID,
  p_publication_id UUID,
  p_counts JSONB,
  p_completeness_pct NUMERIC,
  p_freshness_pct NUMERIC,
  p_active_source_errors JSONB,
  p_canonical_input_hash TEXT,
  p_replay_hash TEXT,
  p_qualifying BOOLEAN,
  p_blockers JSONB,
  p_observed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  existing public.candidate_shadow_session_observations%ROWTYPE;
BEGIN
  INSERT INTO public.candidate_shadow_session_observations (
    session_date, ruleset_version, model_version, pipeline_run_id, publication_id,
    candidate_count, found_count, waiting_count, actionable_count,
    completeness_pct, freshness_pct, active_source_errors,
    canonical_input_hash, replay_hash, reproducibility_status, qualifying,
    blockers, observed_at, published_at, updated_at
  ) VALUES (
    p_session_date, p_ruleset_version, p_model_version, p_pipeline_run_id, p_publication_id,
    COALESCE((p_counts->>'candidate')::INTEGER, 0), COALESCE((p_counts->>'found')::INTEGER, 0),
    COALESCE((p_counts->>'waiting')::INTEGER, 0), COALESCE((p_counts->>'actionable')::INTEGER, 0),
    p_completeness_pct, p_freshness_pct, COALESCE(p_active_source_errors, '[]'::jsonb),
    p_canonical_input_hash, p_replay_hash, 'matched', p_qualifying,
    COALESCE(p_blockers, '[]'::jsonb), p_observed_at, p_observed_at, p_observed_at
  )
  ON CONFLICT (session_date, ruleset_version, model_version) DO NOTHING;

  SELECT * INTO existing
  FROM public.candidate_shadow_session_observations
  WHERE session_date = p_session_date
    AND ruleset_version = p_ruleset_version
    AND model_version = p_model_version
  FOR UPDATE;

  IF existing.canonical_input_hash <> p_canonical_input_hash
    OR existing.replay_hash <> p_replay_hash
    OR existing.reproducibility_status = 'conflict' THEN
    UPDATE public.candidate_shadow_session_observations
    SET reproducibility_status = 'conflict', qualifying = FALSE,
      blockers = CASE WHEN blockers ? 'same_session_replay_conflict' THEN blockers ELSE blockers || '"same_session_replay_conflict"'::jsonb END,
      conflict_evidence = CASE WHEN conflict_evidence ? p_canonical_input_hash THEN conflict_evidence ELSE conflict_evidence || jsonb_build_array(p_canonical_input_hash) END,
      updated_at = p_observed_at
    WHERE id = existing.id;
    RETURN jsonb_build_object('sessionDate', p_session_date, 'qualifying', FALSE, 'conflict', TRUE);
  END IF;

  UPDATE public.candidate_shadow_session_observations
  SET pipeline_run_id = p_pipeline_run_id, publication_id = p_publication_id,
    candidate_count = COALESCE((p_counts->>'candidate')::INTEGER, 0),
    found_count = COALESCE((p_counts->>'found')::INTEGER, 0),
    waiting_count = COALESCE((p_counts->>'waiting')::INTEGER, 0),
    actionable_count = COALESCE((p_counts->>'actionable')::INTEGER, 0),
    completeness_pct = p_completeness_pct, freshness_pct = p_freshness_pct,
    active_source_errors = COALESCE(p_active_source_errors, '[]'::jsonb),
    qualifying = p_qualifying, blockers = COALESCE(p_blockers, '[]'::jsonb),
    observed_at = p_observed_at, published_at = p_observed_at, updated_at = p_observed_at
  WHERE id = existing.id;
  RETURN jsonb_build_object('sessionDate', p_session_date, 'qualifying', p_qualifying, 'conflict', FALSE);
END;
$function$;

CREATE TABLE IF NOT EXISTS public.radar_public_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_key TEXT NOT NULL CHECK (window_key IN ('home','daily','hot','weekly')),
  schema_version TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  etag TEXT NOT NULL,
  content_as_of TIMESTAMPTZ NOT NULL,
  pipeline_run_id UUID,
  ruleset_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid','failed')),
  terminal_reason TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_public_snapshot_latest_valid
  ON public.radar_public_snapshots (window_key, published_at DESC)
  WHERE status = 'valid';

CREATE INDEX IF NOT EXISTS idx_radar_public_snapshot_payload_hash
  ON public.radar_public_snapshots (window_key, payload_hash);

CREATE TABLE IF NOT EXISTS public.radar_publication_state (
  window_key TEXT PRIMARY KEY CHECK (window_key IN ('home','daily','hot','weekly')),
  status TEXT NOT NULL CHECK (status IN ('valid','failed')),
  last_attempt_at TIMESTAMPTZ NOT NULL,
  last_success_snapshot_id UUID REFERENCES public.radar_public_snapshots(id) ON DELETE SET NULL,
  terminal_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.publish_radar_public_snapshots(
  p_home_payload JSONB,
  p_home_hash TEXT,
  p_home_etag TEXT,
  p_daily_payload JSONB,
  p_daily_hash TEXT,
  p_daily_etag TEXT,
  p_schema_version TEXT,
  p_content_as_of TIMESTAMPTZ,
  p_pipeline_run_id UUID,
  p_ruleset_version TEXT,
  p_model_version TEXT,
  p_published_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  home_id UUID;
  daily_id UUID;
BEGIN
  INSERT INTO public.radar_public_snapshots (
    window_key, schema_version, payload_json, payload_hash, etag, content_as_of,
    pipeline_run_id, ruleset_version, model_version, status, published_at
  ) VALUES (
    'home', p_schema_version, p_home_payload, p_home_hash, p_home_etag, p_content_as_of,
    p_pipeline_run_id, p_ruleset_version, p_model_version, 'valid', p_published_at
  ) RETURNING id INTO home_id;
  INSERT INTO public.radar_public_snapshots (
    window_key, schema_version, payload_json, payload_hash, etag, content_as_of,
    pipeline_run_id, ruleset_version, model_version, status, published_at
  ) VALUES (
    'daily', p_schema_version, p_daily_payload, p_daily_hash, p_daily_etag, p_content_as_of,
    p_pipeline_run_id, p_ruleset_version, p_model_version, 'valid', p_published_at
  ) RETURNING id INTO daily_id;
  INSERT INTO public.radar_publication_state (window_key, status, last_attempt_at, last_success_snapshot_id, terminal_reason, updated_at)
  VALUES
    ('home', 'valid', p_published_at, home_id, NULL, p_published_at),
    ('daily', 'valid', p_published_at, daily_id, NULL, p_published_at)
  ON CONFLICT (window_key) DO UPDATE SET
    status = EXCLUDED.status, last_attempt_at = EXCLUDED.last_attempt_at,
    last_success_snapshot_id = EXCLUDED.last_success_snapshot_id,
    terminal_reason = NULL, updated_at = EXCLUDED.updated_at;
  RETURN jsonb_build_object('homeId', home_id, 'dailyId', daily_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_radar_publication_failed(
  p_terminal_reason TEXT,
  p_attempted_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  INSERT INTO public.radar_publication_state (window_key, status, last_attempt_at, terminal_reason, updated_at)
  VALUES
    ('home', 'failed', p_attempted_at, LEFT(p_terminal_reason, 500), p_attempted_at),
    ('daily', 'failed', p_attempted_at, LEFT(p_terminal_reason, 500), p_attempted_at)
  ON CONFLICT (window_key) DO UPDATE SET
    status = 'failed', last_attempt_at = EXCLUDED.last_attempt_at,
    terminal_reason = EXCLUDED.terminal_reason, updated_at = EXCLUDED.updated_at;
$function$;

CREATE OR REPLACE FUNCTION public.candidate_shadow_progress(
  p_ruleset_version TEXT DEFAULT 'source-ranking-v2.1.0',
  p_model_version TEXT DEFAULT 'candidate-research-v2.1.0'
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH rows AS (
    SELECT *
    FROM public.candidate_shadow_session_observations
    WHERE ruleset_version = p_ruleset_version
      AND model_version = p_model_version
  ), aggregate AS (
    SELECT
      COUNT(*)::INTEGER AS observed,
      COUNT(*) FILTER (WHERE qualifying)::INTEGER AS qualifying,
      MIN(session_date) AS started_on,
      MAX(session_date) AS latest_session
    FROM rows
  )
  SELECT jsonb_build_object(
    'observed', observed,
    'qualifying', qualifying,
    'required', 30,
    'remaining', GREATEST(0, 30 - qualifying),
    'startedOn', started_on,
    'latestSession', latest_session,
    'blockers', COALESCE((
      SELECT blockers
      FROM rows
      ORDER BY session_date DESC
      LIMIT 1
    ), '[]'::jsonb)
  )
  FROM aggregate;
$function$;

REVOKE ALL ON FUNCTION public.candidate_shadow_progress(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_shadow_progress(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.record_candidate_shadow_observation(DATE, TEXT, TEXT, UUID, UUID, JSONB, NUMERIC, NUMERIC, JSONB, TEXT, TEXT, BOOLEAN, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_candidate_shadow_observation(DATE, TEXT, TEXT, UUID, UUID, JSONB, NUMERIC, NUMERIC, JSONB, TEXT, TEXT, BOOLEAN, JSONB, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.publish_radar_public_snapshots(JSONB, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_radar_public_snapshots(JSONB, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.mark_radar_publication_failed(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_radar_publication_failed(TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.acquire_production_write_lease(TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_production_write_lease(TEXT, UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.release_production_write_lease(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_production_write_lease(TEXT, UUID) TO service_role;

ALTER TABLE public.candidate_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_research_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_shadow_session_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_public_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_write_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_publication_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.candidate_research_runs, public.candidate_research_run_items,
  public.candidate_shadow_session_observations, public.radar_public_snapshots,
  public.production_write_leases, public.radar_publication_state
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.candidate_research_runs, public.candidate_research_run_items,
  public.candidate_shadow_session_observations, public.radar_public_snapshots, public.radar_publication_state
  TO service_role;

COMMIT;
