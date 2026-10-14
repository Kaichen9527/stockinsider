BEGIN;

CREATE TABLE IF NOT EXISTS public.research_priority_runs_v1 (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of TIMESTAMPTZ NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version = 'research-priority-v1'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  expected_count INTEGER NOT NULL CHECK (expected_count BETWEEN 0 AND 20000),
  accounted_count INTEGER NOT NULL CHECK (accounted_count = expected_count),
  source_attempts JSONB NOT NULL CHECK (jsonb_typeof(source_attempts) = 'array'),
  rows JSONB NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  research_queue JSONB NOT NULL CHECK (jsonb_typeof(research_queue) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (policy_version, input_hash)
);
CREATE INDEX IF NOT EXISTS idx_research_priority_runs_latest_v1
  ON public.research_priority_runs_v1 (as_of DESC, created_at DESC);
CREATE OR REPLACE TRIGGER trg_research_priority_runs_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_priority_runs_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE TABLE IF NOT EXISTS public.candidate_deep_article_reviews_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  article_hash TEXT NOT NULL CHECK (article_hash ~ '^[0-9a-f]{64}$'),
  author_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL CHECK (reviewer_id <> author_id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted','rejected')),
  findings JSONB NOT NULL CHECK (jsonb_typeof(findings) = 'object'),
  source_document_ids JSONB NOT NULL CHECK (jsonb_typeof(source_document_ids) = 'array'),
  reviewed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id, input_hash, article_hash, reviewer_id, decision)
);
CREATE INDEX IF NOT EXISTS idx_candidate_deep_article_reviews_v1
  ON public.candidate_deep_article_reviews_v1 (revision_id, reviewed_at DESC);
