-- Official TPEx dataset 17247. Keep full bytes private; only the existing
-- scheduled outcome writer can consume a receipt for its actual session.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE TABLE public.vnext_launch_tpex_opening_limits_v1(
 session_date date NOT NULL,
 session_authority_id uuid NOT NULL,
 observed_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(recorded_at>=observed_at),
 rights_hash text NOT NULL CHECK(rights_hash~'^[a-f0-9]{64}$'),
 body_sha256 text NOT NULL CHECK(body_sha256=encode(sha256(body),'hex')),
 body bytea NOT NULL CHECK(octet_length(body) BETWEEN 2 AND 524288),
 PRIMARY KEY(session_date,session_authority_id,rights_hash)
);
ALTER TABLE public.vnext_launch_tpex_opening_limits_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_tpex_opening_limits_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_tpex_opening_limits_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tpex_opening_limit_writer_fence BEFORE INSERT OR UPDATE OR DELETE
 ON public.vnext_launch_tpex_opening_limits_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER tpex_opening_limit_immutable BEFORE UPDATE OR DELETE
 ON public.vnext_launch_tpex_opening_limits_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();
CREATE TRIGGER tpex_opening_limit_no_truncate BEFORE TRUNCATE
 ON public.vnext_launch_tpex_opening_limits_v1
 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

