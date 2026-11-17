BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_candidate_public_clues_v1
  ADD COLUMN clue_ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
REVOKE ALL ON SEQUENCE public.vnext_candidate_public_clues_v1_clue_ordinal_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.vnext_launch_candidate_clue_heads_v1 (
  ranking_run_id uuid PRIMARY KEY REFERENCES public.vnext_launch_ranking_snapshots_v1(ranking_run_id),
  through_clue_ordinal bigint NOT NULL CHECK (through_clue_ordinal >= 0)
);
ALTER TABLE public.vnext_launch_candidate_clue_heads_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_candidate_clue_heads_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_candidate_clue_heads_v1 FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER launch_writer_fence BEFORE INSERT ON public.vnext_launch_candidate_clue_heads_v1
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER vnext_candidate_clue_heads_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON public.vnext_launch_candidate_clue_heads_v1 FOR EACH STATEMENT
  EXECUTE FUNCTION public.vnext_source_withdrawal_immutable_v1();

-- Capture the high-water mark in the ranking transaction under the same lock
-- as extraction completion. Reads never create a version for an old snapshot.
CREATE FUNCTION public.vnext_launch_freeze_candidate_clue_head_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
BEGIN
  IF TG_RELID <> 'public.vnext_launch_ranking_snapshots_v1'::regclass OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'launch_candidate_clue_snapshot_binding';
  END IF;
  PERFORM pg_advisory_xact_lock(64221022);
  INSERT INTO public.vnext_launch_candidate_clue_heads_v1(ranking_run_id, through_clue_ordinal)
  VALUES (NEW.ranking_run_id, coalesce((SELECT max(clue_ordinal) FROM public.vnext_candidate_public_clues_v1), 0));
  RETURN NEW;
END
$function$;
ALTER FUNCTION public.vnext_launch_freeze_candidate_clue_head_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_freeze_candidate_clue_head_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER launch_freeze_candidate_clue_head AFTER INSERT ON public.vnext_launch_ranking_snapshots_v1
  FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_freeze_candidate_clue_head_v1();

