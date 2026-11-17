BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT pg_advisory_xact_lock(64221022);

-- Deployment-managed, explicit clearance for the source label, stock code and
-- event time. Completed extraction and research rights alone never authorize
-- disclosure. Review and production deployment establish any actual grants.
CREATE TABLE public.vnext_candidate_clue_clearance_v1 (
  clearance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  scope text NOT NULL,
  rights_subject text NOT NULL,
  license_basis text NOT NULL,
  authorization_sha256 text NOT NULL CHECK (authorization_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz NOT NULL,
  withdrawn_at timestamptz,
  CHECK ((source, scope) IN (('official', 'official_original'), ('ptt', 'metadata'))),
  CHECK (char_length(rights_subject) BETWEEN 1 AND 180 AND char_length(license_basis) BETWEEN 1 AND 180),
  CHECK (isfinite(recorded_at) AND isfinite(valid_until) AND valid_until > recorded_at),
  CHECK (withdrawn_at IS NULL OR (isfinite(withdrawn_at) AND withdrawn_at >= recorded_at)),
  UNIQUE(source, scope, rights_subject, license_basis, recorded_at)
);

CREATE TABLE public.vnext_candidate_public_clues_v1 (
  clue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text NOT NULL REFERENCES public.vnext_extractions_v1(content_hash) ON DELETE RESTRICT,
  clearance_id uuid NOT NULL REFERENCES public.vnext_candidate_clue_clearance_v1(clearance_id) ON DELETE RESTRICT,
  symbol text NOT NULL CHECK (symbol ~ '^[0-9]{4}$'),
  source text NOT NULL CHECK (source IN ('official', 'ptt')),
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (isfinite(event_at) AND isfinite(recorded_at) AND recorded_at >= event_at),
  UNIQUE(content_hash, symbol)
);
CREATE INDEX vnext_candidate_public_clues_by_time_v1
  ON public.vnext_candidate_public_clues_v1(event_at DESC, symbol, clue_id);

ALTER TABLE public.vnext_candidate_clue_clearance_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_candidate_public_clues_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_candidate_clue_clearance_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vnext_candidate_public_clues_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_candidate_clue_clearance_v1, public.vnext_candidate_public_clues_v1
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT ON public.vnext_candidate_public_clues_v1
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();

CREATE FUNCTION public.vnext_capture_candidate_public_clues_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET statement_timeout = '10s' SET lock_timeout = '2s' AS $function$
DECLARE selected uuid;
        original_time timestamptz;
        available_time timestamptz;
        symbol_value text;
        official_identity jsonb;
BEGIN
  IF TG_RELID <> 'public.vnext_extractions_v1'::regclass OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'vnext_candidate_clue_capture_binding_invalid';
  END IF;
  IF (NEW.source, NEW.scope) NOT IN (('official', 'official_original'), ('ptt', 'metadata'))
     OR coalesce(NEW.original->>'eventBasis', '') NOT IN ('source_publication', 'original_event')
     OR coalesce(NEW.original->>'originalRoot', '') = ''
     OR coalesce(NEW.original->>'authorRoot', '') = ''
     OR NEW.completed_at IS NULL
  THEN RETURN NEW; END IF;

  SELECT g.clearance_id INTO selected
  FROM public.vnext_candidate_clue_clearance_v1 g
  JOIN public.vnext_source_policies_v1 p ON p.source=g.source AND p.scope=g.scope
    AND p.rights_subject=g.rights_subject AND p.license_basis=g.license_basis
  WHERE (g.source, g.scope, g.rights_subject, g.license_basis) =
      (NEW.source, NEW.scope, NEW.rights_subject, NEW.license_basis)
    AND g.recorded_at <= NEW.completed_at AND g.valid_until > clock_timestamp()
    AND g.withdrawn_at IS NULL AND p.enabled AND p.valid_until > clock_timestamp()
  ORDER BY g.recorded_at DESC
  LIMIT 1;
  IF selected IS NULL OR EXISTS (SELECT FROM public.vnext_source_withdrawals_v1 w WHERE w.content_hash=NEW.content_hash)
    THEN RETURN NEW; END IF;

  original_time := (NEW.original->>'eventAt')::timestamptz;
  available_time := (NEW.original->>'availableAt')::timestamptz;
  IF original_time IS NULL OR available_time IS NULL
     OR NOT isfinite(original_time) OR NOT isfinite(available_time) OR NOT isfinite(NEW.completed_at)
     OR original_time > available_time OR available_time > NEW.completed_at
     OR NEW.completed_at > clock_timestamp()
     OR jsonb_typeof(NEW.extraction->'clues') IS DISTINCT FROM 'array'
  THEN RETURN NEW; END IF;
  IF jsonb_array_length(NEW.extraction->'clues') > 12 THEN RETURN NEW; END IF;

  FOR symbol_value IN SELECT DISTINCT clue->>'symbol'
    FROM jsonb_array_elements(NEW.extraction->'clues') AS clue
    WHERE clue->>'symbol' ~ '^[0-9]{4}$'
      AND clue->>'source' = NEW.source AND clue->>'contentHash' = NEW.content_hash
      AND clue->>'eventAt' = NEW.original->>'eventAt' AND clue->>'availableAt' = NEW.original->>'availableAt'
  LOOP
    official_identity := public.vnext_launch_instrument_v1(symbol_value, original_time);
    IF official_identity->>'instrumentType' = 'common_stock' AND official_identity->>'listingStatus' = 'active' THEN
      INSERT INTO public.vnext_candidate_public_clues_v1(content_hash, clearance_id, symbol, source, event_at)
        VALUES (NEW.content_hash, selected, symbol_value, NEW.source, original_time)
      ON CONFLICT(content_hash, symbol) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$;
ALTER FUNCTION public.vnext_capture_candidate_public_clues_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_capture_candidate_public_clues_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vnext_capture_candidate_public_clues
  AFTER UPDATE OF state ON public.vnext_extractions_v1 FOR EACH ROW
  WHEN (OLD.state = 'reserved' AND NEW.state = 'completed')
  EXECUTE FUNCTION public.vnext_capture_candidate_public_clues_v1();

CREATE TRIGGER vnext_candidate_public_clues_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.vnext_candidate_public_clues_v1 FOR EACH STATEMENT
  EXECUTE FUNCTION public.vnext_source_withdrawal_immutable_v1();

COMMIT;
