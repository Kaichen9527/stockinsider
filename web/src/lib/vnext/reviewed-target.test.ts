import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewedTargetBaseline,evaluateCachedTargets} from './reviewed-target.ts';
import {reviewedValuation} from './reviewed-valuation.ts';
import {inputHash} from './policy.ts';
import {REQUIRED_SECTIONS,type Artifact,type Evidence,type Review,validateClaim} from './research.ts';
import {loadActualDiscovery} from './discovery-test-loader.mjs';
import type {getSupabaseServerClient} from '../supabase-server';
import type {command,enqueue} from './store.ts';

const publishedAt='2026-10-21T06:10:00.000Z';
const revisionId='11111111-1111-4111-8111-111111111111';
const identity={principal:'synthetic-configured-operator',role:'operator' as const};
function fixture(){
 // Synthetic structural values ONLY; these reserved fact keys are not actual
 // source receipt authority and are never sent to the DB in this source test.
 const original:Evidence[]=[80,140,180,100].map((value,index)=>({id:`synthetic-original-${index}`,key:['valuation_bear','valuation_base','valuation_bull','current_price'][index],value,unit:'TWD',period:index===3?'2026-10-21':'2026-06-30',kind:'fact',sourceTier:'official',source:'https://www.twse.com.tw/synthetic',contentHash:inputHash({index,value}),eventAt:'2026-10-21T05:30:00.000Z',availableAt:'2026-10-21T06:00:00.000Z'}));
 const claims=original.map((source,index)=>({id:index===1?'valuation:normalized_pe':`synthetic-claim-${index}`,text:'Synthetic structural source fixture; not an actual financial publication or semantic approval.',kind:'fact' as const,evidenceIds:[source.id],numeric:{key:source.key!,unit:source.unit!,period:source.period!,value:source.value as number}}));
 const artifact:Artifact={schemaVersion:'stockinsider-vnext-research-v1',model:'synthetic',modelVersion:'synthetic',inputHash:inputHash('synthetic-input'),outputHash:'',claims,sections:Object.fromEntries(REQUIRED_SECTIONS.map(section=>[section,{text:'Synthetic fixture.',claimIds:claims.map(c=>c.id),evidenceIds:original.map(e=>e.id)}])),quoteDate:'2026-10-21',valuationDate:'2026-10-21',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing']};artifact.outputHash=inputHash({...artifact,outputHash:undefined});
 const review:Review={approved:true,authorOutputHash:artifact.outputHash,modelVersion:'synthetic-distinct-review',findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:claims.map((claim,index)=>({claimId:claim.id,verdict:'supported',reason:'Synthetic exact value/unit/hash check; no real semantic truth asserted.',sources:[{id:original[index].id,contentHash:original[index].contentHash}]}))};
 return {artifact,review,original,publishedAt};
}
test('original reviewed baseline survives later target crossing while the entry valuation remains unusable',()=>{
 const input=fixture();const before=JSON.stringify(input);const baseline=reviewedTargetBaseline(input);
 assert.equal(baseline.baseline?.base,140);assert.equal(baseline.baseline?.originalPrice,100);
 const entry=reviewedValuation({...input,cutoff:'2026-10-22T06:10:00.000Z',quote:{close:150,session:'2026-10-22',source:'https://www.twse.com.tw/',adjusted:true,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null}});
 assert.equal(entry.usable,false);assert.equal(entry.valuation.base,null);assert.equal(reviewedTargetBaseline(input).baseline?.base,140);assert.equal(JSON.stringify(input),before);
});
test('missing/unreviewed/corrected original or hash mismatch cannot create a target baseline',()=>{
 const missing=fixture();missing.artifact.claims=missing.artifact.claims.filter(c=>c.numeric?.key!=='valuation_base');assert.equal(reviewedTargetBaseline(missing).baseline,null);
 const review=fixture();review.review.claimChecks[1].verdict='unsupported';assert.equal(reviewedTargetBaseline(review).baseline,null);
 const source=fixture();source.original[1].value=999;assert.equal(reviewedTargetBaseline(source).baseline,null);
 const hash=fixture();hash.review.claimChecks[1].sources[0].contentHash='f'.repeat(64);assert.equal(reviewedTargetBaseline(hash).baseline,null);
});
test('no target lifetime is inferred from qualification expiry; original invalid dates/units still fail',()=>{
 const input=fixture();const withExpiredEntry={...input,qualification:{qualified:false,expiresAt:'2026-10-21T06:12:00.000Z'}};
 assert.equal(reviewedTargetBaseline(withExpiredEntry).baseline?.base,140);
 const invalid=fixture();invalid.publishedAt='2026-10-21T04:00:00.000Z';assert.equal(reviewedTargetBaseline(invalid).baseline,null);
 const unit=fixture();unit.original[1].unit='TWD_thousands';unit.artifact.claims[1].numeric!.unit='TWD_thousands';unit.artifact.outputHash=inputHash({...unit.artifact,outputHash:undefined});unit.review.authorOutputHash=unit.artifact.outputHash;assert.equal(reviewedTargetBaseline(unit).baseline,null);
});
test('actual observer sends only configured principal and empty server scope, accepting no quote or proof selectors',async()=>{
 const calls:unknown[]=[];const observation={symbol:'2330',status:'exited',reason:'target_hit',revisionId,inputHash:inputHash('current')};
 const result=await evaluateCachedTargets(identity,{rpc:async(name,body)=>{calls.push({name,body});return {data:{policyVersion:'vnext-target-exit-v1',observations:[observation]},error:null};}});
 assert.deepEqual(calls,[{name:'vnext_target_command_v1',body:{p_principal:identity.principal,p_request:{}}}]);assert.deepEqual(result.observations,[observation]);
 await assert.rejects(()=>evaluateCachedTargets({...identity,role:'author'},{rpc:async()=>{throw Error('must not call');}}),/operator_required/);
});
test('observer rejects DB errors, extra proof flags, duplicate symbols and malformed current identities',async()=>{
 await assert.rejects(()=>evaluateCachedTargets(identity,{rpc:async()=>({data:null,error:{code:'P0001'}})}),/authority_unavailable/);
 const row={symbol:'2330',status:'deferred',reason:'target_pending_fundamental_or_source_work',revisionId,inputHash:inputHash('current')};
 for(const observations of [[{...row,approved:true}],[row,row],[{...row,symbol:2330}],[{...row,revisionId:'not-a-revision'}]])await assert.rejects(()=>evaluateCachedTargets(identity,{rpc:async()=>({data:{policyVersion:'vnext-target-exit-v1',observations},error:null})}),/receipt_invalid/);
});
test('actual discovery evaluates target exits before current context, refresh enqueue and routine rotation',async()=>{
 const {scanCachedCandidates}=loadActualDiscovery() as {scanCachedCandidates:typeof import('./discovery.ts').scanCachedCandidates};const trace:string[]=[];
 const client={from(){throw Error('exited empty scope must not read financial/price/model');}} as unknown as ReturnType<typeof getSupabaseServerClient>;
 const send:typeof command=async(_identity,action)=>{trace.push(action);return {active:[],clues:[],priceSessions:[],session:'2026-10-22'};};const admit:typeof enqueue=async()=>{trace.push('enqueue');return {jobs:[]};};
 await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now:'2026-10-22T06:10:00.000Z',targets:async()=>{trace.push('actual-server-target-RPC');return {observations:[{symbol:'2330',status:'exited',reason:'target_hit',revisionId,inputHash:inputHash('current')}]};}});
 assert.deepEqual(trace,['actual-server-target-RPC','screen-context']);
});
test('SQL target candidate recomputes no-newer revision/input/work and original/current rights atomically',()=>{
 const sql=readFileSync(new URL('../../../../migrations/20261022_vnext_target_exit_v1.sql',import.meta.url),'utf8');
 for(const fragment of ["PERFORM pg_advisory_xact_lock(64221022)","public.vnext_target_current_v1(r->>'symbol'","vnext_target_current_authority_required","pending.state IN('queued','running','authored','reviewing')","(newer.published_at,newer.revision_id)>(pub.published_at,pub.revision_id)","public.vnext_input_sources_current_v1(frozen,p_symbol)","verified_financial_inputs_changed","new_permitted_original_content","published_claim_or_period_changed","(price->'quote'->>'raw_close')::numeric<base"])assert.ok(sql.includes(fragment),fragment);
 assert.ok(!sql.includes("proof->>'qualified'"));assert.ok(!sql.includes("expiresAt')::timestamptz<statement_timestamp"));assert.ok(!sql.includes('verified_quote_value_changed'));
});
test('SQL source profile preserves one original function body and only finite declared read edges',()=>{
 const sql=readFileSync(new URL('../../../../migrations/20261022_vnext_target_exit_v1.sql',import.meta.url),'utf8');const profile=JSON.parse(readFileSync(new URL('../../../../scripts/opportunity-v3/vnext-target-exit-profile-v1.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(sql).digest('hex'),profile.migrationSha256);assert.equal(profile.nativeVerified,false);assert.equal(profile.routines[0].predecessorBodySha256,'47a8d220420b10ac931118262032aac74bc66e94d437d9ac381ad3ab50226074');assert.equal(profile.readEdges.length,50);
 assert.ok(sql.includes("vnext_target_unapproved_catalog_delta"));assert.ok(sql.includes("vnext_target_core_metadata_changed"));assert.ok(sql.includes("vnext_target_action_interval")||sql.includes('target_action_interval_evidence_incomplete'));assert.ok(!/GRANT ALL|CREATE ROLE|BYPASSRLS/u.test(sql));
});
test('finite dimensionless multiplier preserves the original per-share output unit',()=>{
 const evidence:Evidence[]=[{id:'eps',key:'quarterly_diluted_eps',value:10,unit:'TWD_per_share',period:'2026-06-30',kind:'fact',sourceTier:'official',source:'https://www.twse.com.tw/synthetic',contentHash:'a'.repeat(64),eventAt:publishedAt,availableAt:publishedAt},{id:'pe',key:'pe_multiple',value:20,unit:'dimensionless',period:'2026-06-30',kind:'fact',sourceTier:'official',source:'https://www.twse.com.tw/synthetic',contentHash:'b'.repeat(64),eventAt:publishedAt,availableAt:publishedAt}];
 const claim={id:'synthetic-derived',text:'Synthetic arithmetic source gap, not real valuation.',kind:'derived' as const,evidenceIds:['eps','pe'],numeric:{key:'valuation_base',unit:'TWD_per_share',period:'2026-06-30',value:200,formula:{operation:'multiply' as const,evidenceIds:['eps','pe']}}};
 assert.deepEqual(validateClaim(claim,evidence),[]);
});
test('original action tuple/hash and exact UTC fractional timestamp semantics have fixed reference vectors',()=>{
 const source=readFileSync(new URL('../tw-entry-plan-authority.ts',import.meta.url),'utf8');
 const body=/function canonicalPgTimestamp\(value: unknown\) \{[\s\S]*?\n\}/u.exec(source)![0].replace('(value: unknown)','(value)').replace('digits: string','digits');
 // Execute the unchanged original small formatter, not an alternative production codec.
 const canonical=new Function('text','timestamp','requireAuthority',`return (${body});`)((v:unknown)=>typeof v==='string'?v:'',(v:string)=>Date.parse(v),(ok:unknown)=>{if(!ok)throw Error('original timestamp rejected');}) as (value:string)=>string;
 assert.equal(canonical('2026-10-22T06:00:00.120000+00:00'),'2026-10-22T06:00:00.12+00:00');assert.equal(canonical('2026-10-22T06:00:00.000000+00:00'),'2026-10-22T06:00:00+00:00');assert.equal(canonical('2026-10-22T06:00:00.123456+00:00'),'2026-10-22T06:00:00.123456+00:00');
 const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const rowHash=hash(['corporate-action-source-row-v3.1','TWSE','2026-10-22','2408','ex_right_dividend',100,99,'twse:twt49u:v1']);assert.equal(rowHash,'36cfbf5993af1f74137e1ee21a37407df5c8f989158cc41cb917941b271aef1d');
 const feeds=[['twse:twt49u:v1',123,'a'.repeat(64),1],['twse:twtauu:v1',10,'b'.repeat(64),0],['twse:twtb8u:v1',10,'c'.repeat(64),0]];
 assert.equal(hash(['corporate-action-snapshot-v3.1','TWSE','2026-10-22',revisionId,'tw-corporate-action-v3.1','twse',canonical('2026-10-22T06:00:00.120000+00:00'),feeds,[['2408','ex_right_dividend',100,99,'twse:twt49u:v1',rowHash]]]),'6e32117f35dacfe9e32c827743df2ddecb7e489a4f9c8f6e789558bd65b3bc2d');
 const sql=readFileSync(new URL('../../../../migrations/20261022_vnext_target_exit_v1.sql',import.meta.url),'utf8');assert.ok(sql.includes('target_action_hash_or_numeric_codec_unavailable'));assert.ok(sql.includes('target_original_quote_hash_or_numeric_codec_unavailable'));
});

test('actual cached quote TWD permits explicit per-share scenario aliases, never financial flow units',()=>{
 for(const priceUnit of ['TWD_per_share','TWD/share']){const value=fixture();for(let i=0;i<3;i++){value.original[i].unit=priceUnit;value.artifact.claims[i].numeric!.unit=priceUnit;}value.artifact.outputHash=inputHash({...value.artifact,outputHash:undefined});value.review.authorOutputHash=value.artifact.outputHash;assert.equal(reviewedTargetBaseline(value).baseline?.base,140);}
 const flow=fixture();for(let i=0;i<3;i++){flow.original[i].unit='TWD_million';flow.artifact.claims[i].numeric!.unit='TWD_million';}flow.artifact.outputHash=inputHash({...flow.artifact,outputHash:undefined});flow.review.authorOutputHash=flow.artifact.outputHash;assert.equal(reviewedTargetBaseline(flow).baseline,null);
});
