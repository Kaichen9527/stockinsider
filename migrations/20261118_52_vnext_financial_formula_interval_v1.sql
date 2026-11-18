-- Enforce the prepared financial interval on new author writes.
-- Per-share comparisons and publication qualification remain independently gated.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SELECT pg_advisory_xact_lock(64221022);

DO $predecessor$
BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
  OR (SELECT count(*) FROM pg_class
     WHERE oid IN (to_regclass('public.vnext_jobs_v1'),to_regclass('public.vnext_financial_preparation_protocols_v1'))
       AND relowner='stockinsider_vnext_owner'::regrole AND relrowsecurity)<>2
  OR NOT EXISTS (SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_financial_wire_clock_v1(text)')
       AND proowner='stockinsider_vnext_owner'::regrole AND NOT prosecdef AND provolatile='i')
 THEN RAISE EXCEPTION 'vnext_financial_formula_predecessor_required'; END IF;
END
$predecessor$;

CREATE FUNCTION public.vnext_financial_formula_window_internal_v1(item jsonb, cutoff timestamptz) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $window$
DECLARE meta jsonb:=item->'financial'; start_day text; end_day text; duration text; known_at timestamptz; available_at timestamptz;
BEGIN
 IF jsonb_typeof(meta) IS DISTINCT FROM 'object'
  OR item->>'kind' IS DISTINCT FROM 'fact' OR item->>'sourceTier' IS DISTINCT FROM 'official'
  OR meta->>'schemaVersion' IS DISTINCT FROM 'vnext-financial-observation-v1'
  OR meta->>'factId' IS DISTINCT FROM item->>'id' OR meta->>'factContentHash' IS DISTINCT FROM item->>'contentHash'
  OR meta->>'periodEnd' IS DISTINCT FROM item->>'period'
  OR meta->>'estimateKind' IS DISTINCT FROM 'reported' OR meta->>'estimateHorizon' IS DISTINCT FROM 'reported_period'
  OR coalesce(item->>'contentHash','') !~ '^[a-f0-9]{64}$'
  OR coalesce(meta->>'sourceReceiptHash','') !~ '^[a-f0-9]{64}$'
  OR coalesce(meta->>'sourceRawSha256','') !~ '^[a-f0-9]{64}$'
  OR item->>'key' IN ('quarterly_basic_eps','quarterly_diluted_eps')
  OR coalesce(item->>'unit','') IN ('','TWD_per_share','TWD/share','share','thousand_shares')
  OR meta->'epsBasis' IS DISTINCT FROM 'null'::jsonb
  OR meta->'shareBasis' IS DISTINCT FROM 'null'::jsonb
  OR meta->'denominatorShares' IS DISTINCT FROM 'null'::jsonb
  OR meta->'restatementBasis' IS DISTINCT FROM 'null'::jsonb
  OR meta->'corporateActionRevision' IS DISTINCT FROM 'null'::jsonb
  OR meta->'reportingFrequency' IS DISTINCT FROM 'null'::jsonb
  OR coalesce(jsonb_typeof(meta->'filingRevisionId'),'') NOT IN ('null','string')
 THEN RETURN NULL; END IF;
 known_at:=public.vnext_financial_wire_clock_v1(meta->>'knownAt');
 available_at:=public.vnext_financial_wire_clock_v1(item->>'availableAt');
 IF known_at IS NULL OR available_at IS NULL OR cutoff IS NULL OR NOT isfinite(cutoff)
  OR known_at>available_at OR available_at>cutoff THEN RETURN NULL; END IF;

 start_day:=meta->>'periodStart'; end_day:=meta->>'periodEnd'; duration:=meta->>'storedDurationKind';
 IF public.vnext_financial_wire_clock_v1(end_day||'T00:00:00Z') IS NULL THEN RETURN NULL; END IF;
 IF meta->>'periodType'='instant' THEN
  IF meta->'periodStart' IS DISTINCT FROM 'null'::jsonb OR duration IS DISTINCT FROM 'instant' THEN RETURN NULL; END IF;
 ELSIF meta->>'periodType'='duration' THEN
  IF coalesce(duration,'') NOT IN ('monthly','quarterly','ttm')
   OR public.vnext_financial_wire_clock_v1(start_day||'T00:00:00Z') IS NULL OR start_day>end_day THEN RETURN NULL; END IF;
 ELSE RETURN NULL; END IF;
 RETURN jsonb_build_array(start_day,end_day,duration,item->>'unit',
  CASE WHEN jsonb_typeof(meta->'filingRevisionId')='string' THEN jsonb_build_array('filing',meta->>'filingRevisionId')
       ELSE jsonb_build_array('source',meta->>'sourceRawSha256') END);
