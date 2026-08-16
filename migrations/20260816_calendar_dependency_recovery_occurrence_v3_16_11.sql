-- StockInsider V3.16.11 production repair: a scheduled occurrence can become
-- permanently unreplayable when a historical price row was known at the
-- occurrence cutoff but its official annual-calendar authority was first
-- collected while that attempt was running. Preserve the failed occurrence
-- and create one deterministic recovery occurrence at its database-owned
-- terminal time. Retries reuse the same cutoff, so wall clock cannot move it.

BEGIN;

-- PostgreSQL requires the new owner to retain CREATE on the containing schema
-- while ownership is transferred. Keep the capability transaction-scoped and
-- revoke it before commit, matching the existing V3.13-V3.15 owner handoff.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

CREATE INDEX IF NOT EXISTS legacy_producer_occurrence_terminal_v3_16_11
  ON public.legacy_producer_runs_v3_11(scheduled_occurrence_id,status,terminal_at DESC,run_id);
CREATE INDEX IF NOT EXISTS trading_session_recovery_recorded_v3_16_11
  ON public.tw_trading_sessions_v3(recorded_at,source_timestamp,collected_at);

CREATE OR REPLACE FUNCTION public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(
  p_base_occurrence_id text
) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $helper$
  SELECT run.terminal_at
  FROM public.legacy_producer_runs_v3_11 run
  WHERE p_base_occurrence_id~'^[0-9a-f]{64}$'
    AND run.scheduled_occurrence_id=p_base_occurrence_id AND run.status='failed'
    AND run.failure_code='data_integrity_failure'
    AND NOT EXISTS(SELECT 1 FROM public.legacy_producer_runs_v3_11 success
      WHERE success.scheduled_occurrence_id=p_base_occurrence_id AND success.status='success')
    AND EXISTS(SELECT 1 FROM public.legacy_runtime_failure_diagnostics_v3_14 diagnostic
      WHERE diagnostic.run_id=run.run_id AND diagnostic.stage='facts_refresh'
        AND diagnostic.failure_origin='persistence'
        AND diagnostic.invariant_code='database_constraint_rejected'
        AND diagnostic.constraint_name='calendar_dependency_unavailable')
    AND EXISTS(SELECT 1 FROM public.tw_trading_sessions_v3 authority
      WHERE authority.recorded_at>run.source_cutoff AND authority.recorded_at<=run.terminal_at
        AND authority.source_timestamp<=run.terminal_at AND authority.collected_at<=run.terminal_at)
  ORDER BY run.terminal_at DESC,run.run_id LIMIT 1
$helper$;

ALTER FUNCTION public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(text)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(text)
  TO legacy_correctness_rpc_owner;

CREATE OR REPLACE FUNCTION public.resolve_legacy_scheduled_occurrence_v3_11(
  p_owner_label text,p_config_hash text
) RETURNS public.legacy_scheduled_occurrence_v3_11
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE
  v_now timestamptz:=date_trunc('second',clock_timestamp());v_local timestamp;v_date date;
  v_cutoff timestamptz;v_material_recorded_at timestamptz;v_material_cutoff timestamptz;
  v_id text;v_base_id text;v_session_hash text;v_occurrence_kind text:='scheduled';
  v_failed_terminal timestamptz;v_recovery_cutoff timestamptz;
