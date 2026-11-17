import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const file='scripts/opportunity-v3/apply-reviewed-migrations.mjs';
test('reviewed installer retains the approved wrapper targets and permits only the explicit isolated restore seam',()=>{
 let original=fs.readFileSync('scripts/opportunity-v3/fixtures/financial-installation/wrapper-baseline.mjs.txt','utf8');
 assert.equal(createHash('sha256').update(original).digest('hex'),'f55cabc90924ba6ecb59609df957acb60b936d853b816bb932549f478a7580a4');
 const first="FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'::regprocedure)";
 const firstStart=original.indexOf("      ,'finalClaimHandoff'");const firstEnd=original.indexOf("      ,'partialResume'",firstStart);const firstChunk=original.slice(firstStart,firstEnd);
 assert.equal(firstChunk.split(first).length,2);original=original.slice(0,firstStart)+firstChunk.replace(first,"FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_kol_authority_v3_20(uuid,uuid,uuid,integer)'::regprocedure)")+original.slice(firstEnd);
 const start=original.indexOf("      ,'v320KolRetentionBridge'");const end=original.indexOf("      ,'v320KolClaimPayloadCompaction'",start);const chunk=original.slice(start,end);
 const second="FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)";
 assert.equal(chunk.split(second).length,2);original=original.slice(0,start)+chunk.replace(second,"FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)'::regprocedure)")+original.slice(end);
 const compStart=original.indexOf("      ,'v320KolClaimPayloadCompaction'");const compEnd=original.indexOf("      ,'v320KolRetentionOwnerBoundary'",compStart);const comp=original.slice(compStart,compEnd);assert.equal(comp.split("pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'").length,2);original=original.slice(0,compStart)+comp.replace("pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'","pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'")+original.slice(compEnd);
 const replaceOnce=(before,after)=>{
  assert.equal(original.split(before).length,2);
  original=original.replace(before,after);
 };
 replaceOnce("import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';",
  "import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';\nimport { historicalFinancialRestoreReplay } from './historical-financial-restore-replay.mjs';");
 replaceOnce("async function applyReviewedMigrationPlanToClient(client,plan,options,{operatorPrerequisiteExecutor=executeFinancialVpsOperatorPrerequisite}={}) {",
  `function applyReviewedMigrationPlanToClient(client,plan,options,dependencies) {
  return applyFinancialMigrationPlanToClient(client,plan,options,dependencies);
}

// Called by the isolated restored archive runner. The reviewed CLI cannot
// select this path and its source/attestation envelope is refused here.
function applyRestoredFinancialPlanToClient(client,plan,options,dependencies) {
  if(options?.financialExistingSchemaProfile!==true || options?.privateVpsPeerOperator!==true
    || options?.sourceCommit!==null || options?.attestationCommit!==null || options?.apply===true)
    throw new Error('historical_financial_restore_only');
  return applyFinancialMigrationPlanToClient(client,plan,options,dependencies,true);
}

async function applyFinancialMigrationPlanToClient(client,plan,options,{operatorPrerequisiteExecutor=executeFinancialVpsOperatorPrerequisite}={},restore=false) {`);
 replaceOnce("  let operatorAction=null;\n  try {",
  "  let operatorAction=null;\n  const replay=restore?historicalFinancialRestoreReplay(client):null;\n  try {\n    if(replay)await replay.assertRestoredBackend();");
 replaceOnce("      await client.query(migrationBodyInAtomicTransaction(migration.bytes.toString('utf8')));\n    }\n    const verified",
  "      const sql=replay?await replay.migrationSql(migration):migration.bytes.toString('utf8');\n      if(sql!==null)await client.query(migrationBodyInAtomicTransaction(sql));\n    }\n    const alreadySatisfiedMigrations=replay?await replay.verify():[];\n    const verified");
 replaceOnce("      supersededMigrations:Object.freeze(supersededMigrations),verified});",
  "      supersededMigrations:Object.freeze(supersededMigrations),\n      ...(alreadySatisfiedMigrations.length?{alreadySatisfiedMigrations}:{}),\n      ...(replay?{historicalRestoreReplay:true,productionAuthorized:false}:{}),verified});");
 replaceOnce('  reviewedMigrationPlan, applyReviewedMigrationPlanToClient };',
  '  reviewedMigrationPlan, applyReviewedMigrationPlanToClient, applyRestoredFinancialPlanToClient };');
 assert.equal(fs.readFileSync(file,'utf8'),original);
});
test('approved latest migration delegates via retained terminal wrapper and compaction owner is explicitly opportunity owner',()=>{
 const terminal=fs.readFileSync('migrations/20260911_v320_source_terminal_projection_authority.sql','utf8');
 assert.ok(terminal.includes('RENAME TO claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2'));
 assert.ok(terminal.includes("'claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2' IN pg_get_functiondef"));
 const compact=fs.readFileSync('migrations/20260830_v320_kol_claim_payload_compaction.sql','utf8');
 assert.ok(compact.includes('uuid,uuid,uuid,integer) OWNER TO opportunity_v3_rpc_owner'));
 // This is source audit, not permission to change the untouched installed predicate.
});