CREATE FUNCTION public.vnext_candidate_clue_clearance_revocation_only_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
     AND (to_jsonb(OLD) - 'withdrawn_at') = (to_jsonb(NEW) - 'withdrawn_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'candidate_clue_clearance_revocation_only';
END
$function$;
ALTER FUNCTION public.vnext_candidate_clue_clearance_revocation_only_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_candidate_clue_clearance_revocation_only_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER candidate_clue_clearance_revocation_only BEFORE UPDATE OR DELETE
  ON public.vnext_candidate_clue_clearance_v1 FOR EACH ROW
  EXECUTE FUNCTION public.vnext_candidate_clue_clearance_revocation_only_v1();
CREATE TRIGGER candidate_clue_clearance_no_truncate BEFORE TRUNCATE ON public.vnext_candidate_clue_clearance_v1
  FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_source_withdrawal_immutable_v1();

CREATE FUNCTION public.vnext_launch_candidate_clue_history_v1(
  p_catalog_id uuid, p_after uuid, p_limit integer, p_date date,
  p_source text, p_industry text, p_status text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
SET timezone = 'UTC' SET statement_timeout = '10s' AS $function$
DECLARE packet jsonb;
        catalog_id uuid;
        cutoff_at timestamptz;
        head bigint;
        after_ordinal bigint;
        answer jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20
     OR (p_after IS NOT NULL AND p_catalog_id IS NULL)
     OR (p_date IS NOT NULL AND NOT isfinite(p_date))
     OR (p_source IS NOT NULL AND p_source !~ '^[a-z][a-z0-9_-]{0,39}$')
     OR (p_industry IS NOT NULL AND p_industry !~ '^[0-9]{2}$')
     OR (p_status IS NOT NULL AND p_status NOT IN
          ('not_in_saved_pool', 'snapshot_waiting', 'snapshot_eligible', 'absent_from_successor')) THEN
    RAISE EXCEPTION 'launch_candidate_clue_history_query_invalid';
  END IF;
  packet := public.vnext_launch_candidate_pool_history_v1(p_catalog_id);
  IF packet IS NULL THEN RETURN NULL; END IF;
  catalog_id := (packet->'current'->>'id')::uuid;
  cutoff_at := (packet->'current'->>'cutoff')::timestamptz;
  SELECT through_clue_ordinal INTO head FROM public.vnext_launch_candidate_clue_heads_v1
    WHERE ranking_run_id = catalog_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_after IS NOT NULL THEN
    -- A disclosed row can remain a page anchor after its disclosure ends.
    -- Keep the private sequence and gaps in that sequence inside PostgreSQL.
    SELECT c.clue_ordinal INTO after_ordinal
      FROM public.vnext_candidate_public_clues_v1 c
      JOIN public.vnext_candidate_clue_clearance_v1 g USING (clearance_id)
      WHERE c.clue_id = p_after AND c.clue_ordinal <= head
        AND c.recorded_at <= cutoff_at AND g.recorded_at <= cutoff_at;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;

  WITH current_pool AS (
    SELECT entry->>'symbol' AS symbol, entry->>'state' AS state
    FROM jsonb_array_elements(packet->'current'->'rows') entries(entry)
  ), previous_pool AS (
    SELECT entry->>'symbol' AS symbol
    FROM jsonb_array_elements(coalesce(nullif(packet->'previous'->'rows','null'::jsonb),'[]'::jsonb)) entries(entry)
  ), authorized AS (
    SELECT c.clue_ordinal, c.clue_id, c.symbol, c.source, c.event_at,
      CASE current_pool.state WHEN 'waiting' THEN 'snapshot_waiting' WHEN 'eligible' THEN 'snapshot_eligible'
        ELSE CASE WHEN previous_pool.symbol IS NULL THEN 'not_in_saved_pool' ELSE 'absent_from_successor' END
      END AS state
    FROM public.vnext_candidate_public_clues_v1 c
    JOIN public.vnext_extractions_v1 x ON x.content_hash = c.content_hash
    JOIN public.vnext_candidate_clue_clearance_v1 g ON g.clearance_id = c.clearance_id
    JOIN public.vnext_source_policies_v1 p ON (p.source,p.scope,p.rights_subject,p.license_basis) =
      (g.source,g.scope,g.rights_subject,g.license_basis)
    LEFT JOIN current_pool ON current_pool.symbol=c.symbol
    LEFT JOIN previous_pool ON previous_pool.symbol=c.symbol
    WHERE c.clue_ordinal <= head AND (after_ordinal IS NULL OR c.clue_ordinal < after_ordinal)
      AND c.recorded_at <= cutoff_at AND g.recorded_at <= cutoff_at
      AND x.state = 'completed' AND (x.source,x.scope,x.rights_subject,x.license_basis) =
        (g.source,g.scope,g.rights_subject,g.license_basis) AND c.source=g.source
      AND p.enabled AND p.valid_until > statement_timestamp()
      AND g.withdrawn_at IS NULL AND g.valid_until > statement_timestamp()
      AND NOT EXISTS (SELECT FROM public.vnext_source_withdrawals_v1 w WHERE w.content_hash=c.content_hash)
      AND (p_source IS NULL OR c.source=p_source)
      AND (p_date IS NULL OR (c.event_at AT TIME ZONE 'Asia/Taipei')::date = p_date)
  ), selected AS MATERIALIZED (
    SELECT * FROM authorized a
    WHERE (p_status IS NULL OR a.state=p_status)
      AND (p_industry IS NULL OR public.vnext_launch_candidate_industry_resolved_v1(a.symbol,cutoff_at)->>'code'=p_industry)
    ORDER BY clue_ordinal DESC LIMIT p_limit + 1
  ), page AS (
    SELECT * FROM selected ORDER BY clue_ordinal DESC LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'clueId',clue_id,'symbol',symbol,'source',source,'eventAt',event_at,'state',state,
      'industrySnapshot',public.vnext_launch_candidate_industry_resolved_v1(symbol,cutoff_at)
    ) ORDER BY clue_ordinal DESC),'[]'::jsonb),
    'nextAfter', CASE WHEN (SELECT count(*) FROM selected)>p_limit THEN (array_agg(clue_id ORDER BY clue_ordinal ASC))[1] END
  ) INTO answer FROM page;
  RETURN answer || jsonb_build_object(
    'schemaVersion','launch-candidate-clue-history-v1','catalogId',catalog_id,'cutoff',cutoff_at,
    'previousSnapshot', CASE WHEN packet->'previous'->>'id' IS NOT NULL THEN
      jsonb_build_object('id',packet->'previous'->>'id','cutoff',packet->'previous'->>'cutoff') END,
    'nextSnapshot',packet->'next',
    'sourceAuthority',false,'entryAuthority',false,'publicationAuthority',false
  );
END
$function$;
ALTER FUNCTION public.vnext_launch_candidate_clue_history_v1(uuid,uuid,integer,date,text,text,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_clue_history_v1(uuid,uuid,integer,date,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_candidate_clue_history_v1(uuid,uuid,integer,date,text,text,text) TO service_role;
COMMIT;
