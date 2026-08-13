BEGIN;

-- V3.15 keeps the durable producer state machine unchanged.  It adds a bounded
-- official whole-market research entrance and a service-role REST claim bridge
-- so production does not depend on a locally cached database password.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

-- The production authority bootstrap can legitimately contain more than the
-- V3.11 per-connector ceiling of 1,000 immutable document families. Upgrade
-- the existing reader in place so every selected revision remains conserved;
-- retain a closed 2,000-row ceiling per connector so unexpected growth fails
-- explicitly instead of being silently truncated.
DO $upgrade_discovery_authority_bound$
DECLARE
  v_definition text;
  v_old_count integer;
  v_new_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.read_legacy_discovery_authority_v3_11(uuid,text,text)'::regprocedure
  ) INTO STRICT v_definition;
  v_old_count := (length(v_definition)-length(replace(v_definition,'connector_rank<=1000','')))
    / length('connector_rank<=1000')
    + (length(v_definition)-length(replace(v_definition,'connector_rank>1000','')))
      / length('connector_rank>1000');
  v_new_count := (length(v_definition)-length(replace(v_definition,'connector_rank<=2000','')))
    / length('connector_rank<=2000')
    + (length(v_definition)-length(replace(v_definition,'connector_rank>2000','')))
      / length('connector_rank>2000');
  IF v_old_count=2 AND v_new_count=0 THEN
    v_definition:=replace(v_definition,'connector_rank<=1000','connector_rank<=2000');
    v_definition:=replace(v_definition,'connector_rank>1000','connector_rank>2000');
    EXECUTE v_definition;
  ELSIF NOT (v_old_count=0 AND v_new_count=2) THEN
    RAISE EXCEPTION 'discovery_authority_bound_predecessor_conflict';
  END IF;
END $upgrade_discovery_authority_bound$;

DO $upgrade_claim$
BEGIN
  IF to_regprocedure('public.claim_legacy_producer_job_authoritative_v3_15(uuid,uuid,uuid,integer)') IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_authoritative_v3_15;
  END IF;
END $upgrade_claim$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_cutoff timestamptz;
  v_universe jsonb;
BEGIN
  v_claim:=public.claim_legacy_producer_job_authoritative_v3_15(p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind IS DISTINCT FROM 'candidate_funnel_input' THEN
    RETURN v_claim;
  END IF;
  SELECT run.source_cutoff INTO STRICT v_cutoff
  FROM public.legacy_producer_runs_v3_11 run WHERE run.run_id=v_claim.run_id;
  WITH current_instruments AS MATERIALIZED (
    SELECT ranked.stock_id,ranked.symbol,ranked.exchange,ranked.official_name,
      ranked.recorded_at,ranked.instrument_authority_id
    FROM (
      SELECT instrument.*,row_number() OVER(PARTITION BY instrument.stock_id
        ORDER BY instrument.recorded_at DESC,instrument.source_timestamp DESC,
          instrument.instrument_authority_id) AS precedence
      FROM public.stock_instruments_v3 instrument
      WHERE instrument.recorded_at<=v_cutoff AND instrument.source_timestamp<=v_cutoff
        AND instrument.valid_from<=v_cutoff AND (instrument.valid_to IS NULL OR v_cutoff<instrument.valid_to)
    ) ranked
    WHERE ranked.precedence=1 AND ranked.instrument_type='common_stock' AND ranked.listing_status='active'
  ), bounded AS MATERIALIZED (
    SELECT instrument.*,
      coalesce(sector.canonical_sector_key::text,'unknown') AS canonical_sector
    FROM current_instruments instrument
    LEFT JOIN LATERAL (
      SELECT ranked.canonical_sector_key FROM (
        SELECT assignment.*,row_number() OVER(PARTITION BY assignment.stock_id,assignment.market
          ORDER BY assignment.recorded_at DESC,assignment.source_timestamp DESC,
            assignment.assignment_authority_id) AS precedence
        FROM public.stock_sector_assignments_v3 assignment
        WHERE assignment.stock_id=instrument.stock_id AND assignment.market::text=instrument.exchange::text
          AND assignment.recorded_at<=v_cutoff AND assignment.source_timestamp<=v_cutoff
          AND assignment.valid_from<=v_cutoff AND (assignment.valid_to IS NULL OR v_cutoff<assignment.valid_to)
      ) ranked WHERE ranked.precedence=1 AND ranked.status='active'
    ) sector ON true
    ORDER BY instrument.symbol,instrument.stock_id LIMIT 3000
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(stock_id,symbol,exchange,canonical_sector,
    coalesce(official_name,symbol)) ORDER BY symbol,stock_id),'[]'::jsonb)
  INTO v_universe FROM bounded;
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'sourceCutoff',to_char(v_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'coarseUniverseRows',v_universe,
    'coarseUniverseSchema','official-coarse-universe-v3.15');
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  v_claim.read_row_count:=coalesce(v_claim.read_row_count,0)+jsonb_array_length(v_universe);
  IF octet_length(v_claim.read_canonical)>3145728 OR v_claim.read_row_count>20000 THEN
    RAISE EXCEPTION 'bound_violation';
  END IF;
  RETURN v_claim;
