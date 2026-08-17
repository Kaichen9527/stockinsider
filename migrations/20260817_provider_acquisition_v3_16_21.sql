BEGIN;

GRANT USAGE, CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;
GRANT EXECUTE ON FUNCTION public.legacy_canonical_json_v3_13(jsonb)
  TO legacy_correctness_rpc_owner;

CREATE TABLE IF NOT EXISTS public.legacy_provider_acquisition_revisions_v3_16_21 (
  acquisition_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  request_key text NOT NULL CHECK (request_key ~ '^[0-9a-f]{64}$'),
  run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage ~ '^[a-z_]{2,40}$'),
  source_cutoff timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL,
  response_sha256 text NOT NULL CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  response_bytes integer NOT NULL CHECK (response_bytes BETWEEN 0 AND 67108864),
  normalized_payload_sha256 text NOT NULL CHECK (normalized_payload_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_payload jsonb NOT NULL CHECK (jsonb_typeof(normalized_payload)='object'),
  terminal_status text NOT NULL CHECK (terminal_status IN ('complete','provider_failed','auth_failed','missing_endpoint')),
  evidence_root text NOT NULL CHECK (evidence_root ~ '^[0-9a-f]{64}$'),
  action_eligible boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(provider,request_key,source_cutoff)
);

