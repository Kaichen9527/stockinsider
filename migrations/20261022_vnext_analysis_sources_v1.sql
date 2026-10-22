BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
CREATE TABLE public.vnext_source_policies_v1(source text NOT NULL,scope text NOT NULL CHECK(scope IN('metadata','official_original','operator_claim')),license_basis text NOT NULL,rights_subject text NOT NULL,valid_until timestamptz NOT NULL,enabled boolean NOT NULL DEFAULT false,PRIMARY KEY(source,scope),CHECK(source='ptt' AND scope='metadata' OR source='official' AND scope='official_original' OR source IN('telegram','investanchors') AND scope='operator_claim'));
CREATE TABLE public.vnext_extractions_v1(content_hash text PRIMARY KEY,source text NOT NULL,scope text NOT NULL,original jsonb NOT NULL,state text NOT NULL CHECK(state IN('reserved','completed','failed')),processing_date date NOT NULL DEFAULT(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date,principal text NOT NULL,rights_subject text NOT NULL,license_basis text NOT NULL,extraction jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz);
CREATE TABLE public.vnext_analysis_bindings_v1(principal text PRIMARY KEY REFERENCES public.vnext_principals_v1,provider text NOT NULL CHECK(provider='openai-responses'),model text NOT NULL,model_version text NOT NULL,credential_identity text NOT NULL CHECK(credential_identity ~ '^[a-f0-9]{64}$'),instructions text NOT NULL,enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.vnext_market_interpretations_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),snapshot_key text NOT NULL UNIQUE,principal text NOT NULL,execution_id uuid NOT NULL DEFAULT gen_random_uuid(),provider text NOT NULL,model text NOT NULL,model_version text NOT NULL,credential_identity text NOT NULL,input_hash text NOT NULL,frozen_request jsonb NOT NULL,state text NOT NULL CHECK(state IN('dispatching','pending','uncertain','completed','failed')),provider_response_id text,raw_response jsonb,output jsonb,error text,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '120 seconds',settled_at timestamptz);
CREATE UNIQUE INDEX vnext_market_provider_identity ON public.vnext_market_interpretations_v1(provider,provider_response_id) WHERE provider_response_id IS NOT NULL;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['vnext_source_policies_v1','vnext_extractions_v1','vnext_analysis_bindings_v1','vnext_market_interpretations_v1'] LOOP
 EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',t);EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',t);END LOOP; END $$;
