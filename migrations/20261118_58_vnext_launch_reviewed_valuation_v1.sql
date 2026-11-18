BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT pg_advisory_xact_lock(64221022);

-- Deployment-managed, per-output approval for the numeric scenario projection.
-- Research, provider approval, and public-link rights are separate.
CREATE TABLE public.vnext_launch_valuation_clearance_v1 (
  research_revision uuid NOT NULL REFERENCES public.vnext_publications_v1(revision_id),
  output_hash text NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  disclose_pe_inputs boolean NOT NULL DEFAULT false,
  authorization_sha256 text NOT NULL CHECK (authorization_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz NOT NULL,
  withdrawn_at timestamptz,
  PRIMARY KEY (research_revision, output_hash, recorded_at),
  CHECK (isfinite(recorded_at) AND isfinite(valid_until) AND valid_until > recorded_at),
  CHECK (withdrawn_at IS NULL OR (isfinite(withdrawn_at) AND withdrawn_at >= recorded_at))
);
ALTER TABLE public.vnext_launch_valuation_clearance_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_valuation_clearance_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_valuation_clearance_v1 FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vnext_launch_reviewed_valuation_v1(p_ranking_run_id uuid, p_symbol text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '5s' SET lock_timeout = '2s'
AS $function$
  WITH saved AS MATERIALIZED (
    SELECT s.input_cutoff, m.research_revision, m.input_hash, p.content,
      p.published_at, j.reviewer_result AS review, prep.evidence AS preparation, prep.frozen_at,
      clearance.disclose_pe_inputs
    FROM public.vnext_launch_ranking_members_v1 m
    JOIN public.vnext_launch_ranking_snapshots_v1 s USING (ranking_run_id)
    JOIN public.vnext_launch_qualifications_v1 qualification
      ON (qualification.qualification_revision, qualification.research_revision, qualification.score_revision,
          qualification.symbol, qualification.input_hash) =
         (m.qualification_revision, m.research_revision, m.score_revision, m.symbol, m.input_hash)
    JOIN public.vnext_publications_v1 p
      ON (p.revision_id, p.symbol, p.input_hash) = (m.research_revision, m.symbol, m.input_hash)
    JOIN public.vnext_jobs_v1 j
      ON (j.job_id, j.symbol, j.input_hash) = (p.job_id, p.symbol, p.input_hash)
    JOIN public.vnext_preparations_v1 prep
      ON (prep.job_id, prep.input_hash) = (p.job_id, p.input_hash)
    JOIN public.vnext_provider_invocations_v1 author
      ON (author.job_id, author.task, author.execution_id, author.principal, author.input_hash) =
         (j.job_id, 'author', j.execution_id, j.author_principal, j.input_hash)
    JOIN public.vnext_provider_invocations_v1 reviewer
      ON (reviewer.job_id, reviewer.task, reviewer.execution_id, reviewer.principal, reviewer.input_hash) =
         (j.job_id, 'reviewer', j.reviewer_execution, j.reviewer_principal, j.input_hash)
    JOIN LATERAL (
      SELECT bool_or(grant_row.disclose_pe_inputs) AS disclose_pe_inputs
      FROM public.vnext_launch_valuation_clearance_v1 grant_row
      WHERE (grant_row.research_revision, grant_row.output_hash) = (p.revision_id, p.content->>'outputHash')
        AND grant_row.recorded_at BETWEEN p.published_at AND s.input_cutoff
        AND grant_row.valid_until > statement_timestamp() AND grant_row.withdrawn_at IS NULL
      HAVING count(*) > 0
    ) clearance ON true
    WHERE m.ranking_run_id = p_ranking_run_id AND m.symbol = p_symbol AND m.rank IS NOT NULL
      AND p_symbol ~ '^[0-9]{4}$'
      AND s.published_at <= statement_timestamp()
      AND p.published_at <= s.input_cutoff AND prep.frozen_at <= j.sources_read_at AND j.sources_read_at <= p.published_at
      AND qualification.qualified AND qualification.checked_at <= s.published_at
      AND qualification.checks @> '{"review":true,"rights":true}'
      AND j.state = 'published' AND j.author_result = p.content
      AND j.execution_id <> j.reviewer_execution AND j.author_principal <> j.reviewer_principal
      AND j.reviewer_result @> '{"approved":true,"factsChecked":true,"valuationChecked":true,"claimsChecked":true,"findings":[]}'
      AND j.reviewer_result->'findings' = '[]'::jsonb
      AND j.reviewer_result->>'authorOutputHash' = p.content->>'outputHash'
      AND author.state = 'completed' AND reviewer.state = 'completed'
      AND author.provider = 'openai-responses' AND reviewer.provider = author.provider
      AND author.provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,160}$'
      AND reviewer.provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,160}$'
      AND author.provider_response_id <> reviewer.provider_response_id
      AND author.normalized_output = p.content AND reviewer.normalized_output = j.reviewer_result
      AND author.settled_at BETWEEN author.started_at AND author.deadline_at
      AND reviewer.settled_at BETWEEN reviewer.started_at AND reviewer.deadline_at
      AND author.settled_at <= j.sources_read_at AND j.sources_read_at <= reviewer.started_at
      AND reviewer.settled_at <= p.published_at
      AND EXISTS (SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
      AND EXISTS (SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)
  ), permitted AS MATERIALIZED (
    SELECT * FROM saved
    WHERE content @> jsonb_build_object('schemaVersion','stockinsider-vnext-research-v1','inputHash',input_hash)
      AND content->>'outputHash' =
        encode(sha256(convert_to(public.vnext_catalog_canonical_v1(content-'outputHash'),'UTF8')),'hex')
      AND jsonb_typeof(content->'claims') = 'array'
      AND jsonb_typeof(review->'claimChecks') = 'array'
      AND jsonb_typeof(preparation->'evidence') = 'array'
      AND public.vnext_input_sources_current_v1(preparation, p_symbol) IS TRUE
      AND content->>'valuationDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND content->>'quoteDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND content->>'quoteDate' <= content->>'valuationDate'
      AND content->>'valuationDate' <= (published_at AT TIME ZONE 'Asia/Taipei')::date::text
  ), claims AS MATERIALIZED (
    SELECT claim.item, claim.item->'numeric' AS amount, p.review, p.preparation, p.frozen_at,
      CASE WHEN claim.item->>'id' IN ('valuation:forward_pe','valuation:normalized_pe','valuation:forward_pb','valuation:ev_ebitda','valuation:dcf')
        THEN split_part(claim.item->>'id', ':', 2) END AS method_code
    FROM permitted p
    CROSS JOIN LATERAL jsonb_array_elements(p.content->'claims') claim(item)
    WHERE claim.item->'numeric'->>'key' IN ('valuation_bear','valuation_base','valuation_bull')
       OR claim.item->>'id' IN ('valuation:forward_pe','valuation:normalized_pe','valuation:forward_pb','valuation:ev_ebitda','valuation:dcf')
  ), verified AS MATERIALIZED (
    SELECT c.item, c.amount, c.preparation, c.method_code
    FROM claims c
    WHERE jsonb_typeof(c.item->'evidenceIds') = 'array'
      AND jsonb_array_length(c.item->'evidenceIds') > 0
      AND (SELECT count(*) FROM jsonb_array_elements(c.review->'claimChecks') rc
           WHERE rc->>'claimId' = c.item->>'id') = 1
      AND EXISTS (
        SELECT FROM jsonb_array_elements(c.review->'claimChecks') rc
        WHERE rc->>'claimId' = c.item->>'id' AND rc->>'verdict' = 'supported'
          AND NOT EXISTS (
            SELECT FROM jsonb_array_elements_text(c.item->'evidenceIds') expected(id)
            WHERE 1 <> (
              SELECT count(*) FROM jsonb_array_elements(c.preparation->'evidence') evidence
              WHERE evidence->>'id' = expected.id AND evidence->>'contentHash' ~ '^[a-f0-9]{64}$'
                AND (evidence->>'eventAt')::timestamptz <= (evidence->>'availableAt')::timestamptz
                AND (evidence->>'availableAt')::timestamptz <= c.frozen_at
                AND rc->'sources' @> jsonb_build_array(jsonb_build_object(
                  'id',expected.id,'contentHash',evidence->>'contentHash'))
            )
          )
      )
  ), ordered AS (
    SELECT count(method_code) AS methods, max(method_code) AS method,
      count(*) FILTER (WHERE amount->>'key' IN ('valuation_bear','valuation_base','valuation_bull')) AS scenarios,
      count(DISTINCT amount->>'period') FILTER (WHERE amount->>'key' IN ('valuation_bear','valuation_base','valuation_bull')) AS periods,
      max(amount->>'period') FILTER (WHERE amount->>'key' IN ('valuation_bear','valuation_base','valuation_bull')) AS period,
      min((amount->>'value')::numeric) FILTER (WHERE amount->>'key' = 'valuation_bear'
        AND amount->>'unit' IN ('TWD','TWD_per_share','TWD/share') AND jsonb_typeof(amount->'value') = 'number'
        AND item->>'kind' IN ('derived','assumption')) AS bear,
      min((amount->>'value')::numeric) FILTER (WHERE amount->>'key' = 'valuation_base'
        AND amount->>'unit' IN ('TWD','TWD_per_share','TWD/share') AND jsonb_typeof(amount->'value') = 'number'
        AND item->>'kind' IN ('derived','assumption')) AS base,
      min((amount->>'value')::numeric) FILTER (WHERE amount->>'key' = 'valuation_bull'
        AND amount->>'unit' IN ('TWD','TWD_per_share','TWD/share') AND jsonb_typeof(amount->'value') = 'number'
        AND item->>'kind' IN ('derived','assumption')) AS bull
    FROM verified
  ), pe_inputs AS (
    SELECT split_part(c.amount->>'key','_',2) AS scenario,
      count(*) AS operands,
      max((source.item->>'value')::numeric) FILTER (WHERE component.part = 'eps') AS eps,
      max(source.item->>'key') FILTER (WHERE component.part = 'eps') AS eps_basis,
      max((source.item->>'value')::numeric) FILTER (WHERE component.part = 'multiple') AS multiple,
      max((c.amount->>'value')::numeric) AS expected
    FROM verified c CROSS JOIN ordered o
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE
      WHEN jsonb_typeof(c.amount->'formula'->'evidenceIds') = 'array' THEN c.amount->'formula'->'evidenceIds'
      ELSE '[]'::jsonb END) operand(id)
    JOIN LATERAL jsonb_array_elements(c.preparation->'evidence') source(item)
      ON source.item->>'id' = operand.id AND c.item->'evidenceIds' ? operand.id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN source.item->>'unit' IN ('TWD_per_share','TWD/share')
          AND ((o.method = 'forward_pe' AND source.item->>'key' IN (
            'next_four_quarter_eps','source_annual_forecast_eps','source_next_four_fiscal_quarter_eps'))
            OR (o.method = 'normalized_pe' AND source.item->>'key' = 'normalized_eps'))
          AND source.item->>'kind' IN ('assumption','derived') THEN 'eps'
        WHEN source.item->>'unit' = 'multiple' AND source.item->>'kind' = 'assumption'
          AND source.item->>'key' IN ('scenario_pe_multiple','forward_pe_multiple','normalized_pe_multiple') THEN 'multiple'
      END AS part
    ) component
    WHERE o.method IN ('forward_pe','normalized_pe')
      AND c.amount->>'key' IN ('valuation_bear','valuation_base','valuation_bull')
      AND c.item->>'kind' = 'derived' AND c.amount->'formula'->>'operation' = 'multiply'
      AND jsonb_array_length(c.amount->'formula'->'evidenceIds') = 2
      AND jsonb_typeof(source.item->'value') = 'number'
      AND source.item->>'period' = c.amount->>'period'
    GROUP BY c.item->>'id', c.amount->>'key'
  ), verified_pe AS MATERIALIZED (
    SELECT * FROM pe_inputs i
    WHERE i.operands = 2 AND i.eps > 0 AND i.multiple > 0
      AND abs(i.expected-i.eps*i.multiple) <= greatest(1e-8::numeric,abs(i.eps*i.multiple)*1e-8::numeric)
  )
  SELECT jsonb_build_object('schemaVersion','vnext-launch-reviewed-valuation-v1',
    'rankingRunId',p_ranking_run_id,'symbol',p_symbol,'revisionId',p.research_revision,
    'inputHash',p.input_hash,'cutoff',p.input_cutoff,'valuationDate',p.content->>'valuationDate',
    'quoteDate',p.content->>'quoteDate','period',o.period,'method',o.method,
    'unit','TWD_per_share','bear',o.bear,'base',o.base,'bull',o.bull,
    'peInputs',CASE WHEN p.disclose_pe_inputs AND o.method IN ('forward_pe','normalized_pe') THEN (
      SELECT jsonb_object_agg(i.scenario,jsonb_build_object('eps',i.eps,'epsBasis',i.eps_basis,'multiple',i.multiple))
      FROM verified_pe i
    ) END)
  FROM permitted p CROSS JOIN ordered o
  WHERE (SELECT count(*) FROM claims) = (SELECT count(*) FROM verified)
    AND o.methods = 1 AND o.scenarios = 3 AND o.periods = 1
    AND o.method IN ('forward_pe','normalized_pe','forward_pb','ev_ebitda','dcf')
    AND o.period ~ '^[0-9]{4}(-[0-9]{2}-[0-9]{2}|-Q[1-4])?(/[0-9]{4}(-[0-9]{2}-[0-9]{2}|-Q[1-4])?)?$'
    AND (o.method NOT IN ('forward_pe','normalized_pe') OR 3 = (SELECT count(*) FROM verified_pe))
    AND o.bear > 0 AND o.bear <= o.base AND o.base <= o.bull AND o.bull <= 9007199254740991
$function$;
ALTER FUNCTION public.vnext_launch_reviewed_valuation_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_reviewed_valuation_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_reviewed_valuation_v1(uuid,text) TO service_role;
COMMIT;