CREATE TABLE IF NOT EXISTS public.legacy_provider_acquisition_conflicts_v3_16_21 (
  conflict_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  request_key text NOT NULL CHECK (request_key ~ '^[0-9a-f]{64}$'),
  source_cutoff timestamptz NOT NULL,
  selected_evidence_root text NOT NULL CHECK (selected_evidence_root ~ '^[0-9a-f]{64}$'),
  attempted_evidence_root text NOT NULL CHECK (attempted_evidence_root ~ '^[0-9a-f]{64}$'),
  attempted_response_sha256 text NOT NULL CHECK (attempted_response_sha256 ~ '^[0-9a-f]{64}$'),
  attempted_normalized_payload_sha256 text NOT NULL CHECK (attempted_normalized_payload_sha256 ~ '^[0-9a-f]{64}$'),
  producer_commit_sha text NOT NULL CHECK (producer_commit_sha ~ '^[0-9a-f]{40}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS legacy_provider_acquisition_revisions_v3_16_21_run_idx
  ON public.legacy_provider_acquisition_revisions_v3_16_21(run_id,stage,recorded_at);
CREATE INDEX IF NOT EXISTS legacy_provider_acquisition_conflicts_v3_16_21_request_idx
  ON public.legacy_provider_acquisition_conflicts_v3_16_21(provider,request_key,source_cutoff,recorded_at);

ALTER TABLE public.legacy_provider_acquisition_revisions_v3_16_21 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_provider_acquisition_conflicts_v3_16_21 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legacy_provider_acquisition_revisions_v3_16_21 OWNER TO legacy_correctness_rpc_owner;
ALTER TABLE public.legacy_provider_acquisition_conflicts_v3_16_21 OWNER TO legacy_correctness_rpc_owner;

DROP TRIGGER IF EXISTS legacy_provider_acquisition_revisions_v3_16_21_immutable
  ON public.legacy_provider_acquisition_revisions_v3_16_21;
CREATE TRIGGER legacy_provider_acquisition_revisions_v3_16_21_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_provider_acquisition_revisions_v3_16_21
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();
DROP TRIGGER IF EXISTS legacy_provider_acquisition_conflicts_v3_16_21_immutable
  ON public.legacy_provider_acquisition_conflicts_v3_16_21;
CREATE TRIGGER legacy_provider_acquisition_conflicts_v3_16_21_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_provider_acquisition_conflicts_v3_16_21
  FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11();

CREATE OR REPLACE FUNCTION public.read_legacy_provider_acquisition_v3_16_21(
  p_provider text,p_request_key text,p_source_cutoff timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $read$
  SELECT CASE WHEN selected.acquisition_id IS NULL THEN NULL ELSE jsonb_build_object(
    'schema','provider-acquisition-revision-v3.16.21',
    'provider',selected.provider,'requestKey',selected.request_key,'runId',selected.run_id::text,
    'stage',selected.stage,'sourceCutoff',to_char(selected.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'fetchedAt',to_char(selected.fetched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'responseSha256',selected.response_sha256,'responseBytes',selected.response_bytes,
    'normalizedPayloadSha256',selected.normalized_payload_sha256,'normalizedPayload',selected.normalized_payload,
    'terminalStatus',selected.terminal_status,'evidenceRoot',selected.evidence_root,
    'actionEligible',selected.action_eligible
  ) END
  FROM (SELECT row.* FROM public.legacy_provider_acquisition_revisions_v3_16_21 row
    WHERE row.provider=p_provider AND row.request_key=p_request_key AND row.source_cutoff=p_source_cutoff
    LIMIT 1) selected;
$read$;

CREATE OR REPLACE FUNCTION public.freeze_legacy_provider_acquisition_v3_16_21(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_provider text,p_request_key text,p_stage text,
  p_source_cutoff timestamptz,p_fetched_at timestamptz,p_response_sha256 text,p_response_bytes integer,
  p_normalized_payload jsonb,p_normalized_payload_sha256 text,p_terminal_status text,p_evidence_root text,
  p_action_eligible boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $freeze$
DECLARE
  v_now timestamptz:=clock_timestamp();
  v_started_at timestamptz;
  v_producer_sha text;
  v_payload_sha text;
  v_evidence_root text;
  v_selected public.legacy_provider_acquisition_revisions_v3_16_21%ROWTYPE;
  v_inserted boolean:=false;
BEGIN
  IF p_provider!~'^[a-z0-9_]{2,40}$' OR p_request_key!~'^[0-9a-f]{64}$'
    OR p_stage!~'^[a-z_]{2,40}$' OR p_response_sha256!~'^[0-9a-f]{64}$'
    OR p_normalized_payload_sha256!~'^[0-9a-f]{64}$' OR p_evidence_root!~'^[0-9a-f]{64}$'
    OR p_response_bytes NOT BETWEEN 0 AND 67108864 OR jsonb_typeof(p_normalized_payload)<>'object'
    OR p_terminal_status NOT IN ('complete','provider_failed','auth_failed','missing_endpoint')
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;

  SELECT run.started_at,run.producer_commit_sha INTO v_started_at,v_producer_sha
  FROM public.legacy_producer_runs_v3_11 run
  JOIN public.legacy_producer_jobs_v3_11 job ON job.run_id=run.run_id
  WHERE run.run_id=p_run_id AND job.job_id=p_job_id
    AND run.owner_token_hash=encode(extensions.digest(convert_to(p_owner_token::text,'utf8'),'sha256'),'hex')
    AND job.owner_token_hash=encode(extensions.digest(convert_to(p_owner_token::text,'utf8'),'sha256'),'hex')
    AND job.status='leased' AND job.lease_expires_at>=v_now
    AND run.source_cutoff=p_source_cutoff AND run.status='running' AND run.lease_expires_at>=v_now;
  IF v_started_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';
  END IF;
  IF p_fetched_at<v_started_at OR p_fetched_at>v_now+interval '5 seconds' THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='provider_acquisition_time_invalid';
  END IF;

  v_payload_sha:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(p_normalized_payload),'utf8'),'sha256'),'hex');
  IF v_payload_sha<>p_normalized_payload_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='provider_acquisition_payload_hash';
  END IF;
  v_evidence_root:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
    'provider-acquisition-revision-v3.16.21',p_provider,p_request_key,p_run_id::text,p_stage,
    to_char(p_source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    to_char(p_fetched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    p_response_sha256,p_response_bytes,p_normalized_payload_sha256,p_terminal_status,
    p_terminal_status='complete' AND p_action_eligible)),'utf8'),'sha256'),'hex');
  IF v_evidence_root<>p_evidence_root THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='provider_acquisition_evidence_root';
  END IF;

  INSERT INTO public.legacy_provider_acquisition_revisions_v3_16_21(
    provider,request_key,run_id,stage,source_cutoff,fetched_at,response_sha256,response_bytes,
    normalized_payload_sha256,normalized_payload,terminal_status,evidence_root,action_eligible,recorded_at)
  VALUES(p_provider,p_request_key,p_run_id,p_stage,p_source_cutoff,p_fetched_at,p_response_sha256,p_response_bytes,
    p_normalized_payload_sha256,p_normalized_payload,p_terminal_status,p_evidence_root,
    p_terminal_status='complete' AND p_action_eligible,v_now)
  ON CONFLICT(provider,request_key,source_cutoff) DO NOTHING
  RETURNING * INTO v_selected;
  v_inserted:=v_selected.acquisition_id IS NOT NULL;
  IF NOT v_inserted THEN
    SELECT row.* INTO STRICT v_selected FROM public.legacy_provider_acquisition_revisions_v3_16_21 row
    WHERE row.provider=p_provider AND row.request_key=p_request_key AND row.source_cutoff=p_source_cutoff;
  END IF;

  IF v_selected.evidence_root<>p_evidence_root THEN
    INSERT INTO public.legacy_provider_acquisition_conflicts_v3_16_21(provider,request_key,source_cutoff,
      selected_evidence_root,attempted_evidence_root,attempted_response_sha256,
      attempted_normalized_payload_sha256,producer_commit_sha,recorded_at)
    VALUES(p_provider,p_request_key,p_source_cutoff,v_selected.evidence_root,p_evidence_root,p_response_sha256,
      p_normalized_payload_sha256,v_producer_sha,v_now);
    RETURN jsonb_build_object('disposition','conflict','envelope',NULL);
  END IF;
  RETURN jsonb_build_object('disposition',CASE WHEN v_inserted THEN 'appended' ELSE 'reused' END,
    'envelope',public.read_legacy_provider_acquisition_v3_16_21(p_provider,p_request_key,p_source_cutoff));
