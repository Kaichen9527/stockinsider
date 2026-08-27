#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { canonicalJson } = require('../runtime/codec');
const { resolvePostgresConnectionReference } = require('../runtime/credential-resolver');
const { resolveReviewedRuntimeRelease } = require('../runtime/reviewed-runtime-release');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHA40 = /^[0-9a-f]{40}$/u;
const MIGRATIONS = Object.freeze([
  'migrations/20260724_source_led_opportunity_engine_v3.sql',
  'migrations/20260809_product_value_recovery_v3_12.sql',
  'migrations/20260809_decision_integrity_v3_13.sql',
  'migrations/20260811_actionability_recovery_v3_14.sql',
  'migrations/20260813_opportunity_recovery_v3_15.sql',
  'migrations/20260814_official_ingestion_chunk_apply_v3_15.sql',
  'migrations/20260816_claim_handoff_lease_v3_16.sql',
  'migrations/20260816_official_ingestion_partial_resume_v3_16.sql',
  'migrations/20260816_official_ingestion_transaction_time_v3_16_9.sql',
  'migrations/20260816_official_ingestion_same_transaction_visibility_v3_16_10.sql',
  'migrations/20260816_calendar_dependency_recovery_occurrence_v3_16_11.sql',
  'migrations/20260816_candidate_fact_plane_bound_v3_16_12.sql',
  'migrations/20260816_analysis_payload_reuse_v3_16_15.sql',
  'migrations/20260816_financial_fact_recollection_idempotency_v3_16_16.sql',
  'migrations/20260817_analysis_payload_exact_reuse_v3_16_18.sql',
  'migrations/20260817_runtime_health_bootstrap_v3_16_19.sql',
  'migrations/20260817_evaluation_clock_v3_16_20.sql',
  'migrations/20260817_provider_acquisition_v3_16_21.sql',
  'migrations/20260817_official_ingestion_roster_chunk_snapshot_v3_16_21.sql',
  'migrations/20260817_projection_evaluation_supersession_v3_16_21.sql',
  'migrations/20260822_candidate_ledger_retention_v3_18.sql',
  'migrations/20260823_release_reconciliation_v3_19.sql',
  'migrations/20260827_runtime_diagnostic_contract_v3_19_1.sql',
  'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql',
  'migrations/20260828_decision_revision_identity_dossier_v3_19_3.sql',
  'migrations/20260828_legacy_evaluation_schema_v3_19_6.sql',
  'migrations/20260828_reused_acquisition_lineage_v3_19_7.sql',
  'migrations/20260828_candidate_retention_authority_v3_19_10.sql',
]);
const V3192_PROJECTION_DOSSIER_MIGRATION =
  'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql';

async function reviewedMigrationIsSuperseded(client, relativePath) {
  if (relativePath !== V3192_PROJECTION_DOSSIER_MIGRATION) return false;
  const result = await client.query(`SELECT CASE
    WHEN to_regprocedure(
      'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)') IS NULL
      THEN false
    ELSE position('jsonb_typeof(v_item#>''{bundle,json,researchDossier}'')' IN pg_get_functiondef(
      'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
      AND position('''dossierId''' IN pg_get_functiondef(
      'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
      AND position('decision_revision_identity_conflict' IN pg_get_functiondef(
      'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
    END AS superseded`);
  return result.rows[0]?.superseded === true;
}

function parseArguments(argv) {
  const result = { apply:false,sourceCommit:null,attestationCommit:null };
  for (let index=0; index<argv.length; index+=1) {
    const value=argv[index];
    if(value==='--apply')result.apply=true;
    else if(value==='--source-commit'&&SHA40.test(argv[index+1]??''))result.sourceCommit=argv[++index];
    else if(value==='--attestation-commit'&&SHA40.test(argv[index+1]??''))result.attestationCommit=argv[++index];
    else throw new Error('invalid_arguments');
  }
  if(!result.apply||!result.sourceCommit||!result.attestationCommit)throw new Error('invalid_arguments');
  return Object.freeze(result);
}

