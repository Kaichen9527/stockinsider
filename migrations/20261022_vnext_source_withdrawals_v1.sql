-- Additive candidate: permanent per-content rights withdrawal, preserving historical research.
-- Exact predecessor bodies from frozen analysis38eb; no old migration, ACL or budget changes.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
CREATE TABLE public.vnext_source_withdrawals_v1(
 content_hash text PRIMARY KEY REFERENCES public.vnext_extractions_v1(content_hash),
 payload jsonb NOT NULL, event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'), logical_bytes integer NOT NULL CHECK(logical_bytes BETWEEN 1 AND 8192)
);
ALTER TABLE public.vnext_source_withdrawals_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_source_withdrawals_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_source_withdrawals_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_source_withdrawal_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'vnext_source_withdrawal_append_only'; END
$$;
ALTER FUNCTION public.vnext_source_withdrawal_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_source_withdrawal_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_source_withdrawal_append_only BEFORE UPDATE OR DELETE ON public.vnext_source_withdrawals_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_source_withdrawal_immutable_v1();
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_source_withdrawals_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_source_withdrawal_v1(p_principal text,p_operation text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE receipt public.vnext_extractions_v1; existing public.vnext_source_withdrawals_v1; event jsonb; canonical text; actor text;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) OR octet_length(p_request::text)>8192 OR coalesce(p_request->>'contentHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_withdrawal_request_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) THEN RAISE EXCEPTION 'vnext_database_mode_not_enabled'; END IF;
 SELECT role INTO actor FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled;
 IF actor IS DISTINCT FROM 'operator' THEN RAISE EXCEPTION 'vnext_operator_required'; END IF;
 IF p_operation='read' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>1 THEN RAISE EXCEPTION 'vnext_withdrawal_closed_shape'; END IF;
 ELSIF p_operation='commit' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>3 OR EXISTS(SELECT FROM jsonb_object_keys(p_request) key WHERE key NOT IN('contentHash','reason','citation')) OR coalesce(p_request->>'reason','') NOT IN('source_withdrawn','rights_revoked','source_retracted') OR jsonb_typeof(p_request->'citation') IS DISTINCT FROM 'string' OR octet_length(p_request->>'citation') NOT BETWEEN 1 AND 2048 OR p_request->>'citation' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(/|$)' OR p_request->>'citation' ~* '^https://[^/]*\.(local|internal|test)(/|$)' OR p_request->>'citation' ~ '[[:space:][:cntrl:]@#]' OR p_request->>'citation' ~* '(paid|member|premium|subscription|login|authenticate|[?&](token|password|auth|credential|secret|signature)=)' OR p_request->>'citation' ~* '^https://(t\.me|telegram\.me)/(c/|joinchat/|\+)' THEN RAISE EXCEPTION 'vnext_withdrawal_closed_shape'; END IF;
 ELSE RAISE EXCEPTION 'vnext_withdrawal_operation'; END IF;
 SELECT * INTO existing FROM public.vnext_source_withdrawals_v1 WHERE content_hash=p_request->>'contentHash';
 IF existing.content_hash IS NOT NULL THEN
  IF p_operation='commit' AND (existing.payload->>'principal' IS DISTINCT FROM p_principal OR existing.payload->>'reason' IS DISTINCT FROM p_request->>'reason' OR existing.payload->>'citation' IS DISTINCT FROM p_request->>'citation') THEN RAISE EXCEPTION 'vnext_withdrawal_replay_conflict'; END IF;
  RETURN jsonb_build_object('payload',existing.payload,'hash',existing.event_hash,'logicalBytes',existing.logical_bytes);
 END IF;
 IF p_operation='read' THEN RETURN jsonb_build_object('absent',true); END IF;
 SELECT * INTO receipt FROM public.vnext_extractions_v1 WHERE content_hash=p_request->>'contentHash';
 IF receipt.content_hash IS NULL OR receipt.state<>'completed' THEN RAISE EXCEPTION 'vnext_withdrawal_completed_source_required'; END IF;
 event:=jsonb_build_object('schemaVersion','stockinsider-vnext-source-withdrawal-v1','withdrawalId',gen_random_uuid(),'contentHash',receipt.content_hash,'reason',p_request->>'reason','citation',p_request->>'citation','principal',p_principal,'createdAt',clock_timestamp(),'sourceReceiptHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(receipt)),'UTF8')),'hex'));
 canonical:=public.vnext_catalog_canonical_v1(event);
 INSERT INTO public.vnext_source_withdrawals_v1(content_hash,payload,event_hash,logical_bytes) VALUES(receipt.content_hash,event,encode(sha256(convert_to(canonical,'UTF8')),'hex'),octet_length(convert_to(canonical,'UTF8'))) RETURNING * INTO existing;
 RETURN jsonb_build_object('payload',existing.payload,'hash',existing.event_hash,'logicalBytes',existing.logical_bytes);
END
$$;
ALTER FUNCTION public.vnext_source_withdrawal_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_source_withdrawal_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_source_withdrawal_v1(text,text,jsonb) TO service_role;

DO $patch$ DECLARE original text; definition text; target oid:='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'23b7bc55a4b7241f46e8e8b0bd69f3107db98e62c8d1b04a0cc293c09c44b610' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text OR before_metadata->>'prosecdef' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'vnext_withdrawal_predecessor_vnext_source_evidence_current_v1'; END IF;
 definition:=pg_get_functiondef(target);
 definition:=replace(definition,original,$replacement$
 SELECT EXISTS(SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
 WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=receipt.content_hash) AND receipt.state='completed' AND receipt.scope IN('official_original','operator_claim') AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
 AND receipt.extraction->'evidence'=item AND receipt.content_hash=item->>'contentHash' AND EXISTS(SELECT FROM jsonb_array_elements(receipt.extraction->'clues') clue WHERE clue->>'symbol'=p_symbol)
 AND ((receipt.original->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (receipt.original->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months'))
$replacement$);
 EXECUTE definition;
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'712c701f18809a44fb788453e5e12a9d98b93f28ee3573973606d94bb739f0e8' THEN RAISE EXCEPTION 'vnext_withdrawal_postcondition_vnext_source_evidence_current_v1'; END IF;
END $patch$;

DO $patch$ DECLARE original text; definition text; target oid:='public.vnext_analysis_command_v1(text,text,jsonb)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'fbadeebc2a6120d07abe8d31dd74202a2834da9134d95734ee24d0e142317014' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text OR before_metadata->>'prosecdef' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'vnext_withdrawal_predecessor_vnext_analysis_command_v1'; END IF;
 definition:=pg_get_functiondef(target);
 definition:=replace(definition,original,$replacement$
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
  IF EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=item->>'contentHash') THEN RETURN jsonb_build_object('parse',false,'deferred','source_content_withdrawn'); END IF;
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
  IF EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=receipt.content_hash) THEN RAISE EXCEPTION 'vnext_source_content_withdrawn'; END IF;
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
   answer:=answer||jsonb_build_object(row_item.symbol,jsonb_build_object('clues',coalesce((SELECT jsonb_agg(clue) FROM public.vnext_extractions_v1 x JOIN public.vnext_source_policies_v1 p ON p.source=x.source AND p.scope=x.scope CROSS JOIN LATERAL jsonb_array_elements(x.extraction->'clues') clue WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=x.content_hash) AND x.state='completed' AND p.enabled AND p.valid_until>clock_timestamp() AND p.rights_subject=x.rights_subject AND p.license_basis=x.license_basis AND clue->>'symbol'=row_item.symbol AND ((clue->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (clue->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months')),'[]'::jsonb),
    'evidence',coalesce((SELECT jsonb_agg(evidence) FROM(SELECT x.extraction->'evidence' AS evidence FROM public.vnext_extractions_v1 x WHERE public.vnext_source_evidence_current_v1(x.extraction->'evidence',row_item.symbol) ORDER BY x.created_at DESC LIMIT 4) items),'[]'::jsonb)));
  END LOOP; RETURN answer;
 ELSIF p_command='source-clues' THEN RETURN jsonb_build_object('clues',coalesce((SELECT jsonb_agg(clue) FROM public.vnext_extractions_v1 x JOIN public.vnext_source_policies_v1 p ON p.source=x.source AND p.scope=x.scope CROSS JOIN LATERAL jsonb_array_elements(x.extraction->'clues') clue WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=x.content_hash) AND x.state='completed' AND p.enabled AND p.valid_until>clock_timestamp() AND p.rights_subject=x.rights_subject AND p.license_basis=x.license_basis AND ((clue->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (clue->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months')),'[]'::jsonb));
 ELSE RAISE EXCEPTION 'vnext_analysis_command_unsupported'; END IF;
END $replacement$);
 EXECUTE definition;
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'9573bf8ed9f9f50704fecbdfc82df6259c5d843cd0237e0e8b20c4ae483ba54b' THEN RAISE EXCEPTION 'vnext_withdrawal_postcondition_vnext_analysis_command_v1'; END IF;
END $patch$;

DO $patch$ DECLARE original text; definition text; target oid:='public.vnext_market_events_current_v1(jsonb)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'f948fd6302b286ea64fd4b7cf45733923209f69d573cd1d49ab69a6ef33e3530' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text OR before_metadata->>'prosecdef' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'vnext_withdrawal_predecessor_vnext_market_events_current_v1'; END IF;
 definition:=pg_get_functiondef(target);
 definition:=replace(definition,original,$replacement$
 SELECT jsonb_typeof((request->>'input')::jsonb->'events')='array'
 AND jsonb_array_length((request->>'input')::jsonb->'events') BETWEEN 1 AND 12
 AND NOT EXISTS(SELECT FROM jsonb_array_elements((request->>'input')::jsonb->'events') frozen_event WHERE NOT EXISTS(
  SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
  WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=receipt.content_hash) AND receipt.content_hash=frozen_event->>'content_hash' AND receipt.original=frozen_event->'original' AND receipt.state='completed' AND receipt.scope='official_original'
   AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
   AND (receipt.original->>'eventAt')::timestamptz BETWEEN clock_timestamp()-interval '7 days' AND clock_timestamp()))
$replacement$);
 EXECUTE definition;
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'870a38343210c3252fe3edac0aa1dfd98f6ddb6164d40d5568d1f71a6e03d418' THEN RAISE EXCEPTION 'vnext_withdrawal_postcondition_vnext_market_events_current_v1'; END IF;
END $patch$;

COMMIT;
