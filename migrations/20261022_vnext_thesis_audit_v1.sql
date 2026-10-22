BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
-- Additive candidate only: original migration bytes/ACL/roles remain unchanged.
CREATE TABLE public.vnext_thesis_audits_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,week_start date NOT NULL,session_date date NOT NULL REFERENCES public.vnext_sessions_v1,symbol text NOT NULL REFERENCES public.vnext_members_v1,input_hash text NOT NULL,published_revision uuid REFERENCES public.vnext_publications_v1,material_hash text NOT NULL,report jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(week_start,session_date,symbol,input_hash,material_hash));
ALTER TABLE public.vnext_thesis_audits_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_thesis_audits_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_thesis_audits_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_thesis_audits_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_input_sources_current_v1(input jsonb,p_symbol text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE source_item->>'sourceTier' IS DISTINCT FROM 'official' AND NOT public.vnext_source_evidence_current_v1(source_item,p_symbol)),false)
$$;
ALTER FUNCTION public.vnext_input_sources_current_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_input_sources_current_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
DO $core_current_sources$
DECLARE original text; definition text; changed text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=to_regprocedure('public.vnext_command_v1(text,text,jsonb)');
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '328cb1ed871d94dcb92ca67759eb731ca9082db99547de2b5eb3b62794798af5' THEN RAISE EXCEPTION 'vnext_thesis_core_predecessor_changed'; END IF;
 changed:=replace(original,$old_clues$(SELECT jsonb_agg(claim ORDER BY parsed_at,content_hash) FROM(SELECT * FROM public.vnext_content_v1 WHERE (claim->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (claim->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months' ORDER BY parsed_at DESC LIMIT 200)content)$old_clues$,$new_clues$(SELECT jsonb_agg(content_cache.claim ORDER BY content_cache.parsed_at,content_cache.content_hash) FROM(SELECT content_row.* FROM public.vnext_content_v1 content_row WHERE (content_row.claim->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (content_row.claim->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months' ORDER BY content_row.parsed_at DESC LIMIT 200)content_cache)$new_clues$);
 IF changed=original THEN RAISE EXCEPTION 'vnext_screen_context_alias_predecessor_missing'; END IF;
 changed:=replace(changed,$old_prepare$  IF p_command='prepare' THEN$old_prepare$,$new_prepare$  IF p_command IN('prepare','work-context','author-context','author','review-claim','review-context','review-sources','review','qualification-context','record-qualification','publish') AND NOT public.vnext_input_sources_current_v1(m.evidence,j.symbol) THEN RAISE EXCEPTION 'vnext_research_original_rights_no_longer_current'; END IF;
  IF p_command='prepare' AND NOT public.vnext_input_sources_current_v1(r->'evidence',j.symbol) THEN RAISE EXCEPTION 'vnext_prepared_original_rights_no_longer_current'; END IF;
  IF p_command='prepare' THEN$new_prepare$);
 IF position('vnext_research_original_rights_no_longer_current' IN changed)=0 THEN RAISE EXCEPTION 'vnext_thesis_core_source_seam_missing'; END IF;
 changed:=replace(changed,$old_qualification_replay$    RETURN jsonb_build_object('alreadyPublished',true);$old_qualification_replay$,$new_qualification_replay$    IF NOT public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol) THEN RAISE EXCEPTION 'vnext_research_original_rights_no_longer_current'; END IF;
    RETURN jsonb_build_object('alreadyPublished',true,'sourceRightsCurrent',true);$new_qualification_replay$);
 changed:=replace(changed,$old_publish_replay$   RETURN jsonb_build_object('published',true,'revisionId',v_revision,'replay',true);$old_publish_replay$,$new_publish_replay$   IF NOT public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol) THEN RAISE EXCEPTION 'vnext_research_original_rights_no_longer_current'; END IF;
   RETURN jsonb_build_object('published',true,'revisionId',v_revision,'replay',true,'sourceRightsCurrent',true);$new_publish_replay$);
 changed:=replace(changed,$old_author_replay$   RETURN jsonb_build_object('authored',true,'published',j.state='published','replay',true);$old_author_replay$,$new_author_replay$   RETURN jsonb_build_object('authored',true,'published',j.state='published','replay',true,'historicalReceipt',true,'sourceRightsCurrent',public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol));$new_author_replay$);
 changed:=replace(changed,$old_review_replay$   RETURN jsonb_build_object('reviewRecorded',true,'approved',j.reviewer_result->'approved','replay',true);$old_review_replay$,$new_review_replay$   RETURN jsonb_build_object('reviewRecorded',true,'approved',j.reviewer_result->'approved','replay',true,'historicalReceipt',true,'sourceRightsCurrent',public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol));$new_review_replay$);
 EXECUTE replace(definition,original,changed);
