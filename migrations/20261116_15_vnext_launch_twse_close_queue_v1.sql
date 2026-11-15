-- Store 11764 in the existing licensed queue. Generic price/volume facts
-- and public rank readers cannot consume these close-only observations.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

ALTER TABLE public.vnext_launch_csv_bindings_v1 DROP CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_bindings_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764));
ALTER TABLE public.vnext_launch_csv_captures_v1 DROP CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check,
 ADD CONSTRAINT vnext_launch_csv_captures_v1_dataset_id_check CHECK(dataset_id IN(11370,11371,11856,11391,11755,11743,11764));

CREATE INDEX vnext_launch_csv_bindings_generation_dataset_v1 ON public.vnext_launch_csv_bindings_v1(capture_generation,dataset_id);

CREATE TABLE public.vnext_launch_twse_close_scope_v1(
 capture_id uuid PRIMARY KEY REFERENCES public.vnext_launch_csv_captures_v1,
 report_day date NOT NULL, selection_day date NOT NULL,
 session_authority_id uuid NOT NULL,
 selection_cutoff timestamptz NOT NULL, prepared_at timestamptz NOT NULL,
 calendar_revision text NOT NULL CHECK(calendar_revision~'^[a-f0-9]{64}$'),
 roster_hash text NOT NULL CHECK(roster_hash~'^[a-f0-9]{64}$'),
 roster_count integer NOT NULL CHECK(roster_count BETWEEN 1 AND 20000),
 fact_count integer NOT NULL CHECK(fact_count BETWEEN 1 AND 5000 AND fact_count<=roster_count),
 CHECK(report_day<=selection_day AND prepared_at>=selection_cutoff),
 UNIQUE(capture_id,report_day)
);
CREATE TABLE public.vnext_launch_twse_close_facts_v1(
 capture_id uuid NOT NULL,
 session_date date NOT NULL,stock_id uuid NOT NULL, symbol text NOT NULL CHECK(symbol~'^[0-9]{4}$'),
 report_instrument_authority_id uuid NOT NULL,
 raw_close numeric CHECK(raw_close>0 AND raw_close<=9007199254740991),
 fact_hash text NOT NULL CHECK(fact_hash~'^[a-f0-9]{64}$'),
 PRIMARY KEY(capture_id,stock_id),UNIQUE(capture_id,symbol),
 FOREIGN KEY(capture_id,session_date) REFERENCES public.vnext_launch_twse_close_scope_v1(capture_id,report_day)
);
DO $close_owners$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['vnext_launch_twse_close_scope_v1','vnext_launch_twse_close_facts_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',relation_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',relation_name);
  EXECUTE format('CREATE TRIGGER twse_close_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',relation_name);
  EXECUTE format('CREATE TRIGGER twse_close_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',relation_name);
  EXECUTE format('CREATE TRIGGER twse_close_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',relation_name);
 END LOOP;
END $close_owners$;


DO $apply_0$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_profile_v1(integer,text)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'e1e5b3b0fd522e458abdfd983ab622459ec3d171f48605b0c87677911fa3535d'
  THEN RAISE EXCEPTION 'launch_twse_close_predecessor_changed:vnext_launch_csv_profile_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$BEGIN
 IF dataset NOT IN$b0$,$a0$BEGIN
 IF dataset=11764 THEN
  IF request_key IS NULL OR request_key !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;
  day:=request_key::date;
  IF to_char(day,'YYYY-MM-DD') IS DISTINCT FROM request_key THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;
  RETURN public.vnext_launch_twse_close_profile_v1(day)||jsonb_build_object('requestKey',request_key,'queueDataset','daily_price',
   'maximumBytes',500000,'maximumRows',5001);
 END IF;
 IF dataset NOT IN$a0$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM '189b6c7c9a050fd861589492c2fc1d9dd4cfec62171f91d43e0f7b0d55cbfb90'
  THEN RAISE EXCEPTION 'launch_twse_close_successor_changed:vnext_launch_csv_profile_v1';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_twse_close_metadata_changed:vnext_launch_csv_profile_v1';END IF;
END $apply_0$;

DO $apply_1$
DECLARE target oid:=to_regprocedure('public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)');
 original text;definition text;metadata jsonb;changed text;seam record;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'dda5c8c2021592aaaa5584b44dd6b01c9d4110d65f1f86095ac2ec8974fdbc09'
  THEN RAISE EXCEPTION 'launch_twse_close_predecessor_changed:vnext_launch_csv_command_v1';END IF;
 changed:=original;
 FOR seam IN SELECT * FROM(VALUES
  ($b0$flow_calendar jsonb; flow_close timestamptz;$b0$,$a0$flow_calendar jsonb; flow_close timestamptz; twse_prepared jsonb;$a0$),
  ($b1$  -- At most one immutable capture generation per resource and real Taipei day.$b1$,$a1$  IF (profile->>'datasetId')::integer=11764 THEN
   IF NOT EXISTS(SELECT FROM public.vnext_sessions_v1 WHERE session_date=(at AT TIME ZONE 'Asia/Taipei')::date
      AND completed AND close_at<=at)
    OR NOT EXISTS(
     SELECT FROM jsonb_array_elements(public.vnext_launch_calendar_v1('TWSE',(at AT TIME ZONE 'Asia/Taipei')::date,statement_timestamp(),240)->'sessions')
      WITH ORDINALITY r(value,ordinal) WHERE ordinal>210 AND value->>'session_id'=profile->>'sessionDate'
    ) THEN RAISE EXCEPTION 'launch_twse_close_verified_scope_required';END IF;
  END IF;
  -- At most one immutable capture generation per resource and real Taipei day.$a1$),
  ($b2$IF binding.job_id IS NOT NULL THEN RETURN jsonb_build_object('bound',true,'jobId',binding.job_id,'bindingHash',digest,'replay',true);END IF;
$b2$,$a2$IF binding.job_id IS NOT NULL THEN RETURN jsonb_build_object('bound',true,'jobId',binding.job_id,'bindingHash',digest,'replay',true);END IF;
  IF (SELECT count(*) FROM public.vnext_launch_csv_bindings_v1
   WHERE capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)>=200 THEN
   RAISE EXCEPTION 'launch_csv_plan_bound';
  END IF;
  IF (profile->>'datasetId')::integer=11764 AND (SELECT count(*) FROM public.vnext_launch_csv_bindings_v1
   WHERE dataset_id=11764 AND capture_generation=(at AT TIME ZONE 'Asia/Taipei')::date)>=30 THEN
   RAISE EXCEPTION 'launch_twse_close_capture_day_bound';
  END IF;
$a2$),
  ($b3$  at:=clock_timestamp();
  INSERT INTO public.vnext_launch_csv_ready_acks_v1$b3$,$a3$  IF capture.dataset_id=11764 AND NOT EXISTS(
   SELECT FROM public.vnext_launch_twse_close_scope_v1 scope, public.vnext_source_policies_v1 rights_row
   WHERE scope.capture_id=capture.capture_id AND scope.roster_hash=capture.pool_revision
    AND rights_row.source='official' AND rights_row.scope='official_original' AND rights_row.enabled AND rights_row.valid_until>clock_timestamp()
    AND capture.rights_binding_hash=public.vnext_launch_csv_hash_v1(jsonb_build_array('twse-11764-private-close-purpose-v1',
     public.vnext_launch_twse_close_profile_v1(capture.request_key::date),to_jsonb(rights_row)))
    AND scope.fact_count=(SELECT count(*) FROM public.vnext_launch_twse_close_facts_v1 f WHERE f.capture_id=capture.capture_id)
  ) THEN RAISE EXCEPTION 'launch_twse_close_scope_or_rights_changed';END IF;
  at:=clock_timestamp();
  INSERT INTO public.vnext_launch_csv_ready_acks_v1$a3$),
  ($b4$  derived:=public.vnext_launch_csv_derive_v1(binding.dataset_id,binding.request_key,p_body);$b4$,$a4$  IF binding.dataset_id=11764 THEN
   IF lower(btrim(split_part(p_request->>'contentType',';',1)))<>'text/csv'
    OR binding.capture_generation IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Taipei')::date
    THEN RAISE EXCEPTION 'launch_twse_close_wrong_capture_generation';END IF;
   twse_prepared:=public.vnext_launch_twse_close_prepare_v1(binding.request_key::date,binding.capture_generation,
    statement_timestamp(),observed,artifact,p_body);
   IF twse_prepared IS NULL THEN RAISE EXCEPTION 'launch_twse_close_prepare_required';END IF;
   derived:=jsonb_build_object('headerHash',public.vnext_launch_csv_hash_v1(profile->'header'),'rowCount',twse_prepared->'reportedRows',
    'pool',jsonb_build_object('revision',twse_prepared->>'registeredRosterManifestHash','targets','[]'::jsonb),'facts','[]'::jsonb);
  ELSE
   derived:=public.vnext_launch_csv_derive_v1(binding.dataset_id,binding.request_key,p_body);
  END IF;$a4$),
  ($b5$(derived->>'rowCount')::integer,policy->>'rightsBindingHash',$b5$,$a5$(derived->>'rowCount')::integer,coalesce(twse_prepared->>'rightsBindingHash',policy->>'rightsBindingHash'),$a5$),
  ($b6$  IF binding.dataset_id=11743 THEN
   fact:=derived->'marketFact';$b6$,$a6$  IF binding.dataset_id=11764 THEN
   INSERT INTO public.vnext_launch_twse_close_scope_v1(capture_id,report_day,selection_day,session_authority_id,
    selection_cutoff,prepared_at,calendar_revision,roster_hash,roster_count,fact_count)
   VALUES(capture.capture_id,binding.request_key::date,binding.capture_generation,(twse_prepared->>'sessionAuthorityId')::uuid,
    (twse_prepared->>'selectionCutoff')::timestamptz,(twse_prepared->>'preparedAt')::timestamptz,twse_prepared->>'calendarRevision',
    capture.pool_revision,(twse_prepared->>'registeredRosterCount')::integer,jsonb_array_length(twse_prepared->'facts'));
   INSERT INTO public.vnext_launch_twse_close_facts_v1(capture_id,session_date,stock_id,symbol,report_instrument_authority_id,raw_close,fact_hash)
   SELECT capture.capture_id,binding.request_key::date,(value->>'stockId')::uuid,value->>'symbol',
    (value->>'reportInstrumentAuthorityId')::uuid,(value->>'rawClose')::numeric,public.vnext_launch_csv_hash_v1(value)
   FROM jsonb_array_elements(twse_prepared->'facts');
  END IF;
  IF binding.dataset_id=11743 THEN
   fact:=derived->'marketFact';$a6$),
  ($b7$CASE WHEN binding.dataset_id=11743 THEN 1 ELSE (SELECT count(*) FROM public.vnext_launch_csv_facts_v1 WHERE capture_id=capture.capture_id) END$b7$,$a7$CASE WHEN binding.dataset_id=11743 THEN 1 WHEN binding.dataset_id=11764 THEN jsonb_array_length(twse_prepared->'facts')
    ELSE (SELECT count(*) FROM public.vnext_launch_csv_facts_v1 WHERE capture_id=capture.capture_id) END$a7$)
 ) tokens(before_text,after_text) LOOP
  changed:=replace(changed,seam.before_text,seam.after_text);
 END LOOP;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM 'b0de5782c8099e71a1d1492e7c602dcf36ad469a1e0aff5705020d7654dc2d93'
  THEN RAISE EXCEPTION 'launch_twse_close_successor_changed:vnext_launch_csv_command_v1';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_twse_close_metadata_changed:vnext_launch_csv_command_v1';END IF;
END $apply_1$;

COMMIT;
