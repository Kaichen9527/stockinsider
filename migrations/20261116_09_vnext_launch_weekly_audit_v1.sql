BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_weekly_audit_due_v1(p_principal text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10s' AS $$
DECLARE context jsonb; session_day date; week_day date; active_count integer; due boolean;
BEGIN
 context:=public.vnext_launch_cycle_context_v1(p_principal);
 IF context->>'ready' IS DISTINCT FROM 'true' THEN
  RETURN jsonb_build_object('status','deferred','session',NULL,'weekStart',NULL,'activeCount',0);
 END IF;
 session_day:=(context->>'session')::date;
 week_day:=date_trunc('week',session_day::timestamp)::date;
 SELECT count(*),coalesce(bool_or(NOT EXISTS(
  SELECT FROM public.vnext_thesis_audits_v1 audit
   WHERE audit.week_start=week_day AND audit.symbol=member.symbol AND audit.input_hash=member.input_hash
  )),false) INTO active_count,due
 FROM public.vnext_members_v1 member WHERE member.state<>'exited';
 IF active_count>20 THEN RAISE EXCEPTION 'vnext_weekly_unique_active_scope'; END IF;
 RETURN jsonb_build_object('status',CASE WHEN active_count=0 THEN 'empty' WHEN due THEN 'due' ELSE 'current' END,
  'session',session_day,'weekStart',week_day,'activeCount',active_count);
END $$;
ALTER FUNCTION public.vnext_launch_weekly_audit_due_v1(text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_weekly_audit_due_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_launch_weekly_audit_due_v1(text) TO service_role;

-- Preserve the original all-active, input, revision, cutoff and deterministic
-- score checks. The scheduled action rechecks cadence under the original
-- advisory transaction lock and records audit rows without refreshing legacy home.
DO $launch_weekly_patch$
DECLARE target oid:=to_regprocedure('public.vnext_thesis_command_v1(text,text,jsonb)');
 original text; definition text; changed text; metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF metadata->>'proowner' IS DISTINCT FROM ('stockinsider_vnext_owner'::regrole::oid)::text
  OR metadata->>'prosecdef' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'launch_weekly_thesis_profile_changed'; END IF;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM
  'e15c231f20c7b539b852b7be97607ac4ea4008513505c641b0fbf1609be445e7'
  THEN RAISE EXCEPTION 'launch_weekly_thesis_predecessor_changed'; END IF;
 changed:=replace(replace(original,$old_action$ ELSIF p_command='record' THEN
$old_action$,$new_action$ ELSIF p_command IN ('record','launch-weekly-record') THEN
  IF p_command='launch-weekly-record' AND (public.vnext_launch_weekly_audit_due_v1(p_principal)->>'status') IS DISTINCT FROM 'due'
   THEN RAISE EXCEPTION 'vnext_launch_weekly_record_not_due'; END IF;
$new_action$),
  $old_refresh$  PERFORM public.vnext_refresh_home_v1();RETURN jsonb_build_object('reviewed',expected,'substantive_updates_only',true);$old_refresh$,$new_refresh$  IF p_command='record' THEN PERFORM public.vnext_refresh_home_v1(); END IF;
  RETURN jsonb_build_object('reviewed',expected,'substantive_updates_only',true);$new_refresh$);
 IF encode(sha256(convert_to(changed,'UTF8')),'hex') IS DISTINCT FROM
  'f20b9e0a003a1f35e5e74b50a4a59c840b33724c27afaef4fca338314444f1ec'
  THEN RAISE EXCEPTION 'launch_weekly_thesis_successor_changed'; END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata
  THEN RAISE EXCEPTION 'launch_weekly_thesis_profile_changed'; END IF;
END $launch_weekly_patch$;
COMMIT;