CREATE FUNCTION public.vnext_source_evidence_current_v1(item jsonb,p_symbol text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
 WHERE receipt.state='completed' AND receipt.scope IN('official_original','operator_claim') AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
 AND receipt.extraction->'evidence'=item AND receipt.content_hash=item->>'contentHash' AND EXISTS(SELECT FROM jsonb_array_elements(receipt.extraction->'clues') clue WHERE clue->>'symbol'=p_symbol)
 AND ((receipt.original->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (receipt.original->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months'))
$$;
ALTER FUNCTION public.vnext_source_evidence_current_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_source_evidence_current_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_analysis_command_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE actor text; item jsonb; receipt public.vnext_extractions_v1; policy public.vnext_source_policies_v1; total integer; per_source integer; current_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date; answer jsonb; row_item record;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_analysis_request_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) THEN RAISE EXCEPTION 'vnext_database_mode_not_enabled'; END IF;
 SELECT role INTO actor FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled;
 IF actor IS DISTINCT FROM 'operator' THEN RAISE EXCEPTION 'vnext_operator_required'; END IF;
 IF p_command='source-policies' THEN RETURN jsonb_build_object('policies',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.vnext_source_policies_v1 p WHERE enabled AND valid_until>clock_timestamp()),'[]'::jsonb));
 ELSIF p_command='source-reserve' THEN
  item:=p_request->'item';
  SELECT * INTO receipt FROM public.vnext_extractions_v1 WHERE content_hash=item->>'contentHash';
  IF receipt.content_hash IS NOT NULL THEN RETURN jsonb_build_object('parse',false,'state',receipt.state,'contentHash',receipt.content_hash,'replay',true); END IF;
  SELECT * INTO policy FROM public.vnext_source_policies_v1 WHERE source=item->>'source' AND scope=item->>'scope' AND enabled AND valid_until>clock_timestamp();
  IF policy.source IS NULL THEN RETURN jsonb_build_object('parse',false,'deferred','source_rights_not_current'); END IF;
  IF coalesce(item->>'contentHash','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(item->'original') IS DISTINCT FROM 'object' OR item->'original'->>'source' IS DISTINCT FROM policy.source OR item->'original'->>'scope' IS DISTINCT FROM policy.scope THEN RAISE EXCEPTION 'vnext_source_receipt_invalid'; END IF;
  IF policy.source IN('telegram','investanchors') AND (policy.scope<>'operator_claim' OR item->'original' ? 'body' OR item->'original' ? 'title' OR item->'original'->>'rightsAttested' IS DISTINCT FROM 'true' OR item->'original'->>'operatorAuthored' IS DISTINCT FROM 'true' OR length(coalesce(item->'original'->>'statement','')) NOT BETWEEN 1 AND 320 OR coalesce(item->'original'->>'url','') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(/|$)' OR coalesce(item->'original'->>'url','') ~* '^https://[^/]*\.(local|internal|test)(/|$)' OR coalesce(item->'original'->>'url','') ~* '^https://(t\.me|telegram\.me)/(c/|joinchat/|\+)'  OR coalesce(item->'original'->>'url','') ~* '(paid|member|premium|subscription|login|authenticate|[?&](token|password|auth|credential|secret|signature)=)' OR jsonb_array_length(coalesce(item->'original'->'symbols','[]'::jsonb))=0 OR nullif(item->'original'->>'originalRoot','') IS NULL OR nullif(item->'original'->>'authorRoot','') IS NULL) THEN RAISE EXCEPTION 'vnext_raw_channel_forbidden'; END IF;
  IF policy.scope='operator_claim' AND (item->'original'->>'authorRoot' IS DISTINCT FROM 'operator:'||p_principal OR item->'original'->>'originalRoot' IS DISTINCT FROM item->'original'->>'url' OR (item->'original'->>'availableAt')::timestamptz<clock_timestamp()-interval '120 seconds') THEN RAISE EXCEPTION 'vnext_operator_claim_identity_or_citation_binding'; END IF;
  IF policy.scope='metadata' AND (coalesce(item->'original'->>'authorRoot','')<>'' OR coalesce(item->'original'->>'originalRoot','')<>'') THEN RAISE EXCEPTION 'vnext_ptt_unresolved_independence'; END IF;
  IF item->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('source',policy.source,'scope',policy.scope,'url',item->'original'->>'url','eventAt',item->'original'->>'eventAt','publishedAt',item->'original'->>'publishedAt','eventBasis',item->'original'->>'eventBasis','value',CASE policy.scope WHEN 'operator_claim' THEN item->'original'->>'statement' WHEN 'metadata' THEN item->'original'->>'title' ELSE item->'original'->>'body' END,'originalRoot',item->'original'->>'originalRoot','authorRoot',item->'original'->>'authorRoot','catalystUntil',item->'original'->>'catalystUntil')),'UTF8')),'hex') THEN RAISE EXCEPTION 'vnext_source_original_hash_mismatch'; END IF;
  IF EXISTS(SELECT FROM jsonb_object_keys(item->'original') key WHERE key NOT IN('id','source','scope','url','eventAt','publishedAt','eventBasis','availableAt','symbols','authorRoot','originalRoot','title','body','statement','rightsAttested','operatorAuthored','catalystUntil')) THEN RAISE EXCEPTION 'vnext_source_original_fields'; END IF;
  IF nullif(item->'original'->>'eventAt','') IS NULL OR nullif(item->'original'->>'publishedAt','') IS NULL OR coalesce(item->'original'->>'eventBasis','') NOT IN('source_publication','original_event','operator_attested') OR nullif(item->'original'->>'availableAt','') IS NULL OR (item->'original'->>'eventAt')::timestamptz>(item->'original'->>'publishedAt')::timestamptz OR (item->'original'->>'publishedAt')::timestamptz>(item->'original'->>'availableAt')::timestamptz OR (item->'original'->>'availableAt')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'vnext_source_original_clocks'; END IF;
  IF policy.scope='official_original' AND (coalesce(item->'original'->>'url','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR jsonb_typeof(item->'original'->'body') IS DISTINCT FROM 'string' OR octet_length(convert_to(item->'original'->>'body','UTF8')) NOT BETWEEN 1 AND 16384) THEN RAISE EXCEPTION 'vnext_official_source_body_bounds'; END IF;
  IF item->'original' ? 'catalystUntil' AND NOT ((item->'original'->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months') THEN RAISE EXCEPTION 'vnext_catalyst_original_window'; END IF;
  IF policy.scope='metadata' AND (item->'original' ? 'body' OR item->'original' ? 'statement' OR length(coalesce(item->'original'->>'title',''))>512 OR coalesce(item->'original'->>'url','') !~ '^https://(www\.)?ptt\.cc/bbs/Stock/[A-Za-z0-9._-]+\.html$') THEN RAISE EXCEPTION 'vnext_metadata_source_bounds'; END IF;
  SELECT count(*),count(*) FILTER(WHERE source=item->>'source') INTO total,per_source FROM(SELECT content_hash,source FROM public.vnext_content_v1 WHERE processing_date=current_day UNION SELECT content_hash,source FROM public.vnext_extractions_v1 WHERE processing_date=current_day) batch;
  IF total>=200 OR per_source>=50 THEN RETURN jsonb_build_object('parse',false,'deferred','daily_content_budget'); END IF;
  INSERT INTO public.vnext_extractions_v1(content_hash,source,scope,original,state,principal,rights_subject,license_basis) VALUES(item->>'contentHash',policy.source,policy.scope,item->'original','reserved',p_principal,policy.rights_subject,policy.license_basis);
  RETURN jsonb_build_object('parse',true,'contentHash',item->>'contentHash');
 ELSIF p_command='source-complete' THEN
  SELECT * INTO receipt FROM public.vnext_extractions_v1 WHERE content_hash=p_request->>'contentHash';
  item:=p_request->'extraction';
  IF receipt.content_hash IS NULL OR receipt.principal<>p_principal OR item->'original' IS DISTINCT FROM receipt.original OR item->>'contentHash' IS DISTINCT FROM receipt.content_hash OR item->>'source' IS DISTINCT FROM receipt.source OR item->>'scope' IS DISTINCT FROM receipt.scope OR jsonb_typeof(item->'clues') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'clues')>12 THEN RAISE EXCEPTION 'vnext_source_completion_binding'; END IF;
  IF NOT EXISTS(SELECT FROM public.vnext_source_policies_v1 p WHERE p.source=receipt.source AND p.scope=receipt.scope AND p.enabled AND p.valid_until>clock_timestamp() AND p.rights_subject=receipt.rights_subject AND p.license_basis=receipt.license_basis) THEN RAISE EXCEPTION 'vnext_source_rights_no_longer_current'; END IF;
  IF receipt.state='completed' THEN IF receipt.extraction IS DISTINCT FROM item THEN RAISE EXCEPTION 'vnext_source_immutable_output'; END IF;RETURN jsonb_build_object('replay',true); END IF;
  IF receipt.scope='metadata' AND item->'evidence'<>'null'::jsonb THEN RAISE EXCEPTION 'vnext_metadata_not_body_evidence'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(item->'clues') clue WHERE clue->>'contentHash' IS DISTINCT FROM receipt.content_hash OR clue->>'source' IS DISTINCT FROM receipt.source OR clue->>'root' IS DISTINCT FROM receipt.original->>'originalRoot' OR clue->>'authorRoot' IS DISTINCT FROM receipt.original->>'authorRoot' OR clue->>'eventAt' IS DISTINCT FROM receipt.original->>'eventAt' OR clue->>'availableAt' IS DISTINCT FROM receipt.original->>'availableAt' OR NOT (receipt.original->'symbols' ? (clue->>'symbol')) OR coalesce(clue->>'symbol','') !~ '^[0-9]{4}$') THEN RAISE EXCEPTION 'vnext_source_clue_binding'; END IF;
  IF receipt.scope<>'metadata' AND item->'evidence' IS DISTINCT FROM jsonb_build_object('id','content:'||receipt.content_hash,'key','reported_event','value',jsonb_build_object('scope',receipt.scope,'originSource',receipt.source,'claimStatus',CASE WHEN receipt.scope='operator_claim' THEN 'rumor' ELSE 'reported' END,'publishedAt',receipt.original->>'publishedAt','eventBasis',receipt.original->>'eventBasis','statement',CASE WHEN receipt.scope='operator_claim' THEN receipt.original->>'statement' ELSE receipt.original->>'body' END,'originalContentHash',receipt.content_hash),'source',receipt.original->>'url','sourceTier',CASE WHEN receipt.scope='operator_claim' THEN 'operator' ELSE 'public' END,'kind','assumption','eventAt',receipt.original->>'eventAt','availableAt',receipt.original->>'availableAt','contentHash',receipt.content_hash) THEN RAISE EXCEPTION 'vnext_source_original_evidence_binding'; END IF;
  UPDATE public.vnext_extractions_v1 SET state='completed',extraction=item,completed_at=clock_timestamp() WHERE content_hash=receipt.content_hash;
  RETURN jsonb_build_object('parsed',true,'clues',jsonb_array_length(item->'clues'),'contentHash',receipt.content_hash);
 ELSIF p_command='source-projection' THEN
  IF jsonb_typeof(p_request->'symbols') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'symbols')>20 THEN RAISE EXCEPTION 'vnext_source_projection_scope'; END IF;
  answer:='{}'::jsonb;
  FOR row_item IN SELECT DISTINCT jsonb_array_elements_text(p_request->'symbols') AS symbol LOOP
   answer:=answer||jsonb_build_object(row_item.symbol,jsonb_build_object('clues',coalesce((SELECT jsonb_agg(clue) FROM public.vnext_extractions_v1 x JOIN public.vnext_source_policies_v1 p ON p.source=x.source AND p.scope=x.scope CROSS JOIN LATERAL jsonb_array_elements(x.extraction->'clues') clue WHERE x.state='completed' AND p.enabled AND p.valid_until>clock_timestamp() AND p.rights_subject=x.rights_subject AND p.license_basis=x.license_basis AND clue->>'symbol'=row_item.symbol AND ((clue->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (clue->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months')),'[]'::jsonb),
    'evidence',coalesce((SELECT jsonb_agg(evidence) FROM(SELECT x.extraction->'evidence' AS evidence FROM public.vnext_extractions_v1 x WHERE public.vnext_source_evidence_current_v1(x.extraction->'evidence',row_item.symbol) ORDER BY x.created_at DESC LIMIT 4) items),'[]'::jsonb)));
  END LOOP; RETURN answer;
 ELSIF p_command='source-clues' THEN RETURN jsonb_build_object('clues',coalesce((SELECT jsonb_agg(clue) FROM public.vnext_extractions_v1 x JOIN public.vnext_source_policies_v1 p ON p.source=x.source AND p.scope=x.scope CROSS JOIN LATERAL jsonb_array_elements(x.extraction->'clues') clue WHERE x.state='completed' AND p.enabled AND p.valid_until>clock_timestamp() AND p.rights_subject=x.rights_subject AND p.license_basis=x.license_basis AND ((clue->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (clue->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months')),'[]'::jsonb));
 ELSE RAISE EXCEPTION 'vnext_analysis_command_unsupported'; END IF;
END $$;
ALTER FUNCTION public.vnext_analysis_command_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_analysis_command_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_analysis_command_v1(text,text,jsonb) TO service_role;

DO $provider_source_extension$
DECLARE original text; definition text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=to_regprocedure('public.vnext_provider_command_v1(text,text,jsonb)');
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '2f4c4cae7653b39e518351bdf73621b585d575e5ce52e01087b7b4babc5bd221' THEN RAISE EXCEPTION 'vnext_provider_source_predecessor_changed'; END IF;
 IF position($old_projection$   SELECT FROM jsonb_array_elements(member.evidence->'evidence') fact WHERE fact->>'sourceTier' IS DISTINCT FROM 'official' OR fact->>'kind' IS DISTINCT FROM 'fact'
    OR jsonb_typeof(fact->'value') IS DISTINCT FROM 'number' OR coalesce(fact->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(fact->>'contentHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR nullif(fact->>'key','') IS NULL OR nullif(fact->>'unit','') IS NULL OR nullif(fact->>'period','') IS NULL
    OR nullif(fact->>'eventAt','') IS NULL OR nullif(fact->>'availableAt','') IS NULL OR nullif(member.evidence->>'cutoff','') IS NULL
    OR (fact->>'eventAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz OR (fact->>'availableAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz
    OR EXISTS(SELECT FROM jsonb_object_keys(fact) fact_key WHERE fact_key NOT IN('id','key','value','unit','period','source','sourceTier','kind','contentHash','eventAt','availableAt'))
$old_projection$ IN original)=0 THEN RAISE EXCEPTION 'vnext_provider_source_projection_missing'; END IF;
 EXECUTE replace(definition,original,replace(original,$old_projection$   SELECT FROM jsonb_array_elements(member.evidence->'evidence') fact WHERE fact->>'sourceTier' IS DISTINCT FROM 'official' OR fact->>'kind' IS DISTINCT FROM 'fact'
    OR jsonb_typeof(fact->'value') IS DISTINCT FROM 'number' OR coalesce(fact->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(fact->>'contentHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR nullif(fact->>'key','') IS NULL OR nullif(fact->>'unit','') IS NULL OR nullif(fact->>'period','') IS NULL
    OR nullif(fact->>'eventAt','') IS NULL OR nullif(fact->>'availableAt','') IS NULL OR nullif(member.evidence->>'cutoff','') IS NULL
    OR (fact->>'eventAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz OR (fact->>'availableAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz
    OR EXISTS(SELECT FROM jsonb_object_keys(fact) fact_key WHERE fact_key NOT IN('id','key','value','unit','period','source','sourceTier','kind','contentHash','eventAt','availableAt'))
$old_projection$,$new_projection$   SELECT FROM jsonb_array_elements(member.evidence->'evidence') fact WHERE (fact->>'sourceTier' IS DISTINCT FROM 'official' OR fact->>'kind' IS DISTINCT FROM 'fact'
    OR jsonb_typeof(fact->'value') IS DISTINCT FROM 'number' OR coalesce(fact->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(fact->>'contentHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(fact->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' OR nullif(fact->>'key','') IS NULL OR nullif(fact->>'unit','') IS NULL OR nullif(fact->>'period','') IS NULL
    OR nullif(fact->>'eventAt','') IS NULL OR nullif(fact->>'availableAt','') IS NULL OR nullif(member.evidence->>'cutoff','') IS NULL
    OR (fact->>'eventAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz OR (fact->>'availableAt')::timestamptz>(member.evidence->>'cutoff')::timestamptz
    OR EXISTS(SELECT FROM jsonb_object_keys(fact) fact_key WHERE fact_key NOT IN('id','key','value','unit','period','source','sourceTier','kind','contentHash','eventAt','availableAt'))
) AND NOT public.vnext_source_evidence_current_v1(fact,j.symbol)
$new_projection$));
END $provider_source_extension$;
CREATE FUNCTION public.vnext_analysis_global_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE active_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF TG_TABLE_NAME='vnext_content_v1' THEN
  IF NOT EXISTS(SELECT FROM public.vnext_extractions_v1 WHERE content_hash=NEW.content_hash AND source=NEW.source AND processing_date=NEW.processing_date) THEN
   SELECT count(*) INTO active_count FROM(SELECT content_hash FROM public.vnext_content_v1 WHERE processing_date=NEW.processing_date UNION SELECT content_hash FROM public.vnext_extractions_v1 WHERE processing_date=NEW.processing_date) batch;
   IF active_count>=200 THEN RAISE EXCEPTION 'vnext_content_global_day_limit'; END IF;
   SELECT count(*) INTO active_count FROM(SELECT content_hash FROM public.vnext_content_v1 WHERE processing_date=NEW.processing_date AND source=NEW.source UNION SELECT content_hash FROM public.vnext_extractions_v1 WHERE processing_date=NEW.processing_date AND source=NEW.source) batch;
   IF active_count>=50 THEN RAISE EXCEPTION 'vnext_content_source_day_limit'; END IF;
  END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='vnext_mode_v1' THEN IF NEW.enabled IS DISTINCT FROM OLD.enabled AND EXISTS(SELECT FROM public.vnext_market_interpretations_v1 WHERE state IN('dispatching','uncertain','pending')) THEN RAISE EXCEPTION 'vnext_market_outcome_unsettled'; END IF;RETURN NEW; END IF;
 IF TG_TABLE_NAME='vnext_jobs_v1' THEN
  IF NEW.state='running' AND OLD.state='queued' THEN
   SELECT count(*) INTO active_count FROM public.vnext_jobs_v1 job WHERE job.job_id<>NEW.job_id AND ((job.state IN('running','authored','reviewing') AND job.deadline_at>clock_timestamp()) OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 provider_call WHERE provider_call.job_id=job.job_id AND provider_call.state IN('dispatching','uncertain','pending')));
   active_count:=active_count+(SELECT count(*) FROM public.vnext_market_interpretations_v1 WHERE state IN('dispatching','uncertain','pending'));
   IF active_count>=4 THEN RAISE EXCEPTION 'vnext_global_research_slots_full'; END IF;
  END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='vnext_provider_invocations_v1' THEN
  IF TG_OP='INSERT' THEN
   SELECT count(*) INTO active_count FROM public.vnext_jobs_v1 job WHERE job.job_id<>NEW.job_id AND ((job.state IN('running','authored','reviewing') AND job.deadline_at>clock_timestamp()) OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 provider_call WHERE provider_call.job_id=job.job_id AND provider_call.state IN('dispatching','uncertain','pending')));
   active_count:=active_count+(SELECT count(*) FROM public.vnext_market_interpretations_v1 WHERE state IN('dispatching','uncertain','pending'));
   IF active_count>=4 THEN RAISE EXCEPTION 'vnext_global_research_slots_full'; END IF;
  END IF;
  IF NEW.provider_response_id IS NOT NULL AND EXISTS(SELECT FROM public.vnext_market_interpretations_v1 WHERE provider=NEW.provider AND provider_response_id=NEW.provider_response_id) THEN RAISE EXCEPTION 'vnext_provider_response_reused'; END IF;
 END IF;RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_analysis_global_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_analysis_global_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_content_union_budget BEFORE INSERT ON public.vnext_content_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_analysis_global_guard_v1();
CREATE TRIGGER vnext_market_job_slots BEFORE UPDATE ON public.vnext_jobs_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_analysis_global_guard_v1();
CREATE TRIGGER vnext_market_provider_slots BEFORE INSERT OR UPDATE ON public.vnext_provider_invocations_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_analysis_global_guard_v1();
CREATE TRIGGER vnext_market_mode_idle BEFORE UPDATE ON public.vnext_mode_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_analysis_global_guard_v1();
CREATE FUNCTION public.vnext_market_output_valid_v1(output jsonb,request jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; risk_order text[]:=ARRAY['risk_on','selective','risk_off','breakdown','unknown']; input jsonb:=(request->>'input')::jsonb;
BEGIN
 IF jsonb_typeof(output) IS DISTINCT FROM 'object' OR EXISTS(SELECT FROM jsonb_object_keys(output) key WHERE key NOT IN('risk','mechanisms','gaps')) OR coalesce(output->>'risk','')<>ALL(risk_order)
  OR array_position(risk_order,output->>'risk')<array_position(risk_order,input->'baseline'->>'risk') OR jsonb_typeof(output->'mechanisms') IS DISTINCT FROM 'array' OR jsonb_typeof(output->'gaps') IS DISTINCT FROM 'array' OR jsonb_array_length(output->'mechanisms')>12 THEN RETURN false; END IF;
 IF output->>'risk' IS DISTINCT FROM input->'baseline'->>'risk' AND jsonb_array_length(output->'mechanisms')=0 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(output->'gaps') LOOP IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>512 THEN RETURN false; END IF;END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(output->'mechanisms') LOOP
  IF jsonb_typeof(item)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(item) key WHERE key NOT IN('eventHash','mechanism','counterevidence')) OR length(coalesce(item->>'mechanism','')) NOT BETWEEN 1 AND 2000 OR length(coalesce(item->>'counterevidence','')) NOT BETWEEN 1 AND 2000 OR NOT EXISTS(SELECT FROM jsonb_array_elements(input->'events') event WHERE event->>'content_hash'=item->>'eventHash') THEN RETURN false; END IF;
 END LOOP; RETURN true;
END $$;
ALTER FUNCTION public.vnext_market_output_valid_v1(jsonb,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_market_output_valid_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_market_events_current_v1(request jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_typeof((request->>'input')::jsonb->'events')='array'
 AND jsonb_array_length((request->>'input')::jsonb->'events') BETWEEN 1 AND 12
 AND NOT EXISTS(SELECT FROM jsonb_array_elements((request->>'input')::jsonb->'events') frozen_event WHERE NOT EXISTS(
  SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
  WHERE receipt.content_hash=frozen_event->>'content_hash' AND receipt.original=frozen_event->'original' AND receipt.state='completed' AND receipt.scope='official_original'
   AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
   AND (receipt.original->>'eventAt')::timestamptz BETWEEN clock_timestamp()-interval '7 days' AND clock_timestamp()))
$$;
ALTER FUNCTION public.vnext_market_events_current_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_market_events_current_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_market_publication_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invocation public.vnext_market_interpretations_v1;
BEGIN
 IF NEW.market->'aiInterpretation'->>'status' IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 SELECT * INTO invocation FROM public.vnext_market_interpretations_v1 WHERE id=(NEW.market->'aiInterpretation'->>'invocationId')::uuid;
 IF invocation.id IS NULL OR invocation.state<>'completed' OR NOT public.vnext_market_events_current_v1(invocation.frozen_request)
  OR NEW.market->>'risk' IS DISTINCT FROM invocation.output->>'risk' OR NEW.market->'aiInterpretation'->'mechanisms' IS DISTINCT FROM invocation.output->'mechanisms'
  OR NEW.market->'aiInterpretation'->'gaps' IS DISTINCT FROM invocation.output->'gaps'
  OR NEW.market->>'baselineSnapshotHash' IS DISTINCT FROM ((invocation.frozen_request->>'input')::jsonb->'baseline'->>'snapshotHash')
  OR nullif(NEW.market->>'expiresAt','') IS NULL OR (NEW.market->>'expiresAt')::timestamptz<=clock_timestamp()
  OR invocation.deadline_at<clock_timestamp() AND NOT EXISTS(SELECT FROM public.vnext_home_v1 prior_home WHERE prior_home.market=NEW.market) THEN RAISE EXCEPTION 'vnext_market_publication_original_rights_or_execution'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.vnext_market_publication_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_market_publication_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_market_original_rights BEFORE INSERT OR UPDATE ON public.vnext_home_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_market_publication_guard_v1();
CREATE FUNCTION public.vnext_market_analysis_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE binding public.vnext_analysis_bindings_v1; invocation public.vnext_market_interpretations_v1; baseline jsonb; events jsonb; v_snapshot_key text; document jsonb; frozen_request jsonb; active_count integer;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_analysis_request_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled) THEN RAISE EXCEPTION 'vnext_market_operator_mode_required'; END IF;
 SELECT * INTO binding FROM public.vnext_analysis_bindings_v1 WHERE principal=p_principal AND enabled;
 IF p_command='binding' THEN RETURN coalesce(to_jsonb(binding),'{}'::jsonb); END IF;
 IF binding.principal IS NULL THEN RETURN jsonb_build_object('dispatch',false,'gap','market_provider_binding_missing'); END IF;
 IF p_command IN('reserve','read') THEN
  SELECT market INTO baseline FROM public.vnext_home_v1 WHERE market->>'snapshotHash'=p_request->>'baselineHash' ORDER BY published_at LIMIT 1;
  IF baseline IS NULL THEN RAISE EXCEPTION 'vnext_market_baseline_missing'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(event) ORDER BY content_hash),'[]'::jsonb) INTO events FROM(SELECT content_hash,original FROM public.vnext_extractions_v1 x JOIN public.vnext_source_policies_v1 policy USING(source,scope) WHERE x.state='completed' AND x.scope='official_original' AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=x.rights_subject AND policy.license_basis=x.license_basis AND (x.original->>'eventAt')::timestamptz>=clock_timestamp()-interval '7 days' ORDER BY x.created_at DESC LIMIT 12) event;
  v_snapshot_key:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('baselineHash',p_request->>'baselineHash','events',events)),'UTF8')),'hex');
  SELECT * INTO invocation FROM public.vnext_market_interpretations_v1 market_call WHERE market_call.snapshot_key=v_snapshot_key;
  IF invocation.id IS NOT NULL THEN
   IF NOT public.vnext_market_events_current_v1(invocation.frozen_request) THEN RAISE EXCEPTION 'vnext_market_original_rights_no_longer_current'; END IF;
   RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;
  IF p_command='read' THEN RETURN jsonb_build_object('dispatch',false,'gap','market_snapshot_not_dispatched'); END IF;
  IF baseline->>'risk'='unknown' OR (baseline->>'expiresAt')::timestamptz<=clock_timestamp() OR jsonb_array_length(events)=0 THEN RETURN jsonb_build_object('dispatch',false,'gap','market_core_or_original_events_unavailable'); END IF;
  SELECT count(*) INTO active_count FROM public.vnext_jobs_v1 job WHERE job.state IN('running','authored','reviewing') AND job.deadline_at>clock_timestamp() OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 provider_call WHERE provider_call.job_id=job.job_id AND provider_call.state IN('dispatching','uncertain','pending'));
  active_count:=active_count+(SELECT count(*) FROM public.vnext_market_interpretations_v1 WHERE state IN('dispatching','uncertain','pending'));
  IF active_count>=4 THEN RETURN jsonb_build_object('dispatch',false,'gap','global_external_slots'); END IF;
  document:=jsonb_build_object('schemaVersion','vnext-market-events-v1','baseline',baseline,'events',events,'frozenAt',clock_timestamp());
  frozen_request:=jsonb_build_object('model',binding.model,'instructions',binding.instructions,'input',public.vnext_catalog_canonical_v1(document),'store',true,'max_output_tokens',4000,'text',jsonb_build_object('format',jsonb_build_object('type','json_object')));
  IF NOT public.vnext_provider_envelope_v1(document) OR NOT public.vnext_provider_envelope_v1(frozen_request) THEN RAISE EXCEPTION 'vnext_market_frozen_request_bounds'; END IF;
  INSERT INTO public.vnext_market_interpretations_v1(snapshot_key,principal,provider,model,model_version,credential_identity,input_hash,frozen_request,state) VALUES(v_snapshot_key,p_principal,binding.provider,binding.model,binding.model_version,binding.credential_identity,encode(sha256(convert_to(public.vnext_catalog_canonical_v1(document),'UTF8')),'hex'),frozen_request,'dispatching') RETURNING * INTO invocation;
  RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',true);
 END IF;
 SELECT * INTO invocation FROM public.vnext_market_interpretations_v1 WHERE id=(p_request->>'invocationId')::uuid AND principal=p_principal;
 IF invocation.id IS NULL THEN RAISE EXCEPTION 'vnext_market_invocation_binding'; END IF;
 IF (p_command='publication' OR p_command='lookup-context' AND invocation.state='completed') AND NOT public.vnext_market_events_current_v1(invocation.frozen_request) THEN RAISE EXCEPTION 'vnext_market_original_rights_no_longer_current'; END IF;
 IF p_command='publication' THEN RETURN jsonb_build_object('published',EXISTS(SELECT FROM public.vnext_home_v1 WHERE market->'aiInterpretation'->>'invocationId'=invocation.id::text)); END IF;
 IF p_command='lookup-context' THEN RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false); END IF;
 IF invocation.state IN('completed','failed') THEN
  IF p_command='settle' AND invocation.raw_response IS NOT DISTINCT FROM p_request->'raw' AND invocation.output IS NOT DISTINCT FROM p_request->'output' THEN RETURN to_jsonb(invocation)||jsonb_build_object('replay',true,'dispatch',false); END IF;RAISE EXCEPTION 'vnext_market_settlement_conflict'; END IF;
 IF p_command='uncertain' THEN UPDATE public.vnext_market_interpretations_v1 SET state='uncertain',error='transport_outcome_uncertain' WHERE id=invocation.id;
 ELSIF p_command='settle' THEN
  IF p_request->>'status' NOT IN('completed','failed','pending') OR p_request->>'status' IS NULL OR jsonb_typeof(p_request->'raw') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_market_provider_status'; END IF;
  IF p_request->>'status'<>'failed' AND coalesce(p_request->>'responseId','') !~ '^resp_[A-Za-z0-9_-]{1,180}$' THEN RAISE EXCEPTION 'vnext_market_provider_response_required'; END IF;
  IF invocation.provider_response_id IS NOT NULL AND invocation.provider_response_id IS DISTINCT FROM p_request->>'responseId' THEN RAISE EXCEPTION 'vnext_market_provider_response_changed'; END IF;
  IF EXISTS(SELECT FROM public.vnext_provider_invocations_v1 WHERE provider=invocation.provider AND provider_response_id=p_request->>'responseId') THEN RAISE EXCEPTION 'vnext_provider_response_reused'; END IF;
  IF p_request->>'status'='completed' AND NOT public.vnext_market_output_valid_v1(p_request->'output',invocation.frozen_request) THEN RAISE EXCEPTION 'vnext_market_output_original_downgrade_binding'; END IF;
  UPDATE public.vnext_market_interpretations_v1 SET state=p_request->>'status',provider_response_id=p_request->>'responseId',raw_response=p_request->'raw',output=p_request->'output',error=p_request->>'reason',settled_at=CASE WHEN p_request->>'status' IN('completed','failed') THEN clock_timestamp() END WHERE id=invocation.id;
 ELSE RAISE EXCEPTION 'vnext_market_analysis_command_unsupported'; END IF;
 SELECT * INTO invocation FROM public.vnext_market_interpretations_v1 WHERE id=invocation.id;RETURN to_jsonb(invocation)||jsonb_build_object('dispatch',false);
END $$;
ALTER FUNCTION public.vnext_market_analysis_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_market_analysis_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_market_analysis_v1(text,text,jsonb) TO service_role;
COMMIT;