END $core_current_sources$;
DO $provider_current_sources$
DECLARE original text; definition text; changed text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=to_regprocedure('public.vnext_provider_command_v1(text,text,jsonb)');
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '8aab8cb0e2d19a897019caa596a98abc483b457635d1c3375f9816de89da362e' THEN RAISE EXCEPTION 'vnext_thesis_provider_predecessor_changed'; END IF;
 changed:=replace(original,$old_inspect$'jobId',j.job_id,'state',j.state,'symbol',j.symbol$old_inspect$,$new_inspect$'jobId',j.job_id,'state',CASE WHEN j.state='published' AND NOT public.vnext_input_sources_current_v1((SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=j.job_id),j.symbol) THEN 'published_historical' ELSE j.state END,'symbol',j.symbol$new_inspect$);
 IF changed=original THEN RAISE EXCEPTION 'vnext_thesis_provider_inspect_seam_missing'; END IF;
 EXECUTE replace(definition,original,changed);
END $provider_current_sources$;
CREATE FUNCTION public.vnext_thesis_publication_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE work public.vnext_jobs_v1; frozen jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 SELECT * INTO work FROM public.vnext_jobs_v1 WHERE job_id=NEW.job_id;
 SELECT evidence INTO frozen FROM public.vnext_preparations_v1 WHERE job_id=NEW.job_id;
 IF work.job_id IS NULL OR frozen IS NULL OR NOT public.vnext_input_sources_current_v1(frozen,work.symbol) THEN RAISE EXCEPTION 'vnext_publication_original_rights_no_longer_current'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_thesis_publication_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_thesis_publication_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_publication_source_rights BEFORE INSERT OR UPDATE ON public.vnext_publications_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_thesis_publication_guard_v1();
CREATE TRIGGER vnext_qualification_source_rights BEFORE INSERT OR UPDATE ON public.vnext_qualifications_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_thesis_publication_guard_v1();
CREATE FUNCTION public.vnext_thesis_admission_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.state='researching' AND NEW.evidence->>'hash'=NEW.input_hash AND NEW.input_hash IS DISTINCT FROM OLD.input_hash AND NEW.evidence->'auditMaterial' IS NOT NULL AND NEW.evidence->'auditMaterial'<>'null'::jsonb THEN
  IF NEW.evidence->'auditMaterial'->>'auditedInputHash' IS DISTINCT FROM OLD.input_hash OR NOT EXISTS(SELECT FROM public.vnext_thesis_audits_v1 audit WHERE audit.symbol=NEW.symbol AND audit.input_hash=OLD.input_hash AND audit.material_hash=NEW.evidence->'auditMaterial'->>'materialHash' AND audit.published_revision::text=NEW.evidence->'auditMaterial'->>'revisionId' AND audit.report->'materialEvidence'=NEW.evidence->'auditMaterial'->'materialEvidence' AND audit.report->'deepInputs'=NEW.evidence->'deep' AND audit.report->>'materialChanged'='true') THEN RAISE EXCEPTION 'vnext_thesis_admission_material_not_current'; END IF;
 END IF;RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_thesis_admission_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_thesis_admission_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_thesis_material_admission BEFORE INSERT OR UPDATE ON public.vnext_members_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_thesis_admission_guard_v1();
