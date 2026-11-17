import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  evaluationConstraintReplay, diagnosticConstraintReplay, lockV320Constraint, preserveV320Constraints, verifyV320Constraint,
} from './legacy-v320-constraint-replay.mjs';
import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';

const evaluationLabels=[13,14,17,18,19,20].map(v=>"'legacy-radar-v3."+v+".0'::text");
const diagnosticLabels=['candidate_seed_membership_missing','database_constraint_rejected','provider_timeout',
  'authentication_rejected','projection_supersession_conflict','data_integrity_failure','lease_expired'].map(v=>"'"+v+"'::text");
const cases=[
  [evaluationConstraintReplay,"CHECK (((source_led_correctness ->> 'schema'::text) = ANY (ARRAY["+evaluationLabels.join(', ')+"])))",evaluationLabels],
  [diagnosticConstraintReplay,"CHECK ((invariant_code = ANY (ARRAY["+diagnosticLabels.join(', ')+"])))",diagnosticLabels],
];
const evaluationLater='migrations/20260828_legacy_evaluation_schema_v3_19_6.sql';
const laterRuntime='migrations/20260828_kol_first_runtime_recovery_v3_20.sql';
const load=relativePath=>({relativePath,bytes:fs.readFileSync(relativePath)});
const retained=(...profiles)=>new Map(profiles.map(profile=>[profile,'1337']));
const catalog=(profile,...results)=>{
  const calls=[];
  return {calls,async query(sql,params) {
    calls.push(sql);
    if(sql.startsWith('LOCK TABLE')) {
      assert.equal(sql,'LOCK TABLE '+profile.table+' IN ACCESS EXCLUSIVE MODE');
      return {};
    }
    assert.match(sql,/AND c\.convalidated AND NOT c\.connoinherit/u);
    assert.deepEqual(params,[profile.table,profile.constraint]);
    const value=results.shift();
    return {rows:value?[value]:[]};
  }};
};

for(const [profile,definition,labels] of cases) {
  test('requires the exact validated v3.20 '+profile.constraint+' and preserves its OID',async()=>{
    const existing={definition,oid:'1337'};
    const exact=catalog(profile,existing,existing,existing);
    assert.equal(await lockV320Constraint(exact,profile),'1337');
    await verifyV320Constraint(exact,profile,'1337');
    assert.equal(exact.calls.filter(sql=>sql.startsWith('LOCK TABLE')).length,1);
    for(const older of [null,{...existing,definition:definition.replace(", "+labels.at(-1),'')},{...existing,definition:'CHECK (true)'}]) {
      const other=catalog(profile,older);
      assert.equal(await lockV320Constraint(other,profile),null);
      assert.equal(other.calls.length,1);
    }
    await assert.rejects(lockV320Constraint(catalog(profile,existing,{...existing,oid:'1338'}),profile),
      /legacy_v320_constraint_checkpoint_changed/u);
  });
}

test('preserves only matched evaluation and diagnostic checks during replay',()=>{
  const both=retained(evaluationConstraintReplay,diagnosticConstraintReplay);
  const old=preserveV320Constraints(load(evaluationConstraintReplay.firstMigration),both);
  assert.match(old,/AND NOT \(constraint_value\.conrelid='public\.legacy_decision_revision_evaluations_v3_13'::regclass/u);
  assert.match(old,/ADD CONSTRAINT legacy_revision_id_v314_check/u);
  assert.doesNotMatch(old,/ADD CONSTRAINT legacy_evaluation_schema_v314_check/u);
  const middle=preserveV320Constraints(load(evaluationLater),both);
  assert.match(middle,/DO \$v3196_evaluation_schema_assertions\$/u);
  const diagnostic=preserveV320Constraints(load(diagnosticConstraintReplay.firstMigration),both);
  assert.equal(migrationBodyInAtomicTransaction(diagnostic),'SELECT 1;');
  const latest=preserveV320Constraints(load(laterRuntime),both);
  assert.match(latest,/ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_failure_code_check/u);
  assert.match(latest,/ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_failure_origin_check/u);
  assert.doesNotMatch(migrationBodyInAtomicTransaction(latest),/ADD CONSTRAINT (?:legacy_evaluation_schema_v314_check|legacy_runtime_failure_diagnostics_v3_14_invariant_code_check)/u);
  const evaluationOnly=preserveV320Constraints(load(laterRuntime),retained(evaluationConstraintReplay));
  assert.match(evaluationOnly,/ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_invariant_code_check/u);
  const diagnosticOnly=preserveV320Constraints(load(laterRuntime),retained(diagnosticConstraintReplay));
  assert.match(diagnosticOnly,/ADD CONSTRAINT legacy_evaluation_schema_v314_check/u);
  const original=load(laterRuntime);
  assert.equal(preserveV320Constraints(original,new Map()),original.bytes.toString('utf8'));
  const changed=load(diagnosticConstraintReplay.firstMigration);
  changed.bytes=Buffer.concat([changed.bytes,Buffer.from('\n')]);
  assert.throws(()=>preserveV320Constraints(changed,both),/legacy_v320_constraint_source_changed/u);
});
