BEGIN;
-- Unactivated engineering candidate. Empty binding registry; no operator writer/RPC.
-- Existing two charged ledgers, old RPCs and immutable old rows are not replaced.
-- Candidate ACL: four new RPCs receive the SAME service_role EXECUTE scope as v2.
-- No new role, membership, login, schema grant or production activation.
DO $guard$ DECLARE x record; p record; BEGIN
 SELECT prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner INTO p FROM pg_proc WHERE oid=to_regprocedure('public.research_complete_parent_v2(jsonb)');
 IF p.prosrc IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '3515d35c4f8c5c756009cc22cedd8eee50b39d780e7bb7af8f777dbbd21ee57a' OR p.prosecdef IS DISTINCT FROM true OR p.owner IS DISTINCT FROM 'research_input_preparation_owner_v2' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN RAISE EXCEPTION 'versioned_predecessor_not_exact'; END IF;
 SELECT prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner INTO p FROM pg_proc WHERE oid=to_regprocedure('public.read_research_article_input_revision_v2(jsonb)');
 IF p.prosrc IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '1431ac8c0daabcbfd91fabad81bb0974b0a9643b1570e71cf13579b93566405a' OR p.prosecdef IS DISTINCT FROM true OR p.owner IS DISTINCT FROM 'research_input_preparation_owner_v2' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN RAISE EXCEPTION 'versioned_predecessor_not_exact'; END IF;
 SELECT prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner INTO p FROM pg_proc WHERE oid=to_regprocedure('public.seal_research_article_input_revision_v2(jsonb,jsonb)');
 IF p.prosrc IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '7065c97a368dd5e3d723fc9bf9a3c0a0ec3727e69a3e1ed1d4b9c1adc847dd4c' OR p.prosecdef IS DISTINCT FROM true OR p.owner IS DISTINCT FROM 'research_input_preparation_owner_v2' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN RAISE EXCEPTION 'versioned_predecessor_not_exact'; END IF;
