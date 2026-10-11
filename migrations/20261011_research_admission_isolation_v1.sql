BEGIN;
-- Snapshot isolation can retain a pre-lock view and admit two model leases or
-- a sixth weekly company. Preserve quotas and locks; callers must use RC.
-- Successor installation also repairs already-applied predecessor functions.
-- Never replace an absent or independently changed routine with an old body.
DO $precondition$
DECLARE target record; routine oid; body_hash text; attributes jsonb; expected_attributes jsonb;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.reserve_research_model_v1(text,text,text)','bc8a7ea5427e1601383d1857b70f35da44de22b3227b39de19790371a7e3ed6e','eb4c7cd312de8e493ca1f76a377187e88dd9c9a23b1a9f78db7cc04d27a5c9fc',true,1000),
    ('public.validate_research_deep_scope_v1()','02f78ce1999476042b0223e1107f86493c4ec54a555a90dded77450a4b9efe7b','3206f117f3088454543cc0c5bf30589a209eebeb04795b74e76c745fd33b4df7',false,0),
    ('public.charge_research_deep_admission_v1()','1ce1ec2aa92422d8889f398a32e9343cca8efc5b28a33b8f9f9cc6c5c7f37a50','3bb0190c2a3efbd619c7fda9260c1aa1fab5eef25ad3d7dd6b4367e03a240069',true,0),
    ('public.reconcile_research_deep_admissions_v1()','7972568e2233c900b0225315d710415aee3cebe2ca2060fca8eacda8e32c25c3','e234c217de2776bc2b7882526ce90230e3d272b42afd853989dbb8e531d7abe0',true,0),
    ('public.enqueue_research_deep_jobs_v1(uuid)','c1c82364dea9e7ea88d4daa367731e527f6141e459a6ff10549264a7f4101acb','fca59bf364f852e606c66b3ac6a5aa96f1dccd55a6163d56c2898f7974d175ae',true,0),
    ('public.store_observed_research_priority_v1(text,timestamptz,text,jsonb,jsonb,jsonb,jsonb)','ac9ecdfa5c60ae9d98b435a5ff48d053cd91b026b9d160aa2fc9c432437d8065','6cd5cca1f16f0f4064fcce24adcdd83041bfe8d3aa16ebef63bdf150762538d5',true,0),
    ('public.reap_expired_research_deep_jobs_v2()','8cf5c9e06ca7133616d81c22e8056bafc0aa9ebfd6ec24c1817afea9a5f3e43c','fbc8fe7b1f7cf75a4ebb40776116ce5aa724f53bacaa4fbc156aa3cc3fd65ea9',true,0),
    ('public.claim_research_deep_job_v1(text)','14e10d281cf736a1648d11445b07bea2abeff2def5999cc7a540f2374f2bb1a4','a7233d74acafc7661576b4e4426bdf4e95051d18fcd28800628ad73580e6adc6',true,1000),
    ('public.claim_research_observed_job_v2(text,text)','34c85723a6109c14a7ce24ccd092ac968380eb02d3bb20b1ee70beca68fbf5df','c950426c57c830ebe1bd83b20bf39fbc67ffdddbb073a2a68c9e4209b547bd96',true,0)
  ) AS expected(signature,predecessor_hash,successor_hash,security_definer,estimated_rows) LOOP
    routine:=to_regprocedure(target.signature);
    IF routine IS NULL THEN RAISE EXCEPTION 'research_admission_predecessor_missing: %',target.signature; END IF;
    SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO body_hash FROM pg_proc WHERE oid=routine;
    SELECT jsonb_build_object('language',l.lanname,'securityDefiner',p.prosecdef,
      'volatility',p.provolatile::text,'strict',p.proisstrict,'leakproof',p.proleakproof,
      'parallel',p.proparallel::text,'cost',p.procost,'rows',p.prorows,'kind',p.prokind::text,
      'returnsSet',p.proretset,'defaults',p.pronargdefaults,'variadic',p.provariadic::text,
      'support',p.prosupport::oid::text,'transforms',p.protrftypes::text,'binary',p.probin,
      'configuration',(SELECT jsonb_agg(regexp_replace(setting,'[[:space:]]','','g') ORDER BY setting)
        FROM unnest(p.proconfig) setting)) INTO attributes
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=routine;
    expected_attributes:=jsonb_build_object('language','plpgsql','securityDefiner',target.security_definer,
      'volatility','v','strict',false,'leakproof',false,'parallel','u','cost',100,
      'rows',target.estimated_rows,'kind','f','returnsSet',target.estimated_rows>0,
      'defaults',0,'variadic','0','support','0','transforms','','binary',NULL,
      'configuration',jsonb_build_array('search_path=public,pg_temp'));
    IF body_hash NOT IN (target.predecessor_hash,target.successor_hash)
      OR attributes IS DISTINCT FROM expected_attributes
      THEN RAISE EXCEPTION 'research_admission_predecessor_changed: %',target.signature; END IF;
  END LOOP;
