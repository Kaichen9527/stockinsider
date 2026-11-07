/** Pure isolated SSR of the ACTUAL component + actual read validator.
 * Synthetic DB transport; no Next server, browser, socket or live source claim. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {inputHash} from '../../../lib/vnext/policy.ts';
import {readPublishedStockTarget} from '../../../lib/vnext/published-target-read.ts';
import {REQUIRED_SECTIONS} from '../../../lib/vnext/research.ts';
import {publicationQualificationCurrent} from '../../../lib/vnext/public-contract.ts';
import {publicCitation} from '../../../lib/vnext/citations.ts';
const require=createRequire(new URL('../../../../package.json',import.meta.url));
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const source=fs.readFileSync(new URL('./Detail.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true});
assert.ok(!(compiled.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));
function fixture(){const symbol='2409',revisionId='11111111-1111-4111-8111-111111111111',publishedAt='2026-10-21T06:10:00.000Z',observedAt=new Date().toISOString();const baseline={base:140,bear:80,bull:180,unit:'TWD',quoteAt:'2026-10-21'};const content={schemaVersion:'stockinsider-vnext-research-v1',inputHash:inputHash('synthetic immutable publication'),outputHash:'',quoteDate:baseline.quoteAt,valuationDate:baseline.quoteAt,claims:[80,140,180,100].map((value,i)=>({id:'synthetic-'+i,text:'Synthetic source contract, not actual issuer or model evidence.',kind:'fact',evidenceIds:[],numeric:{key:['valuation_bear','valuation_base','valuation_bull','current_price'][i],unit:'TWD',period:i===3?baseline.quoteAt:'2026',value}})),sections:Object.fromEntries(REQUIRED_SECTIONS.map(k=>[k,{text:'Synthetic full original '+k,claimIds:[],evidenceIds:[]}])),gaps:['synthetic_source_no_financial_qualification']};content.outputHash=inputHash({...content,outputHash:undefined});const pub={revisionId,inputHash:content.inputHash,publishedAt,content,sourceRights:{current:true},citations:[]};const unsigned={schemaVersion:'vnext-per-share-target-rebase-v1',symbol,revisionId,originalBaselineHash:inputHash({...baseline,inputHash:content.inputHash,outputHash:content.outputHash}),originalInputHash:content.inputHash,originalOutputHash:content.outputHash,original:baseline,shareRatio:{numerator:'2',denominator:'1'},rebased:{base:70,bear:40,bull:90,unit:'TWD_per_share'},actionReceiptHashes:[inputHash('synthetic disclosed original current receipt')]};return {symbol,membership:{state:'waiting',contraindication:false,inputHash:content.inputHash},history:[pub],targetAssessment:{schemaVersion:'vnext-published-target-assessment-v1',symbol,revisionId,inputHash:content.inputHash,outputHash:content.outputHash,publishedAt,observedAt,result:{status:'below_target',originalBaseline:baseline,rebasing:{...unsigned,receiptHash:inputHash(unsigned)},currentPrice:{value:69,session:'2026-10-22',observationId:'22222222-2222-4222-8222-222222222222'}}}};}
async function render(data,revision,now=new Date().toISOString()){const calls=[],out={};const modules={
 'react/jsx-runtime':require('react/jsx-runtime'),'next/link':require('next/link'),
 '@/lib/vnext/store':{readPublished:async symbol=>{calls.push(symbol);return readPublishedStockTarget({rpc:async(name,args)=>{assert.equal(name,'vnext_read_v1');assert.deepEqual(args,{p_symbol:symbol});return {data,error:null};}},symbol);}},
 '@/lib/vnext/ranking-read':{rankingEnabled:()=>false,readRankingSnapshot:async()=>{throw Error('unexpected_ranking_read');}},
 '@/lib/vnext/public-contract':{publicationQualificationCurrent},
 '@/lib/vnext/citations':{publicCitation},'@/lib/vnext/research':{REQUIRED_SECTIONS}
};const load=name=>{assert.ok(Object.hasOwn(modules,name),'finite SSR import only: '+name);return modules[name];};const fn=vm.runInNewContext('(function(exports,require){'+compiled.outputText+'\n})',{Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}});fn(out,load);const element=await out.default({symbol:'2409',revision});const html=renderToStaticMarkup(element);assert.deepEqual(calls,['2409']);return {html,React};}
test('actual component renders separate share result while preserving original140 and all sections',async()=>{const data=fixture(),before=structuredClone(data),{html}=await render(data);assert.match(html,/股數調整後每股情境/u);assert.match(html,/基準 70/u);assert.match(html,/>140 /u);assert.match(html,/原始文章與估值不變/u);assert.equal((html.match(/<main\b/gu)||[]).length,1);for(const k of REQUIRED_SECTIONS)assert.ok(html.includes('Synthetic full original '+k));assert.deepEqual(data,before);});
test('historical revision never inherits latest current rebasing',async()=>{const data=fixture();const older=structuredClone(data.history[0]);older.revisionId='33333333-3333-4333-8333-333333333333';data.history.push(older);const {html}=await render(data,older.revisionId);assert.ok(!html.includes('股數調整後每股情境'));assert.match(html,/Synthetic full original valuation/u);});
test('explicit current withdrawal displays gap, forged/stale assessment displays read error without old result',async()=>{const data=fixture();data.targetAssessment.result={status:'deferred',reason:'target_current_action_terms_incomplete'};const denied=await render(data);assert.match(denied.html,/target_current_action_terms_incomplete/u);assert.ok(!denied.html.includes('基準 70'));const forged=fixture();forged.targetAssessment.inputHash='f'.repeat(64);const bad=await render(forged);assert.match(bad.html,/研究資料暫時無法讀取/u);assert.ok(!bad.html.includes('股數調整後每股情境'));});

function qualifiedFixture(now){
 const data=fixture(),pub=data.history[0],content=pub.content;data.targetAssessment=null;
 content.modelVersion='synthetic-read-only';content.claims[1].id='valuation:normalized_pe';
 content.outputHash=inputHash({...content,outputHash:undefined});
 const fields={schemaVersion:'stockinsider-vnext-authority-proof-v1',qualified:true,inputHash:pub.inputHash,checkedAt:now,expiresAt:new Date(Date.parse(now)+120000).toISOString(),financialCoverage:{status:'complete'},priceBasis:{status:'verified'},valuation:{usable:true,gaps:[],claimIds:content.claims.map(c=>c.id),valuation:{current:100,bear:80,base:140,bull:180,method:'normalized_pe',quoteAt:content.quoteDate,valuationAt:content.valuationDate,provenance:['https://example.org/synthetic']},remainingUpside:0.4,downside:0.2,rewardRisk:2}};
 pub.qualification={...fields,proofHash:inputHash(fields)};return data;
}
test('actual detail rechecks a valid original proof at one cutoff; expiry is half open and history survives',async()=>{
 const now='2026-11-06T12:30:00.000Z',data=qualifiedFixture(now),before=structuredClone(data);
 const current=await render(data,undefined,now);assert.match(current.html,/已發布研究；進場仍須符合當前市場與個股條件/u);
 for(const cutoff of ['2026-11-06T12:32:00.000Z','2026-11-06T12:32:00.001Z','2026-11-06T12:29:59.999Z']){
  const expired=await render(data,undefined,cutoff);assert.match(expired.html,/保留歷史研究，目前不具新進場條件/u);assert.match(expired.html,/當前財務與股價資格已逾期或無法驗證/u);assert.match(expired.html,/Synthetic full original valuation/u);assert.ok(!expired.html.includes('已發布研究；進場仍須符合當前市場與個股條件'));
 }
 assert.deepEqual(data,before);
});
test('same input cannot turn an older revision or unavailable current financial context into current detail',async()=>{
 const now='2026-11-06T12:30:00.000Z',data=qualifiedFixture(now),older=structuredClone(data.history[0]);older.revisionId='33333333-3333-4333-8333-333333333333';data.history.push(older);
 const historical=await render(data,older.revisionId,now);assert.match(historical.html,/保留歷史研究，目前不具新進場條件/u);assert.match(historical.html,/Synthetic full original valuation/u);assert.ok(!historical.html.includes('已發布研究；進場仍須符合當前市場與個股條件'));
 for(const value of [undefined,null,{qualified:true}]){const missing=qualifiedFixture(now);missing.history[0].qualification=value;const html=(await render(missing,undefined,now)).html;assert.match(html,/當前財務與股價資格已逾期或無法驗證/u);assert.match(html,/Synthetic full original valuation/u);}
});
