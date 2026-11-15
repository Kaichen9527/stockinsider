-- Candidate migration for T09. Apply after vnext_launch_ranking_v1.
-- Derive new signal anchors in the existing ranking transaction.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);
CREATE TABLE public.vnext_launch_outcome_signals_v1(
 ranking_run_id uuid NOT NULL,
 symbol text NOT NULL CHECK(symbol~'^[0-9]{4}$'),
 first_ranking_run_id uuid NOT NULL,
 rank integer NOT NULL CHECK(rank BETWEEN 1 AND 10),
 signal_session date NOT NULL,
 published_at timestamptz NOT NULL,
 input_cutoff timestamptz NOT NULL CHECK(input_cutoff<=published_at),
 input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 score_revision uuid NOT NULL REFERENCES public.vnext_launch_score_evidence_v1(score_revision),
 stock_id uuid NOT NULL,
 market text NOT NULL CHECK(market IN('TWSE','TPEX')),
 close_observation_id uuid NOT NULL,
 calendar_authority_id uuid NOT NULL REFERENCES public.tw_trading_sessions_v3(session_authority_id),
 raw_close numeric NOT NULL CHECK(raw_close>0 AND raw_close<'1000000000000'::numeric AND raw_close=trunc(raw_close,8)),
 price_revision text NOT NULL CHECK(price_revision~'^[a-f0-9]{64}$'),
 calendar_revision text NOT NULL CHECK(calendar_revision~'^[a-f0-9]{64}$'),
 actions_revision text NOT NULL CHECK(actions_revision~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(ranking_run_id,symbol),
 FOREIGN KEY(ranking_run_id,symbol) REFERENCES public.vnext_launch_ranking_members_v1(ranking_run_id,symbol),
 FOREIGN KEY(first_ranking_run_id,symbol) REFERENCES public.vnext_launch_ranking_members_v1(ranking_run_id,symbol),
 FOREIGN KEY(score_revision,close_observation_id) REFERENCES public.vnext_launch_score_price_pins_v1(score_revision,observation_id)
);
ALTER TABLE public.vnext_launch_outcome_signals_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_outcome_signals_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_outcome_signals_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_outcome_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_launch_outcome_signals_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER launch_outcome_signal_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_outcome_signals_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();
CREATE TRIGGER launch_outcome_signal_no_truncate BEFORE TRUNCATE ON public.vnext_launch_outcome_signals_v1
 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

-- A continuous episode follows actual frozen ranked membership. An unpublished
-- day preserves the last published snapshot and cannot create a false first.
CREATE FUNCTION public.vnext_launch_outcome_first_member_v1(start_run uuid,target text) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE current_run uuid:=start_run;prior_run uuid;root_run uuid;depth integer:=0;
BEGIN
 LOOP
  depth:=depth+1;
  IF depth>4096 THEN RAISE EXCEPTION 'launch_outcome_original_membership_chain_unresolved';END IF;
  SELECT first_ranking_run_id INTO root_run FROM public.vnext_launch_outcome_signals_v1
   WHERE ranking_run_id=current_run AND symbol=target;
  IF FOUND THEN RETURN root_run;END IF;
  SELECT s.previous_ranking_run_id INTO prior_run FROM public.vnext_launch_ranking_snapshots_v1 s
   JOIN public.vnext_launch_ranking_members_v1 m ON m.ranking_run_id=s.ranking_run_id
   WHERE s.ranking_run_id=current_run AND m.symbol=target AND m.rank IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'launch_outcome_original_ranked_member_missing';END IF;
  IF prior_run IS NULL OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_members_v1
    WHERE ranking_run_id=prior_run AND symbol=target AND rank IS NOT NULL) THEN RETURN current_run;END IF;
  current_run:=prior_run;
 END LOOP;
END $$;
ALTER FUNCTION public.vnext_launch_outcome_first_member_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_first_member_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_outcome_seed_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE snapshot_row public.vnext_launch_ranking_snapshots_v1;score_row public.vnext_launch_score_evidence_v1;
 proof public.vnext_launch_qualifications_v1;pin public.vnext_launch_score_price_pins_v1;obs record;member_packet jsonb;price jsonb;bar jsonb;
 first_run uuid;quote_id uuid;calendar_id uuid;matching integer;
