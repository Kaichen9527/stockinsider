BEGIN;
-- Candidate migration only. No scheduler, legacy constant or production data changes.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner') THEN
 CREATE ROLE stockinsider_vnext_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 ELSE IF EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconfig IS NOT NULL
  OR EXISTS(SELECT FROM pg_auth_members membership WHERE membership.member=pg_roles.oid OR membership.roleid=pg_roles.oid)
  OR EXISTS(SELECT FROM pg_db_role_setting settings WHERE settings.setrole=pg_roles.oid AND settings.setconfig IS NOT NULL))) THEN RAISE EXCEPTION 'vnext_owner_role_drift'; END IF;
 END IF;
 IF to_regprocedure('public.enforce_production_writer_fence()') IS NULL THEN RAISE EXCEPTION 'vnext_existing_writer_fence_required'; END IF;
 END $$;
GRANT USAGE ON SCHEMA public TO stockinsider_vnext_owner;
CREATE TABLE public.vnext_principals_v1(principal text PRIMARY KEY, role text NOT NULL CHECK(role IN('operator','author','reviewer')), enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.vnext_sessions_v1(session_date date PRIMARY KEY,close_at timestamptz NOT NULL,completed boolean NOT NULL DEFAULT false);
CREATE TABLE public.vnext_members_v1(symbol text PRIMARY KEY CHECK(symbol ~ '^[0-9]{4}$'), state text NOT NULL CHECK(state IN('researching','waiting','eligible','exited')),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), evidence jsonb NOT NULL, admitted_session date NOT NULL REFERENCES public.vnext_sessions_v1,
 contraindication boolean NOT NULL DEFAULT false, last_failure_hash text, failures integer NOT NULL DEFAULT 0, exit_reason text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_jobs_v1(job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_key text NOT NULL UNIQUE, symbol text NOT NULL REFERENCES public.vnext_members_v1,
 input_hash text NOT NULL, admission_hash text NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','authored','reviewing','published','failed','rejected')),
 session_date date NOT NULL REFERENCES public.vnext_sessions_v1, retry_of uuid REFERENCES public.vnext_jobs_v1, attempt_no integer NOT NULL DEFAULT 0 CHECK(attempt_no BETWEEN 0 AND 1),
 execution_id uuid, author_principal text, reviewer_execution uuid, reviewer_principal text, sources_read_at timestamptz,
 started_at timestamptz, deadline_at timestamptz, finished_at timestamptz, author_result jsonb, reviewer_result jsonb, error text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX vnext_one_input_job_v1 ON public.vnext_jobs_v1(symbol,input_hash) WHERE retry_of IS NULL;
CREATE TABLE public.vnext_preparations_v1(job_id uuid PRIMARY KEY REFERENCES public.vnext_jobs_v1,admission_hash text NOT NULL,input_hash text NOT NULL,evidence jsonb NOT NULL,frozen_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_publications_v1(revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL UNIQUE REFERENCES public.vnext_jobs_v1,
 symbol text NOT NULL, input_hash text NOT NULL, content jsonb NOT NULL,citations jsonb NOT NULL DEFAULT '[]'::jsonb,qualification jsonb NOT NULL DEFAULT '{"qualified":false,"gaps":["authority_not_verified"]}'::jsonb,
 published_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_qualifications_v1(job_id uuid PRIMARY KEY REFERENCES public.vnext_jobs_v1,input_hash text NOT NULL,proof jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_home_v1(version uuid PRIMARY KEY DEFAULT gen_random_uuid(), market jsonb NOT NULL, members jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_audit_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,principal text NOT NULL,command text NOT NULL,request jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_content_v1(content_hash text PRIMARY KEY,source text NOT NULL,processing_date date NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date,session_date date NOT NULL REFERENCES public.vnext_sessions_v1,claim jsonb NOT NULL,parsed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_mode_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,legacy_fenced boolean NOT NULL DEFAULT false);
INSERT INTO public.vnext_mode_v1 DEFAULT VALUES;
CREATE TABLE public.vnext_screening_v1(session_date date NOT NULL REFERENCES public.vnext_sessions_v1,symbol text NOT NULL,input jsonb NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(session_date,symbol));
CREATE TABLE public.vnext_weekly_audits_v1(week_start date PRIMARY KEY,session_date date NOT NULL,symbols jsonb NOT NULL,gaps jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.vnext_confirmations_v1(challenger text NOT NULL,incumbent text NOT NULL,policy text NOT NULL,last_session date NOT NULL,count integer NOT NULL,PRIMARY KEY(challenger,incumbent,policy));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['vnext_principals_v1','vnext_sessions_v1','vnext_members_v1','vnext_jobs_v1','vnext_preparations_v1','vnext_publications_v1','vnext_qualifications_v1','vnext_home_v1','vnext_audit_v1','vnext_content_v1','vnext_confirmations_v1','vnext_mode_v1','vnext_screening_v1','vnext_weekly_audits_v1'] LOOP
 EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',t);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',t);
 END LOOP; END $$;

CREATE FUNCTION public.vnext_refresh_home_v1() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 INSERT INTO public.vnext_home_v1(market,members)
 SELECT coalesce((SELECT market FROM public.vnext_home_v1 ORDER BY published_at DESC,version DESC LIMIT 1),'{"risk":"unknown","confidence":null,"gaps":["market_not_published"],"session":null}'::jsonb),
 coalesce((SELECT jsonb_agg(jsonb_build_object('symbol',m.symbol,'state',m.state,'inputHash',m.input_hash,'eventAt',m.evidence->'eventAt','reasons',coalesce(m.evidence->'reasons','[]'::jsonb),'gaps',coalesce(m.evidence->'gaps','[]'::jsonb),
  'score',m.evidence->'initialScore','revisionId',p.revision_id,'publishedAt',p.published_at,'content',p.content,'publishedInputHash',p.input_hash,'citations',p.citations,'qualification',p.qualification,'statusReason',m.exit_reason)
  ORDER BY coalesce((m.evidence->'initialScore'->>'confirmedPoints')::numeric,0) DESC,coalesce((m.evidence->'initialScore'->>'availableWeight')::numeric,0) DESC,m.evidence->>'eventAt' DESC,m.symbol)
  FROM public.vnext_members_v1 m LEFT JOIN LATERAL(SELECT * FROM public.vnext_publications_v1 WHERE symbol=m.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1)p ON true
  WHERE m.state<>'exited'),'[]'::jsonb)
$$;
ALTER FUNCTION public.vnext_refresh_home_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_refresh_home_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_validate_claims_v1(a jsonb,evidence jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; e jsonb; i text; operand text; num jsonb; formula jsonb; result numeric; v_amount numeric; n integer; op text; unit_name text; units text[]; section jsonb;
BEGIN
 IF jsonb_typeof(a->'claims') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'claims') NOT BETWEEN 1 AND 200
  OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(a->'claims')x)<>jsonb_array_length(a->'claims') THEN RAISE EXCEPTION 'vnext_important_claims_required'; END IF;
 FOR section IN SELECT value FROM jsonb_each(a->'sections') LOOP
  IF jsonb_array_length(coalesce(section->'claimIds','[]'::jsonb))=0 OR EXISTS(SELECT FROM jsonb_array_elements_text(section->'claimIds')id WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(a->'claims') AS claim_item WHERE claim_item.value->>'id'=id)) THEN RAISE EXCEPTION 'vnext_section_claim_binding'; END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(a->'claims') LOOP
  IF nullif(c->>'id','') IS NULL OR nullif(c->>'text','') IS NULL OR coalesce(c->>'kind','') NOT IN('fact','assumption','guidance','derived') OR jsonb_array_length(coalesce(c->'evidenceIds','[]'::jsonb))=0 THEN RAISE EXCEPTION 'vnext_claim_schema_invalid'; END IF;
  FOR i IN SELECT jsonb_array_elements_text(c->'evidenceIds') LOOP
   SELECT value INTO e FROM jsonb_array_elements(evidence) WHERE value->>'id'=i;
   IF e IS NULL OR coalesce(e->>'contentHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_claim_original_missing'; END IF;
   IF c->>'kind'='fact' AND (e->>'kind' IS DISTINCT FROM 'fact' OR e->>'sourceTier' IS DISTINCT FROM 'official') THEN RAISE EXCEPTION 'vnext_claim_fact_authority'; END IF;
  END LOOP;
  num:=c->'numeric'; IF num IS NULL THEN CONTINUE; END IF;
  IF jsonb_typeof(num->'value') IS DISTINCT FROM 'number' OR nullif(num->>'unit','') IS NULL OR nullif(num->>'period','') IS NULL OR nullif(num->>'key','') IS NULL THEN RAISE EXCEPTION 'vnext_claim_numeric_context'; END IF;
  IF c->>'kind'<>'derived' THEN
   IF NOT EXISTS(SELECT FROM jsonb_array_elements(evidence) AS evidence_item WHERE c->'evidenceIds' ? (evidence_item.value->>'id') AND evidence_item.value->>'key'=num->>'key' AND evidence_item.value->>'period'=num->>'period' AND evidence_item.value->>'unit'=num->>'unit' AND evidence_item.value->'value'=num->'value') THEN RAISE EXCEPTION 'vnext_claim_numeric_fact_mismatch'; END IF;
  ELSE
   formula:=num->'formula'; op:=formula->>'operation'; n:=0;result:=NULL;units:=ARRAY[]::text[];
   IF op NOT IN('add','subtract','multiply','divide') OR jsonb_array_length(coalesce(formula->'evidenceIds','[]'::jsonb))<2 THEN RAISE EXCEPTION 'vnext_claim_formula_invalid'; END IF;
   FOR operand IN SELECT jsonb_array_elements_text(formula->'evidenceIds') LOOP
    IF NOT(c->'evidenceIds' ? operand) THEN RAISE EXCEPTION 'vnext_claim_formula_uncited_input'; END IF;
    SELECT value INTO e FROM jsonb_array_elements(evidence) WHERE value->>'id'=operand;
    IF jsonb_typeof(e->'value') IS DISTINCT FROM 'number' OR e->>'period' IS DISTINCT FROM num->>'period' THEN RAISE EXCEPTION 'vnext_claim_formula_period'; END IF;
    v_amount:=(e->>'value')::numeric;unit_name:=e->>'unit';units:=array_append(units,unit_name); n:=n+1;
    IF n=1 THEN result:=v_amount;
    ELSIF op='add' THEN result:=result+v_amount;
    ELSIF op='subtract' THEN result:=result-v_amount;
    ELSIF op='multiply' THEN result:=result*v_amount;
    ELSIF op='divide' THEN IF v_amount=0 THEN RAISE EXCEPTION 'vnext_claim_formula_zero_denominator'; END IF; result:=result/v_amount; END IF;
   END LOOP;
   IF op IN('add','subtract') AND EXISTS(SELECT FROM unnest(units)u WHERE u IS DISTINCT FROM num->>'unit') THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF op='multiply' AND ((SELECT count(*) FROM unnest(units)u WHERE u NOT IN('ratio','multiple'))<>1 OR NOT(num->>'unit'=ANY(units))) THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF op='divide' AND NOT(n=2 AND ((units[1]=units[2] AND num->>'unit'='ratio') OR (units[1]=num->>'unit' AND units[2] IN('ratio','multiple')))) THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF abs(result-(num->>'value')::numeric)>greatest(0.00000001,abs(result)*0.00000001) THEN RAISE EXCEPTION 'vnext_claim_formula_result'; END IF;
  END IF;
 END LOOP;
END $$;
ALTER FUNCTION public.vnext_validate_claims_v1(jsonb,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_validate_claims_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_command_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE role_name text; r jsonb:=p_request; answer jsonb; m public.vnext_members_v1; j public.vnext_jobs_v1;
 s date; count_started integer; count_active integer; prior public.vnext_jobs_v1; v_revision uuid; v_symbol text;
 f record; g record; margin numeric; valid_weight numeric; n integer; confirmation public.vnext_confirmations_v1; v_incumbent public.vnext_members_v1; candidate jsonb; section record; allowed_ids text[]; claim jsonb; checked jsonb; source jsonb; qualification jsonb; citations jsonb;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 -- Serialize mode and principal reads with activation, admissions and publication.
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) THEN RAISE EXCEPTION 'vnext_database_mode_not_enabled'; END IF;
 SELECT role INTO role_name FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled;
 IF role_name IS NULL THEN RAISE EXCEPTION 'vnext_principal_not_provisioned'; END IF;
 SELECT session_date INTO s FROM public.vnext_sessions_v1 WHERE session_date<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date ORDER BY session_date DESC LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'vnext_official_session_missing'; END IF;
 IF p_command IN('enqueue','exit','market','content','swap','expire','screen-context','screen-observations','weekly-audit') AND role_name<>'operator' THEN RAISE EXCEPTION 'vnext_operator_required'; END IF;
 IF p_command='screen-context' THEN
  answer:=jsonb_build_object('session',s,'completed',(SELECT completed FROM public.vnext_sessions_v1 WHERE session_date=s),
   'postclose',s=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date AND (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::time>=time '18:30',
   'weeklyDue',NOT EXISTS(SELECT FROM public.vnext_weekly_audits_v1 WHERE week_start=date_trunc('week',s::timestamp)::date),
   'priceSessions',coalesce((SELECT jsonb_agg(session_date ORDER BY session_date DESC) FROM(SELECT session_date FROM public.vnext_sessions_v1 WHERE session_date<=s AND completed ORDER BY session_date DESC LIMIT 21) recent),'[]'::jsonb),
   'active',coalesce((SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'state',state,'evidence',evidence)) FROM public.vnext_members_v1 WHERE state<>'exited'),'[]'::jsonb),'clues',coalesce((SELECT jsonb_agg(claim ORDER BY parsed_at,content_hash) FROM(SELECT * FROM public.vnext_content_v1 WHERE (claim->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (claim->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months' ORDER BY parsed_at DESC LIMIT 200)content),'[]'::jsonb),
   'market',(SELECT market FROM public.vnext_home_v1 ORDER BY published_at DESC,version DESC LIMIT 1));
 ELSIF p_command='screen-observations' THEN
  IF r->>'session' IS DISTINCT FROM s::text OR jsonb_typeof(r->'observations') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'observations')>220 THEN RAISE EXCEPTION 'vnext_observation_scope_invalid'; END IF;
  FOR candidate IN SELECT value FROM jsonb_array_elements(r->'observations') LOOP
   IF candidate->>'symbol' !~ '^[0-9]{4}$' OR candidate->'input'->>'hash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_observation_invalid'; END IF;
   INSERT INTO public.vnext_screening_v1(session_date,symbol,input) VALUES(s,candidate->>'symbol',candidate->'input')
    ON CONFLICT(session_date,symbol) DO UPDATE SET input=excluded.input,observed_at=clock_timestamp();
   IF candidate->'input'->>'eligible' IS DISTINCT FROM 'true' THEN UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=candidate->>'symbol' OR incumbent=candidate->>'symbol'; END IF;
  END LOOP;
  answer:=jsonb_build_object('observed',jsonb_array_length(r->'observations'));
 ELSIF p_command='weekly-audit' THEN
  IF NOT (SELECT completed FROM public.vnext_sessions_v1 WHERE session_date=s) OR s<>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date
   OR (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::time<time '18:30' THEN RETURN jsonb_build_object('deferred','weekly_audit_requires_postclose'); END IF;
  IF EXISTS(SELECT FROM public.vnext_members_v1 member WHERE state<>'exited' AND (NOT (coalesce(r->'symbols','[]'::jsonb) ? member.symbol) OR NOT EXISTS(SELECT FROM public.vnext_screening_v1 observation WHERE observation.session_date=s AND observation.symbol=member.symbol))) THEN RAISE EXCEPTION 'vnext_weekly_all_active_required'; END IF;
  INSERT INTO public.vnext_weekly_audits_v1(week_start,session_date,symbols,gaps) VALUES(date_trunc('week',s::timestamp)::date,s,r->'symbols',coalesce(r->'gaps','[]'::jsonb)) ON CONFLICT DO NOTHING;
  answer:=jsonb_build_object('checked',r->'symbols','gaps',r->'gaps','substantive_updates_only',true);
 ELSIF p_command='enqueue' THEN
  IF jsonb_typeof(r->'symbols') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'vnext_explicit_scope_required'; END IF;
  IF jsonb_array_length(r->'symbols')=0 THEN RETURN jsonb_build_object('jobs','[]'::jsonb,'reason','empty_scope'); END IF;
  IF s<>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date THEN RETURN jsonb_build_object('jobs','[]'::jsonb,'deferred','not_official_trading_day'); END IF;
  IF jsonb_array_length(r->'symbols')>20 THEN RAISE EXCEPTION 'vnext_scope_over_limit'; END IF;
  answer:='[]'::jsonb;
  FOR v_symbol IN SELECT DISTINCT jsonb_array_elements_text(r->'symbols') ORDER BY 1 LOOP
   IF v_symbol !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'vnext_symbol_invalid'; END IF;
   SELECT * INTO m FROM public.vnext_members_v1 WHERE symbol=v_symbol;
   SELECT * INTO j FROM public.vnext_jobs_v1 WHERE request_key=(r->>'requestKey')||':'||v_symbol;
   IF j.job_id IS NOT NULL THEN
    IF j.admission_hash IS DISTINCT FROM r->'inputs'->v_symbol->>'hash' THEN RAISE EXCEPTION 'vnext_idempotency_conflict'; END IF;
    answer:=answer||jsonb_build_array(jsonb_build_object('jobId',j.job_id,'symbol',v_symbol,'state',j.state,'replay',true)); CONTINUE;
   END IF;
   IF coalesce(r->'inputs'->v_symbol->>'eligible','false')<>'true' OR coalesce(r->'inputs'->v_symbol->>'hash','') !~ '^[a-f0-9]{64}$'
    OR jsonb_array_length(coalesce(r->'inputs'->v_symbol->'roots','[]'::jsonb))=0
    OR coalesce((r->'inputs'->v_symbol->>'eventAt')::timestamptz,'-infinity')>clock_timestamp()
    OR NOT (coalesce((r->'inputs'->v_symbol->>'eventAt')::timestamptz,'-infinity')>=clock_timestamp()-interval '30 days'
      OR ((r->'inputs'->v_symbol->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months'))
   THEN answer:=answer||jsonb_build_array(jsonb_build_object('symbol',v_symbol,'deferred','eligibility_evidence_missing')); CONTINUE; END IF;
   IF m.input_hash=r->'inputs'->v_symbol->>'hash' OR EXISTS(SELECT FROM public.vnext_jobs_v1 WHERE symbol=v_symbol AND admission_hash=r->'inputs'->v_symbol->>'hash' AND retry_of IS NULL) THEN answer:=answer||jsonb_build_array(jsonb_build_object('symbol',v_symbol,'deferred','unchanged_input')); CONTINUE; END IF;
   SELECT count(*) INTO count_active FROM public.vnext_members_v1 WHERE state<>'exited';
   SELECT count(*) INTO count_started FROM public.vnext_jobs_v1 WHERE session_date=s AND started_at IS NOT NULL;
   -- Reserve today's remaining budget for queued work, so vacancies cannot consume fictitious capacity.
   count_started:=count_started+(SELECT count(*) FROM public.vnext_jobs_v1 WHERE session_date=s AND state='queued');
   IF count_started>=4 OR ((m.symbol IS NULL OR m.state='exited') AND count_active>=20) THEN
    answer:=answer||jsonb_build_array(jsonb_build_object('symbol',v_symbol,'deferred',CASE WHEN count_started>=4 THEN 'daily_budget' ELSE 'active_capacity' END)); CONTINUE; END IF;
   IF EXISTS(SELECT FROM public.vnext_jobs_v1 WHERE symbol=v_symbol AND state IN('queued','running','authored','reviewing')) THEN
    answer:=answer||jsonb_build_array(jsonb_build_object('symbol',v_symbol,'deferred','work_in_progress')); CONTINUE; END IF;
   UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=v_symbol OR incumbent=v_symbol;
   INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session) VALUES(v_symbol,'researching',r->'inputs'->v_symbol->>'hash',r->'inputs'->v_symbol,s)
    ON CONFLICT(symbol) DO UPDATE SET state='researching',input_hash=excluded.input_hash,evidence=excluded.evidence,contraindication=false,failures=0,exit_reason=NULL,updated_at=clock_timestamp();
   INSERT INTO public.vnext_jobs_v1(request_key,symbol,input_hash,admission_hash,session_date) VALUES((r->>'requestKey')||':'||v_symbol,v_symbol,r->'inputs'->v_symbol->>'hash',r->'inputs'->v_symbol->>'hash',s) RETURNING * INTO j;
   answer:=answer||jsonb_build_array(jsonb_build_object('jobId',j.job_id,'symbol',v_symbol,'state','queued'));
  END LOOP;
  answer:=jsonb_build_object('jobs',answer);
 ELSIF p_command='claim' THEN
  IF s<>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date THEN RETURN jsonb_build_object('execute',false,'reason','not_official_trading_day'); END IF;
  IF role_name<>'author' THEN RAISE EXCEPTION 'vnext_author_required'; END IF;
  SELECT * INTO j FROM public.vnext_jobs_v1 WHERE job_id=(r->>'jobId')::uuid FOR UPDATE;
  IF j.job_id IS NULL THEN RAISE EXCEPTION 'vnext_job_missing'; END IF;
  SELECT * INTO m FROM public.vnext_members_v1 WHERE symbol=j.symbol;
  IF m.state='exited' OR m.contraindication OR m.input_hash<>j.input_hash THEN RAISE EXCEPTION 'vnext_admission_invalid'; END IF;
  IF j.state<>'queued' THEN RETURN jsonb_build_object('replay',true,'state',j.state,'execute',false); END IF;
  SELECT count(*) INTO count_started FROM public.vnext_jobs_v1 WHERE session_date=s AND started_at IS NOT NULL;
  IF count_started>=4 THEN RETURN jsonb_build_object('execute',false,'reason','daily_budget'); END IF;
  UPDATE public.vnext_jobs_v1 SET state='running',session_date=s,started_at=clock_timestamp(),execution_id=gen_random_uuid(),deadline_at=clock_timestamp()+interval '120 seconds',author_principal=p_principal WHERE job_id=j.job_id RETURNING * INTO j;
  UPDATE public.vnext_members_v1 SET state='researching',exit_reason=NULL,updated_at=clock_timestamp() WHERE symbol=j.symbol;
  answer:=jsonb_build_object('execute',true,'jobId',j.job_id,'symbol',j.symbol,'inputHash',j.input_hash,'executionId',j.execution_id,'session',s,'evidence',m.evidence);
 ELSIF p_command IN('prepare','work-context','author-context','author','fail','review-claim','review-context','review-sources','review','review-fail','qualification-context','record-qualification','publish','retry') THEN
  SELECT * INTO j FROM public.vnext_jobs_v1 WHERE job_id=(r->>'jobId')::uuid FOR UPDATE;
  IF j.job_id IS NULL THEN RAISE EXCEPTION 'vnext_job_missing'; END IF;
  SELECT * INTO m FROM public.vnext_members_v1 WHERE symbol=j.symbol;
  IF p_command IN('publish','qualification-context') AND j.state='published' THEN
   SELECT revision_id INTO v_revision FROM public.vnext_publications_v1 WHERE job_id=j.job_id;
   IF p_command='qualification-context' THEN
    IF role_name<>'reviewer' OR j.reviewer_principal IS DISTINCT FROM p_principal THEN RAISE EXCEPTION 'vnext_qualification_not_reviewed'; END IF;
    RETURN jsonb_build_object('alreadyPublished',true);
   END IF;
   IF j.reviewer_principal IS DISTINCT FROM p_principal OR r->>'inputHash' IS DISTINCT FROM j.input_hash OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' THEN RAISE EXCEPTION 'vnext_publication_replay_binding'; END IF;
   RETURN jsonb_build_object('published',true,'revisionId',v_revision,'replay',true);
  END IF;
  IF p_command='author' AND j.state IN('authored','reviewing','published') THEN
   IF role_name<>'author' OR j.author_principal IS DISTINCT FROM p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId'
    OR r->>'inputHash' IS DISTINCT FROM j.input_hash OR r->'artifact' IS DISTINCT FROM j.author_result THEN RAISE EXCEPTION 'vnext_author_replay_conflict'; END IF;
   RETURN jsonb_build_object('authored',true,'published',j.state='published','replay',true);
  END IF;
  IF p_command='author-context' AND j.state IN('authored','reviewing','published') THEN
   IF role_name<>'author' OR j.author_principal IS DISTINCT FROM p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId' THEN RAISE EXCEPTION 'vnext_author_binding'; END IF;
   RETURN jsonb_build_object('committed',true,'inputHash',j.input_hash);
  END IF;
  IF p_command IN('review','review-context','review-fail') AND j.reviewer_result IS NOT NULL THEN
   IF role_name<>'reviewer' OR j.reviewer_principal IS DISTINCT FROM p_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   IF p_command='review-context' THEN RETURN jsonb_build_object('committed',true,'inputHash',j.input_hash); END IF;
   IF p_command='review-fail' AND j.state='failed' AND j.reviewer_result->>'validationRejected'='true' AND r->>'reason' IS NOT NULL AND j.error IS NOT DISTINCT FROM r->>'reason' THEN RETURN jsonb_build_object('reviewRecorded',true,'approved',false,'replay',true); END IF;
   IF p_command<>'review' OR r->>'inputHash' IS DISTINCT FROM j.input_hash OR r->'review' IS DISTINCT FROM j.reviewer_result THEN RAISE EXCEPTION 'vnext_review_replay_conflict'; END IF;
   RETURN jsonb_build_object('reviewRecorded',true,'approved',j.reviewer_result->'approved','replay',true);
  END IF;
  IF p_command IN('prepare','work-context','author-context','author','review-claim','review-context','review-sources','review','qualification-context','record-qualification','publish') AND (j.deadline_at IS NULL OR clock_timestamp()>j.deadline_at) THEN RAISE EXCEPTION 'vnext_execution_timed_out'; END IF;
  IF p_command='prepare' THEN
   IF role_name<>'author' OR j.author_principal IS DISTINCT FROM p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId' OR j.state<>'running'
    OR m.state='exited' OR m.contraindication OR m.input_hash<>j.input_hash OR coalesce(r->>'inputHash','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(r->'evidence') IS DISTINCT FROM 'object'
   THEN RAISE EXCEPTION 'vnext_preparation_binding'; END IF;
   IF EXISTS(SELECT FROM public.vnext_preparations_v1 WHERE job_id=j.job_id) THEN
    IF NOT EXISTS(SELECT FROM public.vnext_preparations_v1 WHERE job_id=j.job_id AND input_hash=r->>'inputHash' AND evidence=r->'evidence') THEN RAISE EXCEPTION 'vnext_frozen_preparation_conflict'; END IF;
    RETURN jsonb_build_object('inputHash',j.input_hash,'replay',true);
   END IF;
   INSERT INTO public.vnext_preparations_v1(job_id,admission_hash,input_hash,evidence) VALUES(j.job_id,j.admission_hash,r->>'inputHash',r->'evidence');
   UPDATE public.vnext_jobs_v1 SET input_hash=r->>'inputHash' WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET input_hash=r->>'inputHash',evidence=r->'evidence',updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('inputHash',r->>'inputHash','frozen',true);
  ELSIF p_command IN('work-context','author-context') THEN
   IF role_name<>'author' OR j.author_principal IS DISTINCT FROM p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId'
    OR (j.state<>'running' AND NOT(p_command='author-context' AND j.state IN('authored','reviewing','published'))) THEN RAISE EXCEPTION 'vnext_author_binding'; END IF;
   IF m.state='exited' OR m.contraindication OR m.input_hash<>j.input_hash THEN RAISE EXCEPTION 'vnext_admission_invalid'; END IF;
   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash);
  ELSIF p_command='author' THEN
   IF role_name<>'author' OR j.author_principal<>p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId' OR j.state<>'running'
    OR r->>'inputHash' IS DISTINCT FROM j.input_hash OR jsonb_typeof(r->'artifact') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_author_binding'; END IF;
   IF r->'artifact'->>'schemaVersion' IS DISTINCT FROM 'stockinsider-vnext-research-v1' OR r->'artifact'->>'inputHash' IS DISTINCT FROM j.input_hash
    OR nullif(r->'artifact'->>'model','') IS NULL OR nullif(r->'artifact'->>'modelVersion','') IS NULL OR coalesce(r->'artifact'->>'outputHash','') !~ '^[a-f0-9]{64}$'
    OR nullif(r->'artifact'->>'quoteDate','') IS NULL OR nullif(r->'artifact'->>'valuationDate','') IS NULL OR jsonb_typeof(r->'artifact'->'gaps') IS DISTINCT FROM 'array'
    OR NOT(r->'artifact' ? 'annualEps') OR NOT(r->'artifact' ? 'nextFourQuarterEps')
    OR jsonb_typeof(r->'artifact'->'annualEps') NOT IN('number','null') OR jsonb_typeof(r->'artifact'->'nextFourQuarterEps') NOT IN('number','null')
    OR (r->'artifact'->'annualEps'='null'::jsonb AND NOT(r->'artifact'->'gaps' ? 'annual_eps_missing'))
    OR (r->'artifact'->'nextFourQuarterEps'='null'::jsonb AND NOT(r->'artifact'->'gaps' ? 'next_four_quarter_eps_missing'))
   THEN RAISE EXCEPTION 'vnext_artifact_schema_invalid'; END IF;
   SELECT array_agg(item->>'id') INTO allowed_ids FROM jsonb_array_elements(coalesce(m.evidence->'evidence','[]'::jsonb))item;
   FOR section IN SELECT unnest(ARRAY['conclusion','productsRevenue','competitionDemand','profitBridge','cashflows','valuation','catalysts','falsifiers','technical','history']) AS key LOOP
    IF nullif(r->'artifact'->'sections'->section.key->>'text','') IS NULL OR jsonb_array_length(coalesce(r->'artifact'->'sections'->section.key->'evidenceIds','[]'::jsonb))=0
     OR EXISTS(SELECT FROM jsonb_array_elements_text(r->'artifact'->'sections'->section.key->'evidenceIds')id WHERE NOT(id=ANY(coalesce(allowed_ids,ARRAY[]::text[]))))
    THEN RAISE EXCEPTION 'vnext_artifact_evidence_invalid'; END IF;
   END LOOP;
   PERFORM public.vnext_validate_claims_v1(r->'artifact',coalesce(m.evidence->'evidence','[]'::jsonb));
   UPDATE public.vnext_jobs_v1 SET state='authored',author_result=r->'artifact' WHERE job_id=j.job_id;
   answer:=jsonb_build_object('authored',true,'published',false);
  ELSIF p_command='review-claim' THEN
   IF role_name<>'reviewer' OR p_principal=j.author_principal OR j.state<>'authored' THEN RAISE EXCEPTION 'vnext_independent_reviewer_required'; END IF;
   UPDATE public.vnext_jobs_v1 SET state='reviewing',reviewer_execution=gen_random_uuid(),deadline_at=clock_timestamp()+interval '120 seconds',reviewer_principal=p_principal WHERE job_id=j.job_id RETURNING * INTO j;
   answer:=jsonb_build_object('executionId',j.reviewer_execution,'jobId',j.job_id,'inputHash',j.input_hash,'authorArtifact',j.author_result);
  ELSIF p_command IN('review-context','review-sources') THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' OR j.state<>'reviewing' THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   IF p_command='review-sources' THEN UPDATE public.vnext_jobs_v1 SET sources_read_at=clock_timestamp() WHERE job_id=j.job_id; END IF;
   answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash,'authorArtifact',j.author_result);
  ELSIF p_command='review-fail' THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId' OR j.state<>'reviewing' THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   UPDATE public.vnext_jobs_v1 SET reviewer_result=jsonb_build_object('approved',false,'validationRejected',true),state='failed',error=r->>'reason',finished_at=clock_timestamp() WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,state=CASE WHEN failures>=1 THEN 'exited' ELSE 'waiting' END,
    exit_reason=CASE WHEN failures>=1 THEN 'research_failed' ELSE 'review_rejected_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('reviewRecorded',true,'approved',false,'attemptConsumed',true);
  ELSIF p_command='review' THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId'
    OR j.sources_read_at IS NULL OR j.state<>'reviewing' OR r->>'inputHash' IS DISTINCT FROM j.input_hash THEN RAISE EXCEPTION 'vnext_review_binding'; END IF;
   IF jsonb_typeof(r->'review') IS DISTINCT FROM 'object' OR r->'review'->>'authorOutputHash' IS DISTINCT FROM j.author_result->>'outputHash'
    OR jsonb_typeof(r->'review'->'findings') IS DISTINCT FROM 'array' OR jsonb_typeof(r->'review'->'approved') IS DISTINCT FROM 'boolean'
    OR nullif(r->'review'->>'modelVersion','') IS NULL THEN RAISE EXCEPTION 'vnext_review_artifact_binding'; END IF;
   IF r->'review'->>'approved'='true' AND (jsonb_array_length(r->'review'->'findings')<>0 OR r->'review'->>'factsChecked' IS DISTINCT FROM 'true'
    OR r->'review'->>'valuationChecked' IS DISTINCT FROM 'true' OR r->'review'->>'claimsChecked' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'vnext_review_checks_missing'; END IF;
   IF jsonb_typeof(r->'review'->'claimChecks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'vnext_review_claim_checks_missing'; END IF;
   FOR claim IN SELECT value FROM jsonb_array_elements(j.author_result->'claims') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(r->'review'->'claimChecks')c WHERE c->>'claimId'=claim->>'id')<>1 THEN RAISE EXCEPTION 'vnext_review_claim_unchecked'; END IF;
    SELECT value INTO checked FROM jsonb_array_elements(r->'review'->'claimChecks') WHERE value->>'claimId'=claim->>'id';
    IF nullif(checked->>'reason','') IS NULL OR (r->'review'->>'approved'='true' AND checked->>'verdict' IS DISTINCT FROM 'supported') THEN RAISE EXCEPTION 'vnext_review_claim_unsupported'; END IF;
    FOR source IN SELECT value FROM jsonb_array_elements(coalesce(m.evidence->'evidence','[]'::jsonb)) WHERE claim->'evidenceIds' ? (value->>'id') LOOP
     IF NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(checked->'sources','[]'::jsonb))checked_source WHERE checked_source->>'id'=source->>'id' AND checked_source->>'contentHash'=source->>'contentHash') THEN RAISE EXCEPTION 'vnext_review_original_evidence_unchecked'; END IF;
    END LOOP;
   END LOOP;
   UPDATE public.vnext_jobs_v1 SET reviewer_result=r->'review',state=CASE WHEN r->'review'->>'approved'='true' THEN 'reviewing' ELSE 'failed' END,
    error=CASE WHEN r->'review'->>'approved'='true' THEN NULL ELSE 'independent_review_rejected' END,
    finished_at=CASE WHEN r->'review'->>'approved'='true' THEN NULL ELSE clock_timestamp() END WHERE job_id=j.job_id;
   IF r->'review'->>'approved'='false' THEN
    UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,state=CASE WHEN failures>=1 THEN 'exited' ELSE 'waiting' END,
     exit_reason=CASE WHEN failures>=1 THEN 'research_failed' ELSE 'review_rejected_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   END IF;
   answer:=jsonb_build_object('reviewRecorded',true,'published',false);
  ELSIF p_command IN('qualification-context','record-qualification') THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.state<>'reviewing' OR j.reviewer_result->>'approved' IS DISTINCT FROM 'true'
    OR m.state='exited' OR m.contraindication OR m.input_hash<>j.input_hash THEN RAISE EXCEPTION 'vnext_qualification_not_reviewed'; END IF;
   IF p_command='qualification-context' THEN answer:=jsonb_build_object('evidence',m.evidence,'inputHash',j.input_hash,'symbol',j.symbol);
   ELSE
    IF r->>'inputHash' IS DISTINCT FROM j.input_hash OR r->'proof'->>'inputHash' IS DISTINCT FROM j.input_hash OR r->'proof'->>'schemaVersion' IS DISTINCT FROM 'stockinsider-vnext-authority-proof-v1'
     OR coalesce(r->'proof'->>'proofHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_qualification_proof_invalid'; END IF;
    INSERT INTO public.vnext_qualifications_v1(job_id,input_hash,proof) VALUES(j.job_id,j.input_hash,r->'proof')
     ON CONFLICT(job_id) DO UPDATE SET proof=excluded.proof,checked_at=clock_timestamp();
    answer:=jsonb_build_object('recorded',true,'qualified',r->'proof'->'qualified');
   END IF;
  ELSIF p_command='publish' THEN
   IF role_name<>'reviewer' OR p_principal IS DISTINCT FROM j.reviewer_principal OR j.reviewer_execution::text IS DISTINCT FROM r->>'executionId'
    OR j.state<>'reviewing' OR j.reviewer_result->>'approved' IS DISTINCT FROM 'true' OR j.sources_read_at IS NULL
    OR j.execution_id=j.reviewer_execution OR j.author_principal=j.reviewer_principal THEN RAISE EXCEPTION 'vnext_review_not_approved'; END IF;
   IF m.state='exited' OR m.contraindication OR m.input_hash<>j.input_hash OR r->>'inputHash' IS DISTINCT FROM j.input_hash THEN RAISE EXCEPTION 'vnext_publication_stale'; END IF;
   IF clock_timestamp()>j.deadline_at THEN RAISE EXCEPTION 'vnext_review_timed_out'; END IF;
   SELECT proof INTO qualification FROM public.vnext_qualifications_v1 WHERE job_id=j.job_id AND input_hash=j.input_hash AND checked_at>=clock_timestamp()-interval '120 seconds';
   qualification:=coalesce(qualification,jsonb_build_object('qualified',false,'gaps',jsonb_build_array('actual_authority_not_verified')));
   IF qualification->>'qualified'='true' AND (coalesce((qualification->>'expiresAt')::timestamptz,'-infinity')<clock_timestamp()
    OR qualification->'financialCoverage'->>'status' IS DISTINCT FROM 'complete' OR qualification->'priceBasis'->>'status' IS DISTINCT FROM 'verified') THEN RAISE EXCEPTION 'vnext_qualification_stale'; END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','url',e->>'source','contentHash',e->>'contentHash')),'[]'::jsonb) INTO citations
    FROM jsonb_array_elements(coalesce(m.evidence->'evidence','[]'::jsonb))e
    WHERE e->>'source' ~ '^https?://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/:?#]|$)'
     AND e->>'source' !~* '^https?://[^/]*(localhost|\.local|\.internal|\.test)([:/]|$)' AND e->>'source' !~ '^https?://[^/]*@'
     AND NOT(e->>'source' ~* 'investanchors' AND e->>'source' ~* '(paid|member|premium|subscription)');
   INSERT INTO public.vnext_publications_v1(job_id,symbol,input_hash,content,citations,qualification) VALUES(j.job_id,j.symbol,j.input_hash,j.author_result,citations,qualification) RETURNING revision_id INTO v_revision;
   UPDATE public.vnext_jobs_v1 SET state='published',finished_at=clock_timestamp() WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET state=CASE WHEN evidence->>'overheated'='true' OR qualification->>'qualified' IS DISTINCT FROM 'true' THEN 'waiting' ELSE 'eligible' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('published',true,'revisionId',v_revision);
  ELSIF p_command='fail' THEN
   IF role_name<>'author' OR j.author_principal IS DISTINCT FROM p_principal OR j.execution_id::text IS DISTINCT FROM r->>'executionId' OR j.state<>'running' THEN RAISE EXCEPTION 'vnext_failure_binding'; END IF;
   UPDATE public.vnext_jobs_v1 SET state='failed',error=r->>'reason',finished_at=clock_timestamp() WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,
    state=CASE WHEN r->>'permanent'='true' OR failures>=1 THEN 'exited' ELSE 'waiting' END,exit_reason=CASE WHEN r->>'permanent'='true' OR failures>=1 THEN 'research_failed' ELSE 'research_failed_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   answer:=jsonb_build_object('failed',true,'attemptConsumed',true);
  ELSE
   IF role_name<>'operator' OR j.state<>'failed' OR j.attempt_no>=1 OR m.state='exited' OR m.contraindication THEN RAISE EXCEPTION 'vnext_retry_forbidden'; END IF;
   SELECT * INTO prior FROM public.vnext_jobs_v1 WHERE retry_of=j.job_id;
   IF prior.job_id IS NOT NULL THEN RETURN jsonb_build_object('jobId',prior.job_id,'replay',true); END IF;
   SELECT count(*) INTO count_started FROM public.vnext_jobs_v1 WHERE session_date=s AND (started_at IS NOT NULL OR state='queued');
   IF count_started>=4 THEN RETURN jsonb_build_object('deferred','daily_budget'); END IF;
   INSERT INTO public.vnext_jobs_v1(request_key,symbol,input_hash,admission_hash,session_date,retry_of,attempt_no) VALUES(j.request_key||':retry',j.symbol,j.input_hash,j.admission_hash,s,j.job_id,1) RETURNING * INTO prior;
   answer:=jsonb_build_object('jobId',prior.job_id);
  END IF;
 ELSIF p_command='exit' THEN
  IF r->>'reason' NOT IN('verified_contraindication','catalyst_cancelled','trading_invalid','target_hit') OR jsonb_array_length(coalesce(r->'evidence','[]'::jsonb))=0 THEN RAISE EXCEPTION 'vnext_exit_evidence_required'; END IF;
  UPDATE public.vnext_members_v1 SET state='exited',contraindication=(r->>'reason'='verified_contraindication'),exit_reason=r->>'reason',updated_at=clock_timestamp() WHERE symbol=r->>'symbol';
  UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=r->>'symbol' OR incumbent=r->>'symbol';
  UPDATE public.vnext_jobs_v1 SET state='rejected',error='membership_exited' WHERE symbol=r->>'symbol' AND state IN('queued','running','authored','reviewing');
  answer:=jsonb_build_object('exited',true);
 ELSIF p_command='expire' THEN
  n:=0;
  FOR j IN SELECT * FROM public.vnext_jobs_v1 WHERE state IN('running','authored','reviewing') AND deadline_at<clock_timestamp() LOOP
   UPDATE public.vnext_jobs_v1 SET state='failed',finished_at=clock_timestamp(),error='execution_timed_out' WHERE job_id=j.job_id;
   UPDATE public.vnext_members_v1 SET failures=failures+1,last_failure_hash=j.input_hash,state=CASE WHEN failures>=1 THEN 'exited' ELSE 'waiting' END,exit_reason=CASE WHEN failures>=1 THEN 'research_timed_out' ELSE 'research_timed_out_retry_available' END,updated_at=clock_timestamp() WHERE symbol=j.symbol;
   n:=n+1;
  END LOOP;
  answer:=jsonb_build_object('expired',n,'attemptsRefunded',0);
 ELSIF p_command='market' THEN
  IF jsonb_typeof(r->'market') IS DISTINCT FROM 'object' OR nullif(r->'market'->>'snapshotHash','') IS NULL
    OR r->'market'->>'risk' NOT IN('risk_on','selective','risk_off','breakdown','unknown')
    OR jsonb_typeof(r->'market'->'gaps') IS DISTINCT FROM 'array' OR jsonb_typeof(r->'market'->'sessions') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'vnext_market_contract_invalid'; END IF;
  IF EXISTS(SELECT FROM public.vnext_home_v1 WHERE market->>'snapshotHash'=r->'market'->>'snapshotHash') THEN
   IF EXISTS(SELECT FROM public.vnext_home_v1 WHERE market->>'snapshotHash'=r->'market'->>'snapshotHash' AND market IS DISTINCT FROM r->'market') THEN RAISE EXCEPTION 'vnext_frozen_market_conflict'; END IF;
   RETURN jsonb_build_object('replay',true); END IF;
  INSERT INTO public.vnext_home_v1(market,members) VALUES(r->'market','[]'::jsonb);
  answer:=jsonb_build_object('marketFrozen',true);
 ELSIF p_command='content' THEN
  IF jsonb_typeof(r->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'items')>200 THEN RAISE EXCEPTION 'vnext_content_scope_invalid'; END IF;
  n:=0;
  FOR candidate IN SELECT value FROM jsonb_array_elements(r->'items') LOOP
   IF candidate->>'contentHash' !~ '^[a-f0-9]{64}$' OR candidate ? 'rawContent' THEN RAISE EXCEPTION 'vnext_raw_source_forbidden'; END IF;
   IF candidate->>'source' IN('investanchors','telegram') AND (candidate->>'rightsAttested' IS DISTINCT FROM 'true' OR candidate->>'operatorClaim' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'vnext_source_rights_missing'; END IF;
   IF EXISTS(SELECT FROM public.vnext_content_v1 WHERE content_hash=candidate->>'contentHash') THEN CONTINUE; END IF;
   IF (SELECT count(*) FROM public.vnext_content_v1 content_day WHERE content_day.processing_date=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date)>=200 OR (SELECT count(*) FROM public.vnext_content_v1 content_source WHERE content_source.processing_date=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date AND content_source.source=candidate->>'source')>=50 THEN CONTINUE; END IF;
   INSERT INTO public.vnext_content_v1(content_hash,source,session_date,claim) VALUES(candidate->>'contentHash',candidate->>'source',s,candidate); n:=n+1;
  END LOOP;
  answer:=jsonb_build_object('parsed',n,'deferred',jsonb_array_length(r->'items')-n);
 ELSIF p_command='swap' THEN
  IF r->>'policy' IS DISTINCT FROM 'stockinsider-vnext-20-v1' THEN RAISE EXCEPTION 'vnext_policy_mismatch'; END IF;
  IF s<>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::time<time '18:30' OR NOT (SELECT completed FROM public.vnext_sessions_v1 WHERE session_date=s) THEN RETURN jsonb_build_object('deferred','routine_swap_requires_postclose'); END IF;
  v_symbol:=r->>'challengerSymbol';
  SELECT input||jsonb_build_object('symbol',symbol) INTO candidate FROM public.vnext_screening_v1 WHERE session_date=s AND symbol=v_symbol;
  IF candidate IS NULL THEN RETURN jsonb_build_object('deferred','current_challenger_observation_missing'); END IF;
  IF EXISTS(SELECT FROM public.vnext_members_v1 WHERE symbol=v_symbol AND state<>'exited') THEN RETURN jsonb_build_object('deferred','challenger_already_active'); END IF;
  SELECT member.* INTO v_incumbent FROM public.vnext_members_v1 member JOIN public.vnext_screening_v1 observation ON observation.symbol=member.symbol AND observation.session_date=s
   WHERE member.state IN('eligible','waiting') AND NOT member.contraindication AND observation.input->>'eligible'='true'
    AND NOT EXISTS(SELECT FROM public.vnext_jobs_v1 unfinished WHERE unfinished.symbol=member.symbol AND unfinished.state IN('queued','running','authored','reviewing'))
    AND observation.input->>'priceEvidence'='true' AND observation.input->>'eventEvidence'='true' AND observation.input->>'rootEvidence'='true'
   ORDER BY (observation.input->'initialScore'->>'confirmedPoints')::numeric,(observation.input->'initialScore'->>'availableWeight')::numeric,observation.input->>'eventAt',member.symbol DESC LIMIT 1;
  IF v_incumbent.symbol IS NULL THEN RETURN jsonb_build_object('deferred','current_eligible_incumbent_missing'); END IF;
  SELECT input INTO v_incumbent.evidence FROM public.vnext_screening_v1 WHERE session_date=s AND symbol=v_incumbent.symbol;
  IF candidate->>'eligible' IS DISTINCT FROM 'true' OR candidate->>'priceEvidence' IS DISTINCT FROM 'true' OR candidate->>'eventEvidence' IS DISTINCT FROM 'true' OR candidate->>'rootEvidence' IS DISTINCT FROM 'true'
   OR candidate->>'contraindication'='true' OR candidate->>'overheated'='true' THEN
   UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=v_symbol AND incumbent=v_incumbent.symbol;
   RETURN jsonb_build_object('deferred','comparison_evidence_missing'); END IF;
  -- A different weakest incumbent resets the pair's consecutive-session history.
  UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=v_symbol AND (incumbent<>v_incumbent.symbol OR policy<>r->>'policy');
  margin:=0;valid_weight:=0;
  FOR f IN SELECT * FROM(VALUES('recency',20),('sourceVolume',25),('priceVolume',25),('chips',15),('operationsCatalyst',15))w(key,weight) LOOP
   IF f.key='sourceVolume' THEN
    FOR g IN SELECT unnest(ARRAY['independent','volume']) AS key LOOP
     IF jsonb_typeof(candidate->'factors'->f.key->'components'->g.key->'value')='number' AND jsonb_typeof(v_incumbent.evidence->'factors'->f.key->'components'->g.key->'value')='number'
      AND jsonb_array_length(coalesce(candidate->'factors'->f.key->'components'->g.key->'provenance','[]'::jsonb))>0
      AND jsonb_array_length(coalesce(v_incumbent.evidence->'factors'->f.key->'components'->g.key->'provenance','[]'::jsonb))>0 THEN
      IF (candidate->'factors'->f.key->'components'->g.key->>'value')::numeric NOT BETWEEN 0 AND 1 OR (v_incumbent.evidence->'factors'->f.key->'components'->g.key->>'value')::numeric NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'vnext_factor_invalid'; END IF;
      margin:=margin+12.5*((candidate->'factors'->f.key->'components'->g.key->>'value')::numeric-(v_incumbent.evidence->'factors'->f.key->'components'->g.key->>'value')::numeric);valid_weight:=valid_weight+12.5;
     END IF;
    END LOOP;
   ELSIF jsonb_typeof(candidate->'factors'->f.key->'value')='number' AND jsonb_typeof(v_incumbent.evidence->'factors'->f.key->'value')='number'
    AND jsonb_array_length(coalesce(candidate->'factors'->f.key->'provenance','[]'::jsonb))>0 AND jsonb_array_length(coalesce(v_incumbent.evidence->'factors'->f.key->'provenance','[]'::jsonb))>0 THEN
    IF (candidate->'factors'->f.key->>'value')::numeric NOT BETWEEN 0 AND 1 OR (v_incumbent.evidence->'factors'->f.key->>'value')::numeric NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'vnext_factor_invalid'; END IF;
    margin:=margin+f.weight*((candidate->'factors'->f.key->>'value')::numeric-(v_incumbent.evidence->'factors'->f.key->>'value')::numeric);valid_weight:=valid_weight+f.weight;
   END IF;
  END LOOP;
  IF margin<5 THEN UPDATE public.vnext_confirmations_v1 SET count=0 WHERE challenger=v_symbol AND incumbent=v_incumbent.symbol; RETURN jsonb_build_object('deferred','margin_below_five'); END IF;
  SELECT * INTO confirmation FROM public.vnext_confirmations_v1 WHERE challenger=v_symbol AND incumbent=v_incumbent.symbol AND policy=r->>'policy';
  n:=1;
  IF confirmation.last_session=s THEN n:=confirmation.count;
  ELSIF confirmation.last_session=(SELECT max(session_date) FROM public.vnext_sessions_v1 WHERE session_date<s) THEN n:=confirmation.count+1; END IF;
  INSERT INTO public.vnext_confirmations_v1 VALUES(v_symbol,v_incumbent.symbol,r->>'policy',s,n) ON CONFLICT(challenger,incumbent,policy) DO UPDATE SET last_session=s,count=n;
  IF n<2 THEN RETURN jsonb_build_object('deferred','confirmation_pending','count',n); END IF;
  SELECT count(*) INTO count_started FROM public.vnext_jobs_v1 WHERE session_date=s AND (started_at IS NOT NULL OR state='queued');
  IF count_started>=4 THEN RETURN jsonb_build_object('deferred','daily_budget','count',n); END IF;
  -- Reuse exact enqueue validation and reservation under the same transaction lock;
  -- rejected admission rolls the exit back instead of opening a false vacancy.
  UPDATE public.vnext_members_v1 SET state='exited',exit_reason='confirmed_stronger_challenger' WHERE symbol=v_incumbent.symbol;
  answer:=public.vnext_command_v1(p_principal,'enqueue',jsonb_build_object('symbols',jsonb_build_array(v_symbol),'requestKey',r->>'requestKey','inputs',jsonb_build_object(v_symbol,candidate)));
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE symbol=v_symbol AND state='researching') THEN RAISE EXCEPTION 'vnext_swap_admission_deferred'; END IF;
  answer:=answer||jsonb_build_object('exited',v_incumbent.symbol,'margin',margin,'commonWeight',valid_weight);
 ELSE RAISE EXCEPTION 'vnext_command_unsupported'; END IF;
 IF p_command IN('enqueue','claim','prepare','review','review-fail','publish','exit','market','swap','fail','expire') THEN PERFORM public.vnext_refresh_home_v1(); END IF;
 INSERT INTO public.vnext_audit_v1(principal,command,request,result) VALUES(p_principal,p_command,r,answer);
 RETURN answer;
END $$;
ALTER FUNCTION public.vnext_command_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_command_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_command_v1(text,text,jsonb) TO service_role;
-- Read function deliberately returns only the frozen public contract and dated history.
CREATE FUNCTION public.vnext_read_v1(p_symbol text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p_symbol IS NULL THEN (SELECT jsonb_build_object('version',version,'market',market,'members',members,'publishedAt',published_at,'latestSession',(SELECT jsonb_build_object('id',session_date,'closeAt',close_at,'completed',completed) FROM public.vnext_sessions_v1 WHERE completed AND close_at<=clock_timestamp() ORDER BY session_date DESC LIMIT 1)) FROM public.vnext_home_v1 ORDER BY published_at DESC,version DESC LIMIT 1)
 ELSE jsonb_build_object('symbol',p_symbol,'membership',(SELECT jsonb_build_object('state',state,'contraindication',contraindication,'inputHash',input_hash,'reason',exit_reason) FROM public.vnext_members_v1 WHERE symbol=p_symbol),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revisionId',revision_id,'inputHash',input_hash,'content',content,'citations',citations,'qualification',qualification,'publishedAt',published_at) ORDER BY published_at DESC) FROM public.vnext_publications_v1 WHERE symbol=p_symbol),'[]'::jsonb)) END WHERE EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
$$;
ALTER FUNCTION public.vnext_read_v1(text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_read_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_read_v1(text) TO service_role;
COMMIT;
