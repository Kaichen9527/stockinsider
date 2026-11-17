BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SELECT pg_advisory_xact_lock(64221022);

-- Display numeric portions of the exact reviewed issuer estimate. Rights are
-- rechecked at read time by the existing public issuer authority.
CREATE FUNCTION public.vnext_launch_issuer_fiscal_forecasts_v1(p_ranking_run_id uuid, p_symbol text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET statement_timeout='5s' SET lock_timeout='2s' AS $$
 WITH bound AS MATERIALIZED (
  SELECT m.research_revision,m.input_hash,s.input_cutoff,p.content,b.frozen_packet,
         public.vnext_forecast_stock_id_internal_v1(p_symbol) AS stock_id,
         public.vnext_financial_wire_clock_v1(b.frozen_packet->>'forecastSourceAsOf') AS source_as_of
  FROM public.vnext_launch_ranking_members_v1 m
  JOIN public.vnext_launch_ranking_snapshots_v1 s USING(ranking_run_id)
  JOIN public.vnext_publications_v1 p ON (p.revision_id,p.symbol,p.input_hash)=(m.research_revision,m.symbol,m.input_hash)
  JOIN public.vnext_preparations_v1 prep ON (prep.job_id,prep.input_hash)=(p.job_id,p.input_hash)
  JOIN public.vnext_financial_preparation_protocols_v1 b ON (b.job_id,b.input_hash)=(prep.job_id,prep.input_hash)
  WHERE m.ranking_run_id=p_ranking_run_id AND m.symbol=p_symbol AND m.rank IS NOT NULL
   AND p_symbol~'^[0-9]{4}$' AND p.published_at<=s.input_cutoff AND prep.frozen_at<=p.published_at AND b.recorded_at<=p.published_at
   AND s.input_cutoff<=statement_timestamp()
   AND b.protocol='vnext-financial-provider-input-v1' AND b.frozen_packet=prep.evidence
   AND b.packet_digest=encode(sha256(convert_to(b.frozen_packet::text,'UTF8')),'hex')
   AND public.vnext_financial_wire_clock_v1(b.frozen_packet->>'forecastSourceAsOf')<=public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')
   AND public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')<=prep.frozen_at
   AND EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
   AND EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)
 ), evidence AS MATERIALIZED (
  SELECT b.stock_id,b.source_as_of,b.content,e.item,r.receipt
  FROM bound b
  CROSS JOIN LATERAL jsonb_array_elements(b.frozen_packet->'evidence') e(item)
  JOIN LATERAL jsonb_array_elements(b.frozen_packet->'forecastSourceReceipts') r(receipt) ON
   r.receipt->>'evidenceHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(e.item),'UTF8')),'hex')
  WHERE b.stock_id IS NOT NULL AND r.receipt->>'stockId'=b.stock_id::text AND r.receipt->>'symbol'=p_symbol
   AND r.receipt @> '{"schemaVersion":"vnext-fiscal-forecast-receipt-v1","classification":"source_disclosed_forecast_assumption_not_reported"}'
   AND e.item @> '{"sourceTier":"public","kind":"assumption"}'
   AND e.item->>'source' ~ '^https://mops(ov)?\.twse\.com\.tw/[A-Za-z0-9._/-]+$'
   AND e.item->>'source' !~* '(paid|member|premium|subscription|login|authenticate)'
   AND public.vnext_financial_wire_clock_v1(e.item->>'eventAt')<=public.vnext_financial_wire_clock_v1(e.item->>'availableAt')
   AND public.vnext_financial_wire_clock_v1(e.item->>'availableAt')<=b.source_as_of
 ), reviewed AS MATERIALIZED (
  SELECT f.stock_id,f.source_as_of,f.item AS eps,f.receipt AS eps_receipt,o.item AS original,o.receipt AS original_receipt,
         f.receipt->'calculation' AS calculation
  FROM evidence f JOIN evidence o
   ON f.stock_id=o.stock_id AND f.source_as_of=o.source_as_of
   AND (f.receipt-'entryRole'-'evidenceHash')=(o.receipt-'entryRole'-'evidenceHash')
   AND o.receipt->>'entryRole'='original'
   AND o.item->>'key'='fiscal_forecast_original'
  WHERE f.receipt->>'entryRole'='eps'
   AND f.item->>'id'='fiscal-forecast:'||(f.receipt->>'policyId')||':'||(f.receipt->>'verificationId')||':eps'
   AND o.item->>'id'=regexp_replace(f.item->>'id',':eps$',':original')
   AND o.item->>'source'=f.item->>'source'
   AND f.item->>'key' IN('source_annual_forecast_eps','next_four_quarter_eps','source_next_four_fiscal_quarter_eps')
   AND f.item->>'unit'='TWD_per_share' AND jsonb_typeof(f.item->'value')='number'
   AND f.receipt->'calculation' @> jsonb_build_object('key',f.item->>'key','unit','TWD_per_share',
      'value',f.item->'value','period',f.item->>'period','reported',false)
   AND f.receipt->'calculation'->>'shareBasis' IN('basic','diluted')
   AND f.receipt->'calculation'->>'denominatorShares' ~ '^[1-9][0-9]{0,11}$'
   AND f.receipt->'calculation'->>'periodStart' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND f.receipt->'calculation'->>'periodEnd' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND EXISTS(SELECT FROM jsonb_array_elements(f.content->'claims') c
    WHERE c->>'kind'='assumption' AND c->'evidenceIds' ? (f.item->>'id')
     AND c->'numeric'->>'key'=f.item->>'key' AND c->'numeric'->>'unit'=f.item->>'unit'
     AND c->'numeric'->>'period'=f.item->>'period' AND c->'numeric'->'value'=f.item->'value')
 ), authority AS MATERIALIZED (
  SELECT b.stock_id,public.vnext_forecast_current_internal_v1(b.stock_id,p_symbol,b.source_as_of) AS head
  FROM bound b WHERE EXISTS(SELECT FROM reviewed)
 ), permitted AS (
  SELECT DISTINCT CASE WHEN f.eps->>'key'='source_annual_forecast_eps' THEN 'annual' ELSE 'four_quarters' END AS horizon,
   f.calculation->>'periodStart' AS start_day,f.calculation->>'periodEnd' AS end_day,
   f.calculation->>'shareBasis' AS share_basis,f.calculation->>'denominatorShares' AS shares,
   f.eps->'value' AS amount,f.eps->>'source' AS source_url,f.eps->>'availableAt' AS known_at,f.eps->>'eventAt' AS published_at
  FROM reviewed f JOIN authority a USING(stock_id)
  WHERE public.vnext_launch_issuer_estimate_public_right_v1(f.stock_id,(f.eps_receipt->>'policyId')::uuid,
   (f.eps_receipt->>'verificationId')::uuid,f.source_as_of)
   AND (SELECT count(DISTINCT current_entry.item->>'id') FROM jsonb_array_elements(a.head->'evidence') WITH ORDINALITY AS current_entry(item,position)
    WHERE (current_entry.item=f.eps AND (a.head->'receipts')->(current_entry.position::integer-1)=f.eps_receipt)
       OR (current_entry.item=f.original AND (a.head->'receipts')->(current_entry.position::integer-1)=f.original_receipt))=2
 ), periods AS (
  SELECT *,count(*) OVER (PARTITION BY horizon,start_day,end_day) AS alternatives FROM permitted
 )
 SELECT jsonb_build_object('schemaVersion','vnext-launch-issuer-fiscal-forecasts-v1','rankingRunId',p_ranking_run_id,
  'symbol',p_symbol,'revisionId',research_revision,'inputHash',input_hash,'cutoff',input_cutoff,
  'forecasts',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'horizon',horizon,'periodStart',start_day,'periodEnd',end_day,'shareBasis',share_basis,'shares',shares,
   'amount',amount,'sourceUrl',source_url,'publishedAt',published_at,'knownAt',known_at
  ) ORDER BY horizon,start_day,end_day),'[]'::jsonb)
  FROM (SELECT * FROM periods WHERE alternatives=1 ORDER BY horizon,start_day,end_day LIMIT 4) projected))
 FROM bound
$$;
ALTER FUNCTION public.vnext_launch_issuer_fiscal_forecasts_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_issuer_fiscal_forecasts_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_issuer_fiscal_forecasts_v1(uuid,text) TO service_role;
COMMIT;
