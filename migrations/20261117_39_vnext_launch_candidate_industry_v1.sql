BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- The same official instrument resolved for the saved snapshot selects the
-- venue and issuer. Both source and database clocks are limited by its cutoff.
CREATE FUNCTION public.vnext_launch_candidate_industry_v1(p_symbol text,p_cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE instrument jsonb; issuer uuid; venue public.tw_market_v3; chosen public.stock_sector_assignments_v3;
BEGIN
 IF p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$' OR p_cutoff IS NULL OR NOT isfinite(p_cutoff)
  OR p_cutoff>statement_timestamp() THEN RETURN NULL;END IF;
 instrument:=public.vnext_launch_instrument_v1(p_symbol,p_cutoff);
 IF instrument->>'instrumentType' IS DISTINCT FROM 'common_stock'
  OR instrument->>'exchange' IS NULL OR instrument->>'exchange' NOT IN('TWSE','TPEX') THEN RETURN NULL;END IF;
 issuer:=(instrument->>'stockId')::uuid;
 venue:=(instrument->>'exchange')::public.tw_market_v3;

 SELECT assignment.* INTO chosen FROM public.stock_sector_assignments_v3 assignment
 WHERE assignment.stock_id=issuer AND assignment.market=venue AND assignment.recorded_at<=p_cutoff
  AND assignment.source_timestamp<=p_cutoff AND assignment.valid_from<=p_cutoff
 ORDER BY assignment.recorded_at DESC,assignment.assignment_authority_id LIMIT 1;
 IF chosen.assignment_authority_id IS NULL OR chosen.status<>'active'
  OR chosen.provider::text IS DISTINCT FROM lower(venue::text)
  OR chosen.taxonomy_version<>'tw-sector-taxonomy-v3.0'
  -- Display uses the provider's documented code. Older canonical scoring
  -- keys used a different mapping for newer and venue-specific categories.
  OR chosen.official_industry_code NOT IN(
    '01','02','03','04','05','06','08','09','10','11','12','14','15','16','17','18','20',
    '21','22','23','24','25','26','27','28','29','30','31','32','33','35','36','37','38')
  OR NOT isfinite(chosen.recorded_at) OR NOT isfinite(chosen.source_timestamp) OR NOT isfinite(chosen.valid_from)
  OR chosen.source_timestamp>chosen.recorded_at
  OR (chosen.valid_to IS NOT NULL AND (NOT isfinite(chosen.valid_to) OR chosen.valid_to<=p_cutoff))
 THEN RETURN NULL;END IF;
 IF EXISTS(SELECT FROM public.stock_sector_assignments_v3 candidate
  WHERE candidate.stock_id=issuer AND candidate.market=venue AND candidate.recorded_at=chosen.recorded_at
   AND candidate.source_timestamp<=p_cutoff AND candidate.valid_from<=p_cutoff
   AND ROW(candidate.official_industry_code,candidate.canonical_sector_key,candidate.provider,candidate.source_timestamp,
           candidate.valid_from,candidate.valid_to,candidate.taxonomy_version,candidate.status)
    IS DISTINCT FROM ROW(chosen.official_industry_code,chosen.canonical_sector_key,chosen.provider,chosen.source_timestamp,
           chosen.valid_from,chosen.valid_to,chosen.taxonomy_version,chosen.status))
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('revisionId',chosen.assignment_authority_id,'code',chosen.official_industry_code,
  'knownAt',greatest(chosen.recorded_at,chosen.source_timestamp,chosen.valid_from));
END $$;
ALTER FUNCTION public.vnext_launch_candidate_industry_v1(text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_industry_v1(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_candidate_industry_v1(text,timestamptz) TO stockinsider_vnext_owner;

CREATE FUNCTION public.vnext_launch_candidate_pool_history_v2(p_catalog_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='10s' AS $$
DECLARE packet jsonb; scope_name text; scope jsonb; enriched jsonb;
BEGIN
 packet:=public.vnext_launch_candidate_pool_history_v1(p_catalog_id);
 IF packet IS NULL THEN RETURN NULL;END IF;
 FOREACH scope_name IN ARRAY ARRAY['current','previous'] LOOP
  scope:=packet->scope_name;
  IF jsonb_typeof(scope)<>'object' THEN CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(row_item||jsonb_build_object('industrySnapshot',
   public.vnext_launch_candidate_industry_v1(row_item->>'symbol',(scope->>'cutoff')::timestamptz)) ORDER BY ordinal),'[]'::jsonb)
  INTO enriched FROM jsonb_array_elements(scope->'rows') WITH ORDINALITY AS rows(row_item,ordinal);
  packet:=jsonb_set(packet,ARRAY[scope_name,'rows'],enriched,false);
 END LOOP;
 RETURN packet||jsonb_build_object('schemaVersion','launch-candidate-pool-history-v2');
END $$;
ALTER FUNCTION public.vnext_launch_candidate_pool_history_v2(uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_candidate_pool_history_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_candidate_pool_history_v2(uuid) TO service_role;
COMMIT;
