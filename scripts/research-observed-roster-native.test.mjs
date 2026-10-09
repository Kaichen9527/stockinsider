import test from 'node:test';
import {createHash}from 'node:crypto';
import {researchCanonicalHash}from '../web/src/lib/research-agent-qualification.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyLocalInboxDataPlane} from './research-local-inbox-dataplane.mjs';
import {prepareObservedRosterAdmission} from '../web/src/lib/research-observed-roster.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'docs/research/2026-10-08-discovery-live');
const body={legacyClassification:JSON.parse(fs.readFileSync(path.join(directory,'observed-security-classification.json'))),securityScope:JSON.parse(fs.readFileSync(path.join(directory,'official-security-scope-reconciliation.json')))};
const enabled=process.env.RESEARCH_LOCAL_DATAPLANE_VERIFY==='enabled';
test('real guarded1978 observed admission, concurrent replay, ACL and PostgreSQL restart',{skip:!enabled&&'explicit isolated profile not enabled',timeout:120000},async t=>{
 const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedRoster:true,observedPriority:true,check:(name,fn)=>t.test(name,fn),
  afterBaseline:async({sql,post,rpc,origin,apiOrigin,report,restart,priorityRequest})=>{
   const result=prepareObservedRosterAdmission(body);const old=JSON.stringify(body.legacyClassification);let receipt;
   const dbCanonical=sql(`SELECT public.research_observed_canonical_json_v1('${result.canonicalPacket.replaceAll("'","''")}'::jsonb)`);
   if(dbCanonical!==result.canonicalPacket){let i=0;while(dbCanonical[i]===result.canonicalPacket[i])i++;throw Error('canonical_mismatch_at_'+i+':'+JSON.stringify([dbCanonical.slice(i-30,i+50),result.canonicalPacket.slice(i-30,i+50)]));}
   const verify=(name,fn)=>t.test(name,fn);
   const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
   for(const [name,mutate]of [
    ['sector',p=>{p.payload.members[0].sector='forged-sector';}],
    ['listingDate',p=>{p.payload.members[0].listingDate='1900/01/01';}],
    ['TPEXsourceSection',p=>{p.payload.members.find(m=>m.exchange==='TPEX').sourceSection='invented section';}],
    ['excludedSymbolReason',p=>{p.payload.excluded[0].symbol='9999';p.payload.excluded[0].reason='invented exclusion';}],
    ['observedAfterRecordedMicrosecond',p=>{p.request.securityScope.recordedAt='2026-10-08T12:21:15.657942+00:00';}],
    ['missingRecordedAt',p=>{delete p.request.securityScope.recordedAt;}],
    ['infiniteRecordedAt',p=>{p.request.securityScope.recordedAt='infinity';}],
   ])await verify(`direct service RPC rejects ${name} despite recomputed trusted-content labels`,async()=>{
    const packet=JSON.parse(result.canonicalPacket);mutate(packet);packet.payload.classificationHash=researchCanonicalHash({members:packet.payload.members,excluded:packet.payload.excluded});
    const bytes=canonical(packet);const hash=createHash('sha256').update(bytes).digest('hex');
    const response=await rpc('admit_research_observed_roster_v1',{p_snapshot_hash:hash,p_canonical_packet:bytes});
    assert.notEqual(response.status,200,`direct RPC accepted ${name}`);
   });
   await verify('unauthenticated observed endpoint401 and malformed authenticated packet400',async()=>{
    const r=await fetch(origin+'api/internal/research-observed-roster',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,401);
    const bad=await post('api/internal/research-observed-roster',{...body,trusted:true});assert.equal(bad.status,400);
   });
   await verify('1978 real HTTP admission and four simultaneous exact replays have one immutable snapshot',async()=>{
    const responses=await Promise.all(Array.from({length:4},()=>post('api/internal/research-observed-roster',body)));for(const r of responses)assert.equal(r.status,200);
    const receipts=await Promise.all(responses.map(r=>r.json()));assert.equal(receipts.filter(r=>!r.receipt.idempotentReplay).length,1);receipt=receipts[0].receipt;
    assert.equal(receipt.includedCount,1978);assert.equal(receipt.excludedCount,10);assert.equal(receipt.snapshotHash,result.snapshotHash);
    assert.equal(sql('SELECT count(*) FROM research_observed_companies_v1'),'1978');assert.equal(sql('SELECT count(*) FROM research_observed_roster_members_v1'),'1978');assert.equal(sql('SELECT count(*) FROM research_observed_roster_snapshots_v1'),'1');
    assert.equal(JSON.stringify(body.legacyClassification),old);report.observedReceipt=receipt;
   });
   await verify('service/anonymous direct observed table access and mutation denied',async()=>{
    for(const table of ['research_observed_companies_v1','research_observed_roster_members_v1','research_observed_roster_snapshots_v1']){
     assert.equal(sql(`SELECT has_table_privilege('service_role','${table}','INSERT') OR has_table_privilege('service_role','${table}','UPDATE') OR has_table_privilege('service_role','${table}','DELETE') OR has_table_privilege('anon','${table}','SELECT')`),'f');
     assert.throws(()=>sql(`UPDATE ${table} SET ${table==='research_observed_companies_v1'?'issuer_name=issuer_name':table==='research_observed_roster_members_v1'?'observed_name=observed_name':'canonical_packet=canonical_packet'}`),/immutable/);
     assert.throws(()=>sql(`DELETE FROM ${table}`),/immutable/);
     const r=await fetch(apiOrigin+table+'?select=*');assert.equal(r.status,401);
    }
   });
   await verify('RPC wrong hash and altered canonical bytes reject without new identities',async()=>{
    const bad=await rpc('admit_research_observed_roster_v1',{p_snapshot_hash:'a'.repeat(64),p_canonical_packet:result.canonicalPacket});assert.notEqual(bad.status,200);
    const altered=await rpc('admit_research_observed_roster_v1',{p_snapshot_hash:result.snapshotHash,p_canonical_packet:result.canonicalPacket+' '});assert.notEqual(altered.status,200);
    assert.equal(sql('SELECT count(*) FROM research_observed_roster_snapshots_v1'),'1');
   });
   await verify('future source and secret packet rejected, original receivedAt survives restart/replay',async()=>{
    const future=structuredClone(body);future.securityScope.sources[0].observedAt='2027-01-01T00:00:00Z';assert.equal((await post('api/internal/research-observed-roster',future)).status,400);
    assert.equal((await post('api/internal/research-observed-roster',{...body,authorization:'Bearer synthetic-boundary-probe'})).status,400);
    restart();let response;for(let i=0;i<15;i++){response=await post('api/internal/research-observed-roster',body);if(response.status===200)break;await new Promise(r=>setTimeout(r,100));}assert.equal(response.status,200);const replay=(await response.json()).receipt;assert.equal(replay.receivedAt,receipt.receivedAt);assert.equal(replay.mappingDigest,receipt.mappingDigest);assert.equal(replay.idempotentReplay,true);
   });
   await verify('formal stock/authority/publication/profile rows untouched, priority stillformal409',async()=>{
    for(const table of ['stocks','stock_instruments_v3','stock_sector_assignments_v3',...report.readOnlyDependencyTables])assert.equal(sql(`SELECT count(*)FROM ${table}`),'0');
    const r=await post('api/internal/research-priority-run',{...priorityRequest,assessments:[]});assert.equal(r.status,409);
   });
   report.observedChecks=13;report.observedResearchOnlyIdentities=1978;report.optionalFormalMappings=0;
  }});
 assert.equal(report.passed,true);assert.equal(report.observedChecks,13);
});
