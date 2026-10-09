BEGIN;
SELECT pg_advisory_xact_lock(2409,6001);
ALTER TABLE public.research_priority_runs_v1
 ADD COLUMN research_scope text NOT NULL DEFAULT 'formal_v1',
 ADD COLUMN observed_snapshot_hash text REFERENCES public.research_observed_roster_snapshots_v1(snapshot_hash),
 ADD COLUMN scope_receipt jsonb,
 ADD CONSTRAINT research_priority_scope_v1 CHECK (
  (research_scope='formal_v1' AND observed_snapshot_hash IS NULL AND scope_receipt IS NULL) OR
  (research_scope='research_observed_v1' AND observed_snapshot_hash IS NOT NULL AND jsonb_typeof(scope_receipt)='object'));
-- RLS bypass does not grant permission to manufacture an observed run.
CREATE FUNCTION public.fence_observed_priority_insert_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.research_scope='research_observed_v1' AND current_user<>'research_observed_rpc_owner' THEN RAISE EXCEPTION 'observed_priority_requires_scoped_store';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observed_priority_store_fence_v1 BEFORE INSERT ON public.research_priority_runs_v1 FOR EACH ROW EXECUTE FUNCTION public.fence_observed_priority_insert_v1();
REVOKE ALL ON FUNCTION public.fence_observed_priority_insert_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.research_observed_priority_store_receipts_v1 (
 run_id uuid PRIMARY KEY REFERENCES public.research_priority_runs_v1(run_id),
 stored_run_hash text NOT NULL CHECK(stored_run_hash~'^[a-f0-9]{64}$'),
 stored_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A single clock is captured inside the admission lock and reused by every
-- job/charge in that transaction, even if the loop crosses Taipei Monday.
CREATE TABLE public.research_deep_admission_clocks_v1 (
 run_id uuid PRIMARY KEY REFERENCES public.research_priority_runs_v1(run_id),
 admission_at timestamptz NOT NULL,admission_week date NOT NULL,
 CHECK(isfinite(admission_at) AND admission_week=date_trunc('week',admission_at AT TIME ZONE 'Asia/Taipei')::date)
);
ALTER TABLE public.research_deep_jobs_v1
 ALTER COLUMN stock_id DROP NOT NULL,
 ADD COLUMN research_scope text NOT NULL DEFAULT 'formal_v1',
 ADD COLUMN research_company_id uuid REFERENCES public.research_observed_companies_v1(research_company_id),
 ADD COLUMN observed_snapshot_hash text,
 ADD CONSTRAINT deep_observed_member_v1 FOREIGN KEY(observed_snapshot_hash,research_company_id) REFERENCES public.research_observed_roster_members_v1(snapshot_hash,research_company_id),
 ADD CONSTRAINT deep_job_scope_v1 CHECK (
  (research_scope='formal_v1' AND stock_id IS NOT NULL AND research_company_id IS NULL AND observed_snapshot_hash IS NULL) OR
  (research_scope='research_observed_v1' AND research_company_id IS NOT NULL AND observed_snapshot_hash IS NOT NULL));
CREATE TABLE public.research_observed_first_discoveries_v1 (
 research_company_id uuid PRIMARY KEY REFERENCES public.research_observed_companies_v1(research_company_id),
 symbol text NOT NULL,run_id uuid NOT NULL REFERENCES public.research_priority_runs_v1(run_id),
 first_seen_at timestamptz NOT NULL,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 observed_snapshot_hash text NOT NULL,
 FOREIGN KEY(observed_snapshot_hash,research_company_id) REFERENCES public.research_observed_roster_members_v1(snapshot_hash,research_company_id)
);
CREATE TABLE public.research_observed_discovery_lineage_v1 (
 research_company_id uuid NOT NULL REFERENCES public.research_observed_first_discoveries_v1(research_company_id),
 snapshot_hash text NOT NULL REFERENCES public.research_observed_roster_snapshots_v1(snapshot_hash),
 run_id uuid NOT NULL REFERENCES public.research_priority_runs_v1(run_id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(research_company_id,snapshot_hash,run_id)
);
CREATE TABLE public.research_deep_admission_charges_v1 (
 job_id uuid PRIMARY KEY REFERENCES public.research_deep_jobs_v1(job_id),
 issuer_key text NOT NULL CHECK(issuer_key ~ '^TW:[0-9]{4}$'),
 admission_at timestamptz NOT NULL,admission_week date NOT NULL,
 UNIQUE(issuer_key,admission_week),
 CHECK(admission_week=(date_trunc('week',admission_at AT TIME ZONE 'Asia/Taipei'))::date)
);
CREATE TABLE public.research_deep_run_admissions_v1 (
 run_id uuid PRIMARY KEY REFERENCES public.research_priority_runs_v1(run_id),
 admission_at timestamptz NOT NULL,admission_week date NOT NULL,added_count integer NOT NULL CHECK(added_count BETWEEN 0 AND 5),
 CHECK(admission_week=(date_trunc('week',admission_at AT TIME ZONE 'Asia/Taipei'))::date)
);
CREATE TABLE public.research_deep_admission_cutover_v1 (
 singleton boolean PRIMARY KEY CHECK(singleton),installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.research_deep_admission_cutover_v1(singleton) VALUES(true);
CREATE FUNCTION public.validate_research_deep_scope_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r public.research_priority_runs_v1; c public.research_observed_companies_v1; s public.stocks; admission_clock timestamptz;
BEGIN
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
CREATE TRIGGER research_deep_scope_binding_v1 BEFORE INSERT OR UPDATE ON public.research_deep_jobs_v1 FOR EACH ROW EXECUTE FUNCTION public.validate_research_deep_scope_v1();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['research_observed_priority_store_receipts_v1','research_deep_admission_clocks_v1','research_observed_first_discoveries_v1','research_observed_discovery_lineage_v1','research_deep_admission_charges_v1','research_deep_run_admissions_v1','research_deep_admission_cutover_v1'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_research_observed_mutation_v1()','immutable_observed_'||table_name,table_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO research_observed_rpc_owner',table_name);
  EXECUTE format('CREATE POLICY observed_rpc_only ON public.%I TO research_observed_rpc_owner USING(true) WITH CHECK(true)',table_name);
 END LOOP;
END $$;
-- Research first prices can only be read by the exact internal service; no direct write grant.
GRANT SELECT ON public.research_observed_first_discoveries_v1 TO service_role;
CREATE POLICY observed_first_read ON public.research_observed_first_discoveries_v1 FOR SELECT TO service_role USING(true);
GRANT SELECT ON public.stocks,public.research_priority_runs_v1,public.research_deep_jobs_v1 TO research_observed_rpc_owner;
GRANT INSERT ON public.research_priority_runs_v1,public.research_deep_jobs_v1 TO research_observed_rpc_owner;
CREATE POLICY observed_priority_rpc ON public.research_priority_runs_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
CREATE POLICY observed_job_rpc ON public.research_deep_jobs_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
-- All inserts, including legacy formal writers, are charged at the authoritative
-- admission clock; a caller-created past created_at/week cannot escape the cap.
CREATE FUNCTION public.charge_research_deep_admission_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2409,6001);
 IF (SELECT count(*)FROM public.research_deep_admission_charges_v1 WHERE admission_week=NEW.week_start)>=5 THEN RAISE EXCEPTION 'deep_admission_week_capacity'; END IF;
 INSERT INTO public.research_deep_admission_charges_v1(job_id,issuer_key,admission_at,admission_week) VALUES(NEW.job_id,'TW:'||NEW.symbol,NEW.created_at,NEW.week_start);
 RETURN NEW;
END $$;
ALTER FUNCTION public.charge_research_deep_admission_v1() OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.charge_research_deep_admission_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER charge_every_research_deep_insert_v1 AFTER INSERT ON public.research_deep_jobs_v1 FOR EACH ROW EXECUTE FUNCTION public.charge_research_deep_admission_v1();
GRANT EXECUTE ON FUNCTION public.research_source_heads_page_v1(timestamptz,integer,integer) TO research_observed_rpc_owner;
CREATE FUNCTION public.read_research_observed_roster_v1(p_snapshot_hash text,p_as_of timestamptz,p_offset integer,p_limit integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.research_observed_roster_snapshots_v1; members jsonb;
BEGIN
 IF p_offset IS NULL OR p_limit IS NULL OR p_offset<0 OR p_offset>5000 OR p_limit<1 OR p_limit>500 OR p_as_of IS NULL OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'observed_roster_read_invalid'; END IF;
 SELECT * INTO r FROM public.research_observed_roster_snapshots_v1 WHERE snapshot_hash=p_snapshot_hash AND received_at<=p_as_of AND latest_observed_at<=p_as_of;
 IF NOT FOUND THEN RAISE EXCEPTION 'observed_snapshot_missing_or_future'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.symbol),'[]') INTO members FROM (
  SELECT x.research_company_id,x.symbol,x.exchange,x.isin,x.observed_name AS name,x.observed_sector AS sector,x.cfi,x.observed_at FROM public.research_observed_roster_members_v1 x WHERE snapshot_hash=p_snapshot_hash ORDER BY symbol LIMIT p_limit OFFSET p_offset)m;
 RETURN jsonb_build_object('snapshotHash',r.snapshot_hash,'mappingDigest',r.mapping_digest,'classifierHash',r.classifier_hash,'classificationHash',r.classification_hash,'schemaVersion',r.schema_version,'receivedAt',r.received_at,'latestObservedAt',r.latest_observed_at,'includedCount',r.included_count,'members',members);
END $$;
CREATE FUNCTION public.reconcile_research_deep_admissions_v1() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.research_deep_jobs_v1; wk date;
BEGIN
 PERFORM pg_advisory_xact_lock(2409,6001);
 FOR j IN SELECT jobs.* FROM public.research_deep_jobs_v1 jobs LEFT JOIN public.research_deep_admission_charges_v1 c USING(job_id) WHERE c.job_id IS NULL ORDER BY jobs.created_at,jobs.job_id LOOP
  IF j.created_at IS NULL OR j.created_at>clock_timestamp() OR j.symbol !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'deep_legacy_admission_ambiguous'; END IF;
  wk:=date_trunc('week',j.created_at AT TIME ZONE 'Asia/Taipei')::date;
  INSERT INTO public.research_deep_admission_charges_v1(job_id,issuer_key,admission_at,admission_week) VALUES(j.job_id,'TW:'||j.symbol,j.created_at,wk);
 END LOOP;
END $$;
SELECT public.reconcile_research_deep_admissions_v1();
-- Already admitted runs retain their original server clock, not the caller's historical as_of.
INSERT INTO public.research_deep_run_admissions_v1(run_id,admission_at,admission_week,added_count)
 SELECT priority_run_id,min(created_at),date_trunc('week',min(created_at) AT TIME ZONE 'Asia/Taipei')::date,count(*) FROM public.research_deep_jobs_v1 GROUP BY priority_run_id;
CREATE OR REPLACE FUNCTION public.enqueue_research_deep_jobs_v1(p_run_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.research_priority_runs_v1; admission_clock timestamptz; wk date; used integer; added integer:=0; item jsonb; rank integer; stock uuid; company uuid; job uuid;
BEGIN
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
CREATE FUNCTION public.store_observed_research_priority_v1(p_snapshot_hash text,p_as_of timestamptz,p_input_hash text,p_attempts jsonb,p_rows jsonb,p_queue jsonb,p_scope_receipt jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snap public.research_observed_roster_snapshots_v1; id uuid; member record; row jsonb; first_at timestamptz; added integer; captures integer:=0; existing public.research_priority_runs_v1; heads jsonb:='[]'; page jsonb; source_offset integer:=0; actual_first timestamptz;
BEGIN
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
-- Every admission RPC shares the same lock/ledger; direct table mutation remains closed.
ALTER FUNCTION public.read_research_observed_roster_v1(text,timestamptz,integer,integer) OWNER TO research_observed_rpc_owner;
ALTER FUNCTION public.reconcile_research_deep_admissions_v1() OWNER TO research_observed_rpc_owner;
ALTER FUNCTION public.enqueue_research_deep_jobs_v1(uuid) OWNER TO research_observed_rpc_owner;
ALTER FUNCTION public.store_observed_research_priority_v1(text,timestamptz,text,jsonb,jsonb,jsonb,jsonb) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.read_research_observed_roster_v1(text,timestamptz,integer,integer),public.reconcile_research_deep_admissions_v1(),public.enqueue_research_deep_jobs_v1(uuid),public.store_observed_research_priority_v1(text,timestamptz,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_research_observed_roster_v1(text,timestamptz,integer,integer),public.enqueue_research_deep_jobs_v1(uuid),public.store_observed_research_priority_v1(text,timestamptz,text,jsonb,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_research_deep_admissions_v1(),public.enqueue_research_deep_jobs_v1(uuid) TO research_observed_rpc_owner;
CREATE FUNCTION public.reap_expired_research_deep_jobs_v2() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(2409,6002);n:=clock_timestamp();
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 SELECT r.reservation_id,r.owner,'failed',encode(sha256(convert_to('deep_lease_expired','UTF8')),'hex')FROM public.research_model_reservations_v1 r JOIN public.research_deep_jobs_v1 j ON r.role='company_research'AND r.work_key='deep:'||j.job_id||':'||j.attempts WHERE j.status='running'AND j.lease_expires_at<=n ON CONFLICT(reservation_id)DO NOTHING;
 UPDATE public.research_deep_jobs_v1 SET status=CASE WHEN attempts>=3 THEN 'failed'ELSE 'queued'END,terminal_reason=CASE WHEN attempts>=3 THEN 'lease_expired_max_attempts'ELSE terminal_reason END,lease_owner=NULL,lease_expires_at=NULL,finished_at=CASE WHEN attempts>=3 THEN n ELSE NULL END WHERE status='running'AND lease_expires_at<=n;
END $$;
ALTER FUNCTION public.reap_expired_research_deep_jobs_v2() OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.reap_expired_research_deep_jobs_v2() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_expired_research_deep_jobs_v2() TO service_role;
GRANT UPDATE ON public.research_deep_jobs_v1 TO research_observed_rpc_owner;
-- In the complete production schema these tables already exist. The partial
-- local profile installs the same grants/policies with the claim dependency.
DO $$ BEGIN IF to_regclass('public.research_model_reservations_v1')IS NOT NULL THEN
 GRANT SELECT ON public.research_model_reservations_v1,public.research_model_completions_v1 TO research_observed_rpc_owner;
 GRANT INSERT ON public.research_model_completions_v1 TO research_observed_rpc_owner;
 CREATE POLICY observed_expiry_reservation ON public.research_model_reservations_v1 FOR SELECT TO research_observed_rpc_owner USING(true);
 CREATE POLICY observed_expiry_completion ON public.research_model_completions_v1 TO research_observed_rpc_owner USING(true)WITH CHECK(true);
END IF;END $$;
CREATE OR REPLACE FUNCTION public.claim_research_deep_job_v1(p_owner TEXT)
RETURNS TABLE(job_id UUID, symbol TEXT, priority_run_id UUID, attempt INTEGER, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_job public.research_deep_jobs_v1; v_reservation uuid;
BEGIN
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
REVOKE ALL ON FUNCTION public.claim_research_deep_job_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_research_deep_job_v1(text) TO service_role;
COMMIT;