END $precondition$;

-- Exact predecessor: migrations/20260929_research_agent_state_v1.sql
CREATE OR REPLACE FUNCTION public.reserve_research_model_v1(p_role text,p_owner text,p_work_key text)
RETURNS SETOF public.research_model_reservations_v1
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_now timestamptz; v_day date; v_prior public.research_model_reservations_v1;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
  IF p_role NOT IN ('discovery','company_research','counter_review','technical','strategy_research','independent_test')
    OR length(trim(p_owner)) NOT BETWEEN 3 AND 120 OR length(p_work_key) NOT BETWEEN 3 AND 200
    OR p_owner IS NULL OR p_work_key IS NULL THEN RAISE EXCEPTION 'research_model_reservation_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(2409,6002);
  v_now:=clock_timestamp();
  v_day:=(v_now AT TIME ZONE 'Asia/Taipei')::date;
  SELECT * INTO v_prior FROM public.research_model_reservations_v1 WHERE role=p_role AND work_key=p_work_key;
  IF FOUND THEN
    IF v_prior.owner<>p_owner OR v_prior.lease_expires_at<=v_now
      OR EXISTS(SELECT 1 FROM public.research_model_completions_v1 WHERE reservation_id=v_prior.reservation_id)
      THEN RAISE EXCEPTION 'research_model_reservation_replay_closed'; END IF;
    RETURN NEXT v_prior; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.research_model_reservations_v1 r WHERE r.lease_expires_at>v_now
      AND NOT EXISTS(SELECT 1 FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id))
    OR (SELECT COALESCE(sum(reserved_seconds),0) FROM public.research_model_reservations_v1 WHERE taipei_day=v_day)+1800>7200
    OR NOT public.research_model_lease_fits_day_v1(v_now)
    THEN RETURN; END IF;
  RETURN QUERY INSERT INTO public.research_model_reservations_v1(role,owner,work_key,taipei_day,started_at,lease_expires_at)
    VALUES(p_role,p_owner,p_work_key,v_day,v_now,v_now+interval '30 minutes') RETURNING *;
