/** RPC/real preparation/normalizer source contracts. External DB and original
 * values are synthetic here; native permission/COMMIT is not claimed. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readCurrentForecasts} from './forecast-current.ts';
import {freezeFinancialPreparation} from './preparation-reconciliation.ts';
import {normalizeWorkerAuthor,normalizeWorkerReview} from './worker-output.ts';
import {inputHash} from './policy.ts';import {REQUIRED_SECTIONS,type Evidence} from './research.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-10-23T01:00:00.000Z',identity={principal:'synthetic-configured-author',role:'author' as const};
function fixture(){
 const e:Evidence={id:`forecast:${id(1)}:${id(2)}`,key:'source_quarterly_diluted_eps_estimate',value:3.2,unit:'TWD_per_share',period:'2027-01-01/2027-03-31',contentHash:'a'.repeat(64),source:'https://issuer.example.com/public-guidance',sourceTier:'public',kind:'assumption',eventAt:'2026-10-22T01:00:00.000Z',availableAt:at};
 const r={schemaVersion:'vnext-forecast-source-receipt-v1',stockId:id(3),symbol:'2409',evidenceHash:inputHash(e),classification:'source_estimate_not_reported_or_fair_value',verificationId:id(2),revisionId:id(4),sourceHash:'b'.repeat(64),publisherAuthorityId:id(5),sourceAuthorityId:id(6),policyId:id(7),manifestHash:'c'.repeat(64),estimateKind:'analyst_estimate',estimateHorizon:'next_twelve_months',shareBasis:'source_diluted_eps_denominator_not_supplied',denominatorShares:null,annualEps:null,nextFourQuarterEps:null};
 const data={schemaVersion:'vnext-current-forecasts-v1',stockId:id(3),symbol:'2409',asOf:at,evidence:[e],receipts:[r],gaps:['forecast_annual_and_four_quarter_share_basis_unavailable']};const calls:unknown[]=[];
 const client={rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data,error:null};}} as unknown as Parameters<typeof readCurrentForecasts>[0];return {data,e,r,calls,client};
}
test('actual current reader sends only authenticated execution IDs and preserves exact numeric source period',async()=>{
 const f=fixture(),before=JSON.stringify(f.data),r=await readCurrentForecasts(f.client,identity,id(8),id(9));assert.deepEqual(f.calls,[{name:'vnext_forecast_read_v1',args:{p_principal:identity.principal,p_job:id(8),p_execution:id(9)}}]);assert.equal(r.evidence[0].value,3.2);assert.equal(r.evidence[0].period,'2027-01-01/2027-03-31');assert.equal(JSON.stringify(f.data),before);r.evidence[0].value=99;assert.equal(f.data.evidence[0].value,3.2);
});
test('wrong role fails before RPC; DB refusal has no legacy or all-null fallback',async()=>{
 const f=fixture();await assert.rejects(()=>readCurrentForecasts(f.client,{...identity,role:'operator'},id(8),id(9)),/author_execution/);assert.deepEqual(f.calls,[]);
 await assert.rejects(()=>readCurrentForecasts({rpc:async()=>({error:{message:'source revoked'},data:null})} as unknown as typeof f.client,identity,id(8),id(9)),/current_source_unavailable/);
});
test('unknown receipt fields, crossissuer, wrong hash, timestamp and NTM relabelling reject',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{Object.assign(f.r,{validated:true});},(f:ReturnType<typeof fixture>)=>{f.r.symbol='2383';},(f:ReturnType<typeof fixture>)=>{f.r.evidenceHash='d'.repeat(64);},(f:ReturnType<typeof fixture>)=>{f.e.availableAt='2099-01-01T00:00:00Z';},(f:ReturnType<typeof fixture>)=>{f.r.estimateHorizon='target_12m';},(f:ReturnType<typeof fixture>)=>{f.e.key='ntm_eps';}]){const f=fixture();mutate(f);await assert.rejects(()=>readCurrentForecasts(f.client,identity,id(8),id(9)),/forecast_(current|horizon)/);}
});
test('same preparation projection freezes originals/receipts and changes its hash when source changes, never reported EPS',async()=>{
 const f=fixture(),r=await readCurrentForecasts(f.client,identity,id(8),id(9));const sources={evidence:[] as Evidence[],receipts:[],deferredCount:0,deferredDigest:inputHash([]),deferredDetails:[],deferredDetailsTruncated:false,gaps:[]};const history={notEntryAuthority:true as const,nextSessionAuthority:false as const,completedSessions:[],bars:[],priceBasis:null,sourceDatasetRevision:'synthetic',availableAt:at,missingData:['synthetic_price_gap']};
 const original={hash:inputHash('synthetic admission'),evidence:[],gaps:[]};const p=freezeFinancialPreparation(original,history,sources,at,r);assert.deepEqual(p.evidence.forecastSourceReceipts,r.receipts);assert.equal(p.evidence.evidence[0].kind,'assumption');assert.equal(p.evidence.evidence[0].sourceTier,'public');assert.equal(p.evidence.evidence[0].key,'source_quarterly_diluted_eps_estimate');assert.equal(JSON.stringify(original),JSON.stringify({hash:inputHash('synthetic admission'),evidence:[],gaps:[]}));
 const changed=structuredClone(r);changed.evidence[0].value=3.3;assert.notEqual(freezeFinancialPreparation(original,history,sources,at,changed).inputHash,p.inputHash);assert.throws(()=>freezeFinancialPreparation(original,history,sources,'2026-10-22T00:00:00Z',r),/future_snapshot/);
});
test('real author and independent review normalizers consume frozen original estimates; relabelling as reported/annual/4Q fails',async()=>{
 const f=fixture(),r=await readCurrentForecasts(f.client,identity,id(8),id(9));const h=inputHash(r.evidence);const claims=[{id:'source-forecast',text:'Synthetic source estimates EPS3.2 for the exact quarter; unknown denominator prevents annual or forward4Q aggregation. This is not a reported fact.',kind:'assumption' as const,evidenceIds:[f.e.id],numeric:{key:f.e.key!,value:3.2,unit:f.e.unit!,period:f.e.period!}}];
 const raw={sections:Object.fromEntries(REQUIRED_SECTIONS.map(k=>[k,{text:'Synthetic source estimate with explicit period/share/data gaps, not an actual model execution.',claimIds:['source-forecast'],evidenceIds:[f.e.id]}])),claims,quoteDate:'2026-10-22',valuationDate:'2026-10-22',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing','quote_authority_missing']};const a=normalizeWorkerAuthor(raw,{model:'synthetic-author',modelVersion:'synthetic'},h,r.evidence);
 const review={approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:[{claimId:'source-forecast',verdict:'supported',reason:'Synthetic independent role compares original numeric metadata value/unit/period/hash, not real semantic approval.',sources:[{id:f.e.id,contentHash:f.e.contentHash}]}]};assert.equal(normalizeWorkerReview(review,'synthetic-distinct-reviewer',a,r.evidence).approved,true);
 for(const mutant of [{...raw,annualEps:3.2},{...raw,nextFourQuarterEps:3.2},{...raw,claims:[{...claims[0],kind:'fact'}]}])assert.throws(()=>normalizeWorkerAuthor(mutant,{model:'synthetic',modelVersion:'synthetic'},h,r.evidence),/invalid/);
});
test('a legitimate 12month source price target stays distinct from fair value and EPS',async()=>{
 const f=fixture();f.e.key='source_target_price_12m';f.e.value=140;f.e.period='2026-10-22/2027-10-21';f.r.evidenceHash=inputHash(f.e);f.r.estimateKind='broker_consensus';f.r.estimateHorizon='target_12m';f.r.shareBasis='not_applicable_price_target';const r=await readCurrentForecasts(f.client,identity,id(8),id(9));assert.equal(r.evidence[0].value,140);assert.equal(r.receipts[0].annualEps,null);assert.equal(r.receipts[0].nextFourQuarterEps,null);assert.equal(r.receipts[0].classification,'source_estimate_not_reported_or_fair_value');
});

test('original civil quarter, verification identity and scalar magnitude cannot be relabelled at transport',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.e.period='2027-02-01/2027-04-30';},(f:ReturnType<typeof fixture>)=>{f.e.period='2027-02-30/2027-03-31';},(f:ReturnType<typeof fixture>)=>{f.r.verificationId=id(99);},(f:ReturnType<typeof fixture>)=>{f.e.value=1e22;},(f:ReturnType<typeof fixture>)=>{f.e.source='https://user:password@issuer.example.com/forecast';}]){const f=fixture();mutate(f);f.r.evidenceHash=inputHash(f.e);await assert.rejects(()=>readCurrentForecasts(f.client,identity,id(8),id(9)));}
});
