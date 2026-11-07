-- SOURCE CANDIDATE ONLY / NOT_APPLIED / native HOLD.
-- Unregistered, private and unconditionally disabled. This does not instrument
-- any existing routine/trigger, authorize a mutation or backfill any history.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
DO $pre$ BEGIN
 IF to_regclass('public.vnext_candidate_epoch_events_v1') IS NOT NULL
 OR to_regprocedure('public.vnext_candidate_epoch_append_internal_v1(jsonb)') IS NOT NULL
 OR to_regprocedure('public.vnext_candidate_epoch_no_mutation_v1()') IS NOT NULL THEN RAISE EXCEPTION 'vnext_candidate_epoch_first_install_required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members a WHERE a.member=pg_roles.oid OR a.roleid=pg_roles.oid) AND NOT EXISTS(SELECT FROM pg_db_role_setting d WHERE d.setrole=pg_roles.oid AND d.setconfig IS NOT NULL))
 OR to_regprocedure('public.enforce_production_writer_fence()') IS NULL
 OR to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'vnext_candidate_epoch_existing_authority_required'; END IF;
END $pre$;
CREATE TABLE public.vnext_candidate_epoch_events_v1(
 ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 schema_version text NOT NULL DEFAULT 'vnext-candidate-epoch-event-v1' CHECK(schema_version='vnext-candidate-epoch-event-v1'),
 policy_version text NOT NULL DEFAULT 'stockinsider-vnext-20-v1' CHECK(policy_version='stockinsider-vnext-20-v1'),
 event_id uuid NOT NULL UNIQUE CHECK(event_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 symbol text NOT NULL CHECK(symbol ~ '^[0-9]{4}$'),
 sequence bigint NOT NULL CHECK(sequence>0),
 previous_event_id uuid,
 epoch_id uuid,
 epoch_started_at timestamptz,
 previous_epoch_id uuid,
 kind text NOT NULL CHECK(kind IN('admitted','deferred','exited')),
 state text CHECK(state IN('researching','waiting','eligible','exited')),
 reason_code text NOT NULL CHECK(reason_code IN('admitted','eligibility_evidence_missing','unchanged_input','daily_budget','active_capacity','work_in_progress','target_hit')),
 cause_path text NOT NULL CHECK(cause_path IN('core.enqueue.admitted','core.enqueue.deferred','core.exit.target_hit')),
 cause_id text NOT NULL CHECK(length(cause_id) BETWEEN 1 AND 180 AND cause_id ~ '^[A-Za-z0-9_:.-]+$'),
 actor_principal text NOT NULL REFERENCES public.vnext_principals_v1(principal),
 input_hash text CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 proof_hash text CHECK(proof_hash ~ '^[a-f0-9]{64}$'),
 job_id uuid REFERENCES public.vnext_jobs_v1(job_id),
 publication_revision_id uuid REFERENCES public.vnext_publications_v1(revision_id),
 session_date date NOT NULL REFERENCES public.vnext_sessions_v1(session_date),
 occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 coverage_gaps text[] NOT NULL DEFAULT ARRAY['pre_activation_history_unavailable','uncovered_mutation_paths','hooks_not_connected']
  CHECK(coverage_gaps=ARRAY['pre_activation_history_unavailable','uncovered_mutation_paths','hooks_not_connected']),
 UNIQUE(symbol,sequence), UNIQUE(event_id,symbol), UNIQUE(symbol,cause_path,cause_id),
 FOREIGN KEY(previous_event_id,symbol) REFERENCES public.vnext_candidate_epoch_events_v1(event_id,symbol),
 FOREIGN KEY(epoch_id,symbol) REFERENCES public.vnext_candidate_epoch_events_v1(event_id,symbol),
 FOREIGN KEY(previous_epoch_id,symbol) REFERENCES public.vnext_candidate_epoch_events_v1(event_id,symbol),
 CHECK(previous_event_id IS DISTINCT FROM event_id),
 CHECK((sequence=1)=(previous_event_id IS NULL)),
 CHECK((epoch_id IS NULL)=(epoch_started_at IS NULL)),
 CHECK(epoch_started_at IS NULL OR isfinite(epoch_started_at) AND epoch_started_at<=occurred_at),
 CHECK(occurred_at<=recorded_at),
 CHECK(coalesce((cause_path='core.enqueue.admitted' AND kind='admitted' AND state IS NOT NULL AND state='researching' AND reason_code='admitted' AND epoch_id IS NOT NULL AND epoch_started_at IS NOT NULL AND epoch_id=event_id AND epoch_started_at=occurred_at AND input_hash IS NOT NULL AND job_id IS NOT NULL AND proof_hash IS NULL)
  OR (cause_path='core.enqueue.deferred' AND kind='deferred' AND reason_code IN('eligibility_evidence_missing','unchanged_input','daily_budget','active_capacity','work_in_progress') AND proof_hash IS NULL)
  OR (cause_path='core.exit.target_hit' AND kind='exited' AND state='exited' AND reason_code='target_hit' AND input_hash IS NOT NULL AND proof_hash IS NOT NULL AND publication_revision_id IS NOT NULL),false))
);
CREATE UNIQUE INDEX vnext_candidate_epoch_one_genesis_v1 ON public.vnext_candidate_epoch_events_v1(symbol) WHERE previous_event_id IS NULL;
CREATE UNIQUE INDEX vnext_candidate_epoch_one_successor_v1 ON public.vnext_candidate_epoch_events_v1(previous_event_id) WHERE previous_event_id IS NOT NULL;
ALTER TABLE public.vnext_candidate_epoch_events_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_candidate_epoch_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_candidate_epoch_events_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.vnext_candidate_epoch_events_v1_ordinal_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_candidate_epoch_events_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_candidate_epoch_no_mutation_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $immutable$
BEGIN RAISE EXCEPTION 'vnext_candidate_epoch_immutable'; END $immutable$;
ALTER FUNCTION public.vnext_candidate_epoch_no_mutation_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_candidate_epoch_no_mutation_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_candidate_epoch_no_update_delete BEFORE UPDATE OR DELETE ON public.vnext_candidate_epoch_events_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_candidate_epoch_no_mutation_v1();
CREATE TRIGGER vnext_candidate_epoch_no_truncate BEFORE TRUNCATE ON public.vnext_candidate_epoch_events_v1 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_candidate_epoch_no_mutation_v1();

CREATE FUNCTION public.vnext_candidate_epoch_append_internal_v1(p_event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' SET lock_timeout='2s' AS $append$
DECLARE prior public.vnext_candidate_epoch_events_v1; replay public.vnext_candidate_epoch_events_v1; root public.vnext_candidate_epoch_events_v1;
 requested uuid; expected uuid; symbol_value text; path_value text; reason_value text; digest text; occurred timestamptz; recorded timestamptz;
 epoch_value uuid; epoch_start timestamptz; previous_epoch uuid; kind_value text; state_value text; next_sequence bigint; result public.vnext_candidate_epoch_events_v1;
BEGIN
 -- No flag, GUC, client attestation or role can activate this source candidate.
 -- Removing this guard requires a separately reviewed source revision with
 -- exact original-writer hooks, proof bindings and coverage/retention acceptance.
 RAISE EXCEPTION 'vnext_candidate_epoch_hooks_not_connected';

 -- Inert append algorithm below is source design, NOT a reachable writer.
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR octet_length(p_event::text)>4096
 OR NOT(p_event ?& ARRAY['eventId','expectedPreviousEventId','symbol','causePath','causeId','actorPrincipal','inputHash','proofHash','jobId','publicationRevisionId','sessionDate','occurredAt','reasonCode'])
 OR (SELECT count(*) FROM jsonb_object_keys(p_event))<>13
 OR EXISTS(SELECT FROM jsonb_object_keys(p_event) key WHERE key NOT IN('eventId','expectedPreviousEventId','symbol','causePath','causeId','actorPrincipal','inputHash','proofHash','jobId','publicationRevisionId','sessionDate','occurredAt','reasonCode')) THEN RAISE EXCEPTION 'vnext_candidate_epoch_closed_request'; END IF;
 IF EXISTS(SELECT FROM unnest(ARRAY['eventId','symbol','causePath','causeId','actorPrincipal','sessionDate','occurredAt','reasonCode']) key WHERE jsonb_typeof(p_event->key) IS DISTINCT FROM 'string')
 OR EXISTS(SELECT FROM unnest(ARRAY['expectedPreviousEventId','inputHash','proofHash','jobId','publicationRevisionId']) key WHERE jsonb_typeof(p_event->key) NOT IN('string','null'))
 OR p_event->>'eventId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR EXISTS(SELECT FROM unnest(ARRAY['expectedPreviousEventId','jobId','publicationRevisionId']) key WHERE p_event->>key IS NOT NULL AND p_event->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 OR EXISTS(SELECT FROM unnest(ARRAY['inputHash','proofHash']) key WHERE p_event->>key IS NOT NULL AND p_event->>key !~ '^[a-f0-9]{64}$')
 OR p_event->>'symbol' !~ '^[0-9]{4}$' OR length(p_event->>'actorPrincipal') NOT BETWEEN 1 AND 180
 OR length(p_event->>'causeId') NOT BETWEEN 1 AND 180 OR p_event->>'causeId' !~ '^[A-Za-z0-9_:.-]+$'
 OR p_event->>'sessionDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR p_event->>'occurredAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'vnext_candidate_epoch_field_invalid'; END IF;
 requested:=(p_event->>'eventId')::uuid; expected:=(p_event->>'expectedPreviousEventId')::uuid; symbol_value:=p_event->>'symbol';
 path_value:=p_event->>'causePath';reason_value:=p_event->>'reasonCode';
 IF path_value='core.enqueue.admitted' AND reason_value='admitted' THEN kind_value:='admitted';
 ELSIF path_value='core.enqueue.deferred' AND reason_value IN('eligibility_evidence_missing','unchanged_input','daily_budget','active_capacity','work_in_progress') THEN kind_value:='deferred';
 ELSIF path_value='core.exit.target_hit' AND reason_value='target_hit' THEN kind_value:='exited';
 ELSE RAISE EXCEPTION 'vnext_candidate_epoch_unsupported_cause'; END IF;
 -- Canonical accepted caller input only: generated ordinal/sequence/recordedAt
 -- never participate in replay identity; no current-row hydration is performed.
 digest:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('schemaVersion','vnext-candidate-epoch-event-v1','policyVersion','stockinsider-vnext-20-v1','request',p_event)),'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(64221022);
 SELECT * INTO replay FROM public.vnext_candidate_epoch_events_v1 WHERE event_id=requested OR (symbol=symbol_value AND cause_path=path_value AND cause_id=p_event->>'causeId') ORDER BY ordinal LIMIT 1;
 IF replay.event_id IS NOT NULL THEN
  IF replay.event_id<>requested OR replay.symbol<>symbol_value OR replay.cause_path<>path_value OR replay.cause_id<>p_event->>'causeId' OR replay.request_hash<>digest THEN RAISE EXCEPTION 'vnext_candidate_epoch_idempotency_conflict'; END IF;
  RETURN jsonb_build_object('eventId',replay.event_id,'sequence',replay.sequence::text,'replay',true,'activation','disabled_not_connected');
 END IF;
 SELECT * INTO prior FROM public.vnext_candidate_epoch_events_v1 WHERE symbol=symbol_value ORDER BY sequence DESC LIMIT 1;
 IF prior.event_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'vnext_candidate_epoch_compare_and_swap_conflict'; END IF;
 occurred:=(p_event->>'occurredAt')::timestamptz;recorded:=clock_timestamp();
 IF NOT isfinite(occurred) OR occurred<statement_timestamp() OR occurred>recorded OR prior.event_id IS NOT NULL AND occurred<prior.occurred_at THEN RAISE EXCEPTION 'vnext_candidate_epoch_clock_or_backfill_forbidden'; END IF;
 IF to_char((p_event->>'sessionDate')::date,'YYYY-MM-DD') IS DISTINCT FROM p_event->>'sessionDate' THEN RAISE EXCEPTION 'vnext_candidate_epoch_session_invalid'; END IF;
 IF p_event->>'jobId' IS NOT NULL AND NOT EXISTS(SELECT FROM public.vnext_jobs_v1 work WHERE work.job_id=(p_event->>'jobId')::uuid AND work.symbol=symbol_value AND CASE WHEN kind_value='admitted' THEN work.admission_hash=p_event->>'inputHash' AND work.retry_of IS NULL ELSE work.input_hash=p_event->>'inputHash' END AND work.session_date=(p_event->>'sessionDate')::date) THEN RAISE EXCEPTION 'vnext_candidate_epoch_job_lineage_mismatch'; END IF;
 IF p_event->>'publicationRevisionId' IS NOT NULL AND NOT EXISTS(SELECT FROM public.vnext_publications_v1 pub WHERE pub.revision_id=(p_event->>'publicationRevisionId')::uuid AND pub.symbol=symbol_value AND pub.input_hash=p_event->>'inputHash' AND pub.published_at<=occurred) THEN RAISE EXCEPTION 'vnext_candidate_epoch_publication_lineage_mismatch'; END IF;
 next_sequence:=coalesce(prior.sequence,0)+1;epoch_value:=prior.epoch_id;epoch_start:=prior.epoch_started_at;previous_epoch:=prior.previous_epoch_id;
 IF epoch_value IS NOT NULL THEN
  SELECT * INTO root FROM public.vnext_candidate_epoch_events_v1 WHERE event_id=epoch_value AND symbol=symbol_value;
  IF root.event_id IS NULL OR root.kind<>'admitted' OR root.epoch_id IS DISTINCT FROM root.event_id OR root.epoch_started_at IS DISTINCT FROM epoch_start THEN RAISE EXCEPTION 'vnext_candidate_epoch_recorded_admission_required'; END IF;
 END IF;
 IF kind_value='admitted' THEN
  IF prior.state IN('researching','waiting','eligible') THEN RAISE EXCEPTION 'vnext_candidate_epoch_unrecorded_exit_or_active_update'; END IF;
  previous_epoch:=epoch_value;epoch_value:=requested;epoch_start:=occurred;state_value:='researching';
 ELSIF kind_value='exited' THEN
  IF prior.state='exited' THEN RAISE EXCEPTION 'vnext_candidate_epoch_already_exited'; END IF;
  state_value:='exited';
 ELSE state_value:=prior.state; END IF;
 INSERT INTO public.vnext_candidate_epoch_events_v1(event_id,symbol,sequence,previous_event_id,epoch_id,epoch_started_at,previous_epoch_id,kind,state,reason_code,cause_path,cause_id,actor_principal,input_hash,proof_hash,job_id,publication_revision_id,session_date,occurred_at,recorded_at,request_hash)
 VALUES(requested,symbol_value,next_sequence,expected,epoch_value,epoch_start,previous_epoch,kind_value,state_value,reason_value,path_value,p_event->>'causeId',p_event->>'actorPrincipal',p_event->>'inputHash',p_event->>'proofHash',(p_event->>'jobId')::uuid,(p_event->>'publicationRevisionId')::uuid,(p_event->>'sessionDate')::date,occurred,recorded,digest) RETURNING * INTO result;
 RETURN jsonb_build_object('eventId',result.event_id,'sequence',result.sequence::text,'replay',false,'activation','disabled_not_connected');
END $append$;
ALTER FUNCTION public.vnext_candidate_epoch_append_internal_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_candidate_epoch_append_internal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Intentionally NO grant, caller, public reader, existing-table trigger or hook.
COMMIT;
