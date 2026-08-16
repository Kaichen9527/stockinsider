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
]);

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
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");
    locked=true;
    for(const migration of plan.migrations)await client.query(migration.bytes.toString('utf8'));
    const verified=(await client.query(`SELECT jsonb_build_object(
      'v314Diagnostics',to_regclass('public.legacy_runtime_failure_diagnostics_v3_14') IS NOT NULL,
      'v314Chunks',to_regclass('public.legacy_official_ingestion_chunks_v3_14') IS NOT NULL,
      'decisionRevisions',to_regclass('public.legacy_decision_revisions_v3_13') IS NOT NULL,
      'candidateRead',to_regprocedure('public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)') IS NOT NULL,
      'projectionSelect',to_regprocedure('public.select_opportunity_public_projection_v3(timestamptz)') IS NOT NULL
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
    ) result`)).rows[0]?.result;
    if(!verified||Object.values(verified).some((value)=>value!==true))throw new Error('migration_postcondition_failed');
    return Object.freeze({protocol:'source-led-opportunity-v3-reviewed-migration-result-v1',
      sourceCommit:options.sourceCommit,attestationCommit:options.attestationCommit,
      orderedChainSha256:plan.chainSha256,migrations:plan.migrations.map(({relativePath,sha256})=>[relativePath,sha256]),
      verified});
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

export { MIGRATIONS, applyReviewedMigrations, parseArguments, reviewedMigrationPlan };