function reviewedMigrationPlan(options) {
  const head=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const dirty=execFileSync('/usr/bin/git',['status','--porcelain=v1','--untracked-files=all'],
    {cwd:root,encoding:'utf8'}).trim();
  if(head!==options.sourceCommit||dirty!=='')throw new Error('source_tree_dirty');
  resolveReviewedRuntimeRelease({repositoryRoot:root,sourceCommit:options.sourceCommit,
    attestationCommit:options.attestationCommit});
  const status=JSON.parse(fs.readFileSync(path.join(root,
    '.loop-engineering/state/changes/source-led-opportunity-engine-v3/status.json'),'utf8'));
  if(status?.authority?.v314?.productionDatabaseMigrationAuthorized!==true)
    throw new Error('production_migration_authority_missing');
  const migrations=MIGRATIONS.map((relativePath)=>{
    const bytes=fs.readFileSync(path.join(root,relativePath));
    if(/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(bytes.toString('utf8')))
      throw new Error('non_additive_migration_rejected');
    return Object.freeze({relativePath,bytes,sha256:createHash('sha256').update(bytes).digest('hex')});
  });
  const chainSha256=createHash('sha256').update(JSON.stringify(migrations
    .map(({relativePath,sha256})=>[relativePath,sha256]))).digest('hex');
  return Object.freeze({migrations:Object.freeze(migrations),chainSha256});
}

