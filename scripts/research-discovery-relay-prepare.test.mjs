import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareDiscoveryRelay } from './research-discovery-relay-prepare.mjs';
import { executeSourceController } from './research-source-controller.mjs';
const base=new URL('../docs/research/2026-10-08-discovery-live/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,base),'utf8'));
const fixture=()=>['public-source-relay.json','social-surface-observations.json','observed-security-classification.json','timed-public-source-relay.json'].map(read);
const now='2026-10-08T09:30:00.000Z';
const prepare=values=>prepareDiscoveryRelay(values[0],values[1],values[2],now,values[3]);
test('RB01 original social relay cannot export nested authorization',()=>{
  const v=fixture();v[1].headers={authorization:'Bearer synthetic-boundary-probe-value'};
  assert.throws(()=>prepare(v),/forbidden_field/);
});
test('RB02 timed public summaries require raw SHA/bytes and exact matching acquisition',()=>{
  for(const field of ['responseSha256','responseBytes']) {const v=fixture();delete v[3].sourceRows[0][field];assert.throws(()=>prepare(v));}
});
test('RB03 acquisition chain rejects inverted microseconds in the same millisecond',()=>{
  const v=fixture();v[3].sourceRows[0].attemptedAt='2026-10-08T09:18:07.785999Z';v[3].sourceRows[0].observedAt='2026-10-08T09:18:07.785001Z';
  assert.throws(()=>prepare(v));
});
test('RB04 exact corrected real relay retains three industry items, no 3037 candidate',async()=>{
  const p=prepare(fixture());const run=await executeSourceController(p.controllerInput,{now:()=>now});
  assert.equal(run.inboxRequest.items.length,3);assert.ok(run.inboxRequest.items.every(row=>row.subjectScope==='industry_context'&&row.symbols.length===0));
  assert.equal(p.observationUniverse.length,1946);assert.equal(p.top20,null);
});
test('RB05 every input plane rejects hidden credential fields and arbitrary metadata',()=>{
  for(const index of [0,1,2,3]) {const v=fixture();v[index].secret='synthetic';assert.throws(()=>prepare(v),/forbidden_field/);}
  for(const index of [0,1,2,3]) {const v=fixture();v[index].unreviewed={payload:'new field'};assert.throws(()=>prepare(v),/unknown_field/);}
  const v=fixture();v[3].attempts[0].errorType='Bearer synthetic-boundary-probe-value';assert.throws(()=>prepare(v),/secret_or_text_bound/);
});
test('RB06 independently valid hashes/bytes cannot be rebound to a different acquisition receipt',()=>{
  for(const field of ['responseSha256','responseBytes','readSurfaceUrl','attemptedAt','observedAt']) {
    const v=fixture();v[3].sourceRows[0][field]=({responseSha256:'b'.repeat(64),responseBytes:116692,readSurfaceUrl:'https://t.me/s/other',attemptedAt:'2026-10-08T09:18:05.873181Z',observedAt:'2026-10-08T09:18:07.785052Z'})[field];
    assert.throws(()=>prepare(v),/binding_invalid/);
  }
});
test('RB07 sub-millisecond completed/future clocks, invalid calendar dates and excessive precision reject',()=>{
  for(const observed of ['2026-10-08T09:30:00.000000001Z','2026-02-30T09:18:07Z','2026-10-08T09:18:07.7850510001Z']) {
    const v=fixture();v[3].sourceRows[0].observedAt=observed;assert.throws(()=>prepare(v));
  }
});
test('RB08 output receipt projects required fields and retains original acquisition attribution',()=>{
  const p=prepare(fixture());assert.equal(p.originalAcquisitionAttempts.some(row=>'rawFile' in row),false);
  const scope=p.controllerInput.scopes.find(row=>row.id==='telegram-investanchors-869');
  assert.equal(scope.publicRelay.acquisition.responseBytes,116691);
  assert.equal(scope.publicRelay.acquisition.readSurfaceUrl,'https://t.me/s/investanchors');
  assert.equal(scope.publicRelay.acquisition.responseSha256,fixture()[3].attempts[0].sha256);
});
