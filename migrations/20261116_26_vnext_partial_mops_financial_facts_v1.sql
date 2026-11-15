BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Existing scoped as-of selection remains the authority for every admitted
-- fact and current revalidation. The parser version alone grants no evidence.
DO $partial_mops$
DECLARE item jsonb; target regprocedure; original text; definition text; changed text; catalog jsonb; fragment text;
BEGIN
 IF NOT EXISTS (SELECT FROM pg_proc WHERE oid=to_regprocedure('public.read_financial_facts_for_stocks_as_of(timestamptz,uuid[])')
  AND NOT prosecdef AND proowner='opportunity_v3_rpc_owner'::regrole
  AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='220620b91b5c0ffb41a8e33547b5fdc18642c477036dbdd8da8c619ba3b2d2f2')
 OR NOT EXISTS (SELECT FROM pg_proc WHERE oid=to_regprocedure('public.candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)')
  AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='67b36db42304d076c38c582070a5cb67408a9417439124ac3593d3c8959ec8f6')
 THEN RAISE EXCEPTION 'financial_partial_mops_asof_authority_changed';END IF;
 FOR item IN SELECT v FROM jsonb_array_elements($partial_profiles$[{"name":"vnext_financial_rows_internal_v1","signature":"public.vnext_financial_rows_internal_v1(uuid,timestamptz)","before":"document_sha256,manifest_sha256,recorded_at FROM public.candidate_financial_parser_evidence_v8","after":"document_sha256,manifest_sha256,recorded_at,evidence_schema_version FROM public.candidate_financial_parser_evidence_v8","previous":"fbc52066018cd109ee3e40b3efa8282f35b9c54b01567a217b6e9e893600f9e1","successor":"f4c8787f8d9ff2c7b05045997664442424e05cd553bd8d2c79afe99d1873d71d","owner":"opportunity_v3_rpc_owner","securityDefiner":true},{"name":"vnext_financial_descriptor_v1","signature":"public.vnext_financial_descriptor_v1(jsonb,jsonb,jsonb,jsonb,timestamptz)","before":"r->>'receipt_status'<>'accepted' OR r->>'parser_status'<>'complete'","after":"(r->>'receipt_status' IS DISTINCT FROM 'accepted' AND NOT coalesce(\n      r->>'receipt_status'='partial' AND r->>'financial_validation_status'='validated'\n      AND rows_json->'partialMopsGap'='true'::jsonb\n      AND parser->'evidence_schema_version'='10'::jsonb AND f->>'provider'='mops'\n      AND f->>'authority_tier'='official_filing' AND f->>'validation_recorded_at' IS NOT NULL\n      AND rows_json->>'symbol'~'^[0-9]{4}$' AND f->>'period_end'~'^[0-9]{4}-(03-31|06-30|09-30|12-31)$'\n      AND extract(year FROM (f->>'period_end')::date) BETWEEN 2013 AND 2200\n      AND r->>'source_url'='https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id='\n      ||(rows_json->>'symbol')||'&year='||extract(year FROM (f->>'period_end')::date)::integer\n      ||'&season='||extract(quarter FROM (f->>'period_end')::date)::integer,false))\n   OR r->>'parser_status'<>'complete'","previous":"c925ad39ab622ace675c896165fcb5da12ad2c6ebecdf67c068013bdb5d0b475","successor":"8695493d20bd1ac08c5509c7165e91cca086f015e8936805829083332b6e7040","owner":"stockinsider_vnext_owner","securityDefiner":false},{"name":"vnext_financial_packet_v1","signature":"public.vnext_financial_packet_v1(text,jsonb)","before":"rows_json:=public.vnext_financial_rows_internal_v1(stock,cutoff);IF rows_json IS NULL THEN RETURN false;END IF;","after":"rows_json:=public.vnext_financial_rows_internal_v1(stock,cutoff);IF rows_json IS NULL THEN RETURN false;END IF;\n rows_json:=rows_json||jsonb_build_object('symbol',symbol_value,'partialMopsGap',coalesce(packet->'gaps' @> '[\"financial_partial_mops_filing\"]'::jsonb,false));","previous":"0e2ca9ed277f8ea818d9335d656a7a6ee1d6c62819532f2022916b19ed1d8bbb","successor":"63f1862b88958cbba49c28c4dd3a7aad4e8a825db6bc5f95a0ed0710a16631e6","owner":"stockinsider_vnext_owner","securityDefiner":true},{"name":"vnext_command_v1","signature":"public.vnext_command_v1(text,text,jsonb)","before":"jsonb_build_object('financialProviderProtocol','vnext-financial-provider-input-v1')","after":"jsonb_build_object('financialProviderProtocol','vnext-financial-provider-input-v1','financialPartialMopsV10',true)","previous":"5c00756cd3d9c99f11db2e8eb5529f57a0fe161814e776d4450396e79afeb7d6","successor":null,"owner":"stockinsider_vnext_owner","securityDefiner":true}]$partial_profiles$::jsonb)v LOOP
  target:=to_regprocedure(item->>'signature');
  SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,catalog
  FROM pg_proc p WHERE p.oid=target AND prosecdef=(item->>'securityDefiner')::boolean AND proowner=to_regrole(item->>'owner');
  fragment:=item->>'before';
  IF original IS NULL OR encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM item->>'previous'
   OR (length(original)-length(replace(original,fragment,'')))<>length(fragment)
  THEN RAISE EXCEPTION 'financial_partial_mops_predecessor_changed:%',item->>'name';END IF;
  changed:=replace(original,fragment,item->>'after');
  IF item->>'successor' IS NOT NULL AND encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM item->>'successor'
  THEN RAISE EXCEPTION 'financial_partial_mops_successor_changed';END IF;
  EXECUTE replace(definition,original,changed);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM catalog
   OR (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM changed
  THEN RAISE EXCEPTION 'financial_partial_mops_catalog_changed';END IF;
 END LOOP;
END $partial_mops$;
GRANT SELECT (evidence_schema_version) ON public.candidate_financial_parser_evidence_v8 TO opportunity_v3_rpc_owner;
COMMIT;
