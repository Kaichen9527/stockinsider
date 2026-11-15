-- Freeze a completed chart for its immutable ranking member. The daily writer
-- runs this as a separate same-lease RPC after the ranking commit.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';

CREATE TABLE public.vnext_launch_frozen_charts_v1(
 ranking_run_id uuid NOT NULL,symbol text NOT NULL,score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1,
 input_cutoff timestamptz NOT NULL,known_at timestamptz NOT NULL,
 dataset_id integer NOT NULL CHECK(dataset_id=11371),
 rights_revision text NOT NULL CHECK(rights_revision~'^[a-f0-9]{64}$'),
 series_revision text NOT NULL CHECK(series_revision~'^[a-f0-9]{64}$'),
 document jsonb NOT NULL,frozen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(ranking_run_id,symbol),
 FOREIGN KEY(ranking_run_id,symbol) REFERENCES public.vnext_launch_ranking_members_v1(ranking_run_id,symbol),
 CHECK(known_at<=input_cutoff AND input_cutoff<=frozen_at)
);
CREATE TABLE public.vnext_launch_chart_day_pins_v1(
 ranking_run_id uuid NOT NULL,symbol text NOT NULL,session_date date NOT NULL,capture_id uuid NOT NULL,
 ack_id uuid NOT NULL REFERENCES public.vnext_launch_csv_ready_acks_v1(ack_id),
 observation_id uuid NOT NULL REFERENCES public.opportunity_price_observations_v3(observation_id),
 calendar_id uuid NOT NULL REFERENCES public.tw_trading_sessions_v3(session_authority_id),
 action_snapshot_id uuid REFERENCES public.opportunity_corporate_action_snapshots_v3(snapshot_id),
 PRIMARY KEY(ranking_run_id,symbol,session_date),
 FOREIGN KEY(ranking_run_id,symbol) REFERENCES public.vnext_launch_frozen_charts_v1(ranking_run_id,symbol),
 FOREIGN KEY(capture_id,session_date,symbol) REFERENCES public.vnext_launch_csv_facts_v1(capture_id,session_date,symbol)
);
DO $tables$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['vnext_launch_frozen_charts_v1','vnext_launch_chart_day_pins_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',table_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
  EXECUTE format('CREATE TRIGGER launch_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',table_name);
  EXECUTE format('CREATE TRIGGER launch_no_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',table_name);
  EXECUTE format('CREATE TRIGGER launch_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',table_name);
 END LOOP;
END $tables$;

CREATE FUNCTION public.vnext_launch_chart_freeze_v1(p_principal text,p_lease_owner uuid,p_ranking_run_id uuid,p_rank integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3
 SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE member public.vnext_launch_ranking_members_v1;snapshot public.vnext_launch_ranking_snapshots_v1;
 mode public.vnext_launch_ranking_mode_v1;backend jsonb;packet jsonb;chart jsonb;status text;pin_count integer;
BEGIN
 IF p_ranking_run_id IS NULL OR p_rank IS NULL OR p_rank NOT BETWEEN 1 AND 10
  THEN RAISE EXCEPTION 'launch_chart_closed_scope_required';END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_chart_read_committed_required';END IF;
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 PERFORM public.vnext_launch_csv_policy_v1(p_principal);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  THEN RAISE EXCEPTION 'launch_chart_reviewed_mode_required';END IF;
 SELECT * INTO snapshot FROM public.vnext_launch_ranking_snapshots_v1 WHERE ranking_run_id=p_ranking_run_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'launch_chart_ranking_missing';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('launch-chart:'||p_ranking_run_id::text||':'||p_rank::text,0));
 SELECT * INTO member FROM public.vnext_launch_ranking_members_v1 WHERE ranking_run_id=p_ranking_run_id AND rank=p_rank;
 IF NOT FOUND THEN
  IF EXISTS(SELECT FROM public.vnext_launch_ranking_members_v1 WHERE ranking_run_id=p_ranking_run_id AND rank>p_rank)
   THEN RAISE EXCEPTION 'launch_chart_ranking_rank_gap';END IF;
  status:='finished';
 ELSIF EXISTS(SELECT FROM public.vnext_launch_frozen_charts_v1 c WHERE c.ranking_run_id=p_ranking_run_id AND c.symbol=member.symbol) THEN
  status:='replay';
 ELSE
  packet:=public.vnext_launch_chart_volume_internal_v1(p_ranking_run_id,member.symbol);
  IF packet IS NULL THEN status:='missing_evidence';
  ELSE
   chart:=packet->'chart';
   pin_count:=jsonb_array_length(packet->'sourcePins');
   IF packet->>'rankingRunId' IS DISTINCT FROM p_ranking_run_id::text
    OR packet->>'scoreRevision' IS DISTINCT FROM member.score_revision::text
    OR packet->>'symbol' IS DISTINCT FROM member.symbol
    OR (chart->>'cutoff')::timestamptz IS DISTINCT FROM snapshot.input_cutoff
    OR pin_count IS DISTINCT FROM jsonb_array_length(chart->'candles')
    OR jsonb_array_length(packet->'actionPins') IS DISTINCT FROM pin_count-1
    THEN RAISE EXCEPTION 'launch_chart_frozen_binding_invalid';END IF;
   PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
   INSERT INTO public.vnext_launch_frozen_charts_v1(ranking_run_id,symbol,score_revision,input_cutoff,known_at,dataset_id,rights_revision,series_revision,document)
   VALUES(p_ranking_run_id,member.symbol,member.score_revision,snapshot.input_cutoff,(packet->>'knownAt')::timestamptz,
    (packet->>'datasetId')::integer,packet->>'rightsRevision',chart->>'seriesRevision',chart);
   INSERT INTO public.vnext_launch_chart_day_pins_v1(ranking_run_id,symbol,session_date,capture_id,ack_id,observation_id,calendar_id,action_snapshot_id)
   SELECT p_ranking_run_id,member.symbol,(p.value->>'session')::date,(p.value->>'captureId')::uuid,(p.value->>'ackId')::uuid,
    (p.value->>'observationId')::uuid,(p.value->>'calendarId')::uuid,(a.value->>'snapshotId')::uuid
   FROM jsonb_array_elements(packet->'sourcePins') WITH ORDINALITY p(value,ordinal)
   LEFT JOIN jsonb_array_elements(packet->'actionPins') WITH ORDINALITY a(value,ordinal) ON a.ordinal+1=p.ordinal
    AND a.value->>'session'=p.value->>'session' AND a.value->>'calendarId'=p.value->>'calendarId';
   IF (SELECT count(*) FROM public.vnext_launch_chart_day_pins_v1 WHERE ranking_run_id=p_ranking_run_id
    AND symbol=member.symbol AND action_snapshot_id IS NOT NULL)<>pin_count-1
    THEN RAISE EXCEPTION 'launch_chart_frozen_action_pins_invalid';END IF;
   status:='stored';
  END IF;
 END IF;
 RETURN jsonb_build_object('schemaVersion','launch-chart-freeze-receipt-v1','rankingRunId',p_ranking_run_id,'rank',p_rank,'status',status);
END $$;
ALTER FUNCTION public.vnext_launch_chart_freeze_v1(text,uuid,uuid,integer) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_chart_freeze_v1(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_launch_chart_freeze_v1(text,uuid,uuid,integer) TO service_role;

CREATE FUNCTION public.vnext_launch_frozen_chart_read_internal_v1(p_run uuid,p_symbol text,p_score uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $$
 SELECT chart.document
 FROM public.vnext_launch_frozen_charts_v1 chart
 WHERE chart.ranking_run_id=p_run AND chart.symbol=p_symbol AND chart.score_revision=p_score AND chart.dataset_id=11371
  AND EXISTS(SELECT FROM public.vnext_source_policies_v1 policy WHERE policy.source='official' AND policy.scope='official_original'
   AND policy.enabled AND policy.valid_until>statement_timestamp()
   AND public.vnext_launch_csv_hash_v1(to_jsonb(policy))=chart.rights_revision)
$$;
ALTER FUNCTION public.vnext_launch_frozen_chart_read_internal_v1(uuid,text,uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_frozen_chart_read_internal_v1(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $read_patch$
DECLARE prior_oid oid:=to_regprocedure('public.vnext_launch_ranking_read_v1(uuid,text)');
 definition text;
 anchor constant text:= $$'citations',public.vnext_launch_public_citations_v1(score_row.score_revision),'chart',NULL$$;
 replacement constant text:= $$'citations',public.vnext_launch_public_citations_v1(score_row.score_revision),'chart',
       public.vnext_launch_frozen_chart_read_internal_v1(snapshot_row.ranking_run_id,p_symbol,score_row.score_revision)$$;
BEGIN
 IF prior_oid IS NULL OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=prior_oid AND prosecdef AND provolatile='s'
  AND proowner=(SELECT oid FROM pg_roles WHERE rolname='stockinsider_vnext_owner'))
  THEN RAISE EXCEPTION 'launch_chart_reviewed_reader_required';END IF;
 definition:=pg_get_functiondef(prior_oid);
 IF length(definition)-length(replace(definition,anchor,''))<>length(anchor)
  THEN RAISE EXCEPTION 'launch_chart_reader_anchor_changed';END IF;
 EXECUTE replace(definition,anchor,replacement);
END $read_patch$;
COMMIT;