BEGIN
  IF p_owner_label<>'com.stockinsider.auth-source-worker'
    OR p_config_hash<>'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2'
  THEN RETURN NULL;END IF;
  v_local:=v_now AT TIME ZONE 'Asia/Taipei';v_date:=v_local::date;
  IF extract(isodow FROM v_date)>5 OR v_local::time<time '18:20:00' THEN v_date:=v_date-1;END IF;
  WHILE extract(isodow FROM v_date)>5 LOOP v_date:=v_date-1;END LOOP;
  v_cutoff:=(v_date+time '18:20:00') AT TIME ZONE 'Asia/Taipei';
  SELECT max(recorded_at) INTO v_material_recorded_at FROM(
    SELECT max(recorded_at) recorded_at FROM public.stock_instruments_v3
      WHERE instrument_type='common_stock' AND listing_status='active'
    UNION ALL SELECT max(recorded_at) FROM public.stock_aliases_v3 WHERE status='active'
    UNION ALL SELECT max(recorded_at) FROM public.stock_sector_assignments_v3 WHERE status='active'
    UNION ALL SELECT max(recorded_at) FROM public.source_identity_authorities_v3 WHERE status='active'
    UNION ALL SELECT max(recorded_at) FROM public.source_document_revisions_v3 WHERE acquisition_status='complete'
  ) material;
  v_material_cutoff:=date_trunc('second',v_material_recorded_at)+interval '1 second';
  IF v_material_recorded_at>v_cutoff AND v_material_cutoff<=v_now THEN
    v_cutoff:=v_material_cutoff;v_occurrence_kind:='material-authority-refresh';
  END IF;
  v_base_id:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
    'legacy-producer-scheduled-occurrence-v2',p_owner_label,v_date,'18:20:00','Asia/Taipei',
    v_occurrence_kind,to_char(v_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),p_config_hash
  )::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');

  -- Only the typed, immutable calendar-dependency diagnostic opens recovery.
  -- Requiring calendar authority recorded between cutoff and terminal proves
  -- that advancing to the database-owned terminal boundary can add authority.
  v_failed_terminal:=public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(v_base_id);
  IF v_failed_terminal IS NOT NULL THEN
    v_recovery_cutoff:=date_trunc('second',v_failed_terminal);
    IF v_recovery_cutoff>v_cutoff AND v_recovery_cutoff<=v_now THEN
      v_cutoff:=v_recovery_cutoff;v_occurrence_kind:='calendar-dependency-recovery';
      v_id:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
        'legacy-producer-calendar-dependency-recovery-v1',p_owner_label,v_base_id,
        to_char(v_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),p_config_hash
      )::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');
    END IF;
  END IF;
  v_id:=coalesce(v_id,v_base_id);
  SELECT session.taiwan_session_authority_hash INTO v_session_hash
  FROM public.opportunity_effective_taiwan_sessions_v3 session
  WHERE session.session_id=v_date AND session.canonical_cutoff<=v_cutoff;
  RETURN ROW(v_id,v_cutoff,CASE WHEN v_session_hash IS NULL THEN NULL ELSE v_date END,v_session_hash)
    ::public.legacy_scheduled_occurrence_v3_11;
END $resolver$;

ALTER FUNCTION public.resolve_legacy_scheduled_occurrence_v3_11(text,text)
  OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.resolve_legacy_scheduled_occurrence_v3_11(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_scheduled_occurrence_v3_11(text,text)
  TO legacy_correctness_rpc_owner;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

DO $calendar_recovery_contract$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
    WHERE namespace.nspname='public' AND function.proname='resolve_legacy_scheduled_occurrence_v3_11'
      AND function.provolatile='v' AND function.prosecdef)
  THEN RAISE EXCEPTION 'calendar_recovery_resolver_contract_unavailable';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
    JOIN pg_roles owner ON owner.oid=function.proowner
    WHERE namespace.nspname='public' AND function.proname='resolve_legacy_scheduled_occurrence_v3_11'
      AND owner.rolname='opportunity_v3_rpc_owner'
      AND has_function_privilege('legacy_correctness_rpc_owner',function.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'calendar_recovery_resolver_authority_unavailable';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
    JOIN pg_roles owner ON owner.oid=function.proowner
    WHERE namespace.nspname='public'
      AND function.proname='resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal'
      AND function.provolatile='s' AND function.prosecdef AND owner.rolname='opportunity_v3_rpc_owner')
  THEN RAISE EXCEPTION 'calendar_recovery_helper_contract_unavailable';END IF;
END $calendar_recovery_contract$;

COMMIT;