END $claim$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_rest_v3_15(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer,p_authority_hash text
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rest_claim$
DECLARE v_claim public.legacy_producer_claim_v3_11;
BEGIN
  IF coalesce(p_authority_hash,'')<>'' AND p_authority_hash!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';
  END IF;
  PERFORM pg_catalog.set_config('stockinsider.legacy_authority_hash',coalesce(p_authority_hash,''),true);
  v_claim:=public.claim_legacy_producer_job_v3_11(p_run,p_job,p_token,p_lease);
  RETURN v_claim;
END $rest_claim$;

CREATE OR REPLACE FUNCTION public.append_legacy_runtime_health_rest_v3_15(
  p_producer_commit_sha text,p_worker_sha256 text,p_scheduler_config_sha256 text,
  p_observation_canonical bytea,p_observation_json jsonb,p_observation_sha256 text,p_observed_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $health$
BEGIN
  IF p_producer_commit_sha!~'^[0-9a-f]{40}$' OR p_worker_sha256!~'^[0-9a-f]{64}$'
    OR p_scheduler_config_sha256!~'^[0-9a-f]{64}$' OR p_observation_sha256!~'^[0-9a-f]{64}$'
    OR octet_length(p_observation_canonical) NOT BETWEEN 2 AND 65536
    OR convert_from(p_observation_canonical,'utf8')::jsonb<>p_observation_json
    OR encode(extensions.digest(p_observation_canonical,'sha256'),'hex')<>p_observation_sha256
    OR p_observation_json->>'producerCommitSha'<>p_producer_commit_sha
    OR p_observation_json->>'workerSha256'<>p_worker_sha256
    OR p_observation_json->>'schedulerConfigSha256'<>p_scheduler_config_sha256
    OR p_observed_at>clock_timestamp()+interval '1 minute'
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;
  INSERT INTO public.legacy_runtime_health_observations_v3_11(producer_commit_sha,worker_sha256,
    scheduler_config_sha256,observation_canonical,observation_json,observation_sha256,observed_at)
  VALUES(p_producer_commit_sha,p_worker_sha256,p_scheduler_config_sha256,p_observation_canonical,
    p_observation_json,p_observation_sha256,p_observed_at)
  ON CONFLICT(producer_commit_sha,observation_sha256) DO NOTHING;
  RETURN true;
END $health$;

CREATE OR REPLACE FUNCTION public.read_legacy_runtime_health_rest_v3_15()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $health_read$
DECLARE
  v_last_run jsonb:='null'::jsonb;
  v_leases jsonb:='[]'::jsonb;
  v_stuck_run_count integer;
BEGIN
  SELECT jsonb_build_object('status',run.status,'started_at',run.started_at,'terminal_at',run.terminal_at,
    'heartbeat_at',run.heartbeat_at,'lease_expires_at',run.lease_expires_at,
    'producer_commit_sha',run.producer_commit_sha,'worker_sha256',run.worker_sha256,
    'scheduler_config_sha256',run.scheduler_config_sha256)
  INTO v_last_run FROM public.legacy_producer_runs_v3_11 run
  ORDER BY run.started_at DESC,run.run_id DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('status',job.status,'lease_expires_at',job.lease_expires_at,
    'leased_at',job.leased_at,'job_id',job.job_id) ORDER BY job.leased_at DESC,job.job_id),'[]'::jsonb)
  INTO v_leases FROM (SELECT job.status,job.lease_expires_at,job.leased_at,job.job_id
    FROM public.legacy_producer_jobs_v3_11 job WHERE job.status='leased'
    ORDER BY job.leased_at DESC,job.job_id LIMIT 2) job;
  SELECT count(*) INTO v_stuck_run_count FROM (SELECT 1 FROM public.legacy_producer_runs_v3_11 run
    WHERE run.status='running' AND run.lease_expires_at<clock_timestamp() LIMIT 1001) stuck;
  IF v_stuck_run_count>1000 THEN RAISE EXCEPTION 'runtime_running_run_bound';END IF;
  RETURN jsonb_build_object('lastRun',coalesce(v_last_run,'null'::jsonb),'leases',v_leases,
    'stuckRunCount',v_stuck_run_count);
END $health_read$;

ALTER FUNCTION public.claim_legacy_producer_job_authoritative_v3_15(uuid,uuid,uuid,integer)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_legacy_runtime_health_rest_v3_15() OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_authoritative_v3_15(uuid,uuid,uuid,integer),
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer),
  public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text),
  public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz),
  public.read_legacy_runtime_health_rest_v3_15()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_authoritative_v3_15(uuid,uuid,uuid,integer),
  public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
  TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_legacy_runtime_health_rest_v3_15() TO service_role;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;
COMMIT;