BEGIN
 SELECT * INTO STRICT snapshot_row FROM public.vnext_launch_ranking_snapshots_v1 WHERE ranking_run_id=NEW.ranking_run_id;
 SELECT count(*) INTO matching FROM jsonb_array_elements(snapshot_row.snapshot->'members') item WHERE item->>'symbol'=NEW.symbol;
 IF NEW.rank IS NULL AND matching=0 THEN RETURN NEW;END IF;
 IF matching<>1 OR NEW.rank IS NULL THEN RAISE EXCEPTION 'launch_outcome_published_member_binding';END IF;
 SELECT * INTO STRICT score_row FROM public.vnext_launch_score_evidence_v1 WHERE score_revision=NEW.score_revision;
 SELECT * INTO STRICT proof FROM public.vnext_launch_qualifications_v1 WHERE qualification_revision=NEW.qualification_revision;
 SELECT item INTO member_packet FROM jsonb_array_elements(snapshot_row.snapshot->'members') item WHERE item->>'symbol'=NEW.symbol;
 IF snapshot_row.snapshot->>'schemaVersion' IS DISTINCT FROM 'vnext-launch-ranking-snapshot-v2'
 OR snapshot_row.snapshot->>'policyVersion' IS DISTINCT FROM 'stockinsider-launch-radar-v1'
 OR snapshot_row.snapshot->>'rankingRunId' IS DISTINCT FROM NEW.ranking_run_id::text
 OR snapshot_row.snapshot->>'session' IS DISTINCT FROM snapshot_row.session_date::text
 OR (snapshot_row.snapshot->>'inputCutoff')::timestamptz IS DISTINCT FROM snapshot_row.input_cutoff
 OR (snapshot_row.snapshot->>'publishedAt')::timestamptz IS DISTINCT FROM snapshot_row.published_at
 OR (member_packet->>'rank')::integer IS DISTINCT FROM NEW.rank
 OR member_packet->>'scoreRevision' IS DISTINCT FROM NEW.score_revision::text
 OR member_packet->>'launchQualificationRevision' IS DISTINCT FROM NEW.qualification_revision::text
 OR member_packet->>'revisionId' IS DISTINCT FROM NEW.research_revision::text
 OR member_packet->>'inputHash' IS DISTINCT FROM NEW.input_hash
 OR member_packet->'availableWeight' IS DISTINCT FROM '100'::jsonb
 OR score_row.signal_session IS DISTINCT FROM snapshot_row.session_date OR score_row.input_cutoff IS DISTINCT FROM snapshot_row.input_cutoff
 OR score_row.symbol IS DISTINCT FROM NEW.symbol OR score_row.input_hash IS DISTINCT FROM NEW.input_hash
 OR score_row.research_revision IS DISTINCT FROM NEW.research_revision
 OR proof.score_revision IS DISTINCT FROM NEW.score_revision OR proof.research_revision IS DISTINCT FROM NEW.research_revision
 OR proof.input_hash IS DISTINCT FROM NEW.input_hash OR proof.symbol IS DISTINCT FROM NEW.symbol
 OR proof.qualified IS DISTINCT FROM true OR proof.revisions IS DISTINCT FROM member_packet->'revisions'
 THEN RAISE EXCEPTION 'launch_outcome_published_member_binding';END IF;
 price:=score_row.source_inputs->'price';
 bar:=price->'bars'->-1;
 IF price->>'schemaVersion' IS DISTINCT FROM 'launch-db-selected-price-v1'
 OR price->>'priceBasis' IS DISTINCT FROM 'adjusted_to_signal_session'
 OR price->>'anchor' IS DISTINCT FROM snapshot_row.session_date::text
 OR (price->>'knownAt')::timestamptz IS NULL OR (price->>'knownAt')::timestamptz>snapshot_row.input_cutoff
 OR bar->>'session' IS DISTINCT FROM snapshot_row.session_date::text
 OR (bar->>'factor')::numeric IS DISTINCT FROM 1::numeric
 OR coalesce(price->>'priceRevision','')!~'^[a-f0-9]{64}$'
 OR coalesce(price->>'calendarRevision','')!~'^[a-f0-9]{64}$'
 OR coalesce(price->>'actionsRevision','')!~'^[a-f0-9]{64}$'
 OR price->>'priceRevision' IS DISTINCT FROM member_packet->'revisions'->>'price'
 OR price->>'calendarRevision' IS DISTINCT FROM member_packet->'revisions'->>'calendar'
 OR price->>'actionsRevision' IS DISTINCT FROM member_packet->'revisions'->>'actions'
 THEN RAISE EXCEPTION 'launch_outcome_frozen_price_binding';END IF;
 quote_id:=(bar->>'observationId')::uuid;calendar_id:=(bar->>'calendarId')::uuid;
 SELECT * INTO pin FROM public.vnext_launch_score_price_pins_v1
   WHERE score_revision=NEW.score_revision AND observation_id=quote_id;
 IF pin.observation_id IS NULL OR pin.calendar_id IS DISTINCT FROM calendar_id
 THEN RAISE EXCEPTION 'launch_outcome_frozen_price_pin_missing';END IF;
 SELECT stock_id,exchange::text AS market,session_id,session_authority_id,raw_close,source_timestamp,recorded_at INTO obs
 FROM public.opportunity_price_observations_v3 WHERE observation_id=quote_id;
 IF NOT FOUND OR obs.stock_id IS NULL OR obs.market NOT IN('TWSE','TPEX')
 OR obs.session_id IS DISTINCT FROM snapshot_row.session_date OR obs.session_authority_id IS DISTINCT FROM calendar_id
 OR obs.raw_close IS DISTINCT FROM (bar->>'rawClose')::numeric
 OR obs.source_timestamp IS NULL OR obs.recorded_at IS NULL OR obs.source_timestamp>obs.recorded_at
 OR obs.recorded_at>snapshot_row.input_cutoff
 THEN RAISE EXCEPTION 'launch_outcome_frozen_price_observation';END IF;
 first_run:=public.vnext_launch_outcome_first_member_v1(NEW.ranking_run_id,NEW.symbol);
 INSERT INTO public.vnext_launch_outcome_signals_v1(ranking_run_id,symbol,first_ranking_run_id,rank,signal_session,published_at,input_cutoff,
  input_hash,score_revision,stock_id,market,close_observation_id,calendar_authority_id,raw_close,price_revision,calendar_revision,actions_revision)
 VALUES(NEW.ranking_run_id,NEW.symbol,first_run,NEW.rank,snapshot_row.session_date,snapshot_row.published_at,snapshot_row.input_cutoff,
  NEW.input_hash,NEW.score_revision,obs.stock_id,obs.market,quote_id,calendar_id,obs.raw_close,price->>'priceRevision',price->>'calendarRevision',price->>'actionsRevision');
 RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_launch_outcome_seed_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_seed_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_outcome_seed_after_rank_insert AFTER INSERT ON public.vnext_launch_ranking_members_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_outcome_seed_v1();
COMMIT;