CREATE FUNCTION public.vnext_launch_tpex_opening_limit_command_v1(
 p_principal text,p_lease_owner uuid,p_action text,p_session date DEFAULT NULL,
 p_as_of timestamptz DEFAULT NULL,p_observed_at timestamptz DEFAULT NULL,p_session_authority_id uuid DEFAULT NULL,
 p_sha256 text DEFAULT NULL,p_body bytea DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
 SET timezone='UTC' SET statement_timeout='12s' SET lock_timeout='2s' AS $command$
DECLARE
 rights jsonb; backend jsonb; mode public.vnext_launch_ranking_mode_v1;
 checked_at timestamptz; day date; close_at timestamptz; authority_id uuid;
 saved public.vnext_launch_tpex_opening_limits_v1; existing boolean; roc text;
 row_count integer; codes integer; report_valid boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed'
  OR p_action IS NULL OR p_action NOT IN('admit','append','read')
  OR (p_action='admit' AND p_session IS NOT NULL)
  OR (p_action='read' AND (p_session IS NULL OR p_as_of IS NULL))
  OR (p_action<>'read' AND p_as_of IS NOT NULL)
  OR (p_action<>'append' AND (p_observed_at IS NOT NULL OR p_session_authority_id IS NOT NULL
      OR p_sha256 IS NOT NULL OR p_body IS NOT NULL))
  OR (p_action='append' AND (p_session IS NULL OR p_observed_at IS NULL OR p_session_authority_id IS NULL
      OR coalesce(p_sha256,'')!~'^[a-f0-9]{64}$'
      OR coalesce(octet_length(p_body),0) NOT BETWEEN 2 AND 524288))
 THEN RAISE EXCEPTION 'launch_tpex_opening_limit_request_invalid'; END IF;

 IF p_action='append' THEN
  PERFORM pg_advisory_xact_lock(610091002);
  PERFORM pg_advisory_xact_lock(2409,6002);
  PERFORM pg_advisory_xact_lock(64221022);
 END IF;
 rights:=public.vnext_launch_csv_policy_v1(p_principal);
 backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease'
  OR coalesce(rights->>'rightsBindingHash','')!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'launch_outcome_reviewed_writer_required'; END IF;

 checked_at:=clock_timestamp();
 day:=(checked_at AT TIME ZONE 'Asia/Taipei')::date;
 IF p_action='read' THEN
  IF p_as_of>checked_at OR p_session>(p_as_of AT TIME ZONE 'Asia/Taipei')::date
  THEN RAISE EXCEPTION 'launch_tpex_opening_limit_cutoff_invalid'; END IF;
  authority_id:=public.vnext_launch_disposition_session_v1('TPEX',p_session,p_as_of);
  SELECT * INTO saved FROM public.vnext_launch_tpex_opening_limits_v1 r
   WHERE r.session_date=p_session AND r.recorded_at<=p_as_of
    AND r.session_authority_id=authority_id AND r.rights_hash=rights->>'rightsBindingHash';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('session',saved.session_date,'sessionAuthorityId',saved.session_authority_id,
   'observedAt',saved.observed_at,'recordedAt',saved.recorded_at,
   'sha256',saved.body_sha256,'bodyBase64',replace(encode(saved.body,'base64'),chr(10),''));
 END IF;

 close_at:=public.vnext_launch_tpex_cash_close_v1(day,checked_at);
 authority_id:=public.vnext_launch_disposition_session_v1('TPEX',day,checked_at);
 IF close_at IS NULL OR close_at>checked_at OR authority_id IS NULL THEN
  IF p_action='admit' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'launch_tpex_opening_limit_session_unready';
 END IF;
 SELECT * INTO saved FROM public.vnext_launch_tpex_opening_limits_v1 r
  WHERE r.session_date=day AND r.session_authority_id=authority_id AND r.rights_hash=rights->>'rightsBindingHash';
 existing:=FOUND;
 IF p_action='admit' THEN
  RETURN jsonb_build_object('session',day,'sessionAuthorityId',authority_id,
   'alreadyCaptured',existing);
 END IF;
 IF day IS DISTINCT FROM p_session OR p_session_authority_id IS DISTINCT FROM authority_id
  OR p_observed_at<close_at OR p_observed_at>checked_at
  OR p_observed_at<checked_at-interval '90 seconds'
  OR (p_observed_at AT TIME ZONE 'Asia/Taipei')::date<>day
  OR p_sha256<>encode(sha256(p_body),'hex')
 THEN RAISE EXCEPTION 'launch_tpex_opening_limit_capture_invalid'; END IF;

 -- The endpoint is a rolling report. Every non-header row must itself name
 -- the admitted exchange date to prevent a stale response becoming evidence.
 roc:=lpad((extract(year FROM day)::integer-1911)::text,3,'0')||to_char(day,'MMDD');
 SELECT count(*),count(DISTINCT values_by_row[2]) FILTER (WHERE ord>1),
  bool_and(CASE WHEN ord=1 THEN values_by_row=ARRAY['資料日期','股票代號','名稱','收盤價','漲跌','總成交張數',
   '漲跌停成交張數','漲跌停委託張數','漲跌停未成交張數']
   ELSE coalesce(cardinality(values_by_row)=9 AND values_by_row[1]=roc AND values_by_row[2]~'^[A-Z0-9]{4,10}$',false) END)
 INTO row_count,codes,report_valid
 FROM public.vnext_launch_csv_rows_v1(p_body,4001) WITH ORDINALITY AS lines(values_by_row,ord);
 IF row_count<2 OR codes<>row_count-1 OR report_valid IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'launch_tpex_opening_limit_report_invalid'; END IF;
 IF existing THEN
  IF saved.body_sha256<>p_sha256
  THEN RAISE EXCEPTION 'launch_tpex_opening_limit_receipt_conflict'; END IF;
 ELSE
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  INSERT INTO public.vnext_launch_tpex_opening_limits_v1(session_date,session_authority_id,observed_at,rights_hash,
   body_sha256,body)
  VALUES(day,authority_id,p_observed_at,rights->>'rightsBindingHash',p_sha256,p_body)
  RETURNING * INTO saved;
 END IF;
 RETURN jsonb_build_object('session',saved.session_date,'sessionAuthorityId',saved.session_authority_id,
  'recordedAt',saved.recorded_at,'sha256',saved.body_sha256,'replay',existing);
END $command$;
ALTER FUNCTION public.vnext_launch_tpex_opening_limit_command_v1(text,uuid,text,date,timestamptz,timestamptz,uuid,text,bytea)
 OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_tpex_opening_limit_command_v1(text,uuid,text,date,timestamptz,timestamptz,uuid,text,bytea)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_tpex_opening_limit_command_v1(text,uuid,text,date,timestamptz,timestamptz,uuid,text,bytea)
 TO service_role;
COMMIT;
