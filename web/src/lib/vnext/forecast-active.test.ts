/** Synthetic transport/source contracts; no DB role or real guidance claim. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readActiveForecasts} from './forecast-active.ts';
import {auditPublishedThesis,currentEvidenceFromFacts,type ThesisAuditInput} from './thesis-audit.ts';
import {inputHash} from './policy.ts';
import type {Evidence} from './research.ts';
const at='2026-10-23T01:00:00.000Z',id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const operator={role:'operator' as const,principal:'synthetic-configured-operator'};
function vector(){
 const e:Evidence={id:`forecast:${id(1)}:${id(2)}`,key:'source_quarterly_diluted_eps_estimate',value:3.2,unit:'TWD_per_share',period:'2027-01-01/2027-03-31',contentHash:'a'.repeat(64),source:'https://issuer.example.com/public-guidance',sourceTier:'public',kind:'assumption',eventAt:'2026-10-22T01:00:00.000Z',availableAt:at};
 const receipt={schemaVersion:'vnext-forecast-source-receipt-v1',stockId:id(3),symbol:'2409',evidenceHash:inputHash(e),classification:'source_estimate_not_reported_or_fair_value',verificationId:id(2),revisionId:id(4),sourceHash:'b'.repeat(64),publisherAuthorityId:id(5),sourceAuthorityId:id(6),policyId:id(7),manifestHash:'c'.repeat(64),estimateKind:'analyst_estimate',estimateHorizon:'next_twelve_months',shareBasis:'source_diluted_eps_denominator_not_supplied',denominatorShares:null,annualEps:null,nextFourQuarterEps:null};
 const forecast={schemaVersion:'vnext-current-forecasts-v1',stockId:id(3),symbol:'2409',asOf:at,evidence:[e],receipts:[receipt],gaps:['forecast_annual_and_four_quarter_share_authority_missing']};
 const response={schemaVersion:'vnext-active-forecasts-v1',asOf:at,members:[{symbol:'2409',inputHash:'d'.repeat(64),forecast}]};
 const input:ThesisAuditInput={symbol:'2409',inputHash:'d'.repeat(64),revisionId:null,publishedInputHash:null,artifact:null,review:null,original:[e],current:[e],newContent:[],quote:{close:null,session:'2026-10-23',source:'',adjusted:false,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null},cutoff:at,market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null};
 return {e,receipt,forecast,response,input};
}
test('operator sends no chosen symbol/clock and receives cloned complete source projection',async()=>{
 const f=vector(),calls:unknown[]=[];const result=await readActiveForecasts({rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:f.response,error:null};}} as unknown as Parameters<typeof readActiveForecasts>[0],operator);
 assert.deepEqual(calls,[{name:'vnext_forecast_active_read_v1',args:{p_principal:operator.principal}}]);assert.deepEqual(result.members[0].forecast.evidence,[f.e]);result.members[0].forecast.evidence[0].value=99;assert.equal(f.e.value,3.2);
});
test('wrong role, missing installation and unknown batch/receipt/issuer/clock fail without fallback',async()=>{
 const f=vector(),client={rpc:async()=>({data:f.response,error:null})} as unknown as Parameters<typeof readActiveForecasts>[0];await assert.rejects(()=>readActiveForecasts({rpc:()=>{throw Error('unexpected IO');}} as unknown as typeof client,{...operator,role:'author'}),/operator_required/);
 await assert.rejects(()=>readActiveForecasts({rpc:async()=>({data:null,error:{message:'missing'}})} as unknown as typeof client,operator),/active_source_unavailable/);
 for(const mutate of [(v:ReturnType<typeof vector>)=>Object.assign(v.response,{approved:true}),(v:ReturnType<typeof vector>)=>v.response.members.push(v.response.members[0]),(v:ReturnType<typeof vector>)=>{v.forecast.symbol='2383';},(v:ReturnType<typeof vector>)=>{v.forecast.asOf='2026-10-23T01:00:00.001Z';},(v:ReturnType<typeof vector>)=>{v.receipt.annualEps=3.2 as unknown as null;},(v:ReturnType<typeof vector>)=>{v.response.members[0].inputHash='invalid';}]){const v=vector();mutate(v);await assert.rejects(()=>readActiveForecasts({rpc:async()=>({data:v.response,error:null})} as unknown as typeof client,operator));}
});
test('material audit detects numeric source change/first availability without upgrading assumptions or scores',()=>{
 const f=vector(),initial=auditPublishedThesis(f.input);assert.equal(initial.materialChanged,false);
 for(const changed of [{...f.e,value:3.3},{...f.e,period:'2027-04-01/2027-06-30'},{...f.e,source:'https://issuer.example.com/updated-guidance'}]){const report=auditPublishedThesis({...f.input,current:[changed]});assert.ok(report.materialReasons.includes('current_source_forecast_changed'));assert.equal(report.deepScore.availableWeight,initial.deepScore.availableWeight);assert.equal(report.deepScore.confirmedPoints,initial.deepScore.confirmedPoints);assert.equal(report.materialEvidence.factCount,0);assert.equal(report.materialEvidence.forecastCount,1);}
 assert.ok(auditPublishedThesis({...f.input,original:[]}).materialReasons.includes('current_source_forecast_changed'));
});
test('acquisition/id-only changes preserve material digest while outage is a gap, not a fabricated new value',()=>{
 const f=vector(),initial=auditPublishedThesis(f.input);const repeat=auditPublishedThesis({...f.input,current:[{...f.e,id:`forecast:${id(9)}:${id(2)}`,availableAt:'2026-10-23T01:00:00.001Z'}],cutoff:'2026-10-23T01:00:00.002Z'});assert.equal(repeat.materialHash,initial.materialHash);assert.equal(repeat.materialChanged,false);
 const missing=auditPublishedThesis({...f.input,current:[]});assert.equal(missing.materialChanged,false);assert.ok(missing.gaps.includes('original_forecast_current_authority_unavailable'));assert.equal(missing.materialEvidence.forecastCount,0);
 for(const bad of [{...f.e,kind:'fact' as const},{...f.e,unit:'TWD_million'},{...f.e,key:'annual_eps'}])assert.equal(auditPublishedThesis({...f.input,current:[bad]}).materialReasons.includes('current_source_forecast_changed'),false);
});

test('validated cache flags cannot promote estimates or unknown horizons into reported facts',()=>{
 const row={fact_id:id(8),fact_key:'quarterly_diluted_eps',value:3.2,unit:'TWD_per_share',period_end:'2027-03-31',source_ref:'synthetic-original-publication',source_timestamp:at,recorded_at:at,authority_tier:'official_filing',validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true,estimate_kind:'reported',estimate_horizon:'reported_period'};
 const accepted=currentEvidenceFromFacts([row]);assert.equal(accepted.length,1);assert.equal(accepted[0].kind,'fact');assert.equal(accepted[0].value,3.2);
 for(const mutation of [{estimate_kind:'analyst_estimate',estimate_horizon:'next_twelve_months'},{estimate_kind:'broker_consensus',estimate_horizon:'target_12m'},{estimate_kind:undefined},{estimate_horizon:undefined},{estimate_kind:'reported',estimate_horizon:'target_12m'}])assert.deepEqual(currentEvidenceFromFacts([{...row,...mutation}]),[]);
});
