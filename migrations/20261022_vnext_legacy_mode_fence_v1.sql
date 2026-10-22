BEGIN;
-- Candidate only: exact installed financial50/publication26 source profile.
-- Preserve old OIDs, owners, ACLs, configuration and original body bytes.
-- No financial-extraction RPC is wrapped: reserve_research_model_v1 accepts
-- only discovery/company/counter-review/technical/strategy/test research roles.
CREATE TABLE public.vnext_legacy_routines_v1(signature text PRIMARY KEY,routine oid NOT NULL,original_source text NOT NULL,wrapped_source text NOT NULL,metadata jsonb NOT NULL);
ALTER TABLE public.vnext_legacy_routines_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_legacy_routines_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_legacy_routines_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_legacy_routines_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_legacy_claim_guard_v1(p_signature text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled) THEN RAISE EXCEPTION 'vnext_legacy_authority_disabled: %',p_signature; END IF;
END $$;
ALTER FUNCTION public.vnext_legacy_claim_guard_v1(text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_legacy_claim_guard_v1(text) FROM PUBLIC,anon,authenticated,service_role;
-- Local canonical serializer is new-owned, independent of predecessor helpers.
CREATE FUNCTION public.vnext_catalog_canonical_v1(value jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(value)='object' THEN
 SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.vnext_catalog_canonical_v1(member),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) item(key,member);
 ELSIF jsonb_typeof(value)='array' THEN
 SELECT '['||coalesce(string_agg(public.vnext_catalog_canonical_v1(member),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY item(member,ord);
 ELSE result:=value::text; END IF; RETURN result;
END $$;
ALTER FUNCTION public.vnext_catalog_canonical_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_catalog_canonical_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $install$
DECLARE target record; routine oid; original text; wrapped text; definition text; metadata jsonb; actual text; original_owner text;
BEGIN
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE NOT enabled AND NOT legacy_fenced) THEN RAISE EXCEPTION 'vnext_fence_requires_disabled_fresh_mode'; END IF;
 FOR target IN SELECT * FROM (VALUES
 ('public.admit_research_observed_roster_v1(text,text)','e99b656fc6fbf5bd7e84a296c5ac52593992bfc682fe1270403831f8c532a32a'),
 ('public.assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text)','af82e407fd1a67139aa3f37bae2a9006c0d0383ddffe8b80cf4af70656585c00'),
 ('public.charge_research_deep_admission_v1()','5c9767f5b722d3a82ade2399cbc6c12d3d84088d5117af0ced50e252e6c1bec6'),
 ('public.claim_candidate_deep_outbox_v1(uuid,text,integer,uuid,text,text)','7c9598f51021c7d913c255ddcc9684e589073b236f96f115edbcdc12efb01bfd'),
 ('public.claim_candidate_dossier_outbox_v5(text,integer)','b0e6b13daf06cc76390ec0bf833caf933f26fecb4084622a7a586d9ffd5390d7'),
 ('public.claim_research_deep_job_v1(text)','923937cb6353058f7c71afc5ecd736b51cfe2df0e484f4496883b9bb5e724441'),
 ('public.claim_research_observed_job_v2(text,text)','dde4f16be9695c3042025b0b77389f86baaed1e056fd55e8fcdb075f8158886d'),
 ('public.enqueue_research_deep_jobs_v1(uuid)','cd08bb3dadb50e41932a06d776ecc8e3764f78380f31a9a03af1fc6708e488d1'),
 ('public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)','a066dadea19379153079f4788753b92ed7c3a4dc65e383b77b95ea8f46a158b7'),
 ('public.record_budgeted_deep_review_v1(uuid,integer,uuid,jsonb)','363b486a3daea07709f5633fc392d9b0a3d49397ac65108cc71dba7b9f6a1fe0'),
 ('public.record_candidate_deep_submission_v1(uuid,text,integer,uuid,text,uuid,text,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)','690c7b3dbb837a7c476869bec776763106d1af7c0a3ec26782240a1651c91e0a'),
 ('public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)','5fb3fb63db033f82fe23a3b1fc8825cc0a785217c0bb77e6f9dfd313b78dc62a'),
 ('public.record_candidate_dossier_submission_v6(uuid,text,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)','b8b6ac590730bb6dd6dc7869c7e85e68b3c3f5086a459bf0a6bbd60616ac6265'),
 ('public.reserve_research_model_v1(text,text,text)','994ebd6020efbfd282e3cde6a256c1eda028fa90f98a6b0dc771d1e5246f3ab8'),
 ('public.store_observed_research_priority_v1(text,timestamp with time zone,text,jsonb,jsonb,jsonb,jsonb)','16c09b908778b00bc2984d6b857689a18c7a6c6f74d15c59e59171735d3ea5c4')
 ) expected(signature,sha256) LOOP
  routine:=to_regprocedure(target.signature);
  IF routine IS NULL THEN RAISE EXCEPTION 'vnext_legacy_predecessor_missing: %',target.signature; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=(SELECT proname FROM pg_proc WHERE oid=routine))<>1 THEN RAISE EXCEPTION 'vnext_legacy_unknown_overload: %',target.signature; END IF;
  SELECT jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,
   'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'leakproof',p.proleakproof,'config',p.proconfig,
   'acl',coalesce((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),'[]'::jsonb),
   'effectiveAcl',coalesce((SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r) FROM unnest(ARRAY['anon','authenticated','authenticator','legacy_correctness_rpc_owner','opportunity_v3_rpc_owner','postgres','research_input_preparation_owner_v2','research_observed_rpc_owner','research_source_fence_owner_v2','service_role','stockinsider','stockinsider_runtime_v319']::text[]) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)) INTO metadata FROM pg_proc p WHERE oid=routine;
  actual:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(metadata),'UTF8')),'hex');
  IF actual IS DISTINCT FROM target.sha256 THEN RAISE EXCEPTION 'vnext_legacy_predecessor_changed: % actual %',target.signature,actual; END IF;
  SELECT prosrc,pg_get_functiondef(oid),pg_get_userbyid(proowner) INTO original,definition,original_owner FROM pg_proc WHERE oid=routine;
  wrapped:=regexp_replace(original,'\mBEGIN\M',E'BEGIN\n PERFORM public.vnext_legacy_claim_guard_v1('||quote_literal(target.signature)||');','i');
  IF wrapped=original THEN RAISE EXCEPTION 'vnext_legacy_outer_begin_missing'; END IF;
  EXECUTE replace(definition,original,wrapped);
  -- Only exact existing execution owners can call this private guard.
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.vnext_legacy_claim_guard_v1(text) TO %I',original_owner);
  INSERT INTO public.vnext_legacy_routines_v1 VALUES(target.signature,routine,original,wrapped,metadata);
 END LOOP;
 UPDATE public.vnext_mode_v1 SET legacy_fenced=true;