-- Recompute the two deep checklist/valuation weights from raw finite inputs.
CREATE FUNCTION public.vnext_deep_score_v1(input jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE factor text; checks jsonb; required text[]; check_item jsonb; key_name text; met_count integer; valid boolean; points numeric:=0; available numeric:=0; weight numeric; factor_value numeric; factors jsonb:='{}'::jsonb; v jsonb:=input->'valuation'; upside numeric; downside numeric;
BEGIN
 FOREACH factor IN ARRAY ARRAY['valuation','profitability','technicalChips','catalysts','marketLiquidity'] LOOP
  weight:=CASE factor WHEN 'valuation' THEN 30 WHEN 'profitability' THEN 25 WHEN 'technicalChips' THEN 20 WHEN 'catalysts' THEN 15 ELSE 10 END;factor_value:=NULL;
  IF factor='valuation' THEN
   IF NOT EXISTS(SELECT FROM unnest(ARRAY['current','bear','base','bull']) field WHERE jsonb_typeof(v->field) IS DISTINCT FROM 'number' OR (v->>field)::numeric<=0) AND (v->>'bear')::numeric<=(v->>'base')::numeric AND (v->>'base')::numeric<=(v->>'bull')::numeric AND (v->>'bear')::numeric<(v->>'current')::numeric AND v->>'method' IN('forward_pe','forward_pb','normalized_pe','ev_ebitda','dcf') AND jsonb_array_length(coalesce(v->'provenance','[]'::jsonb))>0 AND nullif(v->>'quoteAt','') IS NOT NULL AND nullif(v->>'valuationAt','') IS NOT NULL AND (v->>'quoteAt')::timestamptz<=(input->>'cutoff')::timestamptz AND (v->>'valuationAt')::timestamptz<=(input->>'cutoff')::timestamptz THEN
    upside:=(v->>'base')::numeric/(v->>'current')::numeric-1;downside:=1-(v->>'bear')::numeric/(v->>'current')::numeric;
    IF downside>0 THEN factor_value:=(greatest(0,least(1,upside/0.5))+greatest(0,least(1,upside/downside/3)))/2; END IF;
   END IF;
  ELSE
   required:=CASE factor WHEN 'profitability' THEN ARRAY['margin_stable','cashflow_conversion','competitive_advantage','concentration_disclosed'] WHEN 'technicalChips' THEN ARRAY['trend_valid','volume_confirmed','institutional_confirmed','adjustment_verified'] WHEN 'catalysts' THEN ARRAY['dated','verified','mechanism_documented','falsifier_defined'] ELSE ARRAY['market_known','liquidity_verified','trading_valid','risk_bound'] END;
   checks:=input->(CASE factor WHEN 'catalysts' THEN 'catalystChecklist' ELSE factor||'Checklist' END)->'checks';valid:=jsonb_typeof(checks)='array';met_count:=0;
   FOREACH key_name IN ARRAY required LOOP
    SELECT value INTO check_item FROM jsonb_array_elements(coalesce(checks,'[]'::jsonb)) WHERE value->>'key'=key_name;
    IF (SELECT count(*) FROM jsonb_array_elements(coalesce(checks,'[]'::jsonb)) WHERE value->>'key'=key_name)<>1 OR jsonb_typeof(check_item->'met') IS DISTINCT FROM 'boolean' OR jsonb_array_length(coalesce(check_item->'provenance','[]'::jsonb))=0 OR nullif(check_item->>'observedAt','') IS NULL OR (check_item->>'observedAt')::timestamptz>(input->>'cutoff')::timestamptz THEN valid:=false; END IF;
    IF check_item->>'met'='true' THEN met_count:=met_count+1; END IF;
   END LOOP; IF valid THEN factor_value:=met_count::numeric/array_length(required,1); END IF;
  END IF;
  IF factor_value IS NOT NULL THEN points:=points+factor_value*weight;available:=available+weight; END IF;
  factors:=factors||jsonb_build_object(factor,jsonb_build_object('value',factor_value,'weight',weight));
 END LOOP;
 RETURN jsonb_build_object('confirmedPoints',points,'availableWeight',available,'policyVersion','stockinsider-vnext-20-v1','probability',false,'factors',factors);
END $$;
ALTER FUNCTION public.vnext_deep_score_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_deep_score_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_thesis_command_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE item jsonb; member public.vnext_members_v1; publication public.vnext_publications_v1; total integer; expected integer; score jsonb; current_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_thesis_request_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled AND role='operator') THEN RAISE EXCEPTION 'vnext_thesis_operator_mode_required'; END IF;
 IF p_command='context' THEN RETURN jsonb_build_object('members',coalesce((SELECT jsonb_agg(jsonb_build_object('symbol',m.symbol,'state',m.state,'inputHash',m.input_hash,'evidence',m.evidence,'previousAudit',(SELECT report FROM public.vnext_thesis_audits_v1 prior_audit WHERE prior_audit.symbol=m.symbol AND prior_audit.input_hash=m.input_hash ORDER BY prior_audit.created_at DESC,prior_audit.id DESC LIMIT 1),'publication',(SELECT to_jsonb(pub)||jsonb_build_object('originalEvidence',(SELECT evidence FROM public.vnext_preparations_v1 WHERE job_id=pub.job_id),'review',(SELECT reviewer_result FROM public.vnext_jobs_v1 WHERE job_id=pub.job_id)) FROM public.vnext_publications_v1 pub WHERE pub.symbol=m.symbol ORDER BY pub.published_at DESC,pub.revision_id DESC LIMIT 1))) FROM public.vnext_members_v1 m WHERE m.state<>'exited'),'[]'::jsonb));
 ELSIF p_command='source-current' THEN
  IF jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'items')>500 THEN RAISE EXCEPTION 'vnext_source_current_scope'; END IF;
  RETURN jsonb_build_object('valid',coalesce((SELECT jsonb_agg(current_item->'evidence'->>'id') FROM jsonb_array_elements(p_request->'items') current_item WHERE public.vnext_source_evidence_current_v1(current_item->'evidence',current_item->>'symbol')),'[]'::jsonb));
 ELSIF p_command='dispatch-context' THEN RETURN jsonb_build_object('queued',coalesce((SELECT jsonb_agg(to_jsonb(queued)) FROM(SELECT job_id FROM public.vnext_jobs_v1 WHERE state='queued' ORDER BY created_at,job_id LIMIT 4) queued),'[]'::jsonb),'transientFailures',coalesce((SELECT jsonb_agg(to_jsonb(failed)) FROM(SELECT j.job_id FROM public.vnext_jobs_v1 j JOIN public.vnext_members_v1 m ON m.symbol=j.symbol WHERE j.state='failed' AND j.error='provider_http_429' AND j.attempt_no=0 AND m.state='waiting' AND NOT EXISTS(SELECT FROM public.vnext_jobs_v1 retry WHERE retry.retry_of=j.job_id) AND NOT EXISTS(SELECT FROM public.vnext_provider_invocations_v1 provider_call WHERE provider_call.job_id=j.job_id AND provider_call.state IN('dispatching','uncertain','pending')) ORDER BY j.created_at,j.job_id LIMIT 4) failed),'[]'::jsonb));
 ELSIF p_command='record' THEN
  IF jsonb_typeof(p_request->'reports') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'reports')>20 THEN RAISE EXCEPTION 'vnext_weekly_all_current_members_required'; END IF;
  SELECT count(*) INTO expected FROM public.vnext_members_v1 WHERE state<>'exited';
  IF expected<>jsonb_array_length(p_request->'reports') OR (SELECT count(DISTINCT report->>'symbol') FROM jsonb_array_elements(p_request->'reports') report)<>expected THEN RAISE EXCEPTION 'vnext_weekly_all_current_members_required'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_request->'reports') LOOP
   SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=item->>'symbol' AND state<>'exited';
   SELECT * INTO publication FROM public.vnext_publications_v1 WHERE symbol=member.symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1;
   IF member.symbol IS NULL OR item->>'schemaVersion' IS DISTINCT FROM 'vnext-thesis-audit-v1' OR item->>'inputHash' IS DISTINCT FROM member.input_hash OR item->>'revisionId' IS DISTINCT FROM publication.revision_id::text OR item->>'publishedInputHash' IS DISTINCT FROM publication.input_hash OR coalesce(item->>'materialHash','') !~ '^[a-f0-9]{64}$' OR item->>'session' IS DISTINCT FROM (SELECT session_date::text FROM public.vnext_sessions_v1 WHERE session_date<=current_day ORDER BY session_date DESC LIMIT 1) OR nullif(item->>'cutoff','') IS NULL OR (item->>'cutoff')::timestamptz>clock_timestamp() OR (item->>'cutoff')::timestamptz<clock_timestamp()-interval '120 seconds' OR jsonb_typeof(item->'claimChecks') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'materialReasons') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'deepInputs') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_thesis_report_current_binding'; END IF;
   score:=public.vnext_deep_score_v1(item->'deepInputs');
   IF jsonb_typeof(item->'deepScore') IS DISTINCT FROM 'object' OR jsonb_typeof(item->'deepScore'->'confirmedPoints') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'deepScore'->'availableWeight') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'vnext_thesis_fixed_deep_score_mismatch'; END IF;
   IF abs((score->>'confirmedPoints')::numeric-(item->'deepScore'->>'confirmedPoints')::numeric)>0.00000001 OR score->'availableWeight' IS DISTINCT FROM item->'deepScore'->'availableWeight' THEN RAISE EXCEPTION 'vnext_thesis_fixed_deep_score_mismatch'; END IF;
   INSERT INTO public.vnext_thesis_audits_v1(week_start,session_date,symbol,input_hash,published_revision,material_hash,report) VALUES(date_trunc('week',current_day::timestamp)::date,(item->>'session')::date,member.symbol,member.input_hash,publication.revision_id,item->>'materialHash',item) ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM public.vnext_refresh_home_v1();RETURN jsonb_build_object('reviewed',expected,'substantive_updates_only',true);
 ELSE RAISE EXCEPTION 'vnext_thesis_command_unsupported'; END IF;
