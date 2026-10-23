-- Source-only additive candidate; no production application/independent approval.
-- Exact c08/vNext action + fiscal prefix; both existing signatures/ACLs/OIDs held.
-- No new function/table/role/grant; read assessments are observations, NOT exit authority.
BEGIN;
SET LOCAL transaction_isolation='read committed';
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $lock$ BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) THEN RAISE EXCEPTION 'vnext_target_read_installer_busy';END IF;
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
END $lock$;
CREATE TEMP TABLE vnext_target_read_before_v1(value jsonb) ON COMMIT DROP;
DO $pre$ DECLARE state jsonb;catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT FROM jsonb_each($3) edge WHERE a.attrelid=to_regclass('public.'||edge.key) AND edge.value ? a.attname) THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_target_read_v1' AND EXISTS(SELECT FROM jsonb_each($3) edge WHERE p.polrelid=to_regclass('public.'||edge.key)))),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_target_current_v1(text,uuid,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='2cb716f773f8e5069c56f7f85aa20677bd7c83cfa6a12ecc2784ca8ffb8c393f' AND octet_length(convert_to(prosrc,'UTF8'))=17075) THEN RAISE EXCEPTION 'vnext_target_read_predecessor_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_read_v1(text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='8a6eb1914c1292fae55f6683d661976de0a09aaae277a3bbfbdcc6a7ffa85f3d' AND octet_length(convert_to(prosrc,'UTF8'))=1088) THEN RAISE EXCEPTION 'vnext_target_read_predecessor_changed';END IF;
 EXECUTE catalog_sql INTO state USING ARRAY['public.vnext_target_current_v1(text,uuid,text)'::regprocedure::oid,'public.vnext_read_v1(text)'::regprocedure::oid],ARRAY[]::oid[],'{}'::jsonb;INSERT INTO vnext_target_read_before_v1 VALUES(state);
END $pre$;
DO $patch0$ DECLARE original text;definition text;changed text;metadata jsonb;target oid:='public.vnext_target_current_v1(text,uuid,text)'::regprocedure;BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'2cb716f773f8e5069c56f7f85aa20677bd7c83cfa6a12ecc2784ca8ffb8c393f' THEN RAISE EXCEPTION 'vnext_target_read_predecessor_changed';END IF;
 changed:=$successor0$
DECLARE pub public.vnext_publications_v1; job public.vnext_jobs_v1; member public.vnext_members_v1; frozen jsonb; original_quote jsonb; quote_source jsonb; artifact jsonb; review jsonb; claim jsonb; checked jsonb; quote_claim jsonb; scenario jsonb; scenarios jsonb:='{}'::jsonb; key_name text; method text; base numeric; bear numeric; bull numeric; original_price numeric; instrument_rows jsonb; instrument jsonb; price jsonb; receipt jsonb;
 author_call public.vnext_provider_invocations_v1; reviewer_call public.vnext_provider_invocations_v1; author_input jsonb; reviewer_input jsonb; action_receipt jsonb; share_gcd numeric; share_numerator numeric:=1; share_denominator numeric:=1; original_scenarios jsonb; rebasing jsonb;
