-- Source-only additive candidate. NOT applied; native HOLD remains in force.
-- No existing routine/pin/role/policy is replaced. Install only after exact review.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);
DO $pre$ BEGIN
 IF to_regclass('public.vnext_ranking_snapshots_v1') IS NOT NULL THEN RAISE EXCEPTION 'vnext_ranking_first_install_required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members a WHERE a.member=pg_roles.oid OR a.roleid=pg_roles.oid) AND NOT EXISTS(SELECT FROM pg_db_role_setting d WHERE d.setrole=pg_roles.oid AND d.setconfig IS NOT NULL))
 OR to_regprocedure('public.enforce_production_writer_fence()') IS NULL
 OR to_regprocedure('public.vnext_current_deep_score_v1(jsonb,uuid,text)') IS NULL
 OR to_regprocedure('public.vnext_target_current_v1(text,uuid,text)') IS NULL
 OR to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)') IS NULL
 OR to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') IS NULL
 OR to_regprocedure('public.vnext_read_v1(text)') IS NULL THEN RAISE EXCEPTION 'vnext_ranking_existing_authority_required'; END IF;
END $pre$;
DO $dependencies$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_target_current_v1(text,uuid,text)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='802d70c4a65be2e32b03206471c054479539e694ef4c761efebf451501edf365') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_read_v1(text)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='20259a7fb00e81257ca6a18faafb3131383f60876272885c09b8fc6566a7d85b') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_current_deep_score_v1(jsonb,uuid,text)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='46f6d848805cc89dc35fd85d9f5d817d934112169f0f1a0cc01c37054adf2e33') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='912b039211f3624f82fa1940740b9cb47a8f0ed46817e108504b29d5a528b8e4') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=false AND proconfig=ARRAY['search_path=pg_catalog'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='597081dda160ac0e369b5f5306bee102caac5b78b19cd82583e0e9408cc4f464') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_provider_envelope_v1(jsonb,integer)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=false AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='f30e724618b242f2e40ee3f64ced5f131baf5505ac51827238bb6992f9c27264') THEN RAISE EXCEPTION 'vnext_ranking_dependency_changed';END IF;
END $dependencies$;
CREATE TABLE public.vnext_ranking_snapshots_v1(
 ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ranking_run_id uuid NOT NULL UNIQUE CHECK(ranking_run_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 previous_ranking_run_id uuid REFERENCES public.vnext_ranking_snapshots_v1(ranking_run_id),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 cutoff timestamptz NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND jsonb_typeof(snapshot->'members')='array' AND jsonb_array_length(snapshot->'members')<=10)
);
-- A chain can have one successor, including exactly one genesis.
CREATE UNIQUE INDEX vnext_ranking_single_successor_v1 ON public.vnext_ranking_snapshots_v1((coalesce(previous_ranking_run_id,'00000000-0000-0000-0000-000000000000'::uuid)));
ALTER TABLE public.vnext_ranking_snapshots_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_ranking_snapshots_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_ranking_snapshots_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.vnext_ranking_snapshots_v1_ordinal_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_ranking_snapshots_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_ranking_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $immutable$
BEGIN RAISE EXCEPTION 'vnext_ranking_snapshot_immutable'; END $immutable$;
ALTER FUNCTION public.vnext_ranking_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_ranking_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_ranking_no_mutation BEFORE UPDATE OR DELETE ON public.vnext_ranking_snapshots_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_ranking_immutable_v1();
CREATE TRIGGER vnext_ranking_no_truncate BEFORE TRUNCATE ON public.vnext_ranking_snapshots_v1 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_ranking_immutable_v1();

-- Relational retention pins keep each historical research revision reachable.
CREATE TABLE public.vnext_ranking_members_v1(
 ranking_run_id uuid NOT NULL REFERENCES public.vnext_ranking_snapshots_v1(ranking_run_id),
 rank integer CHECK(rank BETWEEN 1 AND 10),
 symbol text NOT NULL CHECK(symbol ~ '^[0-9]{4}$'),
 revision_id uuid REFERENCES public.vnext_publications_v1(revision_id),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(ranking_run_id,symbol),UNIQUE(ranking_run_id,rank)
);
ALTER TABLE public.vnext_ranking_members_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_ranking_members_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_ranking_members_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_ranking_members_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER vnext_ranking_no_mutation BEFORE UPDATE OR DELETE ON public.vnext_ranking_members_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_ranking_immutable_v1();
CREATE TRIGGER vnext_ranking_no_truncate BEFORE TRUNCATE ON public.vnext_ranking_members_v1 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_ranking_immutable_v1();

