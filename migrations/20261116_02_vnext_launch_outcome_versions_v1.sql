-- Candidate only. Apply after the immutable ranking signal migration.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE TABLE public.vnext_launch_outcome_versions_v1(
 ranking_run_id uuid NOT NULL,
 symbol text NOT NULL,
 as_of timestamptz NOT NULL,
 policy_version text NOT NULL CHECK(policy_version='launch-outcomes-v1'),
 input_snapshot_hash text NOT NULL CHECK(input_snapshot_hash~'^[a-f0-9]{64}$'),
 snapshot_hash text NOT NULL CHECK(snapshot_hash~'^[a-f0-9]{64}$'),
 writer_release text NOT NULL CHECK(writer_release~'^[a-f0-9]{40}$'),
 input jsonb NOT NULL,
 result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(ranking_run_id,symbol,policy_version,as_of),
 FOREIGN KEY(ranking_run_id,symbol) REFERENCES public.vnext_launch_outcome_signals_v1(ranking_run_id,symbol),
 CHECK(recorded_at>=as_of)
);
ALTER TABLE public.vnext_launch_outcome_versions_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_outcome_versions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_outcome_versions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_outcome_version_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_launch_outcome_versions_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER launch_outcome_version_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_outcome_versions_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();
CREATE TRIGGER launch_outcome_version_no_truncate BEFORE TRUNCATE ON public.vnext_launch_outcome_versions_v1
 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

