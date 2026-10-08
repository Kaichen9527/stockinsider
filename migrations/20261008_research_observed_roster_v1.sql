BEGIN;
-- Research identities are deliberately separate from public.stocks and all authority/publication tables.
DO $do$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='research_observed_rpc_owner') THEN
  CREATE ROLE research_observed_rpc_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $do$;
CREATE TABLE public.research_observed_companies_v1 (
 research_company_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 market text NOT NULL DEFAULT 'TW' CHECK(market='TW'),
 symbol text NOT NULL CHECK(symbol ~ '^[1-9][0-9]{3}$'),
 exchange text NOT NULL CHECK(exchange IN('TWSE','TPEX')),
 issuer_name text NOT NULL CHECK(length(issuer_name) BETWEEN 1 AND 300),
 isin text NOT NULL CHECK(isin ~ '^[A-Z0-9]{12}$'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(market,symbol), UNIQUE(market,isin), UNIQUE(research_company_id,symbol,exchange,isin)
);
CREATE TABLE public.research_observed_roster_snapshots_v1 (
 snapshot_hash text PRIMARY KEY CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 canonical_packet text NOT NULL CHECK(octet_length(canonical_packet) BETWEEN 1 AND 2000000),
 schema_version text NOT NULL CHECK(schema_version='research-observed-roster-admission-v1'),
 classifier_hash text NOT NULL CHECK(classifier_hash='9eb59b03bd3b89cbe9813a93f49dc2247e5d7e12a6e31e145d042fef493f8f63'),
 classification_hash text NOT NULL CHECK(classification_hash ~ '^[a-f0-9]{64}$'),
 legacy_snapshot_hash text NOT NULL CHECK(legacy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 source_references jsonb NOT NULL CHECK(jsonb_typeof(source_references)='array'),
 included_count integer NOT NULL CHECK(included_count BETWEEN 1 AND 5000),
 excluded_count integer NOT NULL CHECK(excluded_count BETWEEN 0 AND 5000),
 mapping_digest text NOT NULL CHECK(mapping_digest ~ '^[a-f0-9]{64}$'),
 latest_observed_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(latest_observed_at<=received_at)
);
CREATE TABLE public.research_observed_roster_members_v1 (
 snapshot_hash text NOT NULL REFERENCES public.research_observed_roster_snapshots_v1(snapshot_hash),
 research_company_id uuid NOT NULL,
 symbol text NOT NULL, exchange text NOT NULL, isin text NOT NULL,
 observed_name text NOT NULL, observed_sector text NOT NULL,
 cfi text NOT NULL CHECK(cfi ~ '^ES[A-Z]{4}$'),
 source_section text NOT NULL, observed_at timestamptz NOT NULL,
 PRIMARY KEY(snapshot_hash,research_company_id), UNIQUE(snapshot_hash,symbol),
 FOREIGN KEY(research_company_id,symbol,exchange,isin) REFERENCES public.research_observed_companies_v1(research_company_id,symbol,exchange,isin)
);
CREATE FUNCTION public.reject_research_observed_mutation_v1() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'research_observed_immutable'; END $$;
CREATE TRIGGER immutable_observed_company BEFORE UPDATE OR DELETE ON public.research_observed_companies_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_research_observed_mutation_v1();
CREATE TRIGGER immutable_observed_snapshot BEFORE UPDATE OR DELETE ON public.research_observed_roster_snapshots_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_research_observed_mutation_v1();
CREATE TRIGGER immutable_observed_member BEFORE UPDATE OR DELETE ON public.research_observed_roster_members_v1 FOR EACH ROW EXECUTE FUNCTION public.reject_research_observed_mutation_v1();
ALTER TABLE public.research_observed_companies_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_observed_roster_snapshots_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_observed_roster_members_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY observed_rpc_only ON public.research_observed_companies_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
CREATE POLICY observed_rpc_only ON public.research_observed_roster_snapshots_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
CREATE POLICY observed_rpc_only ON public.research_observed_roster_members_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);
REVOKE ALL ON public.research_observed_companies_v1,public.research_observed_roster_snapshots_v1,public.research_observed_roster_members_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public,extensions TO research_observed_rpc_owner;
GRANT SELECT,INSERT ON public.research_observed_companies_v1,public.research_observed_roster_snapshots_v1,public.research_observed_roster_members_v1 TO research_observed_rpc_owner;
-- Canonical JSON is recomputed in DB; callers cannot substitute a matching label for different bytes.
CREATE FUNCTION public.research_observed_canonical_json_v1(value jsonb) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.research_observed_canonical_json_v1(member),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) AS item(key,member);
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT '['||coalesce(string_agg(public.research_observed_canonical_json_v1(member),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS item(member,ord);
 ELSE result:=value::text;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.admit_research_observed_roster_v1(p_snapshot_hash text,p_canonical_packet text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE packet jsonb; payload jsonb; request jsonb; member jsonb; source jsonb;
 existing public.research_observed_roster_snapshots_v1%ROWTYPE;
 company public.research_observed_companies_v1%ROWTYPE;
 now_clock timestamptz; latest timestamptz; mappings jsonb:='[]'; mapping_hash text;
 n integer; excluded_n integer; matching_n integer; legacy jsonb; scope jsonb;
BEGIN
 IF p_snapshot_hash IS NULL OR p_snapshot_hash !~ '^[a-f0-9]{64}$' OR p_canonical_packet IS NULL OR octet_length(p_canonical_packet)>2000000 THEN RAISE EXCEPTION 'observed_admission_shape_invalid'; END IF;
 packet:=p_canonical_packet::jsonb; payload:=packet->'payload';request:=packet->'request';legacy:=request->'legacyClassification';scope:=request->'securityScope';
 IF EXISTS(WITH RECURSIVE nodes(value,key,depth) AS (
   SELECT packet,''::text,0 UNION ALL
   SELECT child.value,child.key,n.depth+1 FROM nodes n CROSS JOIN LATERAL (
    SELECT e.value,e.key FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END)e
    UNION ALL SELECT a.value,''::text FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]'::jsonb END)a
   )child WHERE n.depth<=16
  ) SELECT 1 FROM nodes WHERE depth>16 OR key ~* '^(authorization|headers|cookies?|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|__proto__|constructor|prototype|rawHtml|rawText|fullText)$'
   OR (jsonb_typeof(value)='string' AND (length(value#>>'{}')>4096 OR value#>>'{}' ~* '(Bearer[[:space:]]+[^[:space:]]{12,}|-----BEGIN .*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(password|api[_-]?key|access[_-]?token|cookie)[[:space:]]*[:=][[:space:]]*[^[:space:]]+)'))
 ) THEN RAISE EXCEPTION 'observed_packet_boundary_invalid'; END IF;

 IF p_canonical_packet<>public.research_observed_canonical_json_v1(packet) THEN RAISE EXCEPTION 'observed_packet_canonical_mismatch'; END IF;
 IF encode(extensions.digest(convert_to(p_canonical_packet,'UTF8'),'sha256'),'hex')<>p_snapshot_hash THEN RAISE EXCEPTION 'observed_packet_hash_mismatch'; END IF;
 IF payload->>'schemaVersion' IS DISTINCT FROM 'research-observed-roster-admission-v1' OR payload->>'classifierHash' IS DISTINCT FROM '9eb59b03bd3b89cbe9813a93f49dc2247e5d7e12a6e31e145d042fef493f8f63'
  OR payload->>'classifierVersion' IS DISTINCT FROM 'source-cohort-consumer-v1'
  OR payload->'researchQualified' IS DISTINCT FROM 'false'::jsonb OR payload->'strategyApproved' IS DISTINCT FROM 'false'::jsonb OR payload->'entryEligible' IS DISTINCT FROM 'false'::jsonb
  OR payload->'trustedAuthorityActivated' IS DISTINCT FROM 'false'::jsonb OR payload->'historicalPITEligible' IS DISTINCT FROM 'false'::jsonb OR payload->'rawSourceHashesVerifiedByVm' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(payload->'members') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'excluded') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'observed_admission_policy_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(packet) key WHERE key NOT IN('request','payload'))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(request) key WHERE key NOT IN('legacyClassification','securityScope'))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) key WHERE key NOT IN('schemaVersion','classifierVersion','classifierHash','classificationHash','legacySnapshotHash','members','excluded','sourceReferences','rawSourceHashesVerifiedByVm','researchQualified','strategyApproved','entryEligible','trustedAuthorityActivated','historicalPITEligible'))
  OR legacy->>'schemaVersion' IS DISTINCT FROM 'stockinsider-observed-security-classification-relay-v1'
  OR scope->>'schemaVersion' IS DISTINCT FROM 'stockinsider-observed-official-security-scope-reconciliation-v1'
  OR legacy->'trustedAuthorityActivated' IS DISTINCT FROM 'false'::jsonb OR scope->'trustedAuthorityActivated' IS DISTINCT FROM 'false'::jsonb
  OR legacy->'historicalPITEligible' IS DISTINCT FROM 'false'::jsonb OR scope->'historicalPITEligible' IS DISTINCT FROM 'false'::jsonb
  OR legacy->'currentTradingEligibilityVerified' IS DISTINCT FROM 'false'::jsonb OR scope->'currentTradingEligibilityVerified' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'observed_raw_boundary_invalid'; END IF;
 n:=jsonb_array_length(payload->'members');excluded_n:=jsonb_array_length(payload->'excluded');
 IF n<1 OR n>5000 OR excluded_n>5000 OR jsonb_array_length(payload->'sourceReferences')<>2 THEN RAISE EXCEPTION 'observed_admission_count_invalid'; END IF;
 IF payload->>'classificationHash'<>encode(extensions.digest(convert_to(public.research_observed_canonical_json_v1(jsonb_build_object('members',payload->'members','excluded',payload->'excluded')),'UTF8'),'sha256'),'hex')
  OR payload->>'legacySnapshotHash'<>encode(extensions.digest(convert_to(public.research_observed_canonical_json_v1(legacy),'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'observed_classification_hash_mismatch'; END IF;
 -- Serialize identity/snapshot admissions; all DB clocks are captured after this lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('research_observed_admission_v1',0));now_clock:=clock_timestamp();
 SELECT * INTO existing FROM public.research_observed_roster_snapshots_v1 WHERE snapshot_hash=p_snapshot_hash;
 IF FOUND THEN
  IF existing.canonical_packet<>p_canonical_packet THEN RAISE EXCEPTION 'observed_replay_bytes_mismatch'; END IF;
  RETURN jsonb_build_object('snapshotHash',existing.snapshot_hash,'mappingDigest',existing.mapping_digest,'includedCount',existing.included_count,'excludedCount',existing.excluded_count,'receivedAt',existing.received_at,'latestObservedAt',existing.latest_observed_at,'idempotentReplay',true,'researchQualified',false,'strategyApproved',false,'entryEligible',false);
 END IF;
 latest:='-infinity';
 FOR source IN SELECT value FROM jsonb_array_elements(payload->'sourceReferences') LOOP
  IF source->>'url' NOT IN('https://isin.twse.com.tw/isin/C_public.jsp?strMode=2','https://isin.twse.com.tw/isin/C_public.jsp?strMode=4') OR source->>'responseSha256' !~ '^[a-f0-9]{64}$'
   OR (source->>'responseBytes')::bigint<1 OR (source->>'responseBytes')::bigint>(CASE WHEN source->>'url' LIKE '%strMode=2' THEN 12000000 ELSE 4000000 END)
   OR (source->>'observedAt')::timestamptz>now_clock THEN RAISE EXCEPTION 'observed_source_receipt_invalid'; END IF;
  IF source->>'url'='https://isin.twse.com.tw/isin/C_public.jsp?strMode=2' THEN
   IF source->>'responseSha256' IS DISTINCT FROM scope#>>'{sources,0,sha256}' OR source->>'responseBytes' IS DISTINCT FROM scope#>>'{sources,0,bytes}' OR source->>'observedAt' IS DISTINCT FROM scope#>>'{sources,0,observedAt}'
    OR scope#>>'{sources,0,url}' IS DISTINCT FROM source->>'url' OR scope#>>'{sources,0,resolvedUrl}' IS DISTINCT FROM source->>'url' OR scope#>>'{sources,0,status}' IS DISTINCT FROM 'read_success' OR scope#>>'{sources,0,httpStatus}' IS DISTINCT FROM '200'
    OR (scope#>>'{sources,0,attemptedAt}')::timestamptz>(source->>'observedAt')::timestamptz THEN RAISE EXCEPTION 'observed_source_binding_invalid'; END IF;
  ELSE
   IF source->>'responseSha256' IS DISTINCT FROM legacy#>>'{sources,1,responseSha256}' OR source->>'responseBytes' IS DISTINCT FROM legacy#>>'{sources,1,responseBytes}' OR source->>'observedAt' IS DISTINCT FROM legacy#>>'{sources,1,observedAt}' OR legacy#>>'{sources,1,url}' IS DISTINCT FROM source->>'url' THEN RAISE EXCEPTION 'observed_source_binding_invalid'; END IF;
  END IF;
  latest:=greatest(latest,(source->>'observedAt')::timestamptz);
 END LOOP;
 IF (legacy->>'recordedAt')::timestamptz>now_clock OR (scope->>'recordedAt')::timestamptz>now_clock THEN RAISE EXCEPTION 'observed_roster_future'; END IF;
 -- Recompute inclusion from the supplied official classification rows, not caller membership flags.
 SELECT count(*) INTO matching_n FROM jsonb_array_elements(scope->'rows') r WHERE r->>'sourceSection' IN('股票','創新板') AND r->>'cfi' ~ '^ES[A-Z]{4}$' AND r->>'symbol' ~ '^[1-9][0-9]{3}$';
 matching_n:=matching_n+(SELECT count(*) FROM jsonb_array_elements(legacy->'members') r WHERE r->>'exchange'='TPEX' AND r->>'cfi'='ESVUFR');
 IF matching_n<>n OR excluded_n<>(SELECT count(*) FROM jsonb_array_elements(scope->'rows') r WHERE r->>'sourceSection'='臺灣存託憑證(TDR)' AND r->>'cfi' ~ '^ED[A-Z]{4}$') THEN RAISE EXCEPTION 'observed_membership_count_mismatch'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(payload->'members') LOOP
  IF member->>'exchange'='TWSE' THEN
   SELECT count(*) INTO matching_n FROM jsonb_array_elements(scope->'rows') r WHERE r->>'symbol'=member->>'symbol' AND r->>'name'=member->>'name' AND r->>'isin'=member->>'isin' AND r->>'cfi'=member->>'cfi' AND r->>'sourceSection'=member->>'sourceSection' AND r->>'sourceSection' IN('股票','創新板');
  ELSIF member->>'exchange'='TPEX' THEN
   SELECT count(*) INTO matching_n FROM jsonb_array_elements(legacy->'members') r WHERE r->>'exchange'='TPEX' AND r->>'symbol'=member->>'symbol' AND r->>'name'=member->>'name' AND r->>'isin'=member->>'isin' AND r->>'cfi'=member->>'cfi';
  ELSE RAISE EXCEPTION 'observed_exchange_invalid'; END IF;
  IF (member->>'observedAt')::timestamptz IS DISTINCT FROM (SELECT (r->>'observedAt')::timestamptz FROM jsonb_array_elements(payload->'sourceReferences')r WHERE r->>'url'=CASE WHEN member->>'exchange'='TWSE' THEN 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2' ELSE 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4' END) THEN RAISE EXCEPTION 'observed_member_clock_binding_invalid'; END IF;
  IF matching_n<>1 OR member->>'cfi' !~ '^ES[A-Z]{4}$' OR (member->>'observedAt')::timestamptz>now_clock THEN RAISE EXCEPTION 'observed_member_binding_invalid'; END IF;
  SELECT * INTO company FROM public.research_observed_companies_v1 WHERE market='TW' AND symbol=member->>'symbol';
  IF FOUND THEN
   IF company.exchange<>member->>'exchange' OR company.isin<>member->>'isin' OR company.issuer_name<>member->>'name' THEN RAISE EXCEPTION 'observed_issuer_conflict'; END IF;
  ELSE
   INSERT INTO public.research_observed_companies_v1(symbol,exchange,issuer_name,isin) VALUES(member->>'symbol',member->>'exchange',member->>'name',member->>'isin') RETURNING * INTO company;
  END IF;
  mappings:=mappings||jsonb_build_array(jsonb_build_object('researchCompanyId',company.research_company_id,'symbol',company.symbol,'stockId',null));
 END LOOP;
 mapping_hash:=encode(extensions.digest(convert_to(public.research_observed_canonical_json_v1(mappings),'UTF8'),'sha256'),'hex');
 INSERT INTO public.research_observed_roster_snapshots_v1(snapshot_hash,canonical_packet,schema_version,classifier_hash,classification_hash,legacy_snapshot_hash,source_references,included_count,excluded_count,mapping_digest,latest_observed_at,received_at)
  VALUES(p_snapshot_hash,p_canonical_packet,payload->>'schemaVersion',payload->>'classifierHash',payload->>'classificationHash',payload->>'legacySnapshotHash',payload->'sourceReferences',n,excluded_n,mapping_hash,latest,now_clock);
 INSERT INTO public.research_observed_roster_members_v1(snapshot_hash,research_company_id,symbol,exchange,isin,observed_name,observed_sector,cfi,source_section,observed_at)
  SELECT p_snapshot_hash,c.research_company_id,r->>'symbol',r->>'exchange',r->>'isin',r->>'name',r->>'sector',r->>'cfi',r->>'sourceSection',(r->>'observedAt')::timestamptz
  FROM jsonb_array_elements(payload->'members')r JOIN public.research_observed_companies_v1 c ON c.market='TW' AND c.symbol=r->>'symbol';
 RETURN jsonb_build_object('snapshotHash',p_snapshot_hash,'mappingDigest',mapping_hash,'includedCount',n,'excludedCount',excluded_n,'receivedAt',now_clock,'latestObservedAt',latest,'idempotentReplay',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false);
END $$;
ALTER FUNCTION public.admit_research_observed_roster_v1(text,text) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.research_observed_canonical_json_v1(jsonb),public.reject_research_observed_mutation_v1(),public.admit_research_observed_roster_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.research_observed_canonical_json_v1(jsonb) TO research_observed_rpc_owner;
GRANT EXECUTE ON FUNCTION public.admit_research_observed_roster_v1(text,text) TO service_role;
COMMIT;
