BEGIN;
-- Read-only continuation of an existing original assignment. No new authority.
CREATE FUNCTION public.read_research_author_packet_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; revision jsonb; payload jsonb; seal public.research_source_seals_v2;
 item jsonb; doc jsonb; m jsonb; descriptor jsonb; sources jsonb:='[]'; result jsonb;
 observed timestamptz; collected timestamptz; cutoff timestamptz; symbol text;
BEGIN
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_packet_assignment_missing'; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 payload:=revision->'canonical_payload';symbol:=payload->'researchIdentity'->>'symbol';
 cutoff:=(payload->'clocks'->>'researchCutoff')::timestamptz;
 IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>clock_timestamp()
  OR jsonb_typeof(payload->'sources'->'manifest') IS DISTINCT FROM 'array'
  OR jsonb_array_length(payload->'sources'->'manifest')>30 THEN
  RAISE EXCEPTION 'research_author_packet_source_shape'; END IF;
 IF jsonb_array_length(payload->'sources'->'manifest')>0 THEN
  SELECT * INTO seal FROM public.research_source_seals_v2
   WHERE seal_id=(payload->'sources'->>'sealId')::uuid;
  IF seal.seal_id IS NULL OR seal.received_at IS NULL OR NOT isfinite(seal.received_at)
   OR seal.received_at>cutoff OR seal.documents IS DISTINCT FROM payload->'sources'->'manifest'
   THEN RAISE EXCEPTION 'research_author_packet_seal_clock'; END IF;
 END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(payload->'sources'->'manifest') x ORDER BY x->>'id' LOOP
  SELECT to_jsonb(d) INTO doc FROM public.source_raw_documents d WHERE id=(item->>'id')::uuid;
  IF doc IS NULL OR encode(sha256(convert_to(doc::text,'UTF8')),'hex') IS DISTINCT FROM item->>'rowHash'
   THEN RAISE EXCEPTION 'research_author_packet_source_changed'; END IF;
  m:=doc->'metadata';
  IF m->>'rights_boundary' IS DISTINCT FROM 'public_citation' OR m->>'visibility' IS DISTINCT FROM 'public'
   OR m->>'subject_scope' IS NULL OR m->>'subject_scope' NOT IN ('company_mentions','industry_context')
   OR jsonb_typeof(doc->'symbols') IS DISTINCT FROM 'array'
   OR jsonb_array_length(doc->'symbols')>50
   OR EXISTS(SELECT FROM jsonb_array_elements(doc->'symbols') x
    WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}')!~'^[0-9]{4}$')
   OR (m->>'subject_scope'='company_mentions' AND NOT(doc->'symbols' @> jsonb_build_array(symbol)))
   OR (m->>'subject_scope'='industry_context' AND doc->'symbols'<>'[]'::jsonb)
   OR NULLIF(m->>'retracted_at','') IS NOT NULL OR m->>'withdrawn'='true'
   OR m->>'claim_status' IS NULL OR m->>'claim_status' NOT IN ('rumor','reported','confirmed')
   THEN RAISE EXCEPTION 'research_author_packet_source_rights_or_scope'; END IF;
  IF jsonb_typeof(doc->'title') IS DISTINCT FROM 'string' OR octet_length(doc->>'title') NOT BETWEEN 1 AND 512
   OR jsonb_typeof(doc->'summary') IS DISTINCT FROM 'string' OR octet_length(doc->>'summary') NOT BETWEEN 1 AND 4096
   OR jsonb_typeof(m->'catalyst') IS DISTINCT FROM 'string' OR octet_length(m->>'catalyst') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(m->'risk') IS DISTINCT FROM 'string' OR octet_length(m->>'risk') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(doc->'platform') IS DISTINCT FROM 'string' OR octet_length(doc->>'platform') NOT BETWEEN 1 AND 80
   OR jsonb_typeof(m->'canonical_url') IS DISTINCT FROM 'string' OR octet_length(m->>'canonical_url') NOT BETWEEN 1 AND 800
   OR jsonb_typeof(m->'first_observed_at') IS DISTINCT FROM 'string' OR octet_length(m->>'first_observed_at') NOT BETWEEN 1 AND 100
   THEN RAISE EXCEPTION 'research_author_packet_content_bound'; END IF;
  observed:=(m->>'first_observed_at')::timestamptz;collected:=(doc->>'collected_at')::timestamptz;
  IF observed IS NULL OR collected IS NULL OR NOT isfinite(observed) OR NOT isfinite(collected)
   OR observed>collected OR collected>seal.received_at
   OR (doc->>'published_at')::timestamptz>observed
   OR ((doc->>'published_at') IS NOT NULL AND NOT isfinite((doc->>'published_at')::timestamptz))
   THEN RAISE EXCEPTION 'research_author_packet_source_clock'; END IF;
  descriptor:=jsonb_build_object('id',item->'id','rowHash',item->'rowHash','url',m->'canonical_url',
   'observedAt',m->'first_observed_at','admittedAt',seal.received_at,
   'publication',jsonb_build_object('precision','unknown','raw',NULL,'timezone',NULL,'instant',NULL),
   'scope',m->'subject_scope','symbols',doc->'symbols','rights','public_summary_only','retracted',false,'superseded',false);
  sources:=sources||jsonb_build_array(jsonb_build_object('descriptor',descriptor,
   'title',doc->'title','summary',doc->'summary','catalyst',m->'catalyst','risk',m->'risk',
   'platform',doc->'platform','sourceClaimStatus',m->'claim_status','collectedAt',doc->'collected_at',
   'unverifiedPublicationClaim',doc->'published_at','untrustedEvidence',true));
  IF octet_length(sources::text)>307200 THEN RAISE EXCEPTION 'research_author_packet_sources_bound'; END IF;
 END LOOP;
 -- Original source -> deep locks still held. No renewal on read or replay.
 IF public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal) IS DISTINCT FROM a
  THEN RAISE EXCEPTION 'research_author_packet_assignment_changed'; END IF;
 result:=jsonb_build_object('assignment',a-'controller_principal'-'canonical_request',
  'inputRevisionId',p_revision_id,'inputHash',p_input_hash,'sourceSealReceivedAt',seal.received_at,'sources',sources);
 IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'research_author_packet_response_bound'; END IF;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
  THEN RAISE EXCEPTION 'research_author_packet_expired'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.read_research_author_packet_v2(jsonb,uuid,text,text) OWNER TO research_input_preparation_owner_v2;
REVOKE ALL ON FUNCTION public.read_research_author_packet_v2(jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_research_author_packet_v2(jsonb,uuid,text,text) TO service_role;
COMMIT;
