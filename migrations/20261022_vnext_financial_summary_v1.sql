-- Additive finite summary binding; original numerical claim engine preserved after preamble.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $patch$ DECLARE original text; definition text; target oid:='public.vnext_validate_claims_v1(jsonb,jsonb)'::regprocedure; before_metadata jsonb; after_metadata jsonb; BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO original,before_metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'0c23f9932c3062d7e62f2e114655b29d38ae16af595e34873f85e86924127149' OR before_metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text THEN RAISE EXCEPTION 'vnext_financial_summary_predecessor'; END IF;
 definition:=replace(pg_get_functiondef(target),original,$replacement$
DECLARE c jsonb; e jsonb; i text; operand text; num jsonb; formula jsonb; result numeric; v_amount numeric; n integer; op text; unit_name text; units text[]; section jsonb;
summary_known_day date; summary_claim jsonb; summary_range text[]; summary_start integer; summary_end integer; summary_current integer; summary_supported boolean;
BEGIN
 SELECT (max((value->>'availableAt')::timestamptz) AT TIME ZONE 'Asia/Taipei')::date INTO summary_known_day FROM jsonb_array_elements(evidence);
 IF summary_known_day IS NULL OR coalesce(a->>'quoteDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(a->>'valuationDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR to_char(to_date(a->>'quoteDate','YYYY-MM-DD'),'YYYY-MM-DD') IS DISTINCT FROM a->>'quoteDate' OR to_char(to_date(a->>'valuationDate','YYYY-MM-DD'),'YYYY-MM-DD') IS DISTINCT FROM a->>'valuationDate'
  OR (a->>'quoteDate')::date>summary_known_day OR (a->>'valuationDate')::date>summary_known_day THEN RAISE EXCEPTION 'vnext_summary_dates_not_original_asof'; END IF;
 IF jsonb_typeof(a->'annualEps')='number' AND NOT EXISTS(
  SELECT FROM jsonb_array_elements(a->'claims') summary_c CROSS JOIN jsonb_array_elements(evidence) summary_e
  WHERE summary_c->>'kind'='fact' AND summary_c->'numeric'->>'key'='annual_eps' AND summary_c->'numeric'->'value'=a->'annualEps' AND summary_c->'numeric'->>'unit' IN('TWD_per_share','TWD/share')
   AND CASE WHEN summary_c->'numeric'->>'period' ~ '^[0-9]{4}$' THEN (summary_c->'numeric'->>'period')::integer<=extract(year FROM summary_known_day)::integer ELSE false END
   AND summary_c->'evidenceIds' ? (summary_e->>'id') AND summary_e->>'kind'='fact' AND summary_e->>'sourceTier'='official' AND summary_e->>'key'='annual_eps'
   AND summary_e->'value'=a->'annualEps' AND summary_e->>'unit'=summary_c->'numeric'->>'unit' AND summary_e->>'period'=summary_c->'numeric'->>'period'
 ) THEN RAISE EXCEPTION 'vnext_annual_eps_summary_unbound'; END IF;
 IF jsonb_typeof(a->'nextFourQuarterEps')='number' THEN
  summary_supported:=false;summary_current:=extract(year FROM summary_known_day)::integer*4+(extract(month FROM summary_known_day)::integer-1)/3;
  FOR summary_claim IN SELECT value FROM jsonb_array_elements(a->'claims') LOOP
   IF summary_claim->>'kind'='assumption' AND summary_claim->'numeric'->>'key'='next_four_quarter_eps' AND summary_claim->'numeric'->'value'=a->'nextFourQuarterEps' AND summary_claim->'numeric'->>'unit' IN('TWD_per_share','TWD/share') THEN
    summary_range:=regexp_match(summary_claim->'numeric'->>'period','^([0-9]{4})-Q([1-4])/([0-9]{4})-Q([1-4])$');
    IF summary_range IS NOT NULL THEN
     summary_start:=summary_range[1]::integer*4+summary_range[2]::integer-1;summary_end:=summary_range[3]::integer*4+summary_range[4]::integer-1;
     IF summary_end-summary_start=3 AND summary_start>=summary_current AND EXISTS(SELECT FROM jsonb_array_elements(evidence) summary_e WHERE summary_claim->'evidenceIds' ? (summary_e->>'id') AND summary_e->>'kind'='assumption' AND summary_e->>'key'='next_four_quarter_eps' AND summary_e->'value'=a->'nextFourQuarterEps' AND summary_e->>'period'=summary_claim->'numeric'->>'period' AND summary_e->>'unit'=summary_claim->'numeric'->>'unit') THEN summary_supported:=true; END IF;
    END IF;
   END IF;
  END LOOP;
  IF NOT summary_supported THEN RAISE EXCEPTION 'vnext_next_four_quarter_eps_summary_unbound'; END IF;
 END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(evidence) summary_e WHERE summary_e->>'key'='current_price') THEN
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(evidence) summary_e WHERE summary_e->>'key'='current_price' AND summary_e->>'kind'='fact' AND summary_e->>'sourceTier'='official' AND summary_e->>'unit' IN('TWD','TWD_per_share','TWD/share') AND jsonb_typeof(summary_e->'value')='number' AND (summary_e->>'value')::numeric>0 AND summary_e->>'period'=a->>'quoteDate') THEN RAISE EXCEPTION 'vnext_quote_date_not_actual_price_period'; END IF;
 ELSIF NOT coalesce(a->'gaps','[]'::jsonb) ? 'quote_authority_missing' THEN RAISE EXCEPTION 'vnext_quote_authority_gap_hidden'; END IF;
 IF jsonb_typeof(a->'claims') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'claims') NOT BETWEEN 1 AND 200
  OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(a->'claims')x)<>jsonb_array_length(a->'claims') THEN RAISE EXCEPTION 'vnext_important_claims_required'; END IF;
 FOR section IN SELECT value FROM jsonb_each(a->'sections') LOOP
  IF jsonb_array_length(coalesce(section->'claimIds','[]'::jsonb))=0 OR EXISTS(SELECT FROM jsonb_array_elements_text(section->'claimIds')id WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(a->'claims') AS claim_item WHERE claim_item.value->>'id'=id)) THEN RAISE EXCEPTION 'vnext_section_claim_binding'; END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(a->'claims') LOOP
  IF nullif(c->>'id','') IS NULL OR nullif(c->>'text','') IS NULL OR coalesce(c->>'kind','') NOT IN('fact','assumption','guidance','derived') OR jsonb_array_length(coalesce(c->'evidenceIds','[]'::jsonb))=0 THEN RAISE EXCEPTION 'vnext_claim_schema_invalid'; END IF;
  FOR i IN SELECT jsonb_array_elements_text(c->'evidenceIds') LOOP
   SELECT value INTO e FROM jsonb_array_elements(evidence) WHERE value->>'id'=i;
   IF e IS NULL OR coalesce(e->>'contentHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'vnext_claim_original_missing'; END IF;
   IF c->>'kind'='fact' AND (e->>'kind' IS DISTINCT FROM 'fact' OR e->>'sourceTier' IS DISTINCT FROM 'official') THEN RAISE EXCEPTION 'vnext_claim_fact_authority'; END IF;
  END LOOP;
  num:=c->'numeric'; IF num IS NULL THEN CONTINUE; END IF;
  IF jsonb_typeof(num->'value') IS DISTINCT FROM 'number' OR nullif(num->>'unit','') IS NULL OR nullif(num->>'period','') IS NULL OR nullif(num->>'key','') IS NULL THEN RAISE EXCEPTION 'vnext_claim_numeric_context'; END IF;
  IF c->>'kind'<>'derived' THEN
   IF NOT EXISTS(SELECT FROM jsonb_array_elements(evidence) AS evidence_item WHERE c->'evidenceIds' ? (evidence_item.value->>'id') AND evidence_item.value->>'key'=num->>'key' AND evidence_item.value->>'period'=num->>'period' AND evidence_item.value->>'unit'=num->>'unit' AND evidence_item.value->'value'=num->'value') THEN RAISE EXCEPTION 'vnext_claim_numeric_fact_mismatch'; END IF;
  ELSE
   formula:=num->'formula'; op:=formula->>'operation'; n:=0;result:=NULL;units:=ARRAY[]::text[];
   IF op NOT IN('add','subtract','multiply','divide') OR jsonb_array_length(coalesce(formula->'evidenceIds','[]'::jsonb))<2 THEN RAISE EXCEPTION 'vnext_claim_formula_invalid'; END IF;
   FOR operand IN SELECT jsonb_array_elements_text(formula->'evidenceIds') LOOP
    IF NOT(c->'evidenceIds' ? operand) THEN RAISE EXCEPTION 'vnext_claim_formula_uncited_input'; END IF;
    SELECT value INTO e FROM jsonb_array_elements(evidence) WHERE value->>'id'=operand;
    IF jsonb_typeof(e->'value') IS DISTINCT FROM 'number' OR e->>'period' IS DISTINCT FROM num->>'period' THEN RAISE EXCEPTION 'vnext_claim_formula_period'; END IF;
    v_amount:=(e->>'value')::numeric;unit_name:=e->>'unit';units:=array_append(units,unit_name); n:=n+1;
    IF n=1 THEN result:=v_amount;
    ELSIF op='add' THEN result:=result+v_amount;
    ELSIF op='subtract' THEN result:=result-v_amount;
    ELSIF op='multiply' THEN result:=result*v_amount;
    ELSIF op='divide' THEN IF v_amount=0 THEN RAISE EXCEPTION 'vnext_claim_formula_zero_denominator'; END IF; result:=result/v_amount; END IF;
   END LOOP;
   IF op IN('add','subtract') AND EXISTS(SELECT FROM unnest(units)u WHERE u IS DISTINCT FROM num->>'unit') THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF op='multiply' AND ((SELECT count(*) FROM unnest(units)u WHERE u NOT IN('ratio','multiple'))<>1 OR NOT(num->>'unit'=ANY(units))) THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF op='divide' AND NOT(n=2 AND ((units[1]=units[2] AND num->>'unit'='ratio') OR (units[1]=num->>'unit' AND units[2] IN('ratio','multiple')))) THEN RAISE EXCEPTION 'vnext_claim_formula_units'; END IF;
   IF abs(result-(num->>'value')::numeric)>greatest(0.00000001,abs(result)*0.00000001) THEN RAISE EXCEPTION 'vnext_claim_formula_result'; END IF;
  END IF;
 END LOOP;
END $replacement$);
 EXECUTE definition;
 SELECT to_jsonb(p)-'prosrc' INTO after_metadata FROM pg_proc p WHERE oid=target;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=target)<>'b177e0010a25b9ff27ef25f59a81c44cce47f0b297ea0061d478afbce424b1b8' THEN RAISE EXCEPTION 'vnext_financial_summary_postcondition'; END IF;
END $patch$;
COMMIT;
