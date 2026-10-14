CREATE FUNCTION public.research_complete_parent_candidate_v3(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.research_input_preparations_v2; m jsonb; replay jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'complete_read_committed_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192 OR
 (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_request) key) IS DISTINCT FROM ARRAY['attempt','expectedArtifactManifestHash','expectedCalculatorExecutionHash','jobId','owner','preparationHash','preparationId','reservationId','scope','snapshotHash']
 OR p_request->>'scope' IS DISTINCT FROM 'research_observed_v1' OR jsonb_typeof(p_request->'owner') IS DISTINCT FROM 'string' OR p_request->>'owner' !~ '^[A-Za-z0-9:_-]{3,120}$'
 OR jsonb_typeof(p_request->'attempt') IS DISTINCT FROM 'number' OR p_request->>'attempt' !~ '^[1-3]$' THEN RAISE EXCEPTION 'complete_request_shape';END IF;
 IF EXISTS(SELECT FROM jsonb_each(p_request) WHERE key IN ('jobId','reservationId','preparationId') AND (jsonb_typeof(value)<>'string' OR value#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 OR EXISTS(SELECT FROM jsonb_each(p_request) WHERE key IN ('snapshotHash','preparationHash','expectedArtifactManifestHash','expectedCalculatorExecutionHash') AND (jsonb_typeof(value)<>'string' OR value#>>'{}' !~ '^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'complete_request_shape';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO old FROM public.research_input_preparations_v2 WHERE preparation_id=(p_request->>'preparationId')::uuid;
 IF old.preparation_id IS NULL OR old.input_hash IS DISTINCT FROM p_request->>'preparationHash'
 OR (old.request-'sourceDocumentIds'-'bundleId') IS DISTINCT FROM (p_request-'preparationId'-'preparationHash'-'expectedArtifactManifestHash'-'expectedCalculatorExecutionHash') THEN RAISE EXCEPTION 'complete_parent_binding';END IF;
 m:=public.research_input_binding_candidate_v3(old.payload->>'symbol',p_request->>'expectedArtifactManifestHash',p_request->>'expectedCalculatorExecutionHash',false);
 replay:=public.assert_research_input_preparation_v2(old.request,old.preparation_id,old.input_hash);
 RETURN jsonb_build_object('preparation',replay,'binding',m,'contextHash',public.research_complete_hash_v2(jsonb_build_object('request',p_request,'preparationHash',old.input_hash,'sourceSeal',old.source_seal_id,'binding',m->>'bindingCapsuleIdentity')));
END $$;