END $$;
ALTER FUNCTION public.vnext_thesis_command_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_thesis_command_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_thesis_command_v1(text,text,jsonb) TO service_role;
CREATE FUNCTION public.vnext_thesis_project_v1(document jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; projected jsonb:='[]'::jsonb; current_sources boolean; latest_report jsonb; publication public.vnext_publications_v1; member public.vnext_members_v1; current_session date; source_input jsonb;
BEGIN
 IF document IS NULL THEN RETURN NULL; END IF;
 SELECT session_date INTO current_session FROM public.vnext_sessions_v1 WHERE completed AND close_at<=clock_timestamp() ORDER BY session_date DESC LIMIT 1;
 IF document ? 'members' THEN
  FOR item IN SELECT * FROM jsonb_array_elements(document->'members') LOOP
   SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=item->>'symbol' AND state<>'exited';IF member.symbol IS NULL THEN CONTINUE; END IF;
   SELECT * INTO publication FROM public.vnext_publications_v1 WHERE revision_id=(item->>'revisionId')::uuid;
   SELECT evidence INTO source_input FROM public.vnext_preparations_v1 WHERE job_id=publication.job_id;
   current_sources:=coalesce(public.vnext_input_sources_current_v1(source_input,member.symbol),false);
   SELECT report INTO latest_report FROM public.vnext_thesis_audits_v1 audit WHERE audit.symbol=member.symbol AND audit.input_hash=member.input_hash AND audit.published_revision=publication.revision_id AND publication.input_hash=member.input_hash AND audit.report->>'session'=current_session::text AND audit.created_at<=(document->>'publishedAt')::timestamptz ORDER BY audit.created_at DESC,audit.id DESC LIMIT 1;
   projected:=projected||jsonb_build_array(item||jsonb_build_object('initialScore',item->'score','deepScore',CASE WHEN current_sources THEN latest_report->'deepScore' ELSE NULL END,'deepScoreAt',CASE WHEN current_sources THEN latest_report->>'cutoff' ELSE NULL END,'sourceRights',jsonb_build_object('current',current_sources,'reason',CASE WHEN current_sources THEN NULL ELSE 'original_source_rights_or_revision_unavailable' END)));
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY CASE WHEN (value->'deepScore'->>'availableWeight')::numeric>0 THEN 0 ELSE 1 END,(value->'deepScore'->>'confirmedPoints')::numeric DESC NULLS LAST,(value->'deepScore'->>'availableWeight')::numeric DESC NULLS LAST,(value->'initialScore'->>'confirmedPoints')::numeric DESC NULLS LAST,value->>'eventAt' DESC,value->>'symbol'),'[]'::jsonb) INTO projected FROM jsonb_array_elements(projected);
  RETURN document||jsonb_build_object('members',projected);
 ELSE
  projected:='[]'::jsonb;
  FOR item IN SELECT * FROM jsonb_array_elements(document->'history') LOOP
   SELECT * INTO publication FROM public.vnext_publications_v1 WHERE revision_id=(item->>'revisionId')::uuid;
   SELECT evidence INTO source_input FROM public.vnext_preparations_v1 WHERE job_id=publication.job_id;
   current_sources:=coalesce(public.vnext_input_sources_current_v1(source_input,publication.symbol),false);
   projected:=projected||jsonb_build_array(item||jsonb_build_object('sourceRights',jsonb_build_object('current',current_sources,'reason',CASE WHEN current_sources THEN NULL ELSE 'original_source_rights_no_longer_current' END)));
  END LOOP;
  RETURN document||jsonb_build_object('history',projected);
 END IF;
END $$;
ALTER FUNCTION public.vnext_thesis_project_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_thesis_project_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $current_read_projection$
DECLARE original text; definition text; changed text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=to_regprocedure('public.vnext_read_v1(text)');
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '4de5f2c62006e451aa8db4f14e91f18777e35cf06f1a7f93ae2bc70f776c52d9' THEN RAISE EXCEPTION 'vnext_thesis_read_predecessor_changed'; END IF;
 changed:=replace(replace(original,' SELECT CASE WHEN',' SELECT public.vnext_thesis_project_v1(CASE WHEN'),' END WHERE EXISTS',' END) WHERE EXISTS');
 IF changed=original THEN RAISE EXCEPTION 'vnext_thesis_read_projection_seam_missing'; END IF;
 EXECUTE replace(definition,original,changed);
END $current_read_projection$;
COMMIT;
