import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
  assert.match(apply,/'releaseReconciliation'[\s\S]*read_legacy_release_checkpoints_v3_19/u);
});
