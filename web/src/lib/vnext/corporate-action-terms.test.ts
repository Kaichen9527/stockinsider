/** Synthetic originals/DB transport; NOT acquired MOPS or native SQL proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {inputHash} from './policy.ts';
import {extractDisclosedActionTerms,actionTermEvidence,validateCurrentActionTerms,readCurrentActionTerms,rebasePerShareTarget,type ActionReceipt,type CurrentActionTerms} from './corporate-action-terms.ts';
import {freezeFinancialPreparation} from './preparation-reconciliation.ts';
import type {VnextIdentity} from './auth.ts';
import {REQUIRED_SECTIONS} from './research.ts';
import {normalizeWorkerAuthor,normalizeWorkerReview} from './worker-output.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-10-23T00:00:00Z';
const author:VnextIdentity={role:'author',principal:'synthetic-distinct-author'};
const body='Synthetic local engineering disclosure; not an acquired issuer document.\n😀 original\n股票代號: 2409\n生效日期: 2026-10-22\n公司行動類型: 每股面額變更\n換發前股數: 1000\n換發後股數: 2000\n每舊股現金股利: 0\n每舊股退還現金: 0\n每舊股認購價款: 0\n計價幣別: TWD';
function fixture(changedBody=body):CurrentActionTerms{
 const parsed=extractDisclosedActionTerms(changedBody);
 const unsigned={schemaVersion:'vnext-corporate-action-terms-v1' as const,stockId:id(1),symbol:parsed.symbol,event:{snapshotId:id(2),ordinal:0,session:parsed.effectiveOn,kind:parsed.kind,sourceRowRef:inputHash('synthetic exact event source ref')},source:{verificationId:id(3),revisionId:id(4),contentHash:inputHash(['synthetic title','synthetic summary',changedBody]),bodyHash:inputHash(changedBody),publisherAuthorityId:id(5),sourceAuthorityId:id(6),manifestHash:inputHash('synthetic manifest'),policyId:id(7),url:'https://mops.twse.com.tw/synthetic-original',publishedAt:'2026-10-21T00:00:00Z',knownAt:'2026-10-22T00:00:00Z'},terms:parsed.terms,spans:parsed.spans};
 const receipt:ActionReceipt={...unsigned,receiptHash:inputHash(unsigned)};
 return {schemaVersion:'vnext-current-action-terms-v1',stockId:id(1),symbol:'2409',asOf:at,receipts:[receipt],evidence:actionTermEvidence(receipt,changedBody),gaps:[]};
}
const baseline={base:140,bear:70,bull:210,unit:'TWD_per_share',quoteAt:'2026-10-20',inputHash:inputHash('immutable original input'),outputHash:inputHash('immutable reviewed article')};
test('disclosed actual shares and ALL cash fields are extracted with exact original Unicode spans',()=>{
 const p=extractDisclosedActionTerms(body);assert.equal(p.terms.oldShares,1000);assert.equal(p.terms.newShares,2000);assert.equal(p.terms.subscriptionCashPerOldShare,0);
 for(const span of Object.values(p.spans))assert.equal([...body].slice(span.startCp,span.endCp).join(''),span.quote);
 assert.ok(p.spans.oldShares.startCp<body.indexOf('換發前股數')); // astral codepoint, not UTF16 offset
 assert.equal(validateCurrentActionTerms(fixture()).evidence.length,6);
});
test('current source wire reuses1MiB/depth12 limits before accepting any receipt',()=>{
 const large={...fixture(),gaps:['x'.repeat(1048576)]};assert.throws(()=>validateCurrentActionTerms(large),/wire_bound/);
 let nested:unknown='bounded';for(let i=0;i<14;i++)nested={child:nested};assert.throws(()=>validateCurrentActionTerms({...fixture(),unknown:nested}),/json_depth/);
});
test('absent cash zero, guessed prices, duplicate labels and unsupported numeric/unit/calendar spellings fail',()=>{
 for(const changed of [body.replace('每舊股現金股利: 0\n',''),body.replace('換發前股數: 1000','前參考價: 1000'),body+'\n換發前股數: 1000',body.replace('1000','1,000'),body.replace('1000','-1000'),body.replace('1000','0'),body.replace('1000','1000.5'),body.replace('TWD','USD'),body.replace('2026-10-22','2026-02-30'),body.replace('每股面額變更','split inferred by price')])assert.throws(()=>extractDisclosedActionTerms(changed));
});
test('pure split derives a separately hashed per-share target and retains every original byte',()=>{
 const f=fixture(),before=JSON.stringify({baseline,f});const r=rebasePerShareTarget(baseline,id(8),f);assert.equal(r.status,'derived');
 if(r.status==='derived'){assert.deepEqual(r.receipt.rebased,{base:70,bear:35,bull:105,unit:'TWD_per_share'});assert.deepEqual(r.receipt.shareRatio,{numerator:'2',denominator:'1'});assert.equal(r.receipt.original.base,140);assert.equal(r.receipt.originalInputHash,baseline.inputHash);assert.equal(r.receipt.actionReceiptHashes[0],f.receipts[0].receiptHash);const {receiptHash,...unsigned}=r.receipt;assert.equal(receiptHash,inputHash(unsigned));}
 assert.equal(JSON.stringify({baseline,f}),before);
});
test('pure reverse split uses actual shares, never pre/post reference prices',()=>{
 const f=fixture(body.replace('換發後股數: 2000','換發後股數: 100'));const r=rebasePerShareTarget(baseline,id(8),f);assert.equal(r.status,'derived');if(r.status==='derived')assert.deepEqual(r.receipt.rebased,{base:1400,bear:700,bull:2100,unit:'TWD_per_share'});
});
test('cash dividends, returned cash, rights subscription or reduction need the explicit price/return decision',()=>{
 for(const changed of [body.replace('現金股利: 0','現金股利: 5'),body.replace('退還現金: 0','退還現金: 2'),body.replace('認購價款: 0','認購價款: 10'),body.replace('每股面額變更','減資')]){
  const f=fixture(changed),before=JSON.stringify(f);const r=rebasePerShareTarget(baseline,id(8),f);assert.equal(r.status,'deferred');if(r.status==='deferred')assert.equal(r.reason,'target_cash_or_rights_intent_decision_required');assert.equal(JSON.stringify(f),before);
 }
});
test('nonterminating division is a named gap rather than silently rounded target',()=>{
 const f=fixture(body.replace('換發後股數: 2000','換發後股數: 3000'));assert.equal(rebasePerShareTarget(baseline,id(8),f).status,'deferred');
});
test('current missing terms/rights remain gaps and cannot authorize a rebased target',()=>{
 const f=fixture();f.gaps=['action_current_use_permission_or_disclosed_terms_missing'];const r=rebasePerShareTarget(baseline,id(8),f);assert.equal(r.status,'deferred');if(r.status==='deferred')assert.equal(r.reason,'target_current_action_terms_incomplete');
});
test('closed receipt rejects unknown fields, crosswired issuer/period/unit/evidence and altered terms/hash',()=>{
 for(const mutate of [(f:CurrentActionTerms)=>Object.assign(f,{validated:true}),(f:CurrentActionTerms)=>{f.symbol='2383';},(f:CurrentActionTerms)=>{f.receipts[0].event.session='2026-10-20';},(f:CurrentActionTerms)=>{f.receipts[0].terms.newShares=3000;},(f:CurrentActionTerms)=>Object.assign(f.receipts[0].terms,{preReferencePrice:100}),(f:CurrentActionTerms)=>{f.evidence[0].unit='TWD';},(f:CurrentActionTerms)=>{f.evidence[0].kind='assumption';},(f:CurrentActionTerms)=>{f.receipts[0].receiptHash='f'.repeat(64);},(f:CurrentActionTerms)=>{f.receipts.push(f.receipts[0]);},(f:CurrentActionTerms)=>{f.receipts[0].source.knownAt='2099-01-01T00:00:00Z';}]){const f=fixture();mutate(f);assert.throws(()=>validateCurrentActionTerms(f));}
});
test('job-scoped actual caller chooses only configured author and original IDs; denied RPC never falls back',async()=>{
 const calls:unknown[]=[];const f=fixture();const client={rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:f,error:null};}};
 await assert.rejects(()=>readCurrentActionTerms(client,{...author,role:'operator'},id(9),id(10)),/author_execution/);assert.deepEqual(calls,[]);
 const r=await readCurrentActionTerms(client,author,id(9),id(10));assert.deepEqual(calls,[{name:'vnext_action_terms_read_v1',args:{p_principal:author.principal,p_job:id(9),p_execution:id(10)}}]);r.evidence[0].value=99;assert.equal(f.evidence[0].value,1000);
 await assert.rejects(()=>readCurrentActionTerms({rpc:async()=>({data:null,error:{code:'source_withdrawn'}})},author,id(9),id(10)),/current_source_unavailable/);
});
test('actual shared preparation freezes original terms/evidence with fresh hash, no changes to its input or old optional projection',()=>{
 const f=fixture(),original={hash:inputHash('admission'),evidence:[],gaps:[]};const before=JSON.stringify({f,original});
 const history={notEntryAuthority:true as const,nextSessionAuthority:false as const,completedSessions:[],bars:[],priceBasis:null,sourceDatasetRevision:'synthetic',availableAt:at,missingData:['synthetic_price_gap']};
 const financial={evidence:[],receipts:[],deferredCount:0,deferredDigest:inputHash([]),deferredDetails:[],deferredDetailsTruncated:false,gaps:[]};
 const frozen=freezeFinancialPreparation(original,history,financial,at,undefined,f);assert.deepEqual(frozen.evidence.actionTermsReceipts,f.receipts);assert.deepEqual(frozen.evidence.evidence,f.evidence);assert.equal(frozen.inputHash,inputHash(frozen.evidence));
 assert.notEqual(frozen.inputHash,freezeFinancialPreparation(original,history,financial,at).inputHash);assert.equal(JSON.stringify({f,original}),before);
 assert.throws(()=>freezeFinancialPreparation(original,history,financial,'2026-10-22T00:00:00Z',undefined,f),/future_snapshot/);
});
test('Taipei effective-day boundary and immutable revision are explicit',()=>{
 const f=fixture(body.replace('2026-10-22','2026-10-23'));f.asOf='2026-10-22T17:00:00Z';const r=rebasePerShareTarget(baseline,id(8),f);assert.equal(r.status,'derived');if(r.status==='derived')assert.equal(r.receipt.rebased.base,70);assert.throws(()=>rebasePerShareTarget(baseline,'arbitrary-path',f),/baseline/);
});
test('actual author/review normalizers receive full original context and finite units; synthetic support is not semantic approval',()=>{
 const f=validateCurrentActionTerms(fixture()),e=f.evidence[0],context=f.evidence[5];assert.equal((context.value as {statement:string}).statement,body);
 const claim={id:'old-shares',kind:'fact' as const,text:'The synthetic original explicitly discloses1000 old shares; the complete original context accompanies the numeric citation.',evidenceIds:[e.id,context.id],numeric:{key:e.key!,value:1000,unit:'share',period:e.period!}};
 const raw={sections:Object.fromEntries(REQUIRED_SECTIONS.map(k=>[k,{text:'Synthetic original context with exact share counts and explicit missing valuation/financial facts; no actual model or semantic approval.',claimIds:[claim.id],evidenceIds:claim.evidenceIds}])),claims:[claim],quoteDate:'2026-10-22',valuationDate:'2026-10-22',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing','quote_authority_missing']};
 const a=normalizeWorkerAuthor(raw,{model:'synthetic-author',modelVersion:'synthetic-source-contract'},inputHash(f.evidence),f.evidence);
 const review={approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:[{claimId:claim.id,verdict:'supported',reason:'Synthetic contract checks original shares plus complete original body/hash; no actual independent semantic execution.',sources:claim.evidenceIds.map(id=>({id,contentHash:f.evidence.find(e=>e.id===id)!.contentHash}))}]};
 assert.equal(normalizeWorkerReview(review,'synthetic-distinct-reviewer-contract',a,f.evidence).approved,true);
 assert.throws(()=>normalizeWorkerAuthor({...raw,claims:[{...claim,numeric:{...claim.numeric,unit:'TWD_per_share'}}]},{model:'synthetic',modelVersion:'synthetic'},inputHash(f.evidence),f.evidence),/invalid/);
 const drift=structuredClone(f);(drift.evidence[5].value as {statement:string}).statement+='!';assert.throws(()=>validateCurrentActionTerms(drift),/body_hash/);
});
test('complete evidence rejects metadata keys intentionally omitted by material hashes',()=>{
 for(const key of ['fetchedAt','collectedAt','retrievedAt','evaluatedAt'])for(const index of [0,5]){
  const f=fixture(),before=inputHash(f.evidence);Object.assign(f.evidence[index],{[key]:'UNEXPECTED_METADATA'});assert.equal(inputHash(f.evidence),before);assert.throws(()=>validateCurrentActionTerms(f),/current_evidence/);
 }
});
