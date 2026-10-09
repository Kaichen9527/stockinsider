-- First-publication v2 prerequisite only. This grants no publication authority.
-- A single transaction lock deliberately serializes every source mutation and
-- seal. It also covers new-revision phantoms and parent/right changes.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='research_source_fence_owner_v2') THEN
  CREATE ROLE research_source_fence_owner_v2 NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
CREATE TABLE public.research_source_fence_events_v2(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 document_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 before_hash text, after_hash text, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.research_source_seals_v2(
 seal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_hash text NOT NULL UNIQUE,
 cutoff timestamptz NOT NULL, documents jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.research_source_seal_invalidations_v2(
 seal_id uuid NOT NULL REFERENCES public.research_source_seals_v2(seal_id),
 event_id bigint NOT NULL REFERENCES public.research_source_fence_events_v2(event_id),
 PRIMARY KEY(seal_id,event_id)
);
ALTER TABLE public.research_source_fence_events_v2 OWNER TO research_source_fence_owner_v2;
ALTER TABLE public.research_source_seals_v2 OWNER TO research_source_fence_owner_v2;
ALTER TABLE public.research_source_seal_invalidations_v2 OWNER TO research_source_fence_owner_v2;
ALTER TABLE public.research_source_fence_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_source_seals_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_source_seal_invalidations_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_source_fence_events_v2,public.research_source_seals_v2,public.research_source_seal_invalidations_v2 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.source_raw_documents TO research_source_fence_owner_v2;

CREATE FUNCTION public.research_source_root_v2(p jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT COALESCE(NULLIF(p->'metadata'->>'parent_source_url',''),NULLIF(p->'metadata'->>'canonical_url',''),split_part(p->>'document_url','#si-revision-',1))
 || COALESCE('#insider-'||(p->'metadata'->'insider_evidence'->>'identity'),'')
$$;
REVOKE ALL ON FUNCTION public.research_source_root_v2(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_source_root_v2(jsonb) TO research_source_fence_owner_v2;

CREATE FUNCTION public.research_source_fence_write_v2() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_doc jsonb; new_doc jsonb; eid bigint; roots text[];
BEGIN
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'research_source_truncate_fenced'; END IF;
 IF TG_OP<>'INSERT' THEN old_doc:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_doc:=to_jsonb(NEW); END IF;
 roots:=ARRAY[public.research_source_root_v2(old_doc),public.research_source_root_v2(new_doc)];
 INSERT INTO public.research_source_fence_events_v2(document_id,operation,before_hash,after_hash)
 VALUES(COALESCE(NEW.id,OLD.id),TG_OP,
  CASE WHEN old_doc IS NOT NULL THEN encode(sha256(convert_to(old_doc::text,'UTF8')),'hex') END,
  CASE WHEN new_doc IS NOT NULL THEN encode(sha256(convert_to(new_doc::text,'UTF8')),'hex') END) RETURNING event_id INTO eid;
 INSERT INTO public.research_source_seal_invalidations_v2(seal_id,event_id)
 SELECT s.seal_id,eid FROM public.research_source_seals_v2 s
 WHERE EXISTS(SELECT FROM jsonb_array_elements(s.documents) d WHERE d->>'root'=ANY(roots));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.research_source_fence_write_v2() OWNER TO research_source_fence_owner_v2;
REVOKE ALL ON FUNCTION public.research_source_fence_write_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_source_fence_write_v2 BEFORE INSERT OR UPDATE OR DELETE ON public.source_raw_documents
 FOR EACH ROW EXECUTE FUNCTION public.research_source_fence_write_v2();
CREATE TRIGGER research_source_fence_truncate_v2 BEFORE TRUNCATE ON public.source_raw_documents
 FOR EACH STATEMENT EXECUTE FUNCTION public.research_source_fence_write_v2();

-- An untrusted caller supplies IDs and exact row hashes, never trusted flags.
-- The database rebuilds the receipt after the shared lock. A seal is a source
-- dependency receipt only: no author/reviewer, lease, research or trade approval.
CREATE FUNCTION public.seal_research_sources_v2(p_documents jsonb,p_cutoff timestamptz)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; doc jsonb; root text; docs jsonb:='[]'; row_hash text; req text; result public.research_source_seals_v2;
BEGIN
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 IF p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>clock_timestamp()
  OR p_documents IS NULL OR jsonb_typeof(p_documents)<>'array' THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
 IF jsonb_array_length(p_documents) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_documents) x)<>jsonb_array_length(p_documents) THEN RAISE EXCEPTION 'source_seal_duplicate'; END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(p_documents) x ORDER BY x->>'id' LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2
   OR jsonb_typeof(item->'id')<>'string' OR jsonb_typeof(item->'rowHash')<>'string'
   OR NOT(item ? 'id' AND item ? 'rowHash') OR COALESCE(item->>'rowHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'source_seal_shape'; END IF;
  SELECT to_jsonb(s) INTO doc FROM public.source_raw_documents s WHERE s.id=(item->>'id')::uuid;
  IF doc IS NULL THEN RAISE EXCEPTION 'source_seal_missing'; END IF;
  IF octet_length(doc::text)>4194304 THEN RAISE EXCEPTION 'source_seal_document_bound'; END IF;
  row_hash:=encode(sha256(convert_to(doc::text,'UTF8')),'hex'); root:=public.research_source_root_v2(doc);
  IF row_hash<>item->>'rowHash' THEN RAISE EXCEPTION 'source_seal_hash_changed'; END IF;
  IF root IS NULL OR root='' OR octet_length(root)>4096 OR (doc->>'collected_at')::timestamptz IS NULL
   OR NOT isfinite((doc->>'collected_at')::timestamptz) OR (doc->>'collected_at')::timestamptz>p_cutoff
   OR (doc->>'published_at')::timestamptz>p_cutoff THEN RAISE EXCEPTION 'source_seal_clock'; END IF;
  IF COALESCE(doc->'metadata'->>'rights_boundary','') NOT IN ('public_citation','bounded_summary_only')
   OR NULLIF(doc->'metadata'->>'retracted_at','') IS NOT NULL OR doc->'metadata'->>'claim_status'='denied' THEN RAISE EXCEPTION 'source_seal_rights_or_withdrawn'; END IF;
  IF EXISTS(SELECT FROM public.source_raw_documents s WHERE public.research_source_root_v2(to_jsonb(s))=root
   AND s.id<>(doc->>'id')::uuid AND (s.collected_at>=(doc->>'collected_at')::timestamptz
    OR NULLIF(s.metadata->>'retracted_at','') IS NOT NULL OR s.metadata->>'claim_status'='denied')) THEN RAISE EXCEPTION 'source_seal_root_changed'; END IF;
  docs:=docs||jsonb_build_array(jsonb_build_object('id',doc->>'id','rowHash',row_hash,'root',root,
   'publishedAt',doc->'published_at','observedAt',doc->'collected_at','rights',doc->'metadata'->>'rights_boundary'));
 END LOOP;
 req:=encode(sha256(convert_to(jsonb_build_object('documents',docs,'cutoff',p_cutoff)::text,'UTF8')),'hex');
 SELECT * INTO result FROM public.research_source_seals_v2 WHERE request_hash=req;
 IF FOUND THEN
  IF EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=result.seal_id) THEN RAISE EXCEPTION 'source_seal_invalidated'; END IF;
 ELSE
  INSERT INTO public.research_source_seals_v2(request_hash,cutoff,documents) VALUES(req,p_cutoff,docs) RETURNING * INTO result;
 END IF;
 RETURN to_jsonb(result)||jsonb_build_object('publicationAuthorized',false,'historicalPITEligible',false);
END $$;
ALTER FUNCTION public.seal_research_sources_v2(jsonb,timestamptz) OWNER TO research_source_fence_owner_v2;
REVOKE ALL ON FUNCTION public.seal_research_sources_v2(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seal_research_sources_v2(jsonb,timestamptz) TO service_role;

-- Future publication transaction must call this under its own restricted owner.
-- Never grant it to service_role as an assertion of publication permission.
CREATE FUNCTION public.assert_research_source_seal_v2(p_seal uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result public.research_source_seals_v2; item jsonb; actual_hash text;
BEGIN
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 SELECT * INTO result FROM public.research_source_seals_v2 WHERE seal_id=p_seal;
 IF NOT FOUND OR EXISTS(SELECT FROM public.research_source_seal_invalidations_v2 WHERE seal_id=p_seal) THEN RAISE EXCEPTION 'source_seal_invalidated_or_missing'; END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(result.documents) x LOOP
  SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') INTO actual_hash FROM public.source_raw_documents s WHERE s.id=(item->>'id')::uuid;
  IF actual_hash IS DISTINCT FROM item->>'rowHash' THEN RAISE EXCEPTION 'source_seal_hash_changed'; END IF;
 END LOOP;
 RETURN to_jsonb(result);
END $$;
ALTER FUNCTION public.assert_research_source_seal_v2(uuid) OWNER TO research_source_fence_owner_v2;
REVOKE ALL ON FUNCTION public.assert_research_source_seal_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reject_research_source_receipt_mutation_v2() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'immutable_source_receipt'; END $$;
REVOKE ALL ON FUNCTION public.reject_research_source_receipt_mutation_v2() FROM PUBLIC;
CREATE TRIGGER research_source_events_immutable_v2 BEFORE UPDATE OR DELETE ON public.research_source_fence_events_v2 FOR EACH ROW EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
CREATE TRIGGER research_source_seals_immutable_v2 BEFORE UPDATE OR DELETE ON public.research_source_seals_v2 FOR EACH ROW EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
CREATE TRIGGER research_source_invalidations_immutable_v2 BEFORE UPDATE OR DELETE ON public.research_source_seal_invalidations_v2 FOR EACH ROW EXECUTE FUNCTION public.reject_research_source_receipt_mutation_v2();
COMMIT;