END
$window$;
ALTER FUNCTION public.vnext_financial_formula_window_internal_v1(jsonb,timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_formula_window_internal_v1(jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_financial_formula_on_author_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $author$
DECLARE binding public.vnext_financial_preparation_protocols_v1; evidence jsonb; by_id jsonb; cutoff timestamptz;
 claim jsonb; operands jsonb; operand_id text; item jsonb; financial_count integer; first_window jsonb; item_window jsonb;
BEGIN
 SELECT * INTO binding FROM public.vnext_financial_preparation_protocols_v1 WHERE job_id=NEW.job_id;
 -- Legacy preparations predate the immutable financial protocol binding.
 IF NOT FOUND THEN RETURN NEW; END IF;
 evidence:=binding.frozen_packet->'evidence';
 cutoff:=public.vnext_financial_wire_clock_v1(binding.frozen_packet->>'cutoff');
 IF binding.protocol IS DISTINCT FROM 'vnext-financial-provider-input-v1'
  OR binding.input_hash IS DISTINCT FROM NEW.input_hash OR NEW.author_result->>'inputHash' IS DISTINCT FROM binding.input_hash
  OR cutoff IS NULL OR jsonb_typeof(evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(evidence)>2000
  OR jsonb_typeof(NEW.author_result->'claims') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.author_result->'claims') NOT BETWEEN 1 AND 200
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(evidence))<>jsonb_array_length(evidence)
 THEN RAISE EXCEPTION 'vnext_financial_formula_binding_invalid'; END IF;
 SELECT jsonb_object_agg(value->>'id',value) INTO by_id FROM jsonb_array_elements(evidence);
 FOR claim IN SELECT value FROM jsonb_array_elements(NEW.author_result->'claims')
      WHERE value->>'kind'='derived' AND jsonb_typeof(value->'numeric')='object' LOOP
  operands:=claim->'numeric'->'formula'->'evidenceIds';
  IF jsonb_typeof(operands) IS DISTINCT FROM 'array' OR jsonb_array_length(operands) NOT BETWEEN 2 AND 2000
   THEN RAISE EXCEPTION 'vnext_financial_formula_binding_invalid'; END IF;
  financial_count:=0; first_window:=NULL;
  FOR operand_id IN SELECT jsonb_array_elements_text(operands) LOOP
   item:=by_id->operand_id;
   IF item IS NULL THEN RAISE EXCEPTION 'vnext_financial_formula_binding_invalid'; END IF;
   IF item->>'key'='current_price'
    OR (item->>'key' IN ('pe_multiple','pb_multiple','ev_ebitda_multiple','ev_sales_multiple') AND item->>'unit' IN ('ratio','multiple','dimensionless'))
    OR (coalesce(item->'financial','null'::jsonb)='null'::jsonb
        AND (item->>'kind' IS DISTINCT FROM 'fact' OR item->>'sourceTier' IS DISTINCT FROM 'official'))
    THEN CONTINUE; END IF;
   item_window:=public.vnext_financial_formula_window_internal_v1(item,cutoff);
   IF financial_count=0 THEN first_window:=item_window;
   ELSIF item_window IS NULL OR first_window IS NULL OR item_window<>first_window
    THEN RAISE EXCEPTION 'vnext_financial_formula_period_or_basis_unavailable'; END IF;
   financial_count:=financial_count+1;
  END LOOP;
 END LOOP;
 RETURN NEW;
END
$author$;
ALTER FUNCTION public.vnext_financial_formula_on_author_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_financial_formula_on_author_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER vnext_financial_formula_on_author BEFORE UPDATE OF author_result ON public.vnext_jobs_v1
 FOR EACH ROW WHEN (NEW.author_result IS NOT NULL AND NEW.author_result IS DISTINCT FROM OLD.author_result)
 EXECUTE FUNCTION public.vnext_financial_formula_on_author_v1();
COMMIT;