async function applyReviewedMigrations(options) {
  const plan=reviewedMigrationPlan(options);
  const client=new Client({connectionString:resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url'),
    application_name:'stockinsider-reviewed-v3-migration',statement_timeout:180000,query_timeout:180000});
  await client.connect();
  let locked=false;
  const supersededMigrations=[];
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");
    locked=true;
    // Freeze successor detection before replaying any older migration. Earlier
    // migrations can temporarily replace the authoritative function body and
    // must not erase evidence that the stronger successor was already installed.
    const v3192Superseded=await reviewedMigrationIsSuperseded(
      client,V3192_PROJECTION_DOSSIER_MIGRATION);
    for(const migration of plan.migrations) {
      if(v3192Superseded && migration.relativePath===V3192_PROJECTION_DOSSIER_MIGRATION) {
        supersededMigrations.push(migration.relativePath);
        continue;
      }
      await client.query(migration.bytes.toString('utf8'));
    }
    const verified=(await client.query(`SELECT jsonb_build_object(
      'v314Diagnostics',to_regclass('public.legacy_runtime_failure_diagnostics_v3_14') IS NOT NULL,
      'v314Chunks',to_regclass('public.legacy_official_ingestion_chunks_v3_14') IS NOT NULL,
      'decisionRevisions',to_regclass('public.legacy_decision_revisions_v3_13') IS NOT NULL,
      'candidateRead',to_regprocedure('public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)') IS NOT NULL,
      'projectionSelect',to_regprocedure('public.select_opportunity_public_projection_v3(timestamptz)') IS NOT NULL
      ,'runtimeDiagnosticContract',(SELECT position('projection_supersession_conflict' in
        pg_get_constraintdef(constraint_row.oid))>0
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid='public.legacy_runtime_failure_diagnostics_v3_14'::regclass
          AND constraint_row.conname='legacy_runtime_failure_diagnostics_v3_14_invariant_code_check')
      ,'restClaim',to_regprocedure('public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)') IS NOT NULL
      ,'boundedChunkApply',to_regprocedure('public.append_legacy_official_ingestion_chunk_rest_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)') IS NOT NULL
      ,'claimHandoff',to_regprocedure('public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)') IS NOT NULL
      ,'partialResume',to_regprocedure('public.claim_legacy_producer_job_rest_v3_15(uuid,uuid,uuid,integer,text)') IS NOT NULL
      ,'transactionTimeDependency',to_regprocedure('public.resolve_legacy_trading_session_dependency_v3_16_9_internal(date,public.tw_market_v3,timestamptz,timestamptz)') IS NOT NULL
      ,'sameTransactionVisibility',(SELECT provolatile='v' FROM pg_proc
        WHERE oid='public.resolve_legacy_trading_session_dependency_v3_16_9_internal(date,public.tw_market_v3,timestamptz,timestamptz)'::regprocedure)
      ,'calendarRecovery',(SELECT provolatile='v' AND prosecdef FROM pg_proc
        WHERE oid='public.resolve_legacy_scheduled_occurrence_v3_11(text,text)'::regprocedure)
      ,'calendarRecoveryHelper',(SELECT provolatile='s' AND prosecdef FROM pg_proc
        WHERE oid='public.resolve_legacy_calendar_recovery_cutoff_v3_16_11_internal(text)'::regprocedure)
      ,'candidateFactPlaneBound',to_regprocedure(
        'public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)') IS NOT NULL
        AND NOT has_function_privilege('legacy_correctness_rpc_owner',
          'public.read_legacy_candidate_fact_plane_v3_16_11_internal(timestamptz,jsonb)','EXECUTE')
        AND has_function_privilege('legacy_correctness_rpc_owner',
          'public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)','EXECUTE')
      ,'analysisPayloadReuse',to_regprocedure(
        'public.claim_legacy_producer_job_authoritative_v3_16_15(uuid,uuid,uuid,integer)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
        AND has_function_privilege('legacy_correctness_rpc_owner',
          'public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' FROM pg_proc
          WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
        AND (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' FROM pg_proc
          WHERE oid='public.enrich_legacy_analysis_prior_payloads_v3_16_15(jsonb)'::regprocedure)
      ,'financialFactRecollection',to_regprocedure(
        'public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.append_financial_fact_pre_v3_16_16(public.financial_fact_input_v3,uuid)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' FROM pg_proc
          WHERE oid='public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)'::regprocedure)
      ,'analysisPayloadExactReuse',to_regprocedure(
        'public.claim_legacy_producer_job_authoritative_v3_16_18(uuid,uuid,uuid,integer)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
        AND has_function_privilege('legacy_correctness_rpc_owner',
          'public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' FROM pg_proc
          WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
        AND (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' FROM pg_proc
          WHERE oid='public.resolve_legacy_analysis_prior_payloads_v3_16_18(jsonb)'::regprocedure)
      ,'runtimeHealthBootstrap',(SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'
          AND prosecdef
        FROM pg_proc WHERE oid='public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)'::regprocedure)
        AND has_function_privilege('service_role',
          'public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)','EXECUTE')
        AND NOT has_function_privilege('anon',
          'public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)','EXECUTE')
        AND NOT has_function_privilege('authenticated',
          'public.append_legacy_runtime_health_rest_v3_15(text,text,text,bytea,jsonb,text,timestamptz)','EXECUTE')
      ,'evaluationClock',to_regprocedure(
        'public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(uuid,uuid,uuid,integer)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(uuid,uuid,uuid,integer)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
          FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
          FROM pg_proc WHERE oid=
            'public.claim_legacy_producer_job_evaluation_clock_base_v3_16_20(uuid,uuid,uuid,integer)'::regprocedure)
      ,'providerAcquisition',to_regclass(
        'public.legacy_provider_acquisition_revisions_v3_16_21') IS NOT NULL
        AND to_regclass('public.legacy_provider_acquisition_conflicts_v3_16_21') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.read_legacy_provider_acquisition_v3_16_21(text,text,timestamptz)','EXECUTE')
        AND has_function_privilege('service_role',
          'public.freeze_legacy_provider_acquisition_v3_16_21(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,jsonb,text,text,text,boolean)','EXECUTE')
        AND NOT has_table_privilege('service_role',
          'public.legacy_provider_acquisition_revisions_v3_16_21','INSERT')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
          FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
        AND NOT has_function_privilege('service_role',
          'public.claim_legacy_producer_job_provider_acquisition_base_v3_16_21(uuid,uuid,uuid,integer)','EXECUTE')
      ,'rosterChunkSnapshot',(SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'
          AND prosecdef
          AND pg_get_functiondef(oid) LIKE '%instrument_roster_chunk_snapshot_v3_16_21%'
          AND pg_get_functiondef(oid) NOT LIKE '%public.resolve_legacy_instrument_symbol_authority_v3_13(%'
          AND pg_get_functiondef(oid) LIKE '%public.resolve_legacy_instrument_symbol_authority_v3_13_internal(%'
        FROM pg_proc WHERE oid=
          'public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)'::regprocedure)
        AND NOT has_function_privilege('service_role',
          'public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)','EXECUTE')
      ,'projectionEvaluationSupersession',(SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'
          AND prosecdef
          AND pg_get_functiondef(oid) LIKE '%projection_same_producer_nondeterminism%'
          AND pg_get_functiondef(oid) LIKE '%projection_evaluation_time_conflict%'
        FROM pg_proc WHERE oid='public.guard_legacy_radar_projection_insert_v3_13()'::regprocedure)
        AND NOT has_function_privilege('service_role',
          'public.guard_legacy_radar_projection_insert_v3_13()','EXECUTE')
        AND NOT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
      ,'candidateLedgerRetention',to_regprocedure(
        'public.claim_legacy_producer_job_candidate_retention_base_v3_18(uuid,uuid,uuid,integer)') IS NOT NULL
        AND to_regprocedure(
          'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.claim_legacy_producer_job_candidate_retention_base_v3_18(uuid,uuid,uuid,integer)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
          AND pg_get_functiondef(oid) LIKE '%candidateLedgerContract%'
          AND pg_get_functiondef(oid) LIKE '%sourceAvailable%'
          FROM pg_proc WHERE oid=
            'public.claim_legacy_producer_job_candidate_retention_base_v3_18(uuid,uuid,uuid,integer)'::regprocedure)
        AND NOT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
      ,'candidateRetentionAuthority',to_regprocedure(
          'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)') IS NOT NULL
        AND has_function_privilege('service_role',
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)','EXECUTE')
        AND NOT has_function_privilege('service_role',
          'public.claim_legacy_producer_job_candidate_authority_base_v3_19_10(uuid,uuid,uuid,integer)','EXECUTE')
        AND (SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' AND prosecdef
          AND pg_get_functiondef(oid) LIKE '%candidateAuthorityContract%'
          AND pg_get_functiondef(oid) LIKE '%legacy_candidate_discovery_ledger_v3_11%'
          AND pg_get_functiondef(oid) LIKE '%candidate_retention_authority_conflict%'
          FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)
        AND NOT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
      ,'releaseReconciliation',to_regclass('public.legacy_release_checkpoints_v3_19') IS NOT NULL
        AND to_regprocedure('public.read_legacy_release_checkpoints_v3_19()') IS NOT NULL
        AND has_function_privilege('service_role','public.read_legacy_release_checkpoints_v3_19()','EXECUTE')
        AND NOT has_table_privilege('service_role','public.legacy_release_checkpoints_v3_19','INSERT')
        AND to_regclass('public.legacy_source_sync_cursors_v3_19') IS NOT NULL
        AND to_regprocedure('public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)') IS NOT NULL
        AND position('legacy_source_sync_cursors_v3_19' IN pg_get_functiondef(
          'public.read_legacy_discovery_authority_v3_11(uuid,text,text)'::regprocedure))>0
        AND position('v319_same_run_successor_conflict' IN pg_get_functiondef(
          'public.schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)'::regprocedure))>0
        AND NOT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
      ,'decisionRevisionDossierProjection',position('researchDossier' IN pg_get_functiondef(
          'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
        AND position('dossierId' IN pg_get_functiondef(
          'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
        AND position('decision_revision_projection_mismatch' IN pg_get_functiondef(
          'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure))>0
        AND (SELECT pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef
          FROM pg_proc WHERE oid=
            'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure)
        AND NOT has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE')
      ,'evaluationSchemaCompatibility',(SELECT
          position('legacy-radar-v3.13.0' IN pg_get_constraintdef(constraint_row.oid))>0
          AND position('legacy-radar-v3.14.0' IN pg_get_constraintdef(constraint_row.oid))>0
          AND position('legacy-radar-v3.17.0' IN pg_get_constraintdef(constraint_row.oid))>0
          AND position('legacy-radar-v3.18.0' IN pg_get_constraintdef(constraint_row.oid))>0
          AND position('legacy-radar-v3.19.0' IN pg_get_constraintdef(constraint_row.oid))>0
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid=
            'public.legacy_decision_revision_evaluations_v3_13'::regclass
          AND constraint_row.conname='legacy_evaluation_schema_v314_check'
          AND constraint_row.contype='c')
        AND NOT has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE')
      ,'reusedAcquisitionLineage',to_regprocedure(
          'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)') IS NOT NULL
        AND position('providerAcquisitions' IN pg_get_functiondef(
          'public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure))>0
        AND position('coarseProviderAcquisition' IN pg_get_functiondef(
          'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)'::regprocedure))>0
        AND position('providerAcquisition' IN pg_get_functiondef(
          'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)'::regprocedure))>0
        AND NOT has_function_privilege('service_role',
          'public.resolve_legacy_provider_acquisition_lineage_v3_19_7_internal(uuid)','EXECUTE')
        AND NOT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE')
    ) result`)).rows[0]?.result;
    if(!verified||Object.values(verified).some((value)=>value!==true))throw new Error('migration_postcondition_failed');
    return Object.freeze({protocol:'source-led-opportunity-v3-reviewed-migration-result-v1',
      sourceCommit:options.sourceCommit,attestationCommit:options.attestationCommit,
      orderedChainSha256:plan.chainSha256,migrations:plan.migrations.map(({relativePath,sha256})=>[relativePath,sha256]),
      supersededMigrations:Object.freeze(supersededMigrations),verified});
  } finally {
    if(locked)try{await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");}
      catch{/* session close releases the lock */}
    await client.end();
  }
}

if(import.meta.url===`file://${process.argv[1]}`) {
  applyReviewedMigrations(parseArguments(process.argv.slice(2)))
    .then((result)=>process.stdout.write(`${canonicalJson(result)}\n`))
    .catch(()=>{process.stderr.write('reviewed V3 migration apply failed\n');process.exitCode=1;});
}

export { MIGRATIONS, applyReviewedMigrations, parseArguments, reviewedMigrationIsSuperseded,
  reviewedMigrationPlan };