END $guard$;
CREATE TABLE public.research_input_bindings_candidate_v3(
 hb text PRIMARY KEY CHECK(hb~'^[a-f0-9]{64}$'),
 core_text text NOT NULL CHECK(octet_length(core_text)<=16384),
 registration jsonb NOT NULL CHECK(octet_length(registration::text)<=1048576),
 CHECK(hb=encode(sha256(convert_to(core_text,'UTF8')),'hex')),
 CHECK(core_text=public.research_observed_canonical_json_v1(core_text::jsonb))
);
CREATE TABLE public.research_input_binding_revocations_candidate_v3(
 hb text NOT NULL REFERENCES public.research_input_bindings_candidate_v3(hb),
 mode text NOT NULL CHECK(mode IN ('read','fresh')), PRIMARY KEY(hb,mode)
);
-- Registration and tombstones are append-only. A revoked identity cannot revive via ABA.
CREATE FUNCTION public.research_input_binding_immutable_candidate_v3() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'versioned_binding_immutable'; END $$;
CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_input_bindings_candidate_v3 FOR EACH STATEMENT EXECUTE FUNCTION public.research_input_binding_immutable_candidate_v3();
CREATE TRIGGER immutable_revocation BEFORE UPDATE OR DELETE OR TRUNCATE ON public.research_input_binding_revocations_candidate_v3 FOR EACH STATEMENT EXECUTE FUNCTION public.research_input_binding_immutable_candidate_v3();
ALTER TABLE public.research_input_bindings_candidate_v3 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_input_binding_revocations_candidate_v3 OWNER TO research_input_preparation_owner_v2;
ALTER TABLE public.research_input_bindings_candidate_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_input_binding_revocations_candidate_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_input_bindings_candidate_v3,public.research_input_binding_revocations_candidate_v3 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.research_input_binding_candidate_v3(p_symbol text,p_inventory text,p_hb text,p_fresh boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.research_input_bindings_candidate_v3; c jsonb; q jsonb;
BEGIN
 SELECT * INTO b FROM public.research_input_bindings_candidate_v3 WHERE hb=p_hb;
 IF NOT FOUND OR EXISTS(SELECT FROM public.research_input_binding_revocations_candidate_v3 WHERE hb=p_hb AND (mode='read' OR p_fresh AND mode='fresh')) THEN RAISE EXCEPTION 'versioned_binding_unavailable';END IF;
 c:=b.core_text::jsonb;q:=b.registration;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key) IS DISTINCT FROM ARRAY['artifactRootId','compiledFingerprintIdentity','financialProfile','inventoryHash','schemaTemplateIdentity','sourceExecutionHash','symbol','validationContract','wireVersion']
 OR c->>'symbol' IS DISTINCT FROM p_symbol OR p_symbol NOT IN ('2409','2383') OR c->>'inventoryHash' IS DISTINCT FROM p_inventory
 OR c->>'validationContract' IS DISTINCT FROM 'research-versioned-input-candidate-v3'
 OR NOT ((c->>'wireVersion'='research-article-input-v2' AND c->>'financialProfile'='oct08_compatible_financial_candidate_v1' AND c->>'artifactRootId'='original75d-fixed8or6')
 OR (c->>'wireVersion'='research-article-input-v3' AND c->>'financialProfile'='oct14_historical_cash_v1' AND c->>'artifactRootId'='historical15d4-fixed9or7'))
 OR EXISTS(SELECT FROM jsonb_each(c) WHERE jsonb_typeof(value)<>'string')
 OR EXISTS(SELECT FROM jsonb_each_text(c) WHERE key IN ('compiledFingerprintIdentity','sourceExecutionHash','schemaTemplateIdentity','inventoryHash') AND value !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'versioned_binding_shape';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(q) key) IS DISTINCT FROM ARRAY['historicalHash','inventory','knownFloor','modelCutoff','schemaTemplate']
 OR public.research_complete_hash_v2(q->'inventory') IS DISTINCT FROM p_inventory
 OR encode(sha256(convert_to(public.research_observed_canonical_json_v1(q->'schemaTemplate'),'UTF8')),'hex') IS DISTINCT FROM c->>'schemaTemplateIdentity'
 OR q->>'historicalHash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'versioned_registration_mismatch';END IF;
 RETURN jsonb_build_object('bindingCapsuleIdentity',b.hb,'core',c,'registration',q);
