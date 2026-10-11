import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareObservedRosterAdmission} from './research-observed-roster.ts';
const legacy=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/observed-security-classification.json','utf8'));
const securityScope=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/official-security-scope-reconciliation.json','utf8'));
const now='2026-10-08T14:00:00Z';
const input=()=>structuredClone({legacyClassification:legacy,securityScope});
test('actual1978 ordinary scope includesinnovation/restrictedCFI and preserves10TDRexclusions',()=>{const result=prepareObservedRosterAdmission(input(),now);assert.equal(result.payload.members.length,1978);assert.equal(result.payload.excluded.length,10);assert.equal(result.payload.members.find(r=>r.symbol==='3673')!.cfi,'ESVTFR');assert.equal(result.payload.members.some(r=>r.symbol==='9136'),false);assert.equal(result.payload.researchQualified,false);assert.equal(result.payload.historicalPITEligible,false);});
test('old1946packet remains byte-identical and observation clocks stay distinct',()=>{const body=input();const before=JSON.stringify(body);const result=prepareObservedRosterAdmission(body,now);assert.equal(JSON.stringify(body),before);assert.equal(result.payload.members.find(r=>r.exchange==='TPEX')!.observedAt,'2026-10-08T09:04:35.607658+00:00');assert.equal(result.payload.members.find(r=>r.exchange==='TWSE')!.observedAt,'2026-10-08T12:21:15.657943+00:00');});
test('canonical replay independent from object insertion order',()=>{const a=prepareObservedRosterAdmission(input(),now);const b=prepareObservedRosterAdmission({securityScope,legacyClassification:legacy},now);assert.equal(a.snapshotHash,b.snapshotHash);assert.equal(a.canonicalPacket,b.canonicalPacket);});
for(const [name,mutate] of [
 ['secret',(b:ReturnType<typeof input>)=>Object.assign(b,{authorization:'Bearer synthetic-boundary-probe'})],
 ['unknown',(b:ReturnType<typeof input>)=>Object.assign(b,{trusted:true})],
 ['memberduplicate',(b:ReturnType<typeof input>)=>b.legacyClassification.members.push(b.legacyClassification.members[0])],
 ['sourcecount',(b:ReturnType<typeof input>)=>b.legacyClassification.sources[1].selectedCount++],
 ['future',(b:ReturnType<typeof input>)=>b.securityScope.sources[0].observedAt='2027-01-01T00:00:00Z'],
 ['formalflag',(b:ReturnType<typeof input>)=>b.legacyClassification.trustedAuthorityActivated=true],
 ['sourceURL',(b:ReturnType<typeof input>)=>b.legacyClassification.sources[1].url='https://attacker.invalid/'],
] as const)test(`reject ${name}`,()=>{const body=input();mutate(body);assert.throws(()=>prepareObservedRosterAdmission(body,now));});
