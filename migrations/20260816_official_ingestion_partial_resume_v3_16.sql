BEGIN;

GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;

-- Preserve the immutable chunks of an interrupted facts barrier.  V3.15 only
-- returned a resume plane after the terminal root existed, which made a safe
-- retry unable to distinguish already-staged 200/50-row chunks from a new
-- <=20-row continuation.  The wrapper now returns every staged prefix plus its
-- exact chunk graph; the reviewed runtime must verify that prefix byte-for-byte
-- before appending a continuation.
CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_rest_v3_15(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer,p_authority_hash text
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rest_claim$
DECLARE v_claim public.legacy_producer_claim_v3_11;v_resume jsonb;v_has_terminal boolean;
BEGIN
  IF coalesce(p_authority_hash,'')<>'' AND p_authority_hash!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';
  END IF;
  PERFORM pg_catalog.set_config('stockinsider.legacy_authority_hash',coalesce(p_authority_hash,''),true);
  v_claim:=public.claim_legacy_producer_job_v3_11(p_run,p_job,p_token,p_lease);
  IF v_claim.stage='facts_refresh' AND EXISTS(SELECT 1
    FROM public.legacy_official_ingestion_chunks_v3_14 chunk
    WHERE chunk.run_id=p_run AND chunk.job_id=p_job) THEN
    SELECT EXISTS(SELECT 1 FROM public.legacy_official_ingestion_chunks_v3_14 chunk
      WHERE chunk.run_id=p_run AND chunk.job_id=p_job AND chunk.chunk_kind='terminal') INTO v_has_terminal;
    SELECT jsonb_build_object(
      'schema',CASE WHEN v_has_terminal THEN 'legacy-official-ingestion-resume-v3.15'
        ELSE 'legacy-official-ingestion-partial-resume-v3.16' END,
      'sourceCutoff',to_char(min(chunk.source_cutoff) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'calendarSessions',(SELECT coalesce(jsonb_agg(item.value ORDER BY staged.chunk_ordinal,item.ordinality),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        CROSS JOIN LATERAL jsonb_array_elements(staged.items_json) WITH ORDINALITY item(value,ordinality)
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind='trading_sessions'),
      'financialFacts',(SELECT coalesce(jsonb_agg(item.value ORDER BY staged.chunk_ordinal,item.ordinality),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        CROSS JOIN LATERAL jsonb_array_elements(staged.items_json) WITH ORDINALITY item(value,ordinality)
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind='financial_facts'),
      'priceObservations',(SELECT coalesce(jsonb_agg(item.value ORDER BY staged.chunk_ordinal,item.ordinality),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        CROSS JOIN LATERAL jsonb_array_elements(staged.items_json) WITH ORDINALITY item(value,ordinality)
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind='price_observations'),
      'corporateActionSnapshots',(SELECT coalesce(jsonb_agg(item.value ORDER BY staged.chunk_ordinal,item.ordinality),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        CROSS JOIN LATERAL jsonb_array_elements(staged.items_json) WITH ORDINALITY item(value,ordinality)
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind='corporate_action_snapshots'),
      'reportedValuations',(SELECT coalesce(jsonb_agg(item.value ORDER BY staged.chunk_ordinal,item.ordinality),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        CROSS JOIN LATERAL jsonb_array_elements(staged.items_json) WITH ORDINALITY item(value,ordinality)
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind='reported_valuations'),
      'chunks',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',staged.chunk_kind,
        'ordinal',staged.chunk_ordinal,'itemCount',staged.item_count,'chunkHash',staged.chunk_hash)
        ORDER BY array_position(ARRAY['trading_sessions','financial_facts','price_observations',
          'corporate_action_snapshots','reported_valuations','terminal'],staged.chunk_kind),staged.chunk_ordinal),'[]'::jsonb)
        FROM public.legacy_official_ingestion_chunks_v3_14 staged
        WHERE staged.run_id=p_run AND staged.job_id=p_job AND staged.chunk_kind<>'terminal'))
    INTO v_resume FROM public.legacy_official_ingestion_chunks_v3_14 chunk
    WHERE chunk.run_id=p_run AND chunk.job_id=p_job
    GROUP BY chunk.run_id,chunk.job_id;
    IF (SELECT count(DISTINCT staged.source_cutoff) FROM public.legacy_official_ingestion_chunks_v3_14 staged
      WHERE staged.run_id=p_run AND staged.job_id=p_job)<>1 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_resume_conflict';
    END IF;
    v_claim.read_json:=jsonb_set(v_claim.read_json,'{officialIngestionResume}',v_resume,true);
    v_claim.read_canonical:=convert_to(public.legacy_canonical_json_v3_13(v_claim.read_json),'utf8');
    IF octet_length(v_claim.read_canonical)>12582912 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_resume_bound';
    END IF;
    v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  END IF;
  RETURN v_claim;
END $rest_claim$;

ALTER FUNCTION public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)
  OWNER TO legacy_correctness_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)
  TO service_role;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

COMMIT;
