BEGIN;
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- Keep the ranking v2 reader unchanged for older releases. This read projects
-- a closed set from the published research's immutable preparation and receipt.
CREATE FUNCTION public.vnext_launch_reported_eps_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' SET lock_timeout='2s' AS $$
 WITH bound AS (
  SELECT m.research_revision,m.input_hash,s.input_cutoff,b.frozen_packet
  FROM public.vnext_launch_ranking_members_v1 m
  JOIN public.vnext_launch_ranking_snapshots_v1 s USING(ranking_run_id)
  JOIN public.vnext_publications_v1 p ON (p.revision_id,p.symbol,p.input_hash)=(m.research_revision,m.symbol,m.input_hash)
  JOIN public.vnext_preparations_v1 prep ON (prep.job_id,prep.input_hash)=(p.job_id,p.input_hash)
  JOIN public.vnext_financial_preparation_protocols_v1 b ON (b.job_id,b.input_hash)=(prep.job_id,prep.input_hash)
  WHERE m.ranking_run_id=p_ranking_run_id AND m.symbol=p_symbol AND m.rank IS NOT NULL
   AND p_symbol~'^[0-9]{4}$' AND p.published_at<=s.input_cutoff AND prep.frozen_at<=p.published_at AND b.recorded_at<=p.published_at
   AND b.protocol='vnext-financial-provider-input-v1' AND b.frozen_packet=prep.evidence
   AND b.packet_digest=encode(sha256(convert_to(b.frozen_packet::text,'UTF8')),'hex')
   AND public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')<=prep.frozen_at
   AND EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
   AND EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)
 ), filing AS (
  SELECT
   CASE raw->>'fact_key' WHEN 'quarterly_basic_eps' THEN 'basic' ELSE 'diluted' END AS basis,
   (raw->>'period_start')::date AS period_start,(raw->>'period_end')::date AS period_end,raw->'value' AS amount,
   public.vnext_financial_wire_clock_v1(raw->>'filing_published_at') AS filed_at,
   public.vnext_financial_wire_clock_v1(e->>'availableAt') AS known_at,
   d->>'sourceUrl' AS source_url
  FROM bound b
  CROSS JOIN LATERAL jsonb_array_elements(b.frozen_packet->'financialProviderInput'->'facts') f
  CROSS JOIN LATERAL (SELECT f->'originalFact' AS raw) original
  JOIN LATERAL jsonb_array_elements(b.frozen_packet->'financialSourceReceipts') d
   ON d->>'factId'=f->>'factId' AND d->>'receiptHash'=f->>'receiptHash'
  JOIN LATERAL jsonb_array_elements(b.frozen_packet->'evidence') e
   ON e->>'id'=f->>'factId' AND e->>'source'=d->>'sourceUrl'
  WHERE raw @> '{"provider":"mops","authority_tier":"official_filing","estimate_kind":"reported","estimate_horizon":"reported_period","validation_status":"validated","schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true}'
   AND raw->>'fact_key' IN('quarterly_basic_eps','quarterly_diluted_eps')
   AND raw->>'unit' IN('TWD_per_share','TWD/share') AND raw->>'duration_kind' IN('quarterly','ttm')
   AND jsonb_typeof(raw->'value')='number' AND d->>'sourceSha256'~'^[a-f0-9]{64}$'
   AND raw->>'source_ref'~('^issuer-document:'||(d->>'sourceSha256')||':[a-f0-9]+$')
   AND raw->>'fact_id'=f->>'factId' AND e->>'key'=raw->>'fact_key' AND e->'value'=raw->'value'
   AND raw->>'period_end'~'^[0-9]{4}-(03-31|06-30|09-30|12-31)$'
   AND (raw->>'period_start')::date<=(raw->>'period_end')::date AND (raw->>'period_end')::date<= (b.input_cutoff AT TIME ZONE 'Asia/Taipei')::date
   AND (public.vnext_financial_wire_clock_v1(raw->>'filing_published_at') AT TIME ZONE 'Asia/Taipei')::date>=(raw->>'period_end')::date
   AND public.vnext_financial_wire_clock_v1(raw->>'filing_published_at')<=public.vnext_financial_wire_clock_v1(e->>'availableAt')
   AND public.vnext_financial_wire_clock_v1(e->>'availableAt')<=public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')
   AND d->>'sourceUrl'='https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id='
    ||p_symbol||'&year='||extract(year FROM (raw->>'period_end')::date)::integer
    ||'&season='||extract(quarter FROM (raw->>'period_end')::date)::integer
 ), identified AS (
  SELECT *,count(*) OVER(PARTITION BY basis,period_start,period_end) AS matches
  FROM filing
 ), latest AS (
  SELECT *,dense_rank() OVER(ORDER BY period_end DESC,period_start DESC) AS interval_rank
  FROM identified WHERE matches=1 AND period_end=(SELECT max(period_end) FROM identified)
 )
 SELECT jsonb_build_object(
  'schemaVersion','vnext-launch-reported-eps-v1','rankingRunId',p_ranking_run_id,'symbol',p_symbol,
  'revisionId',research_revision,'inputHash',input_hash,'cutoff',input_cutoff,
  'facts',(SELECT coalesce(jsonb_agg(jsonb_build_object('basis',basis,'periodStart',period_start,'periodEnd',period_end,'amount',amount,
    'filedAt',filed_at,'knownAt',known_at,'sourceUrl',source_url) ORDER BY period_start DESC,basis),'[]'::jsonb)
    FROM latest WHERE interval_rank<=2))
 FROM bound
$$;
ALTER FUNCTION public.vnext_launch_reported_eps_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_reported_eps_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_reported_eps_v1(uuid,text) TO service_role;
COMMENT ON FUNCTION public.vnext_launch_reported_eps_v1(uuid,text) IS
 'Read-only MOPS EPS from an exact ranked, published research input. No estimates, normalization, private evidence or new evidence acquisition.';
COMMIT;