CREATE FUNCTION public.vnext_ranking_command_v1(p_principal text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $ranking$
DECLARE requested uuid; expected uuid; prior public.vnext_ranking_snapshots_v1; replay public.vnext_ranking_snapshots_v1;
 request_digest text; cutoff_at timestamptz; session_day date; market jsonb; market_revision text; home jsonb;
 member public.vnext_members_v1; publication public.vnext_publications_v1; job public.vnext_jobs_v1; frozen jsonb; report jsonb; proof jsonb; target jsonb; score jsonb;
 reasons jsonb; ranked jsonb:='[]'::jsonb; candidates jsonb:='[]'::jsonb; excluded jsonb:='[]'::jsonb; changes jsonb:='[]'::jsonb; binding jsonb; item jsonb; old_item jsonb;
 document jsonb; run_input jsonb; count_active integer; available numeric; points numeric; allowed boolean; block_reason text; rank_no bigint;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request)
 OR NOT(p_request ?& ARRAY['rankingRunId','expectedPreviousRankingRunId']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2
 OR jsonb_typeof(p_request->'rankingRunId') IS DISTINCT FROM 'string'
 OR coalesce(p_request->>'rankingRunId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR (p_request->'expectedPreviousRankingRunId'<>'null'::jsonb AND (jsonb_typeof(p_request->'expectedPreviousRankingRunId') IS DISTINCT FROM 'string' OR coalesce(p_request->>'expectedPreviousRankingRunId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 THEN RAISE EXCEPTION 'vnext_ranking_request_invalid'; END IF;
 requested:=(p_request->>'rankingRunId')::uuid;expected:=(p_request->>'expectedPreviousRankingRunId')::uuid;
 -- Same source -> admission/publication lock order as existing authority.
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) THEN RAISE EXCEPTION 'vnext_database_mode_not_enabled'; END IF;
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled) THEN RAISE EXCEPTION 'vnext_operator_required'; END IF;
 request_digest:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('principal',p_principal,'request',p_request)),'UTF8')),'hex');
 SELECT * INTO replay FROM public.vnext_ranking_snapshots_v1 WHERE ranking_run_id=requested;
 IF replay.ranking_run_id IS NOT NULL THEN
  IF replay.request_hash IS DISTINCT FROM request_digest THEN RAISE EXCEPTION 'vnext_ranking_idempotency_conflict'; END IF;
  RETURN jsonb_build_object('published',true,'replay',true,'historicalReceipt',true,'snapshot',replay.snapshot);
 END IF;
 SELECT * INTO prior FROM public.vnext_ranking_snapshots_v1 ORDER BY ordinal DESC LIMIT 1;
 IF prior.ranking_run_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'vnext_ranking_compare_and_swap_conflict'; END IF;
 cutoff_at:=clock_timestamp();
 SELECT session_date INTO session_day FROM public.vnext_sessions_v1 WHERE completed AND close_at<=cutoff_at ORDER BY session_date DESC LIMIT 1;
 IF session_day IS NULL OR session_day<>(cutoff_at AT TIME ZONE 'Asia/Taipei')::date OR (cutoff_at AT TIME ZONE 'Asia/Taipei')::time<time '20:30' THEN
  RETURN jsonb_build_object('published',false,'retained',true,'reason','ranking_official_postclose_not_ready','snapshot',prior.snapshot); END IF;
 home:=public.vnext_read_v1(NULL);market:=home->'market';
 IF home IS NULL OR jsonb_typeof(market) IS DISTINCT FROM 'object' OR market->>'session' IS DISTINCT FROM session_day::text
 OR nullif(market->>'expiresAt','') IS NULL OR (market->>'expiresAt')::timestamptz<=cutoff_at
 OR coalesce(market->>'risk','') NOT IN('risk_on','selective','risk_off','breakdown') OR market->>'continuity' IS DISTINCT FROM 'true'
 OR nullif(market->>'sourceAt','') IS NULL OR (market->>'sourceAt')::timestamptz>cutoff_at
 OR jsonb_typeof(market->'provenance') IS DISTINCT FROM 'array' OR jsonb_array_length(market->'provenance')=0
 OR jsonb_typeof(market->'gaps') IS DISTINCT FROM 'array' OR EXISTS(SELECT FROM jsonb_array_elements_text(market->'gaps') gap WHERE gap NOT LIKE 'overseas_unavailable:%' AND gap NOT LIKE 'supplemental_unavailable:%')
 OR coalesce(market->>'snapshotHash','') !~ '^[a-f0-9]{64}$' THEN
  RETURN jsonb_build_object('published',false,'retained',true,'reason','ranking_market_authority_incomplete','snapshot',prior.snapshot); END IF;
 market_revision:=market->>'snapshotHash';
 SELECT count(*) INTO count_active FROM public.vnext_members_v1 WHERE state<>'exited';
 IF count_active>20 THEN RAISE EXCEPTION 'vnext_ranking_active_pool_bound'; END IF;
 FOR member IN SELECT * FROM public.vnext_members_v1 WHERE state<>'exited' ORDER BY symbol LOOP
  reasons:='[]'::jsonb;allowed:=false;proof:=NULL;target:=NULL;score:=NULL;report:=NULL;
  SELECT * INTO publication FROM public.vnext_publications_v1 WHERE symbol=member.symbol AND published_at<=cutoff_at ORDER BY published_at DESC,revision_id DESC LIMIT 1;
  IF member.contraindication THEN reasons:=reasons||jsonb_build_array('verified_contraindication');
  ELSIF publication.revision_id IS NULL OR publication.input_hash IS DISTINCT FROM member.input_hash THEN reasons:=reasons||jsonb_build_array('formal_current_research_missing');
  ELSE
   SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=publication.job_id;
   SELECT evidence INTO frozen FROM public.vnext_preparations_v1 WHERE job_id=publication.job_id;
   IF job.state IS DISTINCT FROM 'published' OR job.author_result IS DISTINCT FROM publication.content OR job.execution_id IS NULL OR job.reviewer_execution IS NULL OR job.execution_id=job.reviewer_execution OR job.author_principal IS NULL OR job.reviewer_principal IS NULL OR job.author_principal=job.reviewer_principal OR job.reviewer_result->>'approved' IS DISTINCT FROM 'true'
   OR public.vnext_input_sources_current_v1(frozen,member.symbol) IS DISTINCT FROM true THEN reasons:=reasons||jsonb_build_array('formal_review_or_current_rights_missing');
   ELSE
    -- Existing target validator authenticates distinct provider receipts, original
    -- evidence, current source/version, instrument and corporate-action quote chain.
    target:=public.vnext_target_current_v1(member.symbol,publication.revision_id,member.input_hash);
    IF target->>'schemaVersion'='vnext-target-exit-proof-v1' THEN reasons:=reasons||jsonb_build_array('reviewed_base_target_reached');
    ELSIF target->>'deferred' IS DISTINCT FROM 'target_not_reached' OR jsonb_typeof(target->'currentPrice') IS DISTINCT FROM 'object' OR nullif(target->'currentPrice'->>'observationId','') IS NULL OR target->'currentPrice'->>'session' IS DISTINCT FROM session_day::text OR jsonb_typeof(target->'currentPrice'->'value') IS DISTINCT FROM 'number' OR (target->'currentPrice'->>'value')::numeric<=0 THEN block_reason:='ranking_current_reviewed_price_or_target_unavailable';EXIT;
    ELSE
     proof:=publication.qualification;
     IF proof->>'schemaVersion' IS DISTINCT FROM 'stockinsider-vnext-authority-proof-v1' OR proof->'qualified' IS DISTINCT FROM 'true'::jsonb OR proof->>'inputHash' IS DISTINCT FROM member.input_hash
     OR nullif(proof->>'checkedAt','') IS NULL OR nullif(proof->>'expiresAt','') IS NULL OR (proof->>'checkedAt')::timestamptz>cutoff_at OR (proof->>'expiresAt')::timestamptz<=cutoff_at OR (proof->>'expiresAt')::timestamptz>(proof->>'checkedAt')::timestamptz+interval '120 seconds'
     OR proof->'financialCoverage'->>'status' IS DISTINCT FROM 'complete' OR proof->'priceBasis'->>'status' IS DISTINCT FROM 'verified'
     OR proof->>'proofHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(proof-'proofHash'),'UTF8')),'hex') THEN
      block_reason:='ranking_current_financial_price_authority_missing';EXIT;
     END IF;
     SELECT audit.report INTO report FROM public.vnext_thesis_audits_v1 audit WHERE audit.symbol=member.symbol AND audit.input_hash=member.input_hash AND audit.published_revision=publication.revision_id AND audit.session_date=session_day AND audit.created_at<=cutoff_at ORDER BY audit.created_at DESC,audit.id DESC LIMIT 1;
     IF report IS NULL OR jsonb_typeof(report->'deepInputs') IS DISTINCT FROM 'object' OR report->>'session' IS DISTINCT FROM session_day::text THEN reasons:=reasons||jsonb_build_array('current_deep_score_missing');
     ELSE
      score:=public.vnext_current_deep_score_v1(report->'deepInputs',publication.revision_id,member.input_hash);
      IF score->>'policyVersion' IS DISTINCT FROM 'stockinsider-vnext-20-v1' OR jsonb_typeof(score->'availableWeight') IS DISTINCT FROM 'number' OR (score->>'availableWeight')::numeric<>100 THEN reasons:=reasons||jsonb_build_array('deep_factor_evidence_incomplete');
      ELSIF nullif(member.evidence->>'eventAt','') IS NULL OR (member.evidence->>'eventAt')::timestamptz>cutoff_at THEN reasons:=reasons||jsonb_build_array('original_event_time_missing_or_future');
      ELSE
       points:=(score->>'confirmedPoints')::numeric;available:=(score->>'availableWeight')::numeric;
       IF points<0 OR points>100 THEN RAISE EXCEPTION 'vnext_ranking_score_invalid'; END IF;
       allowed:=member.state='eligible' AND market->>'risk' IN('risk_on','selective') AND member.evidence->>'overheated' IS DISTINCT FROM 'true';
       binding:=jsonb_build_object('research',publication.revision_id,'score',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(report->'deepInputs'),'UTF8')),'hex'),'financial',proof->>'proofHash','price',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(target->'currentPrice'),'UTF8')),'hex'),'market',market_revision);
       ranked:=ranked||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'revisionId',publication.revision_id,'inputHash',member.input_hash,'confirmedPoints',points,'availableWeight',available,'eventAt',member.evidence->'eventAt','entryEligible',allowed,'reasons',CASE WHEN allowed THEN '[]'::jsonb ELSE jsonb_build_array(CASE WHEN market->>'risk' IN('risk_off','breakdown') THEN 'market_wait' ELSE 'entry_conditions_waiting' END) END,'revisions',binding));
      END IF;
     END IF;
    END IF;
   END IF;
  END IF;
  candidates:=candidates||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'state',member.state,'date',CASE WHEN member.evidence->>'eventAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(member.evidence->>'eventAt',10) ELSE NULL END,'revisionId',publication.revision_id,'inputHash',member.input_hash,'entryEligible',allowed,'reasons',CASE WHEN NOT allowed AND jsonb_array_length(reasons)=0 THEN jsonb_build_array(CASE WHEN market->>'risk' IN('risk_off','breakdown') THEN 'market_wait' ELSE 'entry_conditions_waiting' END) ELSE reasons END,'source',NULL,'industry',NULL));
  IF jsonb_array_length(reasons)>0 THEN excluded:=excluded||jsonb_build_array(jsonb_build_object('symbol',member.symbol,'reasons',reasons));END IF;
 END LOOP;
 IF block_reason IS NOT NULL THEN RETURN jsonb_build_object('published',false,'retained',true,'reason',block_reason,'snapshot',prior.snapshot); END IF;
 IF jsonb_array_length(candidates)<>count_active THEN RAISE EXCEPTION 'vnext_ranking_complete_pool_required'; END IF;
 SELECT coalesce(jsonb_agg(item||jsonb_build_object('rank',rank_position) ORDER BY rank_position),'[]'::jsonb) INTO ranked FROM(SELECT value AS item,row_number() OVER(ORDER BY (value->>'confirmedPoints')::numeric DESC,(value->>'availableWeight')::numeric DESC,(value->>'eventAt')::timestamptz DESC NULLS LAST,value->>'symbol') AS rank_position FROM jsonb_array_elements(ranked)) ordered WHERE rank_position<=10;
 FOR item IN SELECT value FROM jsonb_array_elements(ranked) LOOP
  SELECT value INTO old_item FROM jsonb_array_elements(coalesce(prior.snapshot->'members','[]'::jsonb)) WHERE value->>'symbol'=item->>'symbol';
  changes:=changes||jsonb_build_array(jsonb_build_object('symbol',item->>'symbol','kind',CASE WHEN old_item IS NULL THEN 'entered' ELSE 'maintained' END,'reason',CASE WHEN old_item IS NULL THEN 'qualified_top10_projection' ELSE 'qualified_current_revision_projection' END));
 END LOOP;
 FOR old_item IN SELECT value FROM jsonb_array_elements(coalesce(prior.snapshot->'members','[]'::jsonb)) LOOP
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(ranked) now_item WHERE now_item->>'symbol'=old_item->>'symbol') THEN changes:=changes||jsonb_build_array(jsonb_build_object('symbol',old_item->>'symbol','kind','exited','reason','no_longer_in_qualified_top10'));END IF;
 END LOOP;
 document:=jsonb_build_object('schemaVersion','vnext-ranking-snapshot-v1','rankingRunId',requested,'previousRankingRunId',expected,'cutoff',cutoff_at,'policyVersion','stockinsider-vnext-20-v1','marketRevision',market_revision,'market',market,'members',ranked,'candidates',candidates,'exclusions',excluded,'changes',changes,'sourceVersion','vnext-ranking-snapshot-source-v1');
 run_input:=jsonb_build_object('active',candidates,'members',ranked,'marketRevision',market_revision,'policyVersion','stockinsider-vnext-20-v1');
 INSERT INTO public.vnext_ranking_snapshots_v1(ranking_run_id,previous_ranking_run_id,request_hash,input_hash,cutoff,snapshot) VALUES(requested,expected,request_digest,encode(sha256(convert_to(public.vnext_catalog_canonical_v1(run_input),'UTF8')),'hex'),cutoff_at,document);
 INSERT INTO public.vnext_ranking_members_v1(ranking_run_id,rank,symbol,revision_id,input_hash) SELECT requested,(ranked_member->>'rank')::integer,candidate->>'symbol',(candidate->>'revisionId')::uuid,candidate->>'inputHash' FROM jsonb_array_elements(candidates) candidate LEFT JOIN LATERAL(SELECT value AS ranked_member FROM jsonb_array_elements(ranked) WHERE value->>'symbol'=candidate->>'symbol') matched ON true;
 -- Same guarded audit table/transaction as the existing ledger; no attempt starts.
 INSERT INTO public.vnext_audit_v1(principal,command,request,result) VALUES(p_principal,'ranking-publish',p_request,jsonb_build_object('rankingRunId',requested,'inputHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(run_input),'UTF8')),'hex')));
 RETURN jsonb_build_object('published',true,'replay',false,'snapshot',document);
END $ranking$;
ALTER FUNCTION public.vnext_ranking_command_v1(text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_ranking_command_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_ranking_command_v1(text,jsonb) TO service_role;

CREATE FUNCTION public.vnext_ranking_read_v1(p_ranking_run_id uuid DEFAULT NULL,p_symbol text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $read$
 SELECT jsonb_build_object('snapshot',(SELECT snapshot FROM public.vnext_ranking_snapshots_v1 WHERE p_ranking_run_id IS NULL OR ranking_run_id=p_ranking_run_id ORDER BY ordinal DESC LIMIT 1),'current',jsonb_build_object('home',public.vnext_read_v1(NULL),'detail',CASE WHEN p_symbol IS NOT NULL AND p_symbol ~ '^[0-9]{4}$' THEN public.vnext_read_v1(p_symbol) END))
 WHERE EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) AND (p_symbol IS NULL OR p_symbol ~ '^[0-9]{4}$')
$read$;
ALTER FUNCTION public.vnext_ranking_read_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_ranking_read_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_ranking_read_v1(uuid,text) TO service_role;
COMMIT;