BEGIN
 IF p_symbol !~ '^[0-9]{4}$' OR p_revision IS NULL OR coalesce(p_input_hash,'') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('deferred','target_current_identity_missing');END IF;
 SELECT * INTO pub FROM public.vnext_publications_v1 WHERE revision_id=p_revision AND symbol=p_symbol;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=p_symbol;
 SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=pub.job_id;
 SELECT preparation.evidence INTO frozen FROM public.vnext_preparations_v1 preparation WHERE preparation.job_id=pub.job_id;
 IF pub.revision_id IS NULL OR member.state='exited' OR member.contraindication OR member.input_hash IS DISTINCT FROM p_input_hash OR pub.input_hash IS DISTINCT FROM p_input_hash OR job.input_hash IS DISTINCT FROM p_input_hash OR job.symbol IS DISTINCT FROM p_symbol OR job.state IS DISTINCT FROM 'published' OR pub.content IS DISTINCT FROM job.author_result OR frozen IS DISTINCT FROM member.evidence OR public.vnext_target_baseline_sources_current_v1(frozen,p_symbol) IS DISTINCT FROM true THEN RETURN jsonb_build_object('deferred','target_current_revision_input_or_rights_unavailable');END IF;
 IF EXISTS(SELECT FROM public.vnext_publications_v1 newer WHERE newer.symbol=p_symbol AND (newer.published_at,newer.revision_id)>(pub.published_at,pub.revision_id)) THEN RETURN jsonb_build_object('deferred','target_newer_publication_exists');END IF;
 IF EXISTS(SELECT FROM public.vnext_jobs_v1 pending WHERE pending.symbol=p_symbol AND pending.state IN('queued','running','authored','reviewing')) OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 unresolved JOIN public.vnext_jobs_v1 unresolved_job ON unresolved_job.job_id=unresolved.job_id WHERE unresolved_job.symbol=p_symbol AND unresolved.state IN('dispatching','pending','uncertain')) OR EXISTS(SELECT FROM public.vnext_thesis_audits_v1 audit WHERE audit.symbol=p_symbol AND audit.created_at>pub.published_at AND audit.report->'materialReasons' ?| ARRAY['verified_financial_inputs_changed','new_permitted_original_content','published_claim_or_period_changed']) THEN RETURN jsonb_build_object('deferred','target_pending_fundamental_or_source_work');END IF;
 artifact:=pub.content;review:=job.reviewer_result;
 IF artifact->>'outputHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(artifact-'outputHash'),'UTF8')),'hex') OR review->>'factsChecked' IS DISTINCT FROM 'true' OR review->>'valuationChecked' IS DISTINCT FROM 'true' OR review->>'claimsChecked' IS DISTINCT FROM 'true' OR jsonb_array_length(coalesce(review->'findings','[]'::jsonb))<>0 OR review->>'approved' IS DISTINCT FROM 'true' OR review->>'authorOutputHash' IS DISTINCT FROM artifact->>'outputHash' OR job.author_principal IS NULL OR job.reviewer_principal IS NULL OR job.author_principal=job.reviewer_principal OR job.execution_id IS NULL OR job.reviewer_execution IS NULL OR job.execution_id=job.reviewer_execution OR job.sources_read_at IS NULL THEN RETURN jsonb_build_object('deferred','target_original_independent_review_missing');END IF;
 SELECT * INTO author_call FROM public.vnext_provider_invocations_v1 WHERE job_id=job.job_id AND task='author';SELECT * INTO reviewer_call FROM public.vnext_provider_invocations_v1 WHERE job_id=job.job_id AND task='reviewer';
 IF author_call.state IS DISTINCT FROM 'completed' OR reviewer_call.state IS DISTINCT FROM 'completed' OR author_call.invocation_id=reviewer_call.invocation_id OR coalesce(author_call.provider_response_id,'') !~ '^resp_[A-Za-z0-9_-]{1,160}$' OR coalesce(reviewer_call.provider_response_id,'') !~ '^resp_[A-Za-z0-9_-]{1,160}$' OR author_call.provider_response_id=reviewer_call.provider_response_id OR author_call.principal IS DISTINCT FROM job.author_principal OR reviewer_call.principal IS DISTINCT FROM job.reviewer_principal OR author_call.execution_id IS DISTINCT FROM job.execution_id OR reviewer_call.execution_id IS DISTINCT FROM job.reviewer_execution OR author_call.input_hash IS DISTINCT FROM p_input_hash OR reviewer_call.input_hash IS DISTINCT FROM p_input_hash OR author_call.normalized_output IS DISTINCT FROM artifact OR reviewer_call.normalized_output IS DISTINCT FROM review OR author_call.settled_at IS NULL OR reviewer_call.settled_at IS NULL OR author_call.settled_at>author_call.deadline_at OR reviewer_call.settled_at>reviewer_call.deadline_at OR author_call.settled_at<author_call.started_at OR reviewer_call.settled_at<reviewer_call.started_at OR author_call.settled_at>job.sources_read_at OR job.sources_read_at>reviewer_call.started_at OR reviewer_call.settled_at>pub.published_at OR author_call.request_hash IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(author_call.frozen_request),'UTF8')),'hex') OR reviewer_call.request_hash IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(reviewer_call.frozen_request),'UTF8')),'hex') THEN RETURN jsonb_build_object('deferred','target_original_provider_receipts_missing');END IF;
 author_input:=(author_call.frozen_request->>'input')::jsonb;reviewer_input:=(reviewer_call.frozen_request->>'input')::jsonb;
 IF author_input IS DISTINCT FROM (jsonb_build_object('schemaVersion','vnext-worker-input-v1','task','author','jobId',job.job_id,'executionId',job.execution_id,'inputHash',job.input_hash,'evidence',jsonb_build_object('cutoff',frozen->'cutoff','evidence',frozen->'evidence'))||CASE WHEN author_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5') THEN jsonb_build_object('symbol',p_symbol) ELSE '{}'::jsonb END) OR reviewer_input IS DISTINCT FROM (jsonb_build_object('schemaVersion','vnext-worker-input-v1','task','reviewer','jobId',job.job_id,'executionId',job.reviewer_execution,'inputHash',job.input_hash,'evidence',jsonb_build_object('cutoff',frozen->'cutoff','evidence',frozen->'evidence'),'authorArtifact',artifact)||CASE WHEN reviewer_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5') THEN jsonb_build_object('symbol',p_symbol) ELSE '{}'::jsonb END) THEN RETURN jsonb_build_object('deferred','target_frozen_review_request_mismatch');END IF;
 PERFORM public.vnext_validate_claims_v1(artifact,frozen->'evidence');
 IF (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->'numeric'->>'key'='current_price')<>1 THEN RETURN jsonb_build_object('deferred','target_original_reviewed_quote_missing');END IF;
 SELECT value INTO quote_claim FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key'='current_price';
 IF quote_claim->'numeric'->>'period' IS DISTINCT FROM artifact->>'quoteDate' OR artifact->>'quoteDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR artifact->>'valuationDate'<artifact->>'quoteDate' OR (artifact->>'valuationDate')::date>(pub.published_at AT TIME ZONE 'Asia/Taipei')::date THEN RETURN jsonb_build_object('deferred','target_original_valuation_dates_invalid');END IF;
 original_price:=(quote_claim->'numeric'->>'value')::numeric;
 FOREACH key_name IN ARRAY ARRAY['valuation_bear','valuation_base','valuation_bull'] LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->'numeric'->>'key'=key_name)<>1 THEN RETURN jsonb_build_object('deferred','target_original_scenario_missing');END IF;
  SELECT value INTO scenario FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key'=key_name;
  IF quote_claim->'numeric'->>'unit' NOT IN('TWD','TWD_per_share','TWD/share') OR scenario->'numeric'->>'unit' NOT IN('TWD','TWD_per_share','TWD/share') OR (scenario->'numeric'->>'value')::numeric<=0 THEN RETURN jsonb_build_object('deferred','target_original_scenario_unit_invalid');END IF;
  scenarios:=scenarios||jsonb_build_object(key_name,scenario);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_each(scenarios) c GROUP BY c.value->'numeric'->>'period' LIMIT 1)<>3 THEN RETURN jsonb_build_object('deferred','target_original_scenario_period_invalid');END IF;
 SELECT substr(c->>'id',11) INTO method FROM jsonb_array_elements(artifact->'claims') c WHERE c->>'id' IN('valuation:forward_pe','valuation:forward_pb','valuation:normalized_pe','valuation:ev_ebitda','valuation:dcf');
 IF method IS NULL OR (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->>'id' IN('valuation:forward_pe','valuation:forward_pb','valuation:normalized_pe','valuation:ev_ebitda','valuation:dcf'))<>1 THEN RETURN jsonb_build_object('deferred','target_original_method_missing');END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key' IN('current_price','valuation_bear','valuation_base','valuation_bull') OR c.value->>'id'='valuation:'||method LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(review->'claimChecks') rc WHERE rc->>'claimId'=claim->>'id' AND rc->>'verdict'='supported')<>1 THEN RETURN jsonb_build_object('deferred','target_original_claim_unreviewed');END IF;
  SELECT value INTO checked FROM jsonb_array_elements(review->'claimChecks') rc WHERE rc.value->>'claimId'=claim->>'id';
  IF EXISTS(SELECT FROM jsonb_array_elements(frozen->'evidence') original WHERE claim->'evidenceIds' ? (original->>'id') AND NOT EXISTS(SELECT FROM jsonb_array_elements(checked->'sources') checked_source WHERE checked_source->>'id'=original->>'id' AND checked_source->>'contentHash'=original->>'contentHash')) THEN RETURN jsonb_build_object('deferred','target_original_claim_source_hash_missing');END IF;
 END LOOP;
 bear:=(scenarios->'valuation_bear'->'numeric'->>'value')::numeric;base:=(scenarios->'valuation_base'->'numeric'->>'value')::numeric;bull:=(scenarios->'valuation_bull'->'numeric'->>'value')::numeric;
 IF NOT(bear>0 AND bear<original_price AND bear<=base AND base<=bull AND base>original_price) THEN RETURN jsonb_build_object('deferred','target_original_reviewed_scenario_unusable');END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(row_item)),'[]'::jsonb) INTO instrument_rows FROM(SELECT instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at FROM public.stock_instruments_v3 WHERE symbol=p_symbol AND instrument_type::text='common_stock' AND source_timestamp<=statement_timestamp() AND recorded_at<=statement_timestamp() AND valid_from<=statement_timestamp() AND (valid_to IS NULL OR valid_to>statement_timestamp()) ORDER BY recorded_at DESC,instrument_authority_id LIMIT 101) row_item;
 IF jsonb_array_length(instrument_rows)=0 OR jsonb_array_length(instrument_rows)>100 THEN RETURN jsonb_build_object('deferred','target_current_instrument_missing');END IF;
 instrument:=instrument_rows->0;
 IF (instrument->>'source_timestamp')::timestamptz>(instrument->>'recorded_at')::timestamptz OR instrument->>'listing_status' IS DISTINCT FROM 'active' OR instrument->>'exchange' NOT IN('TWSE','TPEX') OR instrument->>'provider' IS DISTINCT FROM lower(instrument->>'exchange') OR instrument->>'roster_version' IS DISTINCT FROM 'tw-instrument-roster-v3.0' OR EXISTS(SELECT FROM jsonb_array_elements(instrument_rows) ir WHERE ir->>'recorded_at'=instrument->>'recorded_at' AND (ir-'instrument_authority_id') IS DISTINCT FROM(instrument-'instrument_authority_id')) THEN RETURN jsonb_build_object('deferred','target_current_instrument_conflict');END IF;
 original_quote:=public.vnext_target_quote_v1((instrument->>'stock_id')::uuid,p_symbol,instrument->>'exchange',(artifact->>'quoteDate')::date,pub.published_at);
 IF original_quote ? 'deferred' OR original_quote->>'session' IS DISTINCT FROM artifact->>'quoteDate' OR (original_quote->'quote'->>'raw_close')::numeric IS DISTINCT FROM original_price THEN RETURN jsonb_build_object('deferred','target_original_quote_authority_missing');END IF;
 SELECT value INTO quote_source FROM jsonb_array_elements(frozen->'evidence') original WHERE quote_claim->'evidenceIds' ? (original->>'id') AND original->>'key'='current_price' AND original->>'kind'='fact' AND original->>'sourceTier'='official' AND original->>'id'=original_quote->'quote'->>'observation_id' AND original->'value'=original_quote->'quote'->'raw_close' AND original->>'period'=artifact->>'quoteDate';
 IF quote_source IS NULL OR (quote_source->>'availableAt')::timestamptz>pub.published_at THEN RETURN jsonb_build_object('deferred','target_original_quote_source_binding_missing');END IF;
 IF quote_source->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('observationId',original_quote->'quote'->'observation_id','session',original_quote->'quote'->'session_id','rawClose',original_quote->'quote'->'raw_close','sourceTimestamp',original_quote->'quote'->'source_timestamp','recordedAt',original_quote->'quote'->'recorded_at','sourceUrl',CASE WHEN instrument->>'exchange'='TWSE' THEN 'https://www.twse.com.tw/' ELSE 'https://www.tpex.org.tw/' END)),'UTF8')),'hex') THEN RETURN jsonb_build_object('deferred','target_original_quote_hash_or_numeric_codec_unavailable');END IF;
 price:=public.vnext_target_quote_v1((instrument->>'stock_id')::uuid,p_symbol,instrument->>'exchange',(artifact->>'quoteDate')::date,statement_timestamp());
 IF price ? 'deferred' THEN RETURN price;END IF;
 original_scenarios:=jsonb_build_object('base',base,'bear',bear,'bull',bull,'unit',quote_claim->'numeric'->'unit','quoteAt',artifact->'quoteDate');
 IF price ? 'corporateActionReceipts' THEN
  FOR action_receipt IN SELECT value FROM jsonb_array_elements(price->'corporateActionReceipts') LOOP
   share_numerator:=share_numerator*(action_receipt->'terms'->>'newShares')::numeric;share_denominator:=share_denominator*(action_receipt->'terms'->>'oldShares')::numeric;share_gcd:=gcd(share_numerator,share_denominator);share_numerator:=trim_scale(share_numerator/share_gcd);share_denominator:=trim_scale(share_denominator/share_gcd);
   IF share_numerator*1000000<share_denominator OR share_numerator>share_denominator*1000000 THEN RETURN jsonb_build_object('deferred','target_share_ratio_unusable');END IF;
  END LOOP;
  IF base*1000000<>trunc(base*1000000) OR bear*1000000<>trunc(bear*1000000) OR bull*1000000<>trunc(bull*1000000) OR mod(base*1000000*share_denominator,share_numerator)<>0 OR mod(bear*1000000*share_denominator,share_numerator)<>0 OR mod(bull*1000000*share_denominator,share_numerator)<>0 THEN RETURN jsonb_build_object('deferred','target_exact_decimal_rebase_unavailable');END IF;
  base:=trim_scale(base*share_denominator/share_numerator);bear:=trim_scale(bear*share_denominator/share_numerator);bull:=trim_scale(bull*share_denominator/share_numerator);
  IF bear<0.000001 OR bull>=1e21 THEN RETURN jsonb_build_object('deferred','target_exact_decimal_rebase_unavailable');END IF;
  rebasing:=jsonb_build_object('schemaVersion','vnext-per-share-target-rebase-v1','symbol',p_symbol,'revisionId',p_revision,'originalBaselineHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(original_scenarios||jsonb_build_object('inputHash',p_input_hash,'outputHash',artifact->'outputHash')),'UTF8')),'hex'),'originalInputHash',p_input_hash,'originalOutputHash',artifact->'outputHash','original',original_scenarios,'shareRatio',jsonb_build_object('numerator',share_numerator::text,'denominator',share_denominator::text),'rebased',jsonb_build_object('base',base,'bear',bear,'bull',bull,'unit','TWD_per_share'),'actionReceiptHashes',(SELECT jsonb_agg(value->'receiptHash' ORDER BY ordinality) FROM jsonb_array_elements(price->'corporateActionReceipts') WITH ORDINALITY));
 END IF;
 IF (price->'quote'->>'raw_close')::numeric<base THEN RETURN jsonb_build_object('deferred','target_not_reached','originalBaseline',original_scenarios,'rebasing',CASE WHEN rebasing IS NULL THEN NULL ELSE rebasing||jsonb_build_object('receiptHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(rebasing),'UTF8')),'hex')) END,'currentPrice',jsonb_build_object('value',price->'quote'->'raw_close','session',price->>'session','observationId',price->'quote'->>'observation_id'));END IF;
 receipt:=jsonb_build_object('schemaVersion','vnext-target-exit-proof-v1','symbol',p_symbol,'revisionId',p_revision,'inputHash',p_input_hash,'authorOutputHash',artifact->'outputHash','base',base,'quote',price,'baselineQuoteDate',artifact->'quoteDate','valuationDate',artifact->'valuationDate','instrumentAuthority',instrument->'instrument_authority_id','newerThesisScope','current_server_publication_input_and_work');
 receipt:=receipt||jsonb_build_object('originalBaseline',original_scenarios);
 IF rebasing IS NOT NULL THEN receipt:=receipt||jsonb_build_object('rebasing',rebasing||jsonb_build_object('receiptHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(rebasing),'UTF8')),'hex')));END IF;
 RETURN receipt||jsonb_build_object('proofHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(receipt),'UTF8')),'hex'));
END $successor0$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'802d70c4a65be2e32b03206471c054479539e694ef4c761efebf451501edf365' THEN RAISE EXCEPTION 'vnext_target_read_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_target_current_v1(text,uuid,text)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_target_read_metadata_changed';END IF;
END $patch0$;
DO $patch1$ DECLARE original text;definition text;changed text;metadata jsonb;target oid:='public.vnext_read_v1(text)'::regprocedure;BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'8a6eb1914c1292fae55f6683d661976de0a09aaae277a3bbfbdcc6a7ffa85f3d' THEN RAISE EXCEPTION 'vnext_target_read_predecessor_changed';END IF;
 changed:=$successor1$
 SELECT original.value||CASE WHEN p_symbol ~ '^[0-9]{4}$' THEN jsonb_build_object('targetAssessment',(
  SELECT jsonb_build_object('schemaVersion','vnext-published-target-assessment-v1','symbol',p_symbol,'revisionId',pub.revision_id,'inputHash',pub.input_hash,'outputHash',pub.content->>'outputHash','publishedAt',pub.published_at,'observedAt',statement_timestamp(),'result',
   CASE WHEN checked.proof->>'deferred'='target_not_reached' OR checked.proof ? 'proofHash' THEN
    jsonb_build_object('status',CASE WHEN checked.proof ? 'proofHash' THEN 'at_target' ELSE 'below_target' END,'originalBaseline',checked.proof->'originalBaseline','rebasing',checked.proof->'rebasing','currentPrice',CASE WHEN checked.proof ? 'proofHash' THEN jsonb_build_object('value',checked.proof->'quote'->'quote'->'raw_close','session',checked.proof->'quote'->>'session','observationId',checked.proof->'quote'->'quote'->>'observation_id') ELSE checked.proof->'currentPrice' END)
   ELSE jsonb_build_object('status','deferred','reason',checked.proof->>'deferred') END)
  FROM (SELECT * FROM public.vnext_publications_v1 WHERE symbol=p_symbol ORDER BY published_at DESC,revision_id DESC LIMIT 1) pub
  CROSS JOIN LATERAL(SELECT public.vnext_target_current_v1(p_symbol,pub.revision_id,pub.input_hash) AS proof) checked
 )) ELSE '{}'::jsonb END FROM (

 SELECT public.vnext_thesis_project_v1(CASE WHEN p_symbol IS NULL THEN (SELECT jsonb_build_object('version',version,'market',market,'members',members,'publishedAt',published_at,'latestSession',(SELECT jsonb_build_object('id',session_date,'closeAt',close_at,'completed',completed) FROM public.vnext_sessions_v1 WHERE completed AND close_at<=clock_timestamp() ORDER BY session_date DESC LIMIT 1)) FROM public.vnext_home_v1 ORDER BY published_at DESC,version DESC LIMIT 1)
 ELSE jsonb_build_object('symbol',p_symbol,'membership',(SELECT jsonb_build_object('state',state,'contraindication',contraindication,'inputHash',input_hash,'reason',exit_reason) FROM public.vnext_members_v1 WHERE symbol=p_symbol),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revisionId',revision_id,'inputHash',input_hash,'content',content,'citations',citations,'qualification',qualification,'publishedAt',published_at) ORDER BY published_at DESC) FROM public.vnext_publications_v1 WHERE symbol=p_symbol),'[]'::jsonb)) END) WHERE EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)

 ) original(value)
$successor1$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'20259a7fb00e81257ca6a18faafb3131383f60876272885c09b8fc6566a7d85b' THEN RAISE EXCEPTION 'vnext_target_read_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_read_v1(text)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_target_read_metadata_changed';END IF;
END $patch1$;
DO $post$ DECLARE state jsonb;catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT FROM jsonb_each($3) edge WHERE a.attrelid=to_regclass('public.'||edge.key) AND edge.value ? a.attname) THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_target_read_v1' AND EXISTS(SELECT FROM jsonb_each($3) edge WHERE p.polrelid=to_regclass('public.'||edge.key)))),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;BEGIN
 EXECUTE catalog_sql INTO state USING ARRAY['public.vnext_target_current_v1(text,uuid,text)'::regprocedure::oid,'public.vnext_read_v1(text)'::regprocedure::oid],ARRAY[]::oid[],'{}'::jsonb;IF state IS DISTINCT FROM(SELECT value FROM vnext_target_read_before_v1) THEN RAISE EXCEPTION 'vnext_target_read_catalog_changed';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_target_current_v1(text,uuid,text)'::regprocedure)<>'802d70c4a65be2e32b03206471c054479539e694ef4c761efebf451501edf365' THEN RAISE EXCEPTION 'vnext_target_read_successor_changed';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_read_v1(text)'::regprocedure)<>'20259a7fb00e81257ca6a18faafb3131383f60876272885c09b8fc6566a7d85b' THEN RAISE EXCEPTION 'vnext_target_read_successor_changed';END IF;
END $post$;
COMMIT;