END $$;
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
CREATE FUNCTION public.read_research_article_input_candidate_v3(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb; parent jsonb; saved public.research_article_input_revisions_v2; b jsonb; c jsonb; payload jsonb; material jsonb;
BEGIN
 -- Historical exact selector is delegated unchanged, including original live fences.
 IF p_request->>'expectedCalculatorExecutionHash'='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41' THEN RETURN public.read_research_article_input_revision_v2(p_request);END IF;
 ctx:=public.research_complete_parent_candidate_v3(p_request);parent:=ctx->'preparation';b:=ctx->'binding';c:=b->'core';
 SELECT * INTO saved FROM public.research_article_input_revisions_v2 WHERE preparation_id=(p_request->>'preparationId')::uuid;
 IF NOT FOUND THEN
  PERFORM public.research_input_binding_candidate_v3(parent->'payload'->>'symbol',p_request->>'expectedArtifactManifestHash',p_request->>'expectedCalculatorExecutionHash',true);
  RETURN ctx||jsonb_build_object('status','absent','dispatchReady',false);
 END IF;
 IF saved.canonical_request IS DISTINCT FROM p_request OR saved.request_hash IS DISTINCT FROM public.research_complete_hash_v2(p_request) THEN RAISE EXCEPTION 'complete_replay_conflict';END IF;
 payload:=saved.canonical_payload;
 IF payload->>'schemaVersion' IS DISTINCT FROM c->>'wireVersion' OR payload->'hashes'->>'sourceClosureHash' IS DISTINCT FROM c->>'sourceExecutionHash'
 OR saved.input_hash IS DISTINCT FROM public.research_complete_hash_v2(payload) THEN RAISE EXCEPTION 'versioned_stored_binding';END IF;
 IF c->>'wireVersion'='research-article-input-v3' THEN
  IF payload->'financial'->'protocol' IS DISTINCT FROM c||jsonb_build_object('bindingCapsuleIdentity',b->>'bindingCapsuleIdentity') THEN RAISE EXCEPTION 'versioned_stored_binding';END IF;
  material:=(payload->'financial'->'candidate')||jsonb_build_object('financialMaterial',payload->'financial'->'material');
 ELSE
  material:=jsonb_build_object('schemaVersion','research-complete-financial-material-v2','symbol',c->'symbol','artifactReadKnownAt',payload->'clocks'->'artifactReadKnownAt','sourceClosureHash',c->'sourceExecutionHash','artifactInventoryHash',c->'inventoryHash','financialMaterial',payload->'financial'->'material');
 END IF;
 PERFORM public.research_complete_schema_check_v2(material,b->'registration'->'schemaTemplate',(payload->'clocks'->>'artifactReadKnownAt')::timestamptz);
 IF clock_timestamp()>=least((parent->'payload'->'originalJob'->>'leaseExpiresAt')::timestamptz,(parent->'payload'->'originalReservation'->>'leaseExpiresAt')::timestamptz) THEN RAISE EXCEPTION 'complete_lease_lost';END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('status','sealed','replay',true,'dispatchReady',false,'binding',b);
END $$;
CREATE FUNCTION public.assert_research_input_candidate_v3(p_request jsonb,p_context_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.research_complete_parent_candidate_v3(p_request);
 PERFORM public.research_input_binding_candidate_v3(ctx->'preparation'->'payload'->>'symbol',p_request->>'expectedArtifactManifestHash',p_request->>'expectedCalculatorExecutionHash',true);
 IF ctx->>'contextHash' IS DISTINCT FROM p_context_hash THEN RAISE EXCEPTION 'versioned_context_changed';END IF;
 RETURN ctx;
END $$;
CREATE FUNCTION public.prepare_research_input_candidate_v3(p_request jsonb,p_inventory_hash text,p_binding_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE symbol text; binding jsonb; result jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'complete_read_committed_required';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT j.symbol INTO symbol FROM public.research_deep_jobs_v1 j WHERE j.job_id=(p_request->>'jobId')::uuid;
 binding:=public.research_input_binding_candidate_v3(symbol,p_inventory_hash,p_binding_hash,true);
 -- Original function owns all request/role/lease/source validation and charging.
 result:=public.prepare_research_input_v2(p_request);
 RETURN result;
END $$;
CREATE FUNCTION public.seal_research_article_input_candidate_v3(p_request jsonb,p_calculation jsonb,p_context_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb; b jsonb; c jsonb; parent jsonb; existing jsonb; m jsonb; p jsonb; f jsonb; projection jsonb; calc jsonb; material jsonb; known timestamptz; n timestamptz; rh text; ih text; charge integer; used_count bigint;used_bytes bigint;saved public.research_article_input_revisions_v2;gaps jsonb;
BEGIN
 existing:=public.read_research_article_input_candidate_v3(p_request);IF existing->>'status'='sealed' THEN RETURN existing;END IF;
 ctx:=public.assert_research_input_candidate_v3(p_request,p_context_hash);parent:=ctx->'preparation';p:=parent->'payload';b:=ctx->'binding';c:=b->'core';m:=b->'registration';
 IF p_calculation IS NULL OR octet_length(p_calculation::text)>262144 THEN RAISE EXCEPTION 'complete_calculation_bound';END IF;
 known:=(p_calculation->>'artifactReadKnownAt')::timestamptz;
 PERFORM public.research_complete_schema_check_v2(p_calculation,m->'schemaTemplate',known);
 IF c->>'wireVersion'='research-article-input-v2' THEN
  IF p_calculation->>'sourceClosureHash' IS DISTINCT FROM c->>'sourceExecutionHash' OR p_calculation->>'artifactInventoryHash' IS DISTINCT FROM c->>'inventoryHash' THEN RAISE EXCEPTION 'complete_calculation_mapping';END IF;
 ELSE
  IF p_calculation->>'candidateArtifactInventoryHash' IS DISTINCT FROM c->>'inventoryHash' OR p_calculation->>'financialProfile' IS DISTINCT FROM c->>'financialProfile' OR p_calculation->>'symbol' IS DISTINCT FROM c->>'symbol' THEN RAISE EXCEPTION 'complete_calculation_mapping';END IF;
 END IF;
 f:=p_calculation->'financialMaterial';projection:=f->'projection';calc:=f->'calculation';
 IF octet_length(projection::text)>160000 THEN RAISE EXCEPTION 'complete_projection_bound';END IF;
 -- After bounded computation/validation, repeat all original fences under the same locks.
 ctx:=public.assert_research_input_candidate_v3(p_request,p_context_hash);parent:=ctx->'preparation';n:=clock_timestamp();
 IF NOT isfinite(known) OR known>n OR known<(m->>'knownFloor')::timestamptz OR (parent->>'admitted_at')::timestamptz>n OR (parent->>'admitted_at')::timestamptz<n-interval '120 seconds' THEN RAISE EXCEPTION 'complete_freshness';END IF;
 gaps:=jsonb_build_array(jsonb_build_object('namespace','source','reason','source_coverage_incomplete'),jsonb_build_object('namespace','financial','reason','financial_source_live_rights_unverified'),jsonb_build_object('namespace','execution','reason','trusted_role_execution_unavailable'));
 SELECT gaps||jsonb_agg(jsonb_build_object('namespace','financial','reason',reason) ORDER BY ord) INTO gaps FROM jsonb_array_elements_text(projection->'gaps') WITH ORDINALITY a(reason,ord);
 IF jsonb_array_length(p->'sourceManifest')=0 THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('namespace','source','reason','sources_not_selected'));END IF;
 material:=jsonb_build_object('schemaVersion',c->>'wireVersion','assemblyStatus','complete','evidenceStatus','incomplete','producerAttribution','internal_controller_asserted',
 'preparation',jsonb_build_object('id',parent->'preparation_id','inputHash',parent->'input_hash'),
 'researchIdentity',jsonb_build_object('researchCompanyId',p->'researchCompanyId','symbol',p->'symbol','scope',p->'scope','snapshotHash',p->'snapshotHash','mappingDigest',p->'mappingDigest','stockId',p->'stockId'),
 'priority',jsonb_build_object('runId',p->'priorityRunId','inputHash',p->'priorityInputHash','discoveryCutoff',p->'discoveryCutoff'),
 'originalJob',p->'originalJob','originalReservation',p->'originalReservation','sources',jsonb_build_object('sealId',parent->'source_seal_id','manifest',p->'sourceManifest','coverage','incomplete'),
 'financial',jsonb_build_object('artifactInventory',m->'inventory','material',f)||CASE WHEN c->>'wireVersion'='research-article-input-v3' THEN jsonb_build_object('candidate',p_calculation-'financialMaterial','protocol',c||jsonb_build_object('bindingCapsuleIdentity',b->>'bindingCapsuleIdentity')) ELSE '{}'::jsonb END,
 'hashes',jsonb_build_object('preparationInputHash',parent->'input_hash','artifactInventoryHash',public.research_complete_hash_v2(m->'inventory'),'modelHistoricalCanonicalHash',m->'historicalHash',
 'sourceManifestHash',public.research_complete_hash_v2(projection->'sourceManifest'),'projectionHash',public.research_complete_hash_v2(projection),'scenarioInputHash',public.research_complete_hash_v2(projection->'projected'->'scenarios'),'resultHash',public.research_complete_hash_v2(calc),'sourceClosureHash',c->'sourceExecutionHash'),
 'clocks',jsonb_build_object('originalModelCutoff',m->'modelCutoff','originalPreparationAdmittedAt',parent->'admitted_at','artifactReadKnownAt',p_calculation->'artifactReadKnownAt','financialAdmittedAt',n,'researchCutoff',n),
 'gaps',gaps,'capabilities',jsonb_build_object('financialVerified',false,'dispatchReady',false,'modelDispatched',false,'publishableResearch',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false,'historicalPITEligible',false));
 charge:=octet_length(convert_to(public.research_complete_canonical_v2(p_request),'UTF8'))+octet_length(convert_to(public.research_complete_canonical_v2(material),'UTF8'));
 SELECT count(*),coalesce(sum(logical_bytes),0) INTO used_count,used_bytes FROM (
 SELECT logical_bytes FROM public.research_input_preparations_v2 WHERE job_id=(parent->>'job_id')::uuid AND attempt=(parent->>'attempt')::int AND reservation_id=(parent->>'reservation_id')::uuid
 UNION ALL SELECT logical_bytes FROM public.research_article_input_revisions_v2 WHERE job_id=(parent->>'job_id')::uuid AND attempt=(parent->>'attempt')::int AND reservation_id=(parent->>'reservation_id')::uuid) history;
 IF used_count>=4 THEN RAISE EXCEPTION 'complete_count_bound';END IF;IF used_bytes+charge>524288 THEN RAISE EXCEPTION 'complete_byte_bound';END IF;
 IF clock_timestamp()>=least((p->'originalJob'->>'leaseExpiresAt')::timestamptz,(p->'originalReservation'->>'leaseExpiresAt')::timestamptz) THEN RAISE EXCEPTION 'complete_lease_lost';END IF;
 rh:=public.research_complete_hash_v2(p_request);ih:=public.research_complete_hash_v2(material);
 INSERT INTO public.research_article_input_revisions_v2(preparation_id,job_id,attempt,reservation_id,research_company_id,research_scope,snapshot_hash,request_hash,canonical_request,input_hash,canonical_payload,logical_bytes,admitted_at,research_cutoff,source_seal_id)
 VALUES((parent->>'preparation_id')::uuid,(parent->>'job_id')::uuid,(parent->>'attempt')::int,(parent->>'reservation_id')::uuid,(p->>'researchCompanyId')::uuid,'research_observed_v1',p->>'snapshotHash',rh,p_request,ih,material,charge,n,n,(parent->>'source_seal_id')::uuid) RETURNING * INTO saved;
 RETURN to_jsonb(saved)||jsonb_build_object('status','sealed','replay',false,'dispatchReady',false,'binding',b);
END $$;
ALTER FUNCTION public.research_input_binding_immutable_candidate_v3() OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_input_binding_immutable_candidate_v3() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.research_input_binding_candidate_v3(text,text,text,boolean) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_input_binding_candidate_v3(text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.research_complete_parent_candidate_v3(jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.research_complete_parent_candidate_v3(jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.read_research_article_input_candidate_v3(jsonb) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_article_input_candidate_v3(jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.assert_research_input_candidate_v3(jsonb,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.assert_research_input_candidate_v3(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.prepare_research_input_candidate_v3(jsonb,text,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.prepare_research_input_candidate_v3(jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.seal_research_article_input_candidate_v3(jsonb,jsonb,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.seal_research_article_input_candidate_v3(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_research_article_input_candidate_v3(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_research_input_candidate_v3(jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_research_input_candidate_v3(jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seal_research_article_input_candidate_v3(jsonb,jsonb,text) TO service_role;
COMMIT;
