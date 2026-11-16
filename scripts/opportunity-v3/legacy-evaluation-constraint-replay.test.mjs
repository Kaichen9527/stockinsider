import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  V314_ACTIONABILITY_MIGRATION, lockInstalledV320EvaluationCheck, preserveV320EvaluationCheck, verifyV320EvaluationCheck,
} from './legacy-evaluation-constraint-replay.mjs';
import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';

const labels=[13,14,17,18,19,20].map(v=>"'legacy-radar-v3."+v+".0'::text");
const definition="CHECK (((source_led_correctness ->> 'schema'::text) = ANY (ARRAY["+labels.join(', ')+"])))";
const laterPaths=[
  'migrations/20260828_legacy_evaluation_schema_v3_19_6.sql',
  'migrations/20260828_kol_first_runtime_recovery_v3_20.sql',
];
const load=relativePath=>({relativePath,bytes:fs.readFileSync(relativePath)});
const catalog=(...results)=>{
  const calls=[];
  return {calls,async query(sql) {
    calls.push(sql);
    if(sql.startsWith('LOCK TABLE'))return {};
    assert.match(sql,/AND c\.convalidated AND NOT c\.connoinherit/u);
    const value=results.shift();
    return {rows:value?[value]:[]};
  }};
};

test('only an installed validated v3.20 definition acquires a table lock and must retain its OID',async()=>{
  const existing={definition,oid:'1337'};
  const exact=catalog(existing,existing,existing);
  assert.equal(await lockInstalledV320EvaluationCheck(exact),'1337');
  await verifyV320EvaluationCheck(exact,'1337');
  assert.equal(exact.calls.filter(sql=>sql.startsWith('LOCK TABLE')).length,1);
  for(const older of [null,{...existing,definition:definition.replace(", "+labels.at(-1),'')},{...existing,definition:'CHECK (true)'}]) {
    const other=catalog(older);
    assert.equal(await lockInstalledV320EvaluationCheck(other),null);
    assert.equal(other.calls.length,1);
  }
  await assert.rejects(lockInstalledV320EvaluationCheck(catalog(existing,{...existing,oid:'1338'})),
    /legacy_evaluation_v320_checkpoint_changed/u);
});

test('keep only the existing evaluation check while retaining other reviewed DDL and v3.19.6 validation',()=>{
  const old=preserveV320EvaluationCheck(load(V314_ACTIONABILITY_MIGRATION));
  assert.match(old,/AND NOT \(constraint_value\.conrelid='public\.legacy_decision_revision_evaluations_v3_13'::regclass/u);
  assert.match(old,/ADD CONSTRAINT legacy_revision_id_v314_check/u);
  assert.doesNotMatch(old,/ADD CONSTRAINT legacy_evaluation_schema_v314_check/u);
  const mid=preserveV320EvaluationCheck(load(laterPaths[0]));
  assert.match(mid,/DO \$v3196_evaluation_schema_assertions\$/u);
  const latest=preserveV320EvaluationCheck(load(laterPaths[1]));
  assert.match(latest,/ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_failure_code_check/u);
  for(const sql of [mid,latest])
    assert.doesNotMatch(migrationBodyInAtomicTransaction(sql),/(?:ADD CONSTRAINT|DROP CONSTRAINT IF EXISTS) legacy_evaluation_schema_v314_check/u);
  assert.equal(preserveV320EvaluationCheck({relativePath:'other.sql',bytes:Buffer.from('SELECT 1;')}),'SELECT 1;');
  const changed=load(V314_ACTIONABILITY_MIGRATION);
  changed.bytes=Buffer.concat([changed.bytes,Buffer.from('\n')]);
  assert.throws(()=>preserveV320EvaluationCheck(changed),/legacy_evaluation_replay_source_changed/u);
});
