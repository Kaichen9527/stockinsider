BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- This grants no access to the policy table or to private original material.
CREATE FUNCTION public.vnext_launch_issuer_estimate_public_right_v1(
 p_stock uuid,p_policy uuid,p_verification uuid,p_cutoff timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' AS $$
 SELECT EXISTS(
  SELECT FROM public.vnext_forecast_rights_v1 r
  WHERE (r.stock_id,r.policy_id,r.verification_id)=(p_stock,p_policy,p_verification)
   AND r.operation='allow' AND r.license_basis='public_issuer_guidance'
   AND r.permitted_use='structured_numeric_forecast'
   AND r.recorded_at<=p_cutoff AND r.valid_from<=p_cutoff AND r.valid_until>statement_timestamp()
   AND NOT EXISTS(SELECT FROM public.vnext_forecast_rights_v1 revoked
    WHERE revoked.verification_id=r.verification_id AND revoked.operation='revoke'
      AND revoked.recorded_at<=statement_timestamp())
 )
$$;
ALTER FUNCTION public.vnext_launch_issuer_estimate_public_right_v1(uuid,uuid,uuid,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_issuer_estimate_public_right_v1(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_issuer_estimate_public_right_v1(uuid,uuid,uuid,timestamptz) TO stockinsider_vnext_owner;

-- No request can choose a second input, source, quote or time. A changed
-- source may suppress the original estimate, but cannot backfill a snapshot.
CREATE FUNCTION public.vnext_launch_issuer_eps_estimates_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' SET lock_timeout='2s' AS $$
 WITH bound AS MATERIALIZED (
  SELECT m.research_revision,m.input_hash,s.input_cutoff,b.frozen_packet,p.content,
         public.vnext_forecast_stock_id_internal_v1(p_symbol) AS stock_id
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
   AND public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')<=prep.frozen_at
   AND EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
   AND EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)
 ), reviewed AS MATERIALIZED (
  SELECT b.*, e.item, r.receipt
  FROM bound b
  CROSS JOIN LATERAL jsonb_array_elements(b.frozen_packet->'evidence') e(item)
  JOIN LATERAL jsonb_array_elements(b.frozen_packet->'forecastSourceReceipts') r(receipt) ON
   r.receipt->>'evidenceHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(e.item),'UTF8')),'hex')
  WHERE b.stock_id IS NOT NULL AND r.receipt->>'stockId'=b.stock_id::text AND r.receipt->>'symbol'=p_symbol
   AND r.receipt @> '{"schemaVersion":"vnext-forecast-source-receipt-v1","classification":"source_estimate_not_reported_or_fair_value","estimateKind":"analyst_estimate","estimateHorizon":"next_twelve_months","shareBasis":"source_diluted_eps_denominator_not_supplied","denominatorShares":null,"annualEps":null,"nextFourQuarterEps":null}'
   AND e.item @> '{"key":"source_quarterly_diluted_eps_estimate","unit":"TWD_per_share","sourceTier":"public","kind":"assumption"}'
   AND e.item->>'id'~'^forecast:[0-9a-f-]{36}:[0-9a-f-]{36}$'
   AND split_part(e.item->>'id',':',3)=r.receipt->>'verificationId'
   AND e.item->>'source'~'^https://mops(ov)?\.twse\.com\.tw/[A-Za-z0-9._/-]+$'
   AND e.item->>'source'!~* '(paid|member|premium|subscription|login|authenticate)'
   AND e.item->>'period'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9]{4}-(03-31|06-30|09-30|12-31)$'
   AND jsonb_typeof(e.item->'value')='number'
   AND public.vnext_financial_wire_clock_v1(e.item->>'eventAt')<=public.vnext_financial_wire_clock_v1(e.item->>'availableAt')
   AND public.vnext_financial_wire_clock_v1(e.item->>'availableAt')<=public.vnext_financial_wire_clock_v1(b.frozen_packet->>'cutoff')
   AND EXISTS(SELECT FROM jsonb_array_elements(b.content->'claims') c
    WHERE c->>'kind'='assumption' AND c->'evidenceIds' ? (e.item->>'id')
     AND c->'numeric'->>'key'=e.item->>'key' AND c->'numeric'->>'unit'=e.item->>'unit'
     AND c->'numeric'->>'period'=e.item->>'period' AND c->'numeric'->'value'=e.item->'value')
 ), source_heads AS MATERIALIZED (
  SELECT b.stock_id, public.vnext_forecast_current_internal_v1(b.stock_id,p_symbol,statement_timestamp()) AS head
  FROM bound b WHERE EXISTS(SELECT FROM reviewed)
 ), permitted AS (
  SELECT DISTINCT e.item->>'period' AS period,e.item->'value' AS value,
   e.item->>'source' AS source_url,e.item->>'eventAt' AS published_at,e.item->>'availableAt' AS known_at
  FROM reviewed e JOIN source_heads h USING(stock_id)
  WHERE public.vnext_launch_issuer_estimate_public_right_v1(e.stock_id,(e.receipt->>'policyId')::uuid,
   (e.receipt->>'verificationId')::uuid,public.vnext_financial_wire_clock_v1(e.frozen_packet->>'cutoff'))
   AND EXISTS(SELECT FROM jsonb_array_elements(h.head->'evidence') WITH ORDINALITY AS current_entry(item,position)
    WHERE current_entry.item=e.item AND (h.head->'receipts')->(current_entry.position::integer-1)=e.receipt)
 ), unique_periods AS (
  SELECT *,count(*) OVER (PARTITION BY period) AS alternatives FROM permitted
 )
 SELECT jsonb_build_object('schemaVersion','vnext-launch-issuer-eps-estimates-v1','rankingRunId',p_ranking_run_id,
  'symbol',p_symbol,'revisionId',research_revision,'inputHash',input_hash,'cutoff',input_cutoff,
  'estimates',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'periodStart',split_part(period,'/',1),'periodEnd',split_part(period,'/',2),'amount',value,
   'publishedAt',published_at,'knownAt',known_at,'sourceUrl',source_url) ORDER BY period),'[]'::jsonb)
   FROM (SELECT * FROM unique_periods WHERE alternatives=1 ORDER BY period LIMIT 4) visible))
 FROM bound
$$;
ALTER FUNCTION public.vnext_launch_issuer_eps_estimates_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_issuer_eps_estimates_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_issuer_eps_estimates_v1(uuid,text) TO service_role;
COMMIT;