CREATE OR REPLACE TRIGGER trg_candidate_deep_article_reviews_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_deep_article_reviews_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE TABLE IF NOT EXISTS public.candidate_thesis_qualifications_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.candidate_thesis_qualifications_v1(id) ON DELETE RESTRICT,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  detail_revision_id UUID NOT NULL REFERENCES public.candidate_detail_snapshots(id) ON DELETE RESTRICT,
  dossier_id UUID NOT NULL REFERENCES public.candidate_research_dossiers(id) ON DELETE RESTRICT,
  article_hash TEXT NOT NULL CHECK (article_hash ~ '^[0-9a-f]{64}$'),
  evidence_snapshot_hash TEXT NOT NULL CHECK (evidence_snapshot_hash ~ '^[0-9a-f]{64}$'),
  review_receipt_hash TEXT NOT NULL UNIQUE CHECK (review_receipt_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('qualified','rejected','needs_evidence','stale','invalidated')),
  horizon TEXT NOT NULL CHECK (horizon IN ('1-3m','3-6m','6-18m')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  qualified_at TIMESTAMPTZ NOT NULL,
  next_review_at TIMESTAMPTZ NOT NULL CHECK (next_review_at >= qualified_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_candidate_thesis_latest_v1
  ON public.candidate_thesis_qualifications_v1 (stock_id, qualified_at DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_thesis_successor_v1
  ON public.candidate_thesis_qualifications_v1 (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.candidate_technical_decisions_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  thesis_qualification_id UUID NOT NULL REFERENCES public.candidate_thesis_qualifications_v1(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL,
  market_dataset_hash TEXT NOT NULL CHECK (market_dataset_hash ~ '^[0-9a-f]{64}$'),
  calendar_hash TEXT NOT NULL CHECK (calendar_hash ~ '^[0-9a-f]{64}$'),
  feature_version TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (stock_id, thesis_qualification_id, session_date, market_dataset_hash, strategy_version)
);
CREATE INDEX IF NOT EXISTS idx_candidate_technical_latest_v1
  ON public.candidate_technical_decisions_v1 (stock_id, session_date DESC, observed_at DESC);

ALTER TABLE public.research_priority_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_deep_article_reviews_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_thesis_qualifications_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_technical_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_priority_runs_v1, public.candidate_thesis_qualifications_v1,
  public.candidate_technical_decisions_v1, public.candidate_deep_article_reviews_v1 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.research_priority_runs_v1, public.candidate_thesis_qualifications_v1,
  public.candidate_technical_decisions_v1, public.candidate_deep_article_reviews_v1 TO service_role;

CREATE OR REPLACE TRIGGER trg_candidate_thesis_qualifications_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_thesis_qualifications_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
CREATE OR REPLACE TRIGGER trg_candidate_technical_decisions_immutable_v1
  BEFORE UPDATE OR DELETE ON public.candidate_technical_decisions_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

-- Serialize append against the stock's current head. This also protects direct
-- service-role inserts from a stale read or a second parentless review.
CREATE OR REPLACE FUNCTION public.fence_candidate_thesis_append_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_head public.candidate_thesis_qualifications_v1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.stock_id::text, 6101));
  SELECT * INTO v_head FROM public.candidate_thesis_qualifications_v1
    WHERE stock_id=NEW.stock_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NEW.parent_id IS DISTINCT FROM v_head.id THEN
    RAISE EXCEPTION 'research_thesis_head_changed';
  END IF;
  IF NEW.payload->>'reviewReceiptHash' IS DISTINCT FROM NEW.review_receipt_hash
    OR NEW.payload->>'status' IS DISTINCT FROM NEW.status
    OR NEW.payload->>'articleHash' IS DISTINCT FROM NEW.article_hash
    OR (NEW.payload->>'qualifiedAt')::timestamptz IS DISTINCT FROM NEW.qualified_at
    OR (NEW.payload->>'nextReviewAt')::timestamptz IS DISTINCT FROM NEW.next_review_at
    OR jsonb_typeof(NEW.payload->'materialEventIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'research_thesis_payload_mismatch';
  END IF;
  IF v_head.id IS NOT NULL THEN
    IF NOT ((NEW.payload->'materialEventIds') @> (v_head.payload->'materialEventIds')) THEN
      RAISE EXCEPTION 'research_thesis_events_not_reconciled';
    END IF;
    IF NEW.status IN ('qualified','rejected','needs_evidence') THEN
      IF NEW.qualified_at <= (CASE WHEN v_head.status IN ('stale','invalidated')
        THEN v_head.next_review_at ELSE v_head.qualified_at END) THEN
        RAISE EXCEPTION 'research_thesis_review_not_newer';
      END IF;
      IF v_head.status IN ('stale','invalidated') AND NEW.article_hash=v_head.article_hash THEN
        RAISE EXCEPTION 'research_thesis_revised_article_required';
      END IF;
    ELSE
      IF NEW.qualified_at<>v_head.qualified_at OR NEW.article_hash<>v_head.article_hash
        OR NEW.next_review_at < (CASE WHEN v_head.status IN ('stale','invalidated')
          THEN v_head.next_review_at ELSE v_head.qualified_at END) THEN
        RAISE EXCEPTION 'research_thesis_event_clock_invalid';
      END IF;
    END IF;
  END IF;
  NEW.created_at := GREATEST(clock_timestamp(), coalesce(v_head.created_at + interval '1 microsecond',clock_timestamp()));
  RETURN NEW;
END $function$;
CREATE OR REPLACE TRIGGER trg_candidate_thesis_append_fence_v1
  BEFORE INSERT ON public.candidate_thesis_qualifications_v1
  FOR EACH ROW EXECUTE FUNCTION public.fence_candidate_thesis_append_v1();
REVOKE ALL ON FUNCTION public.fence_candidate_thesis_append_v1() FROM PUBLIC,anon,authenticated;

-- Oct-04 approved extension: bounded point-in-time heads retain old roots and
-- their observed revisions. Pagination overflow is an explicit caller failure.
CREATE OR REPLACE FUNCTION public.research_source_heads_page_v1(
  p_cutoff timestamptz, p_offset integer, p_limit integer)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF p_cutoff IS NULL OR p_cutoff>clock_timestamp() OR p_offset<0
    OR p_offset>20000 OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'research_source_head_request_invalid';
  END IF;
  RETURN QUERY
  WITH available AS (
    SELECT d.*, COALESCE(NULLIF(d.metadata->>'parent_source_url',''),NULLIF(d.metadata->>'canonical_url',''),
      split_part(d.document_url,'#si-revision-',1)) || COALESCE('#insider-' ||
        (d.metadata #>> '{insider_evidence,identity}'),'') AS root_key,
      NULLIF(d.metadata->>'parent_source_url','') IS NULL
        OR d.metadata->>'parent_source_url'=COALESCE(NULLIF(d.metadata->>'canonical_url',''),
          split_part(d.document_url,'#si-revision-',1)) AS original_source,
      COALESCE(NULLIF(d.metadata->>'revision_observed_at','')::timestamptz,
        NULLIF(d.metadata->>'retracted_at','')::timestamptz,d.collected_at) AS revised_at,
      COALESCE(NULLIF(d.metadata->>'first_observed_at','')::timestamptz,d.collected_at) AS first_at
    FROM public.source_raw_documents d
    WHERE d.published_at<=p_cutoff AND d.collected_at<=p_cutoff
  ), eligible AS (
    SELECT * FROM available WHERE first_at<=p_cutoff AND revised_at<=p_cutoff
      AND first_at>=published_at AND revised_at>=first_at
  ), numbered AS (
    SELECT e.*, min(first_at) OVER (PARTITION BY root_key) AS earliest_at,
      max(revised_at) OVER (PARTITION BY root_key) AS last_activity_at,
      row_number() OVER (PARTITION BY root_key ORDER BY original_source DESC,revised_at DESC,
        CASE WHEN metadata->>'retracted_at' IS NOT NULL THEN 2
          WHEN metadata->>'claim_status'='denied' THEN 1 ELSE 0 END DESC,
        COALESCE(canonical_content_hash,id::text) DESC) AS n
    FROM eligible e
  )
  SELECT jsonb_build_object('id',n.id,'platform',n.platform,'document_url',n.document_url,
    'published_at',n.published_at,'collected_at',n.collected_at,
    'symbols',COALESCE((SELECT jsonb_agg(DISTINCT s.value) FROM eligible e,
      LATERAL jsonb_array_elements_text(e.symbols) s WHERE e.root_key=n.root_key),'[]'::jsonb),
    'canonical_content_hash',n.canonical_content_hash,'content_semantics',n.content_semantics,
    'metadata',n.metadata || jsonb_build_object('first_observed_at',n.earliest_at,
      'revision_observed_at',n.revised_at))
  FROM numbered n WHERE n.n=1 AND n.last_activity_at>=p_cutoff-interval '14 days' ORDER BY n.root_key LIMIT p_limit OFFSET p_offset;
END $function$;
REVOKE ALL ON FUNCTION public.research_source_heads_page_v1(timestamptz,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_source_heads_page_v1(timestamptz,integer,integer) TO service_role;

-- All model roles share a durable budget. Timeout/offline/retry reservations
-- consume their full 30-minute envelope; finishing early does not refund it.
CREATE TABLE IF NOT EXISTS public.research_model_reservations_v1 (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK(role IN ('discovery','company_research','counter_review','technical','strategy_research','independent_test')),
  owner text NOT NULL CHECK(length(owner) BETWEEN 3 AND 120),
  work_key text NOT NULL CHECK(length(work_key) BETWEEN 3 AND 200),
  taipei_day date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL,
  reserved_seconds integer NOT NULL DEFAULT 1800 CHECK(reserved_seconds=1800),
  UNIQUE(role,work_key), CHECK(lease_expires_at=started_at+interval '30 minutes')
);
CREATE TABLE IF NOT EXISTS public.research_model_completions_v1 (
  reservation_id uuid PRIMARY KEY REFERENCES public.research_model_reservations_v1 ON DELETE RESTRICT,
  owner text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('completed','failed')),
  result_hash text NOT NULL CHECK(result_hash ~ '^[0-9a-f]{64}$'),
  finished_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION public.research_model_lease_fits_day_v1(p_started timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT (p_started AT TIME ZONE 'Asia/Taipei')::date=
    ((p_started+interval '30 minutes') AT TIME ZONE 'Asia/Taipei')::date
$function$;
REVOKE ALL ON FUNCTION public.research_model_lease_fits_day_v1(timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.reserve_research_model_v1(p_role text,p_owner text,p_work_key text)
RETURNS SETOF public.research_model_reservations_v1
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_now timestamptz; v_day date; v_prior public.research_model_reservations_v1;
BEGIN
  IF p_role NOT IN ('discovery','company_research','counter_review','technical','strategy_research','independent_test')
    OR length(trim(p_owner)) NOT BETWEEN 3 AND 120 OR length(p_work_key) NOT BETWEEN 3 AND 200
    OR p_owner IS NULL OR p_work_key IS NULL THEN RAISE EXCEPTION 'research_model_reservation_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(2409,6002);
  v_now:=clock_timestamp();
  v_day:=(v_now AT TIME ZONE 'Asia/Taipei')::date;
  SELECT * INTO v_prior FROM public.research_model_reservations_v1 WHERE role=p_role AND work_key=p_work_key;
  IF FOUND THEN
    IF v_prior.owner<>p_owner OR v_prior.lease_expires_at<=v_now
      OR EXISTS(SELECT 1 FROM public.research_model_completions_v1 WHERE reservation_id=v_prior.reservation_id)
      THEN RAISE EXCEPTION 'research_model_reservation_replay_closed'; END IF;
    RETURN NEXT v_prior; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.research_model_reservations_v1 r WHERE r.lease_expires_at>v_now
      AND NOT EXISTS(SELECT 1 FROM public.research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id))
    OR (SELECT COALESCE(sum(reserved_seconds),0) FROM public.research_model_reservations_v1 WHERE taipei_day=v_day)+1800>7200
    OR NOT public.research_model_lease_fits_day_v1(v_now)
    THEN RETURN; END IF;
  RETURN QUERY INSERT INTO public.research_model_reservations_v1(role,owner,work_key,taipei_day,started_at,lease_expires_at)
    VALUES(p_role,p_owner,p_work_key,v_day,v_now,v_now+interval '30 minutes') RETURNING *;
END $function$;
CREATE OR REPLACE FUNCTION public.finish_research_model_v1(p_reservation uuid,p_owner text,p_outcome text,p_result_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_prior public.research_model_completions_v1;
BEGIN
  PERFORM pg_advisory_xact_lock(2409,6002);
  SELECT * INTO v_prior FROM public.research_model_completions_v1 WHERE reservation_id=p_reservation;
  IF FOUND THEN
    IF v_prior.owner<>p_owner OR v_prior.outcome<>p_outcome OR v_prior.result_hash<>p_result_hash
      THEN RAISE EXCEPTION 'research_model_completion_replay_mismatch'; END IF;
    RETURN true;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.research_model_reservations_v1
    WHERE reservation_id=p_reservation AND owner=p_owner AND lease_expires_at>clock_timestamp())
    THEN RAISE EXCEPTION 'research_model_lease_lost'; END IF;
  INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
    VALUES(p_reservation,p_owner,p_outcome,p_result_hash);
  RETURN true;
END $function$;
ALTER TABLE public.research_model_reservations_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_model_completions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_model_reservations_v1,public.research_model_completions_v1 FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.research_model_reservations_v1,public.research_model_completions_v1 FROM service_role;
GRANT SELECT ON public.research_model_reservations_v1,public.research_model_completions_v1 TO service_role;
CREATE OR REPLACE TRIGGER trg_research_model_reservations_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_model_reservations_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
CREATE OR REPLACE TRIGGER trg_research_model_completions_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_model_completions_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
REVOKE ALL ON FUNCTION public.reserve_research_model_v1(text,text,text),
  public.finish_research_model_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_research_model_v1(text,text,text),
  public.finish_research_model_v1(uuid,text,text,text) TO service_role;

-- First observation freezes an actual quote or an explicit gap, never a
-- later backfilled price dressed up as a quote known at discovery time.
CREATE TABLE IF NOT EXISTS public.research_first_discoveries_v1 (
  symbol text PRIMARY KEY CHECK(symbol ~ '^[0-9]{4}$'),
  run_id uuid NOT NULL REFERENCES public.research_priority_runs_v1 ON DELETE RESTRICT,
  first_seen_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object')
);
CREATE OR REPLACE TRIGGER trg_research_first_discoveries_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_first_discoveries_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
ALTER TABLE public.research_first_discoveries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_first_discoveries_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.research_first_discoveries_v1 TO service_role;
CREATE OR REPLACE FUNCTION public.capture_research_first_discoveries_v1(p_run_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_run public.research_priority_runs_v1; v_row jsonb; v_first timestamptz;
  v_price jsonb; v_session date; v_stock uuid; v_count integer:=0; v_added integer;
BEGIN
  SELECT * INTO v_run FROM public.research_priority_runs_v1 WHERE run_id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'research_priority_run_missing'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_run.rows) LOOP
    IF COALESCE((v_row->>'hasDiscoveryEvidence')::boolean,false) IS NOT TRUE THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.research_first_discoveries_v1 WHERE symbol=v_row->>'symbol') THEN CONTINUE; END IF;
    v_first:=COALESCE((v_row->>'firstSeenAt')::timestamptz,v_run.as_of);
    IF v_first>v_run.as_of THEN RAISE EXCEPTION 'research_discovery_future_observation'; END IF;
    SELECT id INTO v_stock FROM public.stocks WHERE symbol=v_row->>'symbol' AND market='TW';
    -- Calendar close/source/observation clocks must all predate discovery.
    SELECT max(session_id::date) INTO v_session FROM public.tw_trading_sessions_v3
      WHERE status='completed' AND close_at<=v_first AND source_timestamp<=v_first
        AND collected_at<=v_first AND recorded_at<=v_first;
    SELECT jsonb_build_object('session',p.session_date,'close',p.close,'volume',p.volume,
      'sourceUrl',p.source_url,'availableAt',p.available_at,'priceBasis','raw_exchange_quote') INTO v_price
    FROM public.official_price_history p WHERE p.stock_id=v_stock AND p.session_date=v_session
      AND p.available_at<=v_first AND p.as_of<=v_first AND p.close>0
      AND p.source_url ~ '^https://([a-z0-9-]+[.])*(twse[.]com[.]tw|tpex[.]org[.]tw)/'
      AND COALESCE(p.provenance->>'provider','') NOT LIKE '%finmind%'
      AND COALESCE(p.provenance->>'integrityStatus','')<>'conflict'
      AND COALESCE(p.provenance->>'integrity_status','')<>'conflict' LIMIT 1;
    INSERT INTO public.research_first_discoveries_v1(symbol,run_id,first_seen_at,snapshot)
      VALUES(v_row->>'symbol',p_run_id,v_first,jsonb_build_object('price',v_price,
        'priceStatus',CASE WHEN v_price IS NULL THEN 'missing_at_discovery' ELSE 'official_quote' END,
        'pricePhase','unknown','relative5d',NULL,'relative20d',NULL,'relative60d',NULL,
        'gap','Adjusted price history and aligned benchmark are evaluated separately; a raw quote alone is not an early-entry signal.',
        'factors',COALESCE(v_row->'factors','[]'::jsonb))) ON CONFLICT(symbol) DO NOTHING;
    GET DIAGNOSTICS v_added=ROW_COUNT; v_count:=v_count+v_added;
  END LOOP;
  RETURN v_count;
END $function$;
REVOKE ALL ON FUNCTION public.capture_research_first_discoveries_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_research_first_discoveries_v1(uuid) TO service_role;

-- Failed assessments and validations remain immutable research records.
-- Only the separately authenticated approval endpoint can issue adoption receipts.
CREATE TABLE IF NOT EXISTS public.research_strategy_records_v1 (
  record_hash text PRIMARY KEY CHECK(record_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK(kind IN ('proposal','assessment','validation','approval')),
  proposal_hash text NOT NULL CHECK(proposal_hash ~ '^[0-9a-f]{64}$'),
  parent_hash text REFERENCES public.research_strategy_records_v1(record_hash) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
  input_payload jsonb NOT NULL CHECK(jsonb_typeof(input_payload)='object'),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((kind='proposal' AND parent_hash IS NULL AND proposal_hash=record_hash) OR
    (kind<>'proposal' AND parent_hash IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_research_strategy_records_chain_v1 ON public.research_strategy_records_v1(proposal_hash,kind,available_at);
CREATE OR REPLACE FUNCTION public.fence_research_strategy_record_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_parent public.research_strategy_records_v1;
BEGIN
  IF NEW.available_at>clock_timestamp() THEN RAISE EXCEPTION 'research_strategy_future_record'; END IF;
  IF NEW.kind='proposal' THEN
    PERFORM pg_advisory_xact_lock(2409,6003);
    IF EXISTS(SELECT 1 FROM public.research_strategy_records_v1 r WHERE r.kind='proposal'
      AND date_trunc('week',r.available_at AT TIME ZONE 'Asia/Taipei')=
        date_trunc('week',NEW.available_at AT TIME ZONE 'Asia/Taipei')
      AND r.record_hash<>NEW.record_hash) THEN RAISE EXCEPTION 'research_strategy_weekly_hypothesis_cap'; END IF;
  ELSE
    SELECT * INTO v_parent FROM public.research_strategy_records_v1 WHERE record_hash=NEW.parent_hash;
    IF NOT FOUND OR v_parent.proposal_hash<>NEW.proposal_hash OR v_parent.available_at>NEW.available_at
      OR v_parent.kind<>(CASE NEW.kind WHEN 'assessment' THEN 'proposal' WHEN 'validation' THEN 'assessment' ELSE 'validation' END)
      THEN RAISE EXCEPTION 'research_strategy_parent_binding_invalid'; END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE TRIGGER trg_research_strategy_record_fence_v1 BEFORE INSERT ON public.research_strategy_records_v1
  FOR EACH ROW EXECUTE FUNCTION public.fence_research_strategy_record_v1();
CREATE OR REPLACE TRIGGER trg_research_strategy_records_immutable_v1 BEFORE UPDATE OR DELETE ON public.research_strategy_records_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
ALTER TABLE public.research_strategy_records_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_strategy_records_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.research_strategy_records_v1 TO service_role;

CREATE TABLE IF NOT EXISTS public.research_paper_book_revisions_v1 (
  revision_hash text PRIMARY KEY CHECK(revision_hash ~ '^[0-9a-f]{64}$'),
  book_id text NOT NULL CHECK(book_id IN ('conservative','growth')),
  parent_hash text REFERENCES public.research_paper_book_revisions_v1(revision_hash) ON DELETE RESTRICT,
  operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 3 AND 200),
  input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK(jsonb_typeof(state)='object'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(book_id,operation_key), CHECK(state->>'bookId'=book_id)
);
CREATE INDEX IF NOT EXISTS idx_research_paper_book_head_v1 ON public.research_paper_book_revisions_v1(book_id,available_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_paper_book_successor_v1 ON public.research_paper_book_revisions_v1(parent_hash) WHERE parent_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.fence_research_paper_book_append_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_head public.research_paper_book_revisions_v1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.book_id,6102));
  SELECT * INTO v_head FROM public.research_paper_book_revisions_v1 WHERE book_id=NEW.book_id
    ORDER BY available_at DESC,revision_hash DESC LIMIT 1;
  IF NEW.parent_hash IS DISTINCT FROM v_head.revision_hash THEN RAISE EXCEPTION 'research_paper_book_head_changed'; END IF;
  IF v_head.revision_hash IS NOT NULL AND NEW.state->>'inceptionAt' IS DISTINCT FROM v_head.state->>'inceptionAt'
    THEN RAISE EXCEPTION 'research_paper_book_inception_changed'; END IF;
  IF v_head.state->>'activationAt' IS NOT NULL
    AND NEW.state->>'activationAt' IS DISTINCT FROM v_head.state->>'activationAt'
    THEN RAISE EXCEPTION 'research_paper_book_activation_changed'; END IF;
  IF v_head.state->>'inceptionAt' IS NOT NULL AND v_head.state->>'activationAt' IS NULL
    AND (NEW.state->>'activationAt')::timestamptz IS DISTINCT FROM
      greatest((v_head.state->>'inceptionAt')::timestamptz,v_head.available_at)
    THEN RAISE EXCEPTION 'research_paper_book_activation_invalid'; END IF;
  IF NEW.available_at>clock_timestamp() OR (v_head.revision_hash IS NOT NULL AND NEW.available_at<=v_head.available_at)
    THEN RAISE EXCEPTION 'research_paper_book_revision_time_invalid'; END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE TRIGGER trg_research_paper_book_append_v1 BEFORE INSERT ON public.research_paper_book_revisions_v1
  FOR EACH ROW EXECUTE FUNCTION public.fence_research_paper_book_append_v1();
CREATE OR REPLACE TRIGGER trg_research_paper_book_immutable_v1 BEFORE UPDATE OR DELETE ON public.research_paper_book_revisions_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();
ALTER TABLE public.research_paper_book_revisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_paper_book_revisions_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.research_paper_book_revisions_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.research_evidence_heads_v1(p_ids uuid[],p_cutoff timestamptz)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids)>100 OR p_cutoff IS NULL OR p_cutoff>clock_timestamp()
    THEN RAISE EXCEPTION 'research_evidence_head_bound_invalid'; END IF;
  RETURN QUERY SELECT jsonb_build_object('id',original.id,'headId',head.id,
    'retracted',head.metadata->>'retracted_at' IS NOT NULL OR parent.metadata->>'retracted_at' IS NOT NULL,
    'superseded',head.id IS DISTINCT FROM original.id AND (
      COALESCE(head.canonical_content_hash,head.id::text) IS DISTINCT FROM COALESCE(original.canonical_content_hash,original.id::text)
      OR head.metadata->>'claim_status' IS DISTINCT FROM original.metadata->>'claim_status'
      OR head.metadata->>'retracted_at' IS DISTINCT FROM original.metadata->>'retracted_at')
      OR COALESCE(parent.metadata->>'claim_status'='denied',false))
  FROM public.source_raw_documents original
  LEFT JOIN LATERAL (
    SELECT d.* FROM public.source_raw_documents d
    WHERE COALESCE(d.metadata->>'canonical_url',split_part(d.document_url,'#si-revision-',1))=
      COALESCE(original.metadata->>'canonical_url',split_part(original.document_url,'#si-revision-',1))
      AND (d.metadata #>> '{insider_evidence,identity}') IS NOT DISTINCT FROM
        (original.metadata #>> '{insider_evidence,identity}')
      AND d.published_at<=p_cutoff AND d.collected_at<=p_cutoff
      AND COALESCE(NULLIF(d.metadata->>'revision_observed_at','')::timestamptz,d.collected_at)<=p_cutoff
    ORDER BY COALESCE(NULLIF(d.metadata->>'revision_observed_at','')::timestamptz,d.collected_at) DESC,
      CASE WHEN d.metadata->>'retracted_at' IS NOT NULL THEN 2 WHEN d.metadata->>'claim_status'='denied' THEN 1 ELSE 0 END DESC,
      COALESCE(d.canonical_content_hash,d.id::text) DESC,d.id DESC LIMIT 1
  ) head ON true
  LEFT JOIN LATERAL (
    SELECT d.metadata FROM public.source_raw_documents d
    WHERE NULLIF(original.metadata->>'parent_source_url','') IS NOT NULL
      AND COALESCE(d.metadata->>'canonical_url',split_part(d.document_url,'#si-revision-',1))=original.metadata->>'parent_source_url'
      AND d.published_at<=p_cutoff AND d.collected_at<=p_cutoff
      AND COALESCE(NULLIF(d.metadata->>'revision_observed_at','')::timestamptz,d.collected_at)<=p_cutoff
    ORDER BY COALESCE(NULLIF(d.metadata->>'revision_observed_at','')::timestamptz,d.collected_at) DESC,
      CASE WHEN d.metadata->>'retracted_at' IS NOT NULL THEN 2 WHEN d.metadata->>'claim_status'='denied' THEN 1 ELSE 0 END DESC,
      COALESCE(d.canonical_content_hash,d.id::text) DESC,d.id DESC LIMIT 1
  ) parent ON true
  WHERE original.id=ANY(p_ids) AND original.collected_at<=p_cutoff AND original.published_at<=p_cutoff;
END $function$;
REVOKE ALL ON FUNCTION public.research_evidence_heads_v1(uuid[],timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_evidence_heads_v1(uuid[],timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.research_thesis_heads_page_v1(
  p_cutoff timestamptz,p_offset integer,p_limit integer)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF p_cutoff IS NULL OR p_cutoff>clock_timestamp() OR p_offset NOT BETWEEN 0 AND 20000
    OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'research_thesis_head_request_invalid'; END IF;
  RETURN QUERY SELECT to_jsonb(head) FROM (
    SELECT DISTINCT ON(stock_id) stock_id,id,payload,created_at
    FROM public.candidate_thesis_qualifications_v1
    WHERE qualified_at<=p_cutoff AND created_at<=p_cutoff
    ORDER BY stock_id,created_at DESC,id DESC
  ) head ORDER BY head.stock_id LIMIT p_limit OFFSET p_offset;
END $function$;
REVOKE ALL ON FUNCTION public.research_thesis_heads_page_v1(timestamptz,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_thesis_heads_page_v1(timestamptz,integer,integer) TO service_role;

CREATE INDEX IF NOT EXISTS idx_research_strategy_input_replay_v1
  ON public.research_strategy_records_v1(kind,input_hash);

-- Compare actual installed routine bodies/attributes against the reviewed
-- application manifest. Candidate declarations alone cannot authorize entries.
CREATE OR REPLACE FUNCTION public.research_execution_policy_matches_v1(p_expected jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $function$
DECLARE v_item jsonb; v_proc record;
BEGIN
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_array_length(p_expected) NOT BETWEEN 8 AND 100
    THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_expected) LOOP
    IF v_item->>'name' !~ '^[a-z0-9_]+$' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_item->>'name')<>1 THEN RETURN false; END IF;
    SELECT p.* INTO v_proc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_item->>'name';
    IF encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex') IS DISTINCT FROM v_item->>'bodySha256'
      OR v_proc.prosecdef IS DISTINCT FROM (v_item->>'securityDefiner')::boolean
      OR v_proc.provolatile::text IS DISTINCT FROM v_item->>'volatility'
      OR v_proc.pronargs IS DISTINCT FROM (v_item->>'argumentCount')::integer
      OR oidvectortypes(v_proc.proargtypes) IS DISTINCT FROM v_item->>'argumentTypes'
      OR (SELECT coalesce(jsonb_agg(regexp_replace(setting,'[[:space:]"]','','g') ORDER BY setting),'[]'::jsonb)
        FROM unnest(v_proc.proconfig) setting) IS DISTINCT FROM v_item->'configuration'
      THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM (VALUES
      ('candidate_thesis_qualifications_v1','trg_candidate_thesis_append_fence_v1','fence_candidate_thesis_append_v1',7),
      ('candidate_thesis_qualifications_v1','trg_candidate_thesis_qualifications_immutable_v1','reject_candidate_dossier_revision_mutation_v4',27),
      ('candidate_technical_decisions_v1','trg_candidate_technical_decisions_immutable_v1','reject_candidate_dossier_revision_mutation_v4',27),
      ('research_strategy_records_v1','trg_research_strategy_record_fence_v1','fence_research_strategy_record_v1',7),
      ('research_strategy_records_v1','trg_research_strategy_records_immutable_v1','reject_candidate_dossier_revision_mutation_v4',27),
      ('research_paper_book_revisions_v1','trg_research_paper_book_append_v1','fence_research_paper_book_append_v1',7),
      ('research_paper_book_revisions_v1','trg_research_paper_book_immutable_v1','reject_candidate_dossier_revision_mutation_v4',27)
    ) expected(table_name,trigger_name,function_name,trigger_type)
    WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE t.tgrelid=to_regclass('public.'||expected.table_name) AND t.tgname=expected.trigger_name
        AND n.nspname='public' AND p.proname=expected.function_name
        AND t.tgenabled='O' AND t.tgtype=expected.trigger_type AND t.tgqual IS NULL)) THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.candidate_technical_decisions_v1'::regclass
    AND attname='decision_input_hash' AND attnotnull AND NOT attisdropped);
END $function$;
REVOKE ALL ON FUNCTION public.research_execution_policy_matches_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_execution_policy_matches_v1(jsonb) TO service_role;

COMMIT;
