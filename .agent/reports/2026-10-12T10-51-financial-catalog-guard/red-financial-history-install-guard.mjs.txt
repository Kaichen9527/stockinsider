import { createHash } from 'node:crypto';
export const FINANCIAL_TAIL = 'migrations/20261005_financial_history_admission_v1.sql';
export const FINANCIAL_TAIL_SHA256 = '5494165e6163d9e63e1649f0214865f5ad4c9ffb262e00dd6073cc1be4124e27';
export const BASE_CHAIN_SHA256 = '37dfacc252ec24a719b898b2b3ea31fc77c1631db083211f1f171c956772c613';
export const orderedHash = rows => createHash('sha256').update(JSON.stringify(rows.map(r => [r.relativePath ?? r.migration,r.sha256]))).digest('hex');
export function selectFinancialHistoryChain(base, tail, enabled = false) {
  if (base.length !== 48 || orderedHash(base) !== BASE_CHAIN_SHA256) throw new Error('financial_base_chain_mismatch');
  if (!enabled) return Object.freeze([...base]);
  if (!tail || tail.relativePath !== FINANCIAL_TAIL || tail.sha256 !== FINANCIAL_TAIL_SHA256
    || createHash('sha256').update(tail.bytes).digest('hex') !== FINANCIAL_TAIL_SHA256) throw new Error('financial_tail_mismatch');
  return Object.freeze([...base,tail]);
}
// The exact-review resolver verifies the evidence hash and direct-child attestation.
// This additional literal is required inside that hash-bound review, not supplied by a flag.
export function assertFinancialReviewBinding(review, hash) {
  if (!/^[0-9a-f]{64}$/u.test(hash) || review.split(/\r?\n/u).filter(x => x === `Financial history ordered chain SHA256: ${hash}`).length !== 1)
    throw new Error('financial_chain_review_binding_missing');
}
export async function verifyFinancialHistoryPostconditions(client) {
  const { rows } = await client.query(`SELECT jsonb_build_object(
    'observationRls', (SELECT relrowsecurity AND pg_get_userbyid(relowner)='opportunity_v3_rpc_owner'
      FROM pg_class WHERE oid=to_regclass('public.opportunity_financial_observations_v1')),
    'observationAcl', has_table_privilege('service_role','public.opportunity_financial_observations_v1','SELECT')
      AND NOT has_table_privilege('service_role','public.opportunity_financial_observations_v1','INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT has_table_privilege('anon','public.opportunity_financial_observations_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT has_table_privilege('authenticated','public.opportunity_financial_observations_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE c.oid=to_regclass('public.opportunity_financial_observations_v1') AND a.grantee=0),
    'periodBound', (SELECT encode(extensions.digest(convert_to(prosrc,'utf8'),'sha256'),'hex')='557f6cc65f4f67ad0b31a8b7993a8d7a82f00f07e2c17c0c53067dc3d4d0ffd3'
      AND position('financial_period_revision_bound' IN pg_get_functiondef(oid))>0
      AND position('fact.period_end=NEW.period_end' IN pg_get_functiondef(oid))>0
      AND prosecdef AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'
      FROM pg_proc WHERE oid=to_regprocedure('public.prepare_opportunity_financial_fact_series_v3()')),
    'appendWrapper', (SELECT encode(extensions.digest(convert_to(prosrc,'utf8'),'sha256'),'hex')='ee5843356767ef40eb9ac39eab973bbb6dda86eb3c24c9679d54c9badddab391'
      AND has_function_privilege('service_role',oid,'EXECUTE')
      AND NOT has_function_privilege('anon',oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND position('append_financial_fact_pre_history_v1' IN pg_get_functiondef(oid))>0
      AND position('opportunity_financial_observations_v1' IN pg_get_functiondef(oid))>0 AND prosecdef
      AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'
      FROM pg_proc WHERE oid=to_regprocedure('public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)')),
    'privatePredecessor', NOT has_function_privilege('service_role','public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)','EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=to_regprocedure('public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)') AND a.grantee=0),
    'immutable', EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.opportunity_financial_observations_v1')
      AND tgname='opportunity_financial_observations_v1_immutable' AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid=to_regprocedure('public.legacy_correctness_immutable_v3_11()') AND (tgtype & 24)=24),
    'ownerNoCreate', NOT has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE'),
    'pageReader', EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid)')
      AND encode(extensions.digest(convert_to(prosrc,'utf8'),'sha256'),'hex')='0a7367125481f12eb46735568f5c161d752f5fd8f5c2351399090ec1b9e93551'
      AND prosecdef AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'
      AND position('p_limit NOT BETWEEN 1 AND 128' IN pg_get_functiondef(oid))>0
      AND position('p_limit+1' IN pg_get_functiondef(oid))>0
      AND has_function_privilege('service_role',oid,'EXECUTE')
      AND NOT has_function_privilege('anon',oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0))
  ) result`);
  const value=rows[0]?.result;
  if (!value || Object.keys(value).length !== 8 || Object.values(value).some(x=>x!==true)) throw new Error('financial_history_postcondition_failed');
  return value;
}
export async function assertInstalledFinancialHistoryPlan(client, plan, enabled) {
  const {rows}=await client.query(`SELECT
    to_regclass('public.opportunity_financial_observations_v1') IS NOT NULL AS observations,
    to_regprocedure('public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)') IS NOT NULL AS wrapper,
    EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='read_financial_history_page_v1') AS reader,
    (to_regclass('public.opportunity_financial_facts_v3_history_page_v1') IS NOT NULL
      OR to_regclass('public.opportunity_financial_facts_v3_period_revisions_v1') IS NOT NULL
      OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.prepare_opportunity_financial_fact_series_v3()')
        AND position('financial_period_revision_bound' IN pg_get_functiondef(oid))>0)) AS residue,
    EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')
      AND (relname LIKE 'research_%' AND relname NOT IN ('research_memos','research_reports','research_dossiers')
        OR relname LIKE 'cloud_%'))
      OR to_regprocedure('public.reserve_research_model_v1(text,text,integer)') IS NOT NULL
      OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
        AND proname IN ('reserve_research_model_v1','claim_research_deep_job_v1','admit_research_observed_roster_v1')) AS unknown_successor`);
  const state=rows[0];
  if (!state || ['observations','wrapper','reader','residue','unknown_successor'].some(k=>typeof state[k]!=='boolean')) throw new Error('financial_install_state_unavailable');
  if (state.unknown_successor) throw new Error('unknown_research_successor_replay_rejected');
  if (enabled) {
    if (plan.length!==49 || plan[48].relativePath!==FINANCIAL_TAIL || plan[48].sha256!==FINANCIAL_TAIL_SHA256
      || orderedHash(plan.slice(0,48))!==BASE_CHAIN_SHA256) throw new Error('financial_installed_tail_required');
  }
  const present=[state.observations,state.wrapper,state.reader];
  if (present.some(Boolean) || state.residue) {
    if (!enabled) throw new Error('installed_financial_successor_base_replay_rejected');
    if (!present.every(Boolean) || !state.residue) throw new Error('financial_successor_partial_residue');
    await verifyFinancialHistoryPostconditions(client);
  }
}
