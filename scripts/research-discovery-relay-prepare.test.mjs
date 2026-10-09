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

const scope=()=>read('official-security-scope-reconciliation.json');
const current='2026-10-08T13:00:00Z';
const expanded=(s=scope())=>{const v=fixture();return prepareDiscoveryRelay(v[0],v[1],v[2],current,v[3],s);};
test('RC01 observed1978 keeps old1946 immutable; innovation31 and restricted-CFI3673 are research observations only',()=>{
 const before=JSON.stringify(fixture()[2]),p=expanded();
 assert.equal(p.observationUniverse.length,1978);assert.equal(p.observationUniverse.filter(r=>r.sourceSection==='創新板').length,31);
 assert.equal(p.observationUniverse.find(r=>r.symbol==='3673').cfi,'ESVTFR');
 assert.ok(p.observationUniverse.every(r=>r.pricePhase==='unknown'));assert.equal(p.top20,null);assert.equal(p.trustedCandidateUniverse,false);
 assert.equal(JSON.stringify(fixture()[2]),before);assert.equal(prepare(fixture()).observationUniverse.length,1946);
});
test('RC02 four-digit TDR9136 excluded, never infer ordinary scope by code/name suffix',()=>{
 const p=expanded();assert.equal(p.excludedNonCommon.length,10);assert.ok(p.excludedNonCommon.some(r=>r.symbol==='9136'));
 assert.ok(!p.observationUniverse.some(r=>r.symbol==='9136'));
 const s=scope();s.rows.find(r=>r.symbol==='9136').classification='ordinary_equity_research_candidate';assert.throws(()=>expanded(s));
});
test('RC03 preferred/warrant and forged ES outside stock/innovation section rejected',()=>{
 for(const edit of [r=>r.cfi='EPVUFR',r=>r.cfi='DAVUFR',r=>r.sourceSection='特別股',r=>r.sourceSection='權證']){const s=scope();edit(s.rows[0]);assert.throws(()=>expanded(s));}
});
test('RC04 exact original TWSE/TPEX clock split and large raw reference preserved without VM raw hash claim',()=>{
 const e=expanded().classificationEvidence;assert.equal(e.sourceReferences[0].responseBytes,9063029);assert.equal(e.sourceReferences[0].observedAt,'2026-10-08T12:21:15.657943+00:00');
 assert.equal(e.sourceReferences[1].observedAt,'2026-10-08T09:04:35.607658+00:00');assert.equal(e.rawSourceHashesVerifiedByVm,false);
});
test('RC05 only fixed CFI raw reference can exceed4MB, selected input/bounds/secret validation unchanged',()=>{
 let s=scope();s.sources[0].url='https://example.org/C_public.jsp?strMode=2';assert.throws(()=>expanded(s));
 s=scope();s.sources[0].bytes=12000001;assert.throws(()=>expanded(s));
 s=scope();s.sources[0].headers={authorization:'Bearer synthetic-boundary-probe-value'};assert.throws(()=>expanded(s),/forbidden/);
 const v=fixture();v[2].sources[0].responseBytes=9063029;assert.throws(()=>prepare(v));
});
test('RC06 duplicate/count/future-nanosecond/legacy-binding mutations fail closed',()=>{
 for(const edit of [s=>s.rows[1]=s.rows[0],s=>s.counts.twseOrdinaryResearchCandidates++,s=>s.recordedAt='2026-10-08T13:00:00.000000001Z',s=>s.rows[0].isin='not-original']){const s=scope();edit(s);assert.throws(()=>expanded(s));}
});
test('RC07 actual expanded cohort controller consumes3same-root industry summaries, restart dedup zero new',async()=>{
 const p=expanded(),first=await executeSourceController(p.controllerInput,{now:()=>current});
 assert.equal(first.inboxRequest.items.length,3);assert.ok(first.inboxRequest.items.every(i=>i.symbols.length===0));
 const second=await executeSourceController({...p.controllerInput,priorItems:first.inboxRequest.items},{now:()=>current});
 assert.equal(second.inboxRequest.items.length,0);assert.equal(second.receipts.filter(r=>r.outcome==='duplicate').length,3);
});

test('RC08 configured Gooaye provider IDs match the actual publisher relay, without enabling platforms',()=>{
 const publisher=read('podcast-publisher-observation.json').observations.find(r=>r.url==='https://linktr.ee/gooaye');
 const source=readFileSync(new URL('../web/src/lib/research-v2.ts',import.meta.url),'utf8');
 const block=source.slice(source.indexOf("displayName: '股癌'"),source.indexOf("displayName: '麥克風"));
 const apple=/appleUrl: '([^']+)'/.exec(block)[1],spotify=/spotifyUrl: '([^']+)'/.exec(block)[1];
 assert.equal(new URL(apple).pathname.split('/').at(-1),new URL(publisher.links.appleShow).pathname.split('/').at(-1));
 assert.equal(spotify,publisher.links.spotifyShow);assert.ok(publisher.limits.some(v=>v.includes('not listened/transcribed')));
});