END $function$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.validate_research_deep_scope_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r public.research_priority_runs_v1; c public.research_observed_companies_v1; s public.stocks; admission_clock timestamptz;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(2409,6001);admission_clock:=clock_timestamp();
  IF current_user='research_observed_rpc_owner' THEN
   SELECT admission_at INTO admission_clock FROM public.research_deep_admission_clocks_v1 WHERE run_id=NEW.priority_run_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'deep_scoped_admission_clock_missing';END IF;
  END IF;
  NEW.created_at:=admission_clock;NEW.week_start:=date_trunc('week',admission_clock AT TIME ZONE 'Asia/Taipei')::date;
 END IF;
 SELECT * INTO r FROM public.research_priority_runs_v1 WHERE run_id=NEW.priority_run_id;
 IF r.research_scope IS DISTINCT FROM NEW.research_scope OR r.observed_snapshot_hash IS DISTINCT FROM NEW.observed_snapshot_hash THEN RAISE EXCEPTION 'deep_scope_run_binding_invalid'; END IF;
 IF NEW.research_scope='research_observed_v1' THEN
  IF current_user<>'research_observed_rpc_owner' THEN RAISE EXCEPTION 'observed_job_requires_scoped_rpc'; END IF;
  SELECT * INTO c FROM public.research_observed_companies_v1 WHERE research_company_id=NEW.research_company_id;
  IF NOT FOUND OR c.symbol<>NEW.symbol THEN RAISE EXCEPTION 'deep_scope_company_invalid'; END IF;
 END IF;
 IF NEW.stock_id IS NOT NULL THEN
  SELECT * INTO s FROM public.stocks WHERE id=NEW.stock_id;
  IF NOT FOUND OR s.market<>'TW' OR s.symbol<>NEW.symbol THEN RAISE EXCEPTION 'deep_scope_stock_mapping_invalid'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.research_scope,OLD.research_company_id,OLD.observed_snapshot_hash,OLD.stock_id,OLD.symbol,OLD.priority_run_id,OLD.week_start,OLD.created_at) IS DISTINCT FROM (NEW.research_scope,NEW.research_company_id,NEW.observed_snapshot_hash,NEW.stock_id,NEW.symbol,NEW.priority_run_id,NEW.week_start,NEW.created_at) THEN RAISE EXCEPTION 'deep_scope_lineage_immutable'; END IF;
 RETURN NEW;
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.charge_research_deep_admission_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(2409,6001);
 IF (SELECT count(*)FROM public.research_deep_admission_charges_v1 WHERE admission_week=NEW.week_start)>=5 THEN RAISE EXCEPTION 'deep_admission_week_capacity'; END IF;
 INSERT INTO public.research_deep_admission_charges_v1(job_id,issuer_key,admission_at,admission_week) VALUES(NEW.job_id,'TW:'||NEW.symbol,NEW.created_at,NEW.week_start);
 RETURN NEW;
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.reconcile_research_deep_admissions_v1() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.research_deep_jobs_v1; wk date;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(2409,6001);
 FOR j IN SELECT jobs.* FROM public.research_deep_jobs_v1 jobs LEFT JOIN public.research_deep_admission_charges_v1 c USING(job_id) WHERE c.job_id IS NULL ORDER BY jobs.created_at,jobs.job_id LOOP
  IF j.created_at IS NULL OR j.created_at>clock_timestamp() OR j.symbol !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'deep_legacy_admission_ambiguous'; END IF;
  wk:=date_trunc('week',j.created_at AT TIME ZONE 'Asia/Taipei')::date;
  INSERT INTO public.research_deep_admission_charges_v1(job_id,issuer_key,admission_at,admission_week) VALUES(j.job_id,'TW:'||j.symbol,j.created_at,wk);
 END LOOP;
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.enqueue_research_deep_jobs_v1(p_run_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.research_priority_runs_v1; admission_clock timestamptz; wk date; used integer; added integer:=0; item jsonb; rank integer; stock uuid; company uuid; job uuid;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(2409,6001);admission_clock:=clock_timestamp();wk:=date_trunc('week',admission_clock AT TIME ZONE 'Asia/Taipei')::date;
 SELECT * INTO r FROM public.research_priority_runs_v1 WHERE run_id=p_run_id;
 IF NOT FOUND OR r.as_of>admission_clock OR jsonb_array_length(r.research_queue)>20 THEN RAISE EXCEPTION 'research_deep_priority_run_invalid'; END IF;
 IF r.research_scope='research_observed_v1' AND NOT EXISTS(SELECT 1 FROM public.research_observed_priority_store_receipts_v1 receipt WHERE receipt.run_id=r.run_id AND receipt.stored_run_hash=encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'observed_priority_store_lineage_missing';END IF;
 IF EXISTS(SELECT 1 FROM public.research_deep_run_admissions_v1 WHERE run_id=p_run_id) THEN RETURN 0; END IF;
 IF r.created_at<(SELECT installed_at FROM public.research_deep_admission_cutover_v1) THEN RAISE EXCEPTION 'deep_legacy_zero_admission_unproven'; END IF;
 INSERT INTO public.research_deep_admission_clocks_v1(run_id,admission_at,admission_week)VALUES(p_run_id,admission_clock,wk);
 PERFORM public.reconcile_research_deep_admissions_v1();
 SELECT count(*) INTO used FROM public.research_deep_admission_charges_v1 WHERE admission_week=wk;
 FOR item,rank IN SELECT value,ordinality::integer FROM jsonb_array_elements(r.research_queue)WITH ORDINALITY LOOP
  EXIT WHEN used>=5;
  IF item->>'disposition' NOT IN('queued','stale') OR coalesce((item->>'independentRootCount')::integer,0)<1 THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.research_deep_jobs_v1 WHERE symbol=item->>'symbol' AND status IN('queued','running')) OR EXISTS(SELECT 1 FROM public.research_deep_admission_charges_v1 WHERE issuer_key='TW:'||(item->>'symbol') AND admission_week=wk) THEN CONTINUE; END IF;
  stock:=NULL;company:=NULL;
  IF r.research_scope='formal_v1' THEN
   SELECT id INTO stock FROM public.stocks WHERE symbol=item->>'symbol' AND market='TW';
   IF stock IS NULL THEN RAISE EXCEPTION 'research_deep_stock_authority_missing'; END IF;
  ELSE
   SELECT research_company_id INTO company FROM public.research_observed_roster_members_v1 WHERE snapshot_hash=r.observed_snapshot_hash AND symbol=item->>'symbol';
   IF company IS NULL THEN RAISE EXCEPTION 'research_deep_observed_membership_missing'; END IF;
  END IF;
  INSERT INTO public.research_deep_jobs_v1(priority_run_id,stock_id,symbol,week_start,queue_rank,research_scope,research_company_id,observed_snapshot_hash,created_at)
   VALUES(p_run_id,stock,item->>'symbol',wk,rank,r.research_scope,company,r.observed_snapshot_hash,admission_clock) RETURNING job_id INTO job;
  used:=used+1;added:=added+1;
 END LOOP;
 INSERT INTO public.research_deep_run_admissions_v1(run_id,admission_at,admission_week,added_count) VALUES(p_run_id,admission_clock,wk,added);
 RETURN added;
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.store_observed_research_priority_v1(p_snapshot_hash text,p_as_of timestamptz,p_input_hash text,p_attempts jsonb,p_rows jsonb,p_queue jsonb,p_scope_receipt jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snap public.research_observed_roster_snapshots_v1; id uuid; member record; row jsonb; first_at timestamptz; added integer; captures integer:=0; existing public.research_priority_runs_v1; heads jsonb:='[]'; page jsonb; source_offset integer:=0; actual_first timestamptz;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(2409,6001);
 SELECT * INTO snap FROM public.research_observed_roster_snapshots_v1 WHERE snapshot_hash=p_snapshot_hash AND received_at<=p_as_of AND latest_observed_at<=p_as_of;
 IF NOT FOUND OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() OR p_input_hash IS NULL OR octet_length(coalesce(p_rows::text,''))+octet_length(coalesce(p_attempts::text,''))+octet_length(coalesce(p_scope_receipt::text,''))>16000000 OR p_input_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)<>snap.included_count OR jsonb_typeof(p_queue) IS DISTINCT FROM 'array' OR jsonb_array_length(p_queue)>20 OR jsonb_typeof(p_attempts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'observed_priority_input_invalid'; END IF;
 IF p_scope_receipt IS DISTINCT FROM (public.read_research_observed_roster_v1(p_snapshot_hash,p_as_of,0,1)-'members') THEN RAISE EXCEPTION 'observed_priority_receipt_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows)r LEFT JOIN public.research_observed_roster_members_v1 m ON m.snapshot_hash=p_snapshot_hash AND m.symbol=r->>'symbol' WHERE m.symbol IS NULL) OR (SELECT count(DISTINCT r->>'symbol')FROM jsonb_array_elements(p_rows)r)<>snap.included_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_queue)q WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows)r WHERE r @> q)) THEN RAISE EXCEPTION 'observed_priority_accounting_invalid'; END IF;
 SELECT * INTO existing FROM public.research_priority_runs_v1 WHERE policy_version='research-priority-v1' AND input_hash=p_input_hash;
 IF FOUND THEN
  IF existing.research_scope<>'research_observed_v1' OR existing.observed_snapshot_hash<>p_snapshot_hash OR existing.as_of<>p_as_of OR existing.rows<>p_rows OR existing.research_queue<>p_queue OR existing.source_attempts<>p_attempts OR existing.scope_receipt<>p_scope_receipt THEN RAISE EXCEPTION 'observed_priority_replay_mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.research_observed_priority_store_receipts_v1 receipt WHERE receipt.run_id=existing.run_id AND receipt.stored_run_hash=encode(sha256(convert_to(to_jsonb(existing)::text,'UTF8')),'hex'))THEN RAISE EXCEPTION 'observed_priority_store_lineage_missing';END IF;
  RETURN jsonb_build_object('runId',existing.run_id,'newDeepResearchJobs',0,'firstDiscoveryCaptures',0,'idempotentReplay',true);
 END IF;
 -- Verify claimed root identities against actual bounded database source heads.
 LOOP
  SELECT coalesce(jsonb_agg(value),'[]') INTO page FROM public.research_source_heads_page_v1(p_as_of,source_offset,500)value;
  heads:=heads||page;IF jsonb_array_length(heads)>20000 THEN RAISE EXCEPTION 'observed_source_head_bound'; END IF;
  EXIT WHEN jsonb_array_length(page)<500;source_offset:=source_offset+500;
 END LOOP;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(row->'rootIds') IS DISTINCT FROM 'array' OR jsonb_typeof(row->'independentRootCount') IS DISTINCT FROM 'number' OR row->>'independentRootCount' !~ '^[0-9]+$' OR (row->>'independentRootCount')::integer<>jsonb_array_length(row->'rootIds') OR (SELECT count(DISTINCT value)FROM jsonb_array_elements(row->'rootIds'))<>jsonb_array_length(row->'rootIds') THEN RAISE EXCEPTION 'observed_priority_root_count_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(row->'rootIds')root WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(heads)h WHERE h->'symbols' @> jsonb_build_array(row->'symbol') AND coalesce(h#>>'{metadata,subject_scope}','company_mentions')='company_mentions' AND coalesce(h#>>'{metadata,parent_source_url}',h#>>'{metadata,canonical_url}',split_part(h->>'document_url','#si-revision-',1))=root AND coalesce(h->>'content_semantics','')<>'metadata_only' AND coalesce(h#>>'{metadata,content_form}','')<>'chapter_titles' AND h#>>'{metadata,retracted_at}' IS NULL AND coalesce(h#>>'{metadata,claim_status}','')<>'denied')) THEN RAISE EXCEPTION 'observed_priority_source_binding_invalid'; END IF;
  SELECT min((h#>>'{metadata,first_observed_at}')::timestamptz) INTO actual_first FROM jsonb_array_elements(heads)h WHERE h->'symbols' @> jsonb_build_array(row->'symbol') AND coalesce(h#>>'{metadata,subject_scope}','company_mentions')='company_mentions' AND coalesce(h->>'content_semantics','')<>'metadata_only' AND coalesce(h#>>'{metadata,content_form}','')<>'chapter_titles';
  IF (row->'hasDiscoveryEvidence' IS DISTINCT FROM to_jsonb(actual_first IS NOT NULL)) OR (row->>'firstSeenAt')::timestamptz IS DISTINCT FROM actual_first THEN RAISE EXCEPTION 'observed_first_observation_binding_invalid'; END IF;
 END LOOP;
 INSERT INTO public.research_priority_runs_v1(as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue,research_scope,observed_snapshot_hash,scope_receipt)
  VALUES(p_as_of,'research-priority-v1',p_input_hash,snap.included_count,snap.included_count,p_attempts,p_rows,p_queue,'research_observed_v1',p_snapshot_hash,p_scope_receipt) RETURNING run_id INTO id;
 INSERT INTO public.research_observed_priority_store_receipts_v1(run_id,stored_run_hash)SELECT run_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')FROM public.research_priority_runs_v1 r WHERE run_id=id;
 FOR member IN SELECT * FROM public.research_observed_roster_members_v1 WHERE snapshot_hash=p_snapshot_hash LOOP
  SELECT value INTO row FROM jsonb_array_elements(p_rows) WHERE value->>'symbol'=member.symbol;
  IF coalesce((row->>'hasDiscoveryEvidence')::boolean,false) THEN
   first_at:=(row->>'firstSeenAt')::timestamptz;
   IF first_at IS NULL OR first_at>p_as_of THEN RAISE EXCEPTION 'observed_discovery_clock_invalid'; END IF;
   INSERT INTO public.research_observed_first_discoveries_v1(research_company_id,symbol,run_id,first_seen_at,snapshot,observed_snapshot_hash)
    VALUES(member.research_company_id,member.symbol,id,first_at,jsonb_build_object('price',NULL,'priceStatus','missing_at_discovery','pricePhase','unknown','relative5d',NULL,'relative20d',NULL,'relative60d',NULL,'factors',row->'factors','scope','research_observed_v1'),p_snapshot_hash)ON CONFLICT(research_company_id)DO NOTHING;
   IF FOUND THEN captures:=captures+1; END IF;
   INSERT INTO public.research_observed_discovery_lineage_v1(research_company_id,snapshot_hash,run_id)VALUES(member.research_company_id,p_snapshot_hash,id)ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 added:=public.enqueue_research_deep_jobs_v1(id);
 RETURN jsonb_build_object('runId',id,'newDeepResearchJobs',added,'firstDiscoveryCaptures',captures,'idempotentReplay',false);
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.reap_expired_research_deep_jobs_v2() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n timestamptz;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 PERFORM pg_advisory_xact_lock(2409,6002);n:=clock_timestamp();
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 SELECT r.reservation_id,r.owner,'failed',encode(sha256(convert_to('deep_lease_expired','UTF8')),'hex')FROM public.research_model_reservations_v1 r JOIN public.research_deep_jobs_v1 j ON r.role='company_research'AND r.work_key='deep:'||j.job_id||':'||j.attempts WHERE j.status='running'AND j.lease_expires_at<=n ON CONFLICT(reservation_id)DO NOTHING;
 UPDATE public.research_deep_jobs_v1 SET status=CASE WHEN attempts>=3 THEN 'failed'ELSE 'queued'END,terminal_reason=CASE WHEN attempts>=3 THEN 'lease_expired_max_attempts'ELSE terminal_reason END,lease_owner=NULL,lease_expires_at=NULL,finished_at=CASE WHEN attempts>=3 THEN n ELSE NULL END WHERE status='running'AND lease_expires_at<=n;
END $$;

-- Exact predecessor: migrations/20261008_research_observed_priority_v1.sql
CREATE OR REPLACE FUNCTION public.claim_research_deep_job_v1(p_owner TEXT)
RETURNS TABLE(job_id UUID, symbol TEXT, priority_run_id UUID, attempt INTEGER, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1; v_reservation uuid;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
  IF p_owner IS NULL OR length(trim(p_owner)) < 3 OR length(p_owner) > 120 THEN
    RAISE EXCEPTION 'research_deep_owner_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(2409, 6002);
  PERFORM public.reap_expired_research_deep_jobs_v2();
  IF EXISTS (SELECT 1 FROM public.research_deep_jobs_v1 WHERE status='running')
    OR (SELECT count(*) FROM public.research_deep_job_attempts_v1
       WHERE (claimed_at AT TIME ZONE 'Asia/Taipei')::date =
         (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) >= 4 THEN
    RETURN;
  END IF;
  SELECT * INTO v_job FROM public.research_deep_jobs_v1 AS jobs
    WHERE jobs.research_scope='formal_v1' AND jobs.status='queued' AND jobs.attempts < 3
    ORDER BY jobs.week_start, jobs.queue_rank, jobs.created_at, jobs.job_id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT reservation_id INTO v_reservation FROM public.reserve_research_model_v1(
    'company_research',p_owner,'deep:'||v_job.job_id||':'||(v_job.attempts+1)::text);
  IF v_reservation IS NULL THEN RETURN; END IF;
  UPDATE public.research_deep_jobs_v1 SET status='running', attempts=attempts+1,
    lease_owner=p_owner, lease_expires_at=clock_timestamp()+interval '30 minutes'
    WHERE research_deep_jobs_v1.job_id=v_job.job_id
    RETURNING * INTO v_job;
  INSERT INTO public.research_deep_job_attempts_v1(job_id,attempt,owner,lease_expires_at)
    VALUES (v_job.job_id,v_job.attempts,p_owner,v_job.lease_expires_at);
  RETURN QUERY SELECT v_job.job_id,v_job.symbol,v_job.priority_run_id,v_job.attempts,v_job.lease_expires_at;
END $function$;

-- Exact predecessor: migrations/20261008_research_observed_claim_v2.sql
CREATE OR REPLACE FUNCTION public.claim_research_observed_job_v2(p_owner text,p_snapshot_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.research_deep_jobs_v1;m public.research_model_reservations_v1;
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9:_-]{3,120}$' OR p_snapshot_hash IS NULL OR p_snapshot_hash !~ '^[a-f0-9]{64}$'THEN RAISE EXCEPTION 'observed_claim_identity_invalid';END IF;
 PERFORM pg_advisory_xact_lock(2409,6002);
 PERFORM public.reap_expired_research_deep_jobs_v2();
 IF EXISTS(SELECT 1 FROM public.research_deep_jobs_v1 WHERE status='running'AND lease_expires_at>clock_timestamp())THEN RETURN NULL;END IF;
 SELECT *INTO j FROM public.research_deep_jobs_v1 WHERE research_scope='research_observed_v1'AND observed_snapshot_hash=p_snapshot_hash AND status='queued'AND attempts<3 ORDER BY week_start,queue_rank,created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT *INTO m FROM public.reserve_research_model_v1('company_research',p_owner,'deep:'||j.job_id||':'||(j.attempts+1));IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.research_deep_jobs_v1 SET status='running',attempts=attempts+1,lease_owner=p_owner,lease_expires_at=m.lease_expires_at WHERE job_id=j.job_id RETURNING *INTO j;
 INSERT INTO public.research_deep_job_attempts_v1(job_id,attempt,owner,lease_expires_at)VALUES(j.job_id,j.attempts,p_owner,j.lease_expires_at);
 RETURN public.read_research_observed_claim_v2(p_owner,p_snapshot_hash,j.job_id,j.attempts);
END $$;

COMMIT;
