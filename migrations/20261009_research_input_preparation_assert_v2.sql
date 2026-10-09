BEGIN;
-- Read-only wrapper over the already existing exact-replay branch. No caller
-- can create a preparation through this RPC: existence is checked under the
-- same source/global locks before the original RPC is entered.
CREATE FUNCTION public.assert_research_input_preparation_v2(p_request jsonb,p_preparation_id uuid,p_input_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.research_input_preparations_v2; replay jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'input_preparation_read_committed_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
  OR p_preparation_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'input_preparation_assert_shape'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO old FROM public.research_input_preparations_v2 WHERE preparation_id=p_preparation_id;
 IF NOT FOUND OR old.request IS DISTINCT FROM p_request OR old.input_hash IS DISTINCT FROM p_input_hash THEN RAISE EXCEPTION 'input_preparation_assert_mismatch'; END IF;
 -- Original function rechecks lease, lineage, role, attempt/completion and source
 -- seal even for replay; immutable old row guarantees no admission branch.
 replay:=public.prepare_research_input_v2(p_request);
 IF replay->>'preparation_id' IS DISTINCT FROM p_preparation_id::text OR replay->>'input_hash' IS DISTINCT FROM p_input_hash
  OR replay->'replay' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'input_preparation_assert_mismatch'; END IF;
 RETURN replay;
END $$;
ALTER FUNCTION public.assert_research_input_preparation_v2(jsonb,uuid,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.assert_research_input_preparation_v2(jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_research_input_preparation_v2(jsonb,uuid,text) TO service_role;
COMMIT;