-- Internal only. The admitted writer constructs both documents from official
-- cache rows and the versioned evaluator. It never forwards a caller payload.
-- SQL binds their identity to an immutable rank signal and seals the complete
-- documents; clients cannot update old versions, erase gaps or backdate them.
CREATE FUNCTION public.vnext_launch_outcome_command_v1(p_principal text,p_lease_owner uuid,
 p_run_id uuid,p_symbol text,p_input jsonb DEFAULT NULL,p_result jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='15s' SET lock_timeout='2s' AS $$
DECLARE anchor public.vnext_launch_outcome_signals_v1; saved public.vnext_launch_outcome_versions_v1;
 mode public.vnext_launch_ranking_mode_v1; rights jsonb; backend jsonb; digest text; observed timestamptz;
 raw_signal jsonb; input_revision text; reused boolean:=false;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_run_id IS NULL
  OR p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$' OR (p_input IS NULL)<>(p_result IS NULL)
  THEN RAISE EXCEPTION 'launch_outcome_closed_request';END IF;
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 rights:=public.vnext_launch_csv_policy_v1(p_principal);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease'
  THEN RAISE EXCEPTION 'launch_outcome_reviewed_writer_required';END IF;
 SELECT * INTO anchor FROM public.vnext_launch_outcome_signals_v1 WHERE ranking_run_id=p_run_id AND symbol=p_symbol;
 IF NOT FOUND THEN RAISE EXCEPTION 'launch_outcome_unknown_frozen_signal';END IF;
 IF p_input IS NULL THEN
  RETURN jsonb_build_object('rankingRunId',anchor.ranking_run_id,'firstRankingRunId',anchor.first_ranking_run_id,
   'symbol',anchor.symbol,'stockId',anchor.stock_id,'market',anchor.market,'session',anchor.signal_session,
   'cutoff',anchor.input_cutoff,'publishedAt',anchor.published_at,'rawClose',anchor.raw_close::text,'inputHash',anchor.input_hash,
   'priceRevision',anchor.price_revision,'closeObservationId',anchor.close_observation_id,'calendarAuthorityId',anchor.calendar_authority_id,
   'calendarRevision',anchor.calendar_revision,'actionsRevision',anchor.actions_revision);
 END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
  OR octet_length(p_input::text)>256000 OR octet_length(p_result::text)>24000
  OR NOT(p_input ?& ARRAY['scope','signal','asOf','calendarRevision','basisRevision','sessions','bars','opening'])
  OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>(CASE WHEN p_input ? 'benchmark' THEN 9 ELSE 8 END)
  OR (p_input ? 'benchmark' AND jsonb_typeof(p_input->'benchmark') IS DISTINCT FROM 'object')
  OR NOT(p_result ?& ARRAY['scope','signal','asOf','calendarRevision','basisRevision','inputSnapshotHash','costs','policyVersion','key','repeatSignal','research','execution'])
  OR (SELECT count(*) FROM jsonb_object_keys(p_result))<>12
  OR p_input->>'scope' IS DISTINCT FROM 'published_rank' OR p_result->>'scope' IS DISTINCT FROM 'published_rank'
  OR p_result->>'policyVersion' IS DISTINCT FROM 'launch-outcomes-v1'
  OR p_result->>'key' IS DISTINCT FROM 'published_rank:'||p_run_id::text||':'||p_symbol
  OR p_result->'repeatSignal' IS DISTINCT FROM to_jsonb(anchor.first_ranking_run_id<>anchor.ranking_run_id)
  OR jsonb_typeof(p_input->'sessions') IS DISTINCT FROM 'array' OR jsonb_typeof(p_input->'bars') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_result->'research') IS DISTINCT FROM 'object' OR jsonb_typeof(p_result->'execution') IS DISTINCT FROM 'object'
  OR p_input->>'calendarRevision' IS DISTINCT FROM p_result->>'calendarRevision'
  OR p_input->>'basisRevision' IS DISTINCT FROM p_result->>'basisRevision'
  OR p_input->>'asOf' IS DISTINCT FROM p_result->>'asOf'
  OR coalesce(p_input->>'calendarRevision','')!~'^[a-f0-9]{64}$'
  OR coalesce(p_input->>'basisRevision','')!~'^[a-f0-9]{64}$'
  OR coalesce(p_result->>'inputSnapshotHash','')!~'^[a-f0-9]{64}$'
  OR coalesce(p_input->>'asOf','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR p_result->'costs' IS DISTINCT FROM '{"version":"tw-equity-fixed-cost-v1","buyCommissionPpm":1425,"sellCommissionPpm":1425,"sellTaxPpm":3000,"slippagePerSidePpm":1000}'::jsonb
  THEN RAISE EXCEPTION 'launch_outcome_packet_invalid';END IF;
 IF jsonb_array_length(p_input->'sessions')>180 OR jsonb_array_length(p_input->'bars')>120
  OR p_result->'signal' IS DISTINCT FROM p_input->'signal' OR jsonb_typeof(p_input->'signal') IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'launch_outcome_packet_invalid';END IF;
 observed:=(p_input->>'asOf')::timestamptz;
 IF observed<anchor.published_at OR observed>clock_timestamp() THEN RAISE EXCEPTION 'launch_outcome_cutoff_invalid';END IF;
 raw_signal:=p_input->'signal';
 IF NOT(raw_signal ?& ARRAY['rankingRunId','firstRankingRunId','symbol','market','session','cutoff','inputHash','priceRevision','rawClose','normalizedClose'])
  OR (SELECT count(*) FROM jsonb_object_keys(raw_signal))<>10
  OR raw_signal->>'rankingRunId' IS DISTINCT FROM anchor.ranking_run_id::text
  OR raw_signal->>'firstRankingRunId' IS DISTINCT FROM anchor.first_ranking_run_id::text
  OR raw_signal->>'symbol' IS DISTINCT FROM anchor.symbol OR raw_signal->>'market' IS DISTINCT FROM anchor.market
  OR raw_signal->>'session' IS DISTINCT FROM anchor.signal_session::text
  OR (raw_signal->>'cutoff')::timestamptz IS DISTINCT FROM anchor.input_cutoff
  OR raw_signal->>'inputHash' IS DISTINCT FROM anchor.input_hash OR raw_signal->>'priceRevision' IS DISTINCT FROM anchor.price_revision
  OR coalesce(raw_signal->>'rawClose','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$'
  OR coalesce(raw_signal->>'normalizedClose','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$'
  THEN RAISE EXCEPTION 'launch_outcome_frozen_signal_mismatch';END IF;
 IF (raw_signal->>'rawClose')::numeric IS DISTINCT FROM anchor.raw_close OR (raw_signal->>'normalizedClose')::numeric<=0
  THEN RAISE EXCEPTION 'launch_outcome_frozen_signal_mismatch';END IF;
 input_revision:=p_result->>'inputSnapshotHash';
 digest:=public.vnext_launch_csv_hash_v1(jsonb_build_array('vnext-launch-outcome-version-v1',p_input,p_result));
 SELECT * INTO saved FROM public.vnext_launch_outcome_versions_v1 WHERE ranking_run_id=p_run_id AND symbol=p_symbol
  AND policy_version='launch-outcomes-v1' AND as_of=observed;
 IF FOUND THEN
  IF saved.snapshot_hash IS DISTINCT FROM digest OR saved.input IS DISTINCT FROM p_input OR saved.result IS DISTINCT FROM p_result
   THEN RAISE EXCEPTION 'launch_outcome_cutoff_conflict';END IF;
  reused:=true;
 ELSE
  IF EXISTS(SELECT FROM public.vnext_launch_outcome_versions_v1 WHERE ranking_run_id=p_run_id AND symbol=p_symbol
   AND policy_version='launch-outcomes-v1' AND as_of>observed) THEN RAISE EXCEPTION 'launch_outcome_cutoff_regression';END IF;
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  INSERT INTO public.vnext_launch_outcome_versions_v1(ranking_run_id,symbol,as_of,policy_version,input_snapshot_hash,snapshot_hash,writer_release,input,result)
   VALUES(p_run_id,p_symbol,observed,'launch-outcomes-v1',input_revision,digest,backend->>'writerRelease',p_input,p_result)
   RETURNING * INTO saved;
 END IF;
 RETURN jsonb_build_object('schemaVersion','vnext-launch-outcome-write-v1','rankingRunId',saved.ranking_run_id,'symbol',saved.symbol,
  'asOf',saved.as_of,'policyVersion',saved.policy_version,'inputSnapshotHash',saved.input_snapshot_hash,
  'snapshotHash',saved.snapshot_hash,'replay',reused);
END $$;
ALTER FUNCTION public.vnext_launch_outcome_command_v1(text,uuid,uuid,text,jsonb,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_command_v1(text,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_outcome_command_v1(text,uuid,uuid,text,jsonb,jsonb) TO service_role;
COMMIT;