END $install$;
CREATE FUNCTION public.vnext_set_mode_v1(p_enabled boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target record; routine oid; metadata jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF p_enabled IS NULL OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE legacy_fenced) THEN RAISE EXCEPTION 'vnext_legacy_fence_not_installed'; END IF;
 FOR target IN SELECT * FROM public.vnext_legacy_routines_v1 LOOP
  routine:=target.routine;
  SELECT jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,
   'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'leakproof',p.proleakproof,'config',p.proconfig,
   'acl',coalesce((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),'[]'::jsonb),
   'effectiveAcl',coalesce((SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r) FROM unnest(ARRAY['anon','authenticated','authenticator','legacy_correctness_rpc_owner','opportunity_v3_rpc_owner','postgres','research_input_preparation_owner_v2','research_observed_rpc_owner','research_source_fence_owner_v2','service_role','stockinsider','stockinsider_runtime_v319']::text[]) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)) INTO metadata FROM pg_proc p WHERE oid=routine;
  IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=target.routine AND prosrc=target.wrapped_source)
   OR (metadata-'definitionSha256') IS DISTINCT FROM (target.metadata-'definitionSha256') THEN RAISE EXCEPTION 'vnext_legacy_fence_drift'; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM public.vnext_jobs_v1 WHERE state IN('queued','running','authored','reviewing')) OR EXISTS(SELECT FROM public.research_deep_jobs_v1 WHERE status='running' AND lease_expires_at>clock_timestamp()) OR EXISTS(SELECT FROM public.candidate_dossier_outbox_v5 WHERE status='running' AND lease_expires_at>clock_timestamp()) OR EXISTS(SELECT FROM public.research_model_reservations_v1 r WHERE r.lease_expires_at>clock_timestamp() AND NOT EXISTS(SELECT FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id)) THEN RAISE EXCEPTION 'vnext_mode_execution_in_progress'; END IF;
 UPDATE public.vnext_mode_v1 SET enabled=p_enabled;
 RETURN p_enabled;
END $$;
ALTER FUNCTION public.vnext_set_mode_v1(boolean) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_set_mode_v1(boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Finite read access for activation's idle checks; existing source ACLs unchanged.
GRANT SELECT ON public.research_deep_jobs_v1,public.candidate_dossier_outbox_v5,public.research_model_reservations_v1,public.research_model_completions_v1 TO stockinsider_vnext_owner;
CREATE POLICY vnext_mode_idle_check ON public.research_deep_jobs_v1 FOR SELECT TO stockinsider_vnext_owner USING(true);
CREATE POLICY vnext_mode_idle_check ON public.candidate_dossier_outbox_v5 FOR SELECT TO stockinsider_vnext_owner USING(true);
CREATE POLICY vnext_mode_idle_check ON public.research_model_reservations_v1 FOR SELECT TO stockinsider_vnext_owner USING(true);
CREATE POLICY vnext_mode_idle_check ON public.research_model_completions_v1 FOR SELECT TO stockinsider_vnext_owner USING(true);
COMMIT;
