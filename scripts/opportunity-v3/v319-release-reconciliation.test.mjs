import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { reviewedMigrationIsSuperseded } from './apply-reviewed-migrations.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(name)=>require(path.join(root,'scripts/runtime',name));

test('V3.19 release state advances once per closed checkpoint and cannot skip runtime identity',()=>{
  const {createReleaseStateV319,advanceReleaseStateV319,releaseStateDigestV319}=runtime('release-state-v319.js');
  const evidence=(kind, digit)=>({kind,sha256:String(digit).repeat(64)});
  const identity={commitSha:'a'.repeat(40),treeSha:'b'.repeat(40),runtimeManifestSha256:null,migrationLevel:null};
  let state=createReleaseStateV319({evidence:evidence('workspace_audit','1'),releaseIdentity:identity});
  state=advanceReleaseStateV319(state,{phase:'contract_passed',evidence:evidence('contract_review','2'),releaseIdentity:identity});
  state=advanceReleaseStateV319(state,{phase:'implementation_reviewed',evidence:evidence('exact_review','3'),releaseIdentity:identity});
  assert.throws(()=>advanceReleaseStateV319(state,{phase:'web_deployed',evidence:evidence('deploy','4')}),/transition invalid/u);
  assert.throws(()=>advanceReleaseStateV319(state,{phase:'runtime_staged',evidence:evidence('runtime_stage','4'),releaseIdentity:identity}),
    /runtime release identity required/u);
  const staged={...identity,runtimeManifestSha256:'c'.repeat(64),migrationLevel:'release-reconciliation-v3.19'};
  state=advanceReleaseStateV319(state,{phase:'runtime_staged',evidence:evidence('runtime_stage','4'),releaseIdentity:staged});
  assert.match(releaseStateDigestV319(state),/^[0-9a-f]{64}$/u);
});

test('V3.19 disk policy fails closed below the reviewed capacity floor without deleting artifacts',()=>{
  const {assessRuntimeDiskPolicy}=runtime('runtime-disk-policy-v319.js');
  const {canonicalJson}=runtime('codec.js');
  const policyPath=path.join(root,'config/runtime/artifact-retention-v3.19.json');
  const policyText=readFileSync(policyPath,'utf8');
  assert.equal(policyText,`${canonicalJson(JSON.parse(policyText))}\n`,
    'the installed doctor reads this policy through the canonical-file trust boundary');
  const reviewedPolicy=JSON.parse(policyText);
  assert.equal(reviewedPolicy.minimumFreeBytes,30*1024**3,
    'the release plan requires a real 30 GiB hard floor, not an undocumented higher gate');
  assert.equal(reviewedPolicy.warningFreeBytes,32*1024**3,
    'capacity between 30 and 32 GiB remains observable as a warning without blocking recovery');
  const policy={schema:'stockinsider-artifact-retention-v3.19.0',sourceAuditMaxBytes:1000,sourceAuditRetentionDays:14,
    minimumFreeBytes:100,warningFreeBytes:200};
  const health=assessRuntimeDiskPolicy({policy,runtimeRoot:root,sourceAuditRoot:null,
    statfs:()=>({bavail:1,bsize:64})});
  assert.equal(health.status,'fail');
  assert.deepEqual(health.reasons,['disk_capacity_low']);
});

test('V3.19 readiness gives every candidate one visibility lane without treating missing authority as avoid',()=>{
  const {deriveResearchReadinessV319}=runtime('research-readiness-v319.js');
  const missing=deriveResearchReadinessV319({decisionEnvelope:{userAction:'unavailable',valuationReadiness:'missing',
    blockers:['data_required_for_formal_decision']},researchRanking:{rankingScore:76,coverage:.8,
      missingAxes:['valuation'],softBlockers:[]},technicalState:'at_support'});
  assert.equal(missing.status,'data_needed');
  assert.notEqual(missing.reason,'known_overvaluation');
  const near=deriveResearchReadinessV319({decisionEnvelope:{userAction:'unavailable',valuationReadiness:'complete',
    blockers:['formal_authority_pending']},researchRanking:{rankingScore:76,coverage:.8,missingAxes:[],softBlockers:[]},
    technicalState:'normal'});
  assert.equal(near.status,'near_action');
  const waiting=deriveResearchReadinessV319({decisionEnvelope:{userAction:'wait_reclaim',valuationReadiness:'complete',
    blockers:['support_must_be_reclaimed']},researchRanking:{rankingScore:74,coverage:.9,missingAxes:[],softBlockers:[]},
    technicalState:'reclaim_required'});
  assert.equal(waiting.status,'wait_condition');
});

