-- Cloud acceptance is distinct from generic model accounting. Apply only through
-- the reviewed production migration path; no deployment authority is conferred.
BEGIN;
CREATE TABLE IF NOT EXISTS public.research_cloud_acceptances_v1 (
  reservation_id uuid PRIMARY KEY REFERENCES public.research_model_completions_v1(reservation_id) ON DELETE RESTRICT,
  owner text NOT NULL,
  work_key text NOT NULL CHECK (work_key ~ '^cloud:v1:[0-9a-f]{64}$'),
  work_hash text NOT NULL CHECK (work_hash ~ '^[0-9a-f]{64}$'),
  source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
  result_hash text NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('completed','failed')),
  receiver_version text NOT NULL DEFAULT 'research-cloud-result-v1' CHECK (receiver_version='research-cloud-result-v1'),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.research_cloud_acceptances_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_cloud_acceptances_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.research_cloud_acceptances_v1 TO service_role;
CREATE OR REPLACE TRIGGER trg_research_cloud_acceptances_immutable_v1
  BEFORE UPDATE OR DELETE ON public.research_cloud_acceptances_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_dossier_revision_mutation_v4();

CREATE OR REPLACE FUNCTION public.accept_research_cloud_result_v1(
  p_reservation uuid,p_owner text,p_work_key text,p_work_hash text,
  p_source_commit text,p_outcome text,p_result_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_reservation public.research_model_reservations_v1;
  v_prior public.research_cloud_acceptances_v1;
BEGIN
  IF p_owner IS NULL OR p_work_key IS NULL OR p_work_hash IS NULL OR p_source_commit IS NULL
    OR p_outcome IS NULL OR p_result_hash IS NULL
    OR p_work_key !~ '^cloud:v1:[0-9a-f]{64}$' OR p_work_hash !~ '^[0-9a-f]{64}$'
    OR p_source_commit !~ '^[0-9a-f]{40}$' OR p_result_hash !~ '^[0-9a-f]{64}$'
    OR p_outcome NOT IN ('completed','failed') THEN RAISE EXCEPTION 'cloud_acceptance_input_invalid'; END IF;
  -- Same lock as all role reservations/completions, so a generic finish cannot
  -- race past the provenance check or leave a partial acceptance.
  PERFORM pg_advisory_xact_lock(2409,6002);
  SELECT * INTO v_reservation FROM public.research_model_reservations_v1 WHERE reservation_id=p_reservation;
  IF NOT FOUND OR v_reservation.role<>'independent_test' OR v_reservation.owner<>p_owner
    OR v_reservation.work_key<>p_work_key THEN RAISE EXCEPTION 'cloud_acceptance_reservation_mismatch'; END IF;
  SELECT * INTO v_prior FROM public.research_cloud_acceptances_v1 WHERE reservation_id=p_reservation;
  IF FOUND THEN
    IF v_prior.owner<>p_owner OR v_prior.work_key<>p_work_key OR v_prior.work_hash<>p_work_hash
      OR v_prior.source_commit<>p_source_commit OR v_prior.outcome<>p_outcome OR v_prior.result_hash<>p_result_hash
      THEN RAISE EXCEPTION 'cloud_acceptance_replay_mismatch'; END IF;
    RETURN true;
  END IF;
  IF EXISTS(SELECT 1 FROM public.research_model_completions_v1 WHERE reservation_id=p_reservation)
    THEN RAISE EXCEPTION 'cloud_generic_completion_not_acceptance'; END IF;
  IF v_reservation.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'cloud_acceptance_lease_lost'; END IF;
  PERFORM public.finish_research_model_v1(p_reservation,p_owner,p_outcome,p_result_hash);
  INSERT INTO public.research_cloud_acceptances_v1(reservation_id,owner,work_key,work_hash,source_commit,result_hash,outcome)
    VALUES(p_reservation,p_owner,p_work_key,p_work_hash,p_source_commit,p_result_hash,p_outcome);
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.accept_research_cloud_result_v1(uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_research_cloud_result_v1(uuid,text,text,text,text,text,text) TO service_role;
COMMIT;