END $freeze$;

DO $upgrade_provider_lineage$
BEGIN
  IF to_regprocedure(
    'public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
      RENAME TO claim_legacy_producer_job_provider_acquisition_base_v3_16_21;
  END IF;
END $upgrade_provider_lineage$;

CREATE OR REPLACE FUNCTION public.claim_legacy_producer_job_v3_11(
  p_run uuid,p_job uuid,p_token uuid,p_lease integer
) RETURNS public.legacy_producer_claim_v3_11
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE
  v_claim public.legacy_producer_claim_v3_11;
  v_lineage jsonb;
  v_evidence_at timestamptz;
  v_evaluation_at timestamptz;
BEGIN
  v_claim:=public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(
    p_run,p_job,p_token,p_lease);
  IF v_claim.run_id IS NULL OR v_claim.read_kind NOT IN (
    'analysis_revision_input','compact_projection_input'
  ) THEN
    RETURN v_claim;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema','provider-acquisition-lineage-member-v3.16.21',
    'provider',revision.provider,'requestKey',revision.request_key,'runId',revision.run_id::text,
    'stage',revision.stage,
    'sourceCutoff',to_char(revision.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'fetchedAt',to_char(revision.fetched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'responseSha256',revision.response_sha256,'responseBytes',revision.response_bytes,
    'normalizedPayloadSha256',revision.normalized_payload_sha256,
    'terminalStatus',revision.terminal_status,'evidenceRoot',revision.evidence_root,
    'actionEligible',revision.action_eligible
  ) ORDER BY revision.provider,revision.request_key),'[]'::jsonb) INTO v_lineage
  FROM public.legacy_provider_acquisition_revisions_v3_16_21 revision
  WHERE revision.run_id=v_claim.run_id;
  SELECT max(revision.fetched_at) INTO v_evidence_at
  FROM public.legacy_provider_acquisition_revisions_v3_16_21 revision
  WHERE revision.run_id=v_claim.run_id;
  v_evaluation_at:=greatest((v_claim.read_json->>'evaluationTimestamp')::timestamptz,v_evidence_at);
  v_claim.read_json:=v_claim.read_json||jsonb_build_object(
    'evaluationTimestamp',to_char(v_evaluation_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  IF v_claim.read_kind='compact_projection_input' THEN
    v_claim.read_json:=v_claim.read_json||jsonb_build_object('providerAcquisitions',v_lineage);
  END IF;
  v_claim.read_canonical:=convert_to(v_claim.read_json::text,'utf8');
  v_claim.read_hash:=encode(extensions.digest(v_claim.read_canonical,'sha256'),'hex');
  IF octet_length(v_claim.read_canonical)>3145728 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_claim;
END $claim$;

ALTER FUNCTION public.read_legacy_provider_acquisition_v3_16_21(text,text,timestamptz)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.freeze_legacy_provider_acquisition_v3_16_21(
  uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,jsonb,text,text,text,boolean)
  OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;
ALTER FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) OWNER TO legacy_correctness_rpc_owner;

REVOKE ALL ON TABLE public.legacy_provider_acquisition_revisions_v3_16_21,
  public.legacy_provider_acquisition_conflicts_v3_16_21 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_legacy_provider_acquisition_v3_16_21(text,text,timestamptz),
  public.freeze_legacy_provider_acquisition_v3_16_21(
    uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,jsonb,text,text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_legacy_provider_acquisition_v3_16_21(text,text,timestamptz),
  public.freeze_legacy_provider_acquisition_v3_16_21(
    uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,jsonb,text,text,text,boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_producer_job_v3_11(
  uuid,uuid,uuid,integer) TO service_role;

REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;

COMMIT;
