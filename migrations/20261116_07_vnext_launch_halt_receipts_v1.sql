-- Durable official halt captures used by the existing calendar sync and post-close cycle.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE TABLE public.vnext_launch_halt_bodies_v1(
 raw_sha256 text PRIMARY KEY CHECK(raw_sha256~'^[a-f0-9]{64}$'),
 body bytea NOT NULL CHECK(octet_length(body) BETWEEN 2 AND 524288),
 CHECK(raw_sha256=encode(sha256(body),'hex'))
);
CREATE TABLE public.vnext_launch_halt_receipts_v1(
 market text NOT NULL CHECK(market IN('TWSE','TPEX')),
 slot_day date NOT NULL,slot smallint NOT NULL CHECK(slot IN(0,1)),
 raw_sha256 text NOT NULL REFERENCES public.vnext_launch_halt_bodies_v1(raw_sha256),
 observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(recorded_at>=observed_at),
 rights_hash text NOT NULL CHECK(rights_hash~'^[a-f0-9]{64}$'),
 PRIMARY KEY(market,slot_day,slot)
);
CREATE INDEX vnext_launch_halt_receipts_known_v1 ON public.vnext_launch_halt_receipts_v1(market,rights_hash,recorded_at DESC);
DO $owners$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['vnext_launch_halt_receipts_v1','vnext_launch_halt_bodies_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',target);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',target);
  EXECUTE format('CREATE TRIGGER launch_halt_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',target);
  EXECUTE format('CREATE TRIGGER launch_halt_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',target);
  EXECUTE format('CREATE TRIGGER launch_halt_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',target);
 END LOOP;
END $owners$;

CREATE FUNCTION public.vnext_launch_halt_command_v1(p_principal text,p_lease_owner uuid,p_action text,
 p_market text DEFAULT NULL,p_as_of timestamptz DEFAULT NULL,p_observed_at timestamptz DEFAULT NULL,
 p_sha256 text DEFAULT NULL,p_body bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='12s' SET lock_timeout='2s' AS $$
DECLARE rights jsonb;backend jsonb; mode public.vnext_launch_ranking_mode_v1;
 at timestamptz;day date;slot_no smallint;receipt public.vnext_launch_halt_receipts_v1;now_rights text;raw bytea;already boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_action IS NULL OR p_action NOT IN('admit','append','read')
  OR (p_action='admit' AND (p_market IS NOT NULL OR p_as_of IS NOT NULL OR p_observed_at IS NOT NULL OR p_sha256 IS NOT NULL OR p_body IS NOT NULL))
  OR (p_action<>'admit' AND (p_market IS NULL OR p_market NOT IN('TWSE','TPEX')))
  OR (p_action='read' AND (p_as_of IS NULL OR p_observed_at IS NOT NULL OR p_sha256 IS NOT NULL OR p_body IS NOT NULL))
  OR (p_action='append' AND (p_as_of IS NOT NULL OR p_observed_at IS NULL OR p_sha256 IS NULL OR p_body IS NULL
    OR octet_length(p_body) NOT BETWEEN 2 AND 524288 OR p_sha256!~'^[a-f0-9]{64}$'))
  THEN RAISE EXCEPTION 'launch_halt_request_invalid';END IF;
 IF p_action<>'read' THEN
  PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 END IF;
 rights:=public.vnext_launch_csv_policy_v1(p_principal);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease'
  THEN RAISE EXCEPTION 'launch_outcome_reviewed_writer_required';END IF;
 now_rights:=rights->>'rightsBindingHash';at:=clock_timestamp();
 day:=(at AT TIME ZONE 'Asia/Taipei')::date;
 slot_no:=CASE WHEN extract(hour FROM at AT TIME ZONE 'Asia/Taipei')<12 THEN 0 ELSE 1 END;
 IF p_action='admit' THEN
  RETURN jsonb_build_object('markets',coalesce((SELECT jsonb_agg(market ORDER BY market)
   FROM (VALUES('TWSE'),('TPEX')) m(market) WHERE NOT EXISTS(SELECT FROM public.vnext_launch_halt_receipts_v1 r
   WHERE r.market=m.market AND r.slot_day=day AND r.slot=slot_no)),'[]'::jsonb));
 END IF;
 IF p_action='read' THEN
  IF p_as_of>at THEN RAISE EXCEPTION 'launch_halt_cutoff_invalid';END IF;
  SELECT * INTO receipt FROM public.vnext_launch_halt_receipts_v1 WHERE market=p_market AND recorded_at<=p_as_of
   AND observed_at<=p_as_of AND rights_hash=now_rights
   ORDER BY recorded_at DESC,slot_day DESC,slot DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL;END IF;
  SELECT body INTO raw FROM public.vnext_launch_halt_bodies_v1 WHERE raw_sha256=receipt.raw_sha256;
  RETURN jsonb_build_object('market',receipt.market,'observedAt',receipt.observed_at,'recordedAt',receipt.recorded_at,
   'sha256',receipt.raw_sha256,'bodyBase64',replace(encode(raw,'base64'),chr(10),''));
 END IF;
 IF p_observed_at>at OR p_observed_at<at-interval '90 seconds' OR (p_observed_at AT TIME ZONE 'Asia/Taipei')::date<>day
  OR p_sha256<>encode(sha256(p_body),'hex') THEN RAISE EXCEPTION 'launch_halt_capture_invalid';END IF;
 SELECT * INTO receipt FROM public.vnext_launch_halt_receipts_v1 WHERE market=p_market AND slot_day=day AND slot=slot_no;
 already:=FOUND;
 IF already THEN
  IF receipt.raw_sha256<>p_sha256 OR receipt.rights_hash<>now_rights THEN RAISE EXCEPTION 'launch_halt_slot_conflict';END IF;
 ELSE
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  INSERT INTO public.vnext_launch_halt_bodies_v1 VALUES (p_sha256,p_body) ON CONFLICT(raw_sha256) DO NOTHING;
  INSERT INTO public.vnext_launch_halt_receipts_v1(market,slot_day,slot,raw_sha256,observed_at,rights_hash)
   VALUES(p_market,day,slot_no,p_sha256,p_observed_at,now_rights) RETURNING * INTO receipt;
 END IF;
 RETURN jsonb_build_object('market',receipt.market,'recordedAt',receipt.recorded_at,'replay',already,'sha256',receipt.raw_sha256);
END $$;
ALTER FUNCTION public.vnext_launch_halt_command_v1(text,uuid,text,text,timestamptz,timestamptz,text,bytea) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_halt_command_v1(text,uuid,text,text,timestamptz,timestamptz,text,bytea) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_halt_command_v1(text,uuid,text,text,timestamptz,timestamptz,text,bytea) TO service_role;
COMMIT;
