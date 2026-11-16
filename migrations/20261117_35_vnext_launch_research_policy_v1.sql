BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE TABLE public.vnext_launch_research_admissions_v1 (
  job_id uuid PRIMARY KEY REFERENCES public.vnext_jobs_v1(job_id) ON DELETE RESTRICT,
  admission_hash text NOT NULL CHECK (admission_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK (policy_version = 'stockinsider-launch-radar-v1')
);
ALTER TABLE public.vnext_launch_research_admissions_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_research_admissions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_research_admissions_v1 FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_launch_research_admissions_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();

CREATE FUNCTION public.vnext_launch_research_admission_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'vnext_launch_research_admission_immutable';
END $$;
ALTER FUNCTION public.vnext_launch_research_admission_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_research_admission_immutable_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vnext_launch_research_admission_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_research_admissions_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_research_admission_immutable_v1();

-- Reuse the same source/eligibility gates, lock, queue, cap and ledger.
-- The version is set only on successful new admissions in this transaction.
CREATE FUNCTION public.vnext_launch_enqueue_research_v1(p_principal text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE policy constant text:='stockinsider-launch-radar-v1';
 symbol_value text; item jsonb; ticket jsonb; admitted jsonb; inputs jsonb:='{}'; work public.vnext_jobs_v1;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request)
  OR NOT(p_request ?& ARRAY['symbols','inputs','requestKey','entrypoint'])
  OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>4
  OR jsonb_typeof(p_request->'symbols') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'symbols')>20
  OR jsonb_typeof(p_request->'inputs') IS DISTINCT FROM 'object'
  OR coalesce(p_request->>'requestKey','') !~ '^[A-Za-z0-9_:.-]{1,180}$'
  OR char_length(coalesce(p_request->>'entrypoint','')) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'vnext_launch_research_scope_required'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(p_request->'symbols') value
  WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value #>> '{}') !~ '^[0-9]{4}$')
  OR (SELECT count(*) FROM jsonb_object_keys(p_request->'inputs')) <>
     (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_request->'symbols') value)
 THEN RAISE EXCEPTION 'vnext_launch_research_scope_required'; END IF;

 FOR symbol_value IN SELECT DISTINCT value FROM jsonb_array_elements_text(p_request->'symbols') value ORDER BY value LOOP
  item:=p_request->'inputs'->symbol_value;
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'hash','') !~ '^[a-f0-9]{64}$'
    OR item ? 'researchPolicyVersion' THEN RAISE EXCEPTION 'vnext_launch_research_input_invalid'; END IF;
  item:=item||jsonb_build_object('researchPolicyVersion',policy,'hash',
    encode(sha256(convert_to(policy||':'||(item->>'hash'),'UTF8')),'hex'));
  inputs:=jsonb_set(inputs,ARRAY[symbol_value],item);
 END LOOP;

 admitted:=public.vnext_cached_admission_v1(p_principal,'enqueue',p_request||jsonb_build_object(
  'inputs',inputs,'requestKey','launch-radar:'||encode(sha256(convert_to(p_request->>'requestKey','UTF8')),'hex')));
 FOR ticket IN SELECT value FROM jsonb_array_elements(coalesce(admitted->'jobs','[]')) value WHERE value ? 'jobId' LOOP
  SELECT * INTO STRICT work FROM public.vnext_jobs_v1 WHERE job_id=(ticket->>'jobId')::uuid;
  IF work.admission_hash IS DISTINCT FROM inputs->work.symbol->>'hash' OR work.retry_of IS NOT NULL
  THEN RAISE EXCEPTION 'vnext_launch_research_admission_mismatch'; END IF;
  IF ticket->>'replay'='true' THEN
   IF NOT EXISTS(SELECT FROM public.vnext_launch_research_admissions_v1 binding WHERE binding.job_id=work.job_id
     AND binding.admission_hash=work.admission_hash AND binding.policy_version=policy)
   THEN RAISE EXCEPTION 'vnext_launch_research_admission_mismatch'; END IF;
  ELSE
   IF work.state<>'queued' THEN RAISE EXCEPTION 'vnext_launch_research_admission_mismatch'; END IF;
   INSERT INTO public.vnext_launch_research_admissions_v1(job_id,admission_hash,policy_version)
    VALUES(work.job_id,work.admission_hash,policy);
  END IF;
 END LOOP;
 RETURN admitted;
END $$;
ALTER FUNCTION public.vnext_launch_enqueue_research_v1(text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_enqueue_research_v1(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_launch_enqueue_research_v1(text,jsonb) TO service_role;

CREATE FUNCTION public.vnext_launch_research_policy_v1(p_principal text,p_job uuid,p_execution uuid,p_input_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
 SELECT jsonb_build_object('researchPolicyVersion',binding.policy_version)
 FROM public.vnext_jobs_v1 work
 JOIN public.vnext_members_v1 member ON member.symbol=work.symbol AND member.input_hash=work.input_hash
 JOIN public.vnext_launch_research_admissions_v1 binding ON binding.job_id=coalesce(work.retry_of,work.job_id)
 WHERE work.job_id=p_job AND work.execution_id=p_execution AND work.input_hash=p_input_hash
   AND binding.admission_hash=work.admission_hash AND member.evidence->>'researchPolicyVersion'=binding.policy_version
   AND work.author_principal=p_principal AND work.state='running' AND work.deadline_at>statement_timestamp()
   AND member.state<>'exited' AND NOT member.contraindication
   AND EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
   AND EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='author' AND enabled)
   AND public.vnext_input_sources_current_v1(member.evidence,work.symbol) IS TRUE
$$;
ALTER FUNCTION public.vnext_launch_research_policy_v1(text,uuid,uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_research_policy_v1(text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_launch_research_policy_v1(text,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.vnext_check_launch_preparation_policy_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE work public.vnext_jobs_v1; admitted_policy text; marker text;
BEGIN
 SELECT * INTO STRICT work FROM public.vnext_jobs_v1 WHERE job_id=NEW.job_id;
 SELECT member.evidence->>'researchPolicyVersion' INTO marker FROM public.vnext_members_v1 member WHERE member.symbol=work.symbol;
 SELECT binding.policy_version INTO admitted_policy FROM public.vnext_launch_research_admissions_v1 binding
 WHERE binding.job_id=coalesce(work.retry_of,work.job_id) AND binding.admission_hash=work.admission_hash;
 IF marker IS DISTINCT FROM admitted_policy OR NEW.evidence->>'researchPolicyVersion' IS DISTINCT FROM admitted_policy
 THEN RAISE EXCEPTION 'vnext_launch_research_preparation_policy_mismatch'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_check_launch_preparation_policy_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_check_launch_preparation_policy_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vnext_launch_research_preparation_policy BEFORE INSERT ON public.vnext_preparations_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_check_launch_preparation_policy_v1();
COMMIT;