test('V3.19 release reconciliation migration is additive, private and in the reviewed chain',()=>{
  const migration=readFileSync(path.join(root,'migrations/20260823_release_reconciliation_v3_19.sql'),'utf8');
  const apply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/legacy_release_checkpoints_v3_19[\s\S]*BEFORE UPDATE OR DELETE/u);
  assert.match(migration,/read_legacy_release_checkpoints_v3_19\(\)[\s\S]*SECURITY DEFINER/u);
  assert.match(migration,/REVOKE ALL ON TABLE public[.]legacy_release_checkpoints_v3_19 FROM PUBLIC, anon, authenticated, service_role/u);
  assert.match(migration,/legacy_source_sync_cursors_v3_19/u);
  assert.match(migration,/source_document_high_water_revision_id uuid NOT NULL/u);
  assert.match(migration,/\(d\.recorded_at,d\.revision_id\)>coalesce\(/u,
    'a timestamp-only cursor could skip a same-batch source revision');
  assert.match(migration,/ORDER BY revision\.recorded_at DESC,revision\.revision_id DESC/u,
    'cursor writes must preserve the revision-ID tiebreaker');
  assert.match(migration,/v319_source_cursor_predecessor_conflict/u);
  assert.match(migration,/v319_same_run_successor_conflict/u);
  assert.match(migration,/persisted[.]disposition='new_revision'[\s\S]*legacy_frozen_source_revisions_v3_11/u);
  assert.doesNotMatch(migration,/DELETE FROM public[.]legacy_frozen_source_revisions_v3_11/u);
  assert.match(apply,/20260823_release_reconciliation_v3_19[.]sql/u);
  assert.match(apply,/20260827_runtime_diagnostic_contract_v3_19_1[.]sql/u);
  assert.match(apply,/'releaseReconciliation'[\s\S]*read_legacy_release_checkpoints_v3_19/u);
  assert.match(apply,/'v319_same_run_successor_conflict'[\s\S]*schedule_legacy_source_shard_successor_v3_19/u,
    'the production postcondition must inspect the successor scheduler that owns the guard');
  assert.doesNotMatch(apply,/'v319_same_run_successor_conflict'[\s\S]{0,240}complete_legacy_producer_job/u,
    'completion functions do not own the same-run successor guard');
  assert.match(apply,/const v3192Superseded=await reviewedMigrationIsSuperseded\([\s\S]*for\(const migration of plan[.]migrations\)/u,
    'successor authority must be frozen before older migrations can replace the inspected function');
});

test('V3.19.4 reviewed replay skips only V3.19.2 after the stronger V3.19.3 contract is installed',async()=>{
  const queries=[];
  const client={query:async(sql)=>{queries.push(sql);return {rows:[{superseded:true}]};}};
  assert.equal(await reviewedMigrationIsSuperseded(client,
    'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql'),true);
  assert.equal(queries.length,1);
  assert.match(queries[0],/jsonb_typeof\(v_item#>''\{bundle,json,researchDossier\}''\)/u);
  assert.match(queries[0],/decision_revision_identity_conflict/u);
  assert.equal(await reviewedMigrationIsSuperseded(client,
    'migrations/20260827_runtime_diagnostic_contract_v3_19_1.sql'),false);
  assert.equal(queries.length,1,'unrelated migrations cannot be skipped');
});

test('V3.19.1 runtime diagnostic contract preserves projection conflicts',()=>{
  const migration=readFileSync(path.join(root,
    'migrations/20260827_runtime_diagnostic_contract_v3_19_1.sql'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/legacy_runtime_failure_diagnostics_v3_14_invariant_code_check/u);
  assert.match(migration,/'projection_supersession_conflict'/u);
  assert.match(migration,/BEGIN;[\s\S]*COMMIT;/u);
});

test('V3.19.2 compares compact landing cards with full detail revisions without dropping dossiers',()=>{
  const migration=readFileSync(path.join(root,
    'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql'),'utf8');
  const apply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/complete_legacy_producer_job_authoritative_v3_19/u);
  assert.match(migration,/\(value#>'\{bundle,json\}'\)-'researchDossier'/u);
  assert.match(migration,/v_old_count<>1 OR v_new_count<>0/u);
  assert.match(migration,/owner\.rolname='opportunity_v3_rpc_owner'/u);
  assert.match(migration,/REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner/u);
  assert.match(apply,/20260827_decision_revision_dossier_projection_v3_19_2[.]sql/u);
  assert.match(apply,/'decisionRevisionDossierProjection'/u);
});

test('V3.19.3 validates bound dossier identities with the worker cyclic fields removed',()=>{
  const migration=readFileSync(path.join(root,
    'migrations/20260828_decision_revision_identity_dossier_v3_19_3.sql'),'utf8');
  const apply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.match(migration,/v3193_decision_identity_contract/u);
  assert.match(migration,/'dossierId'/u);
  assert.match(migration,/'decisionRevisionId'/u);
  assert.match(apply,/20260828_decision_revision_identity_dossier_v3_19_3[.]sql/u);
});

test('V3.19.6 admits every supported compact evaluation schema without reopening CREATE',()=>{
  const migration=readFileSync(path.join(root,
    'migrations/20260828_legacy_evaluation_schema_v3_19_6.sql'),'utf8');
  const apply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/legacy_evaluation_schema_v314_check/u);
  for(const version of ['3.13.0','3.14.0','3.17.0','3.18.0','3.19.0']) {
    assert.match(migration,new RegExp(`legacy-radar-v${version.replaceAll('.', '[.]')}`,'u'));
  }
  assert.match(migration,/REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner/u);
  assert.match(migration,/v3196_evaluation_schema_contract_unavailable/u);
  assert.match(apply,/20260828_legacy_evaluation_schema_v3_19_6[.]sql/u);
  assert.match(apply,/'evaluationSchemaCompatibility'/u);
});

test('V3.19.7 binds reused frozen acquisitions to the current immutable job graph',()=>{
  const migration=readFileSync(path.join(root,
    'migrations/20260828_reused_acquisition_lineage_v3_19_7.sql'),'utf8');
  const apply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/resolve_legacy_provider_acquisition_lineage_v3_19_7_internal/u);
  assert.match(migration,/result[.]result_json->'providerAcquisitions'/u);
  assert.match(migration,/result[.]result_json->'coarseProviderAcquisition'/u);
  assert.match(migration,/result[.]result_json->'providerAcquisition'/u);
  assert.match(migration,/revision[.]evidence_root=referenced[.]reference->>'evidenceRoot'/u);
  assert.match(migration,/revision[.]normalized_payload_sha256=referenced[.]reference->>'normalizedPayloadSha256'/u);
  assert.match(migration,/REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner/u);
  assert.match(apply,/20260828_reused_acquisition_lineage_v3_19_7[.]sql/u);
  assert.match(apply,/'reusedAcquisitionLineage'/u);
});
