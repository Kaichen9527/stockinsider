/** Execute the actual weekly composition with a closed synthetic transport.
 * No PG/HTTP/model, ACL, lease, real source or semantic acceptance claim. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {readActiveForecasts} from '../web/src/lib/vnext/forecast-active.ts';
import {auditThesisCycle} from '../web/src/lib/vnext/thesis-cycle.ts';
import {currentEvidenceFromFacts} from '../web/src/lib/vnext/thesis-audit.ts';
import {inputHash} from '../web/src/lib/vnext/policy.ts';
const ts=createRequire(new URL('../web/package.json',import.meta.url))('typescript');
const at='2026-10-23T01:00:00.000Z',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function lab({drift=false,sourceError=false,stockDrift=false}={}){
 const evidence={id:`forecast:${id(1)}:${id(2)}`,key:'source_quarterly_diluted_eps_estimate',value:3.2,unit:'TWD_per_share',period:'2027-01-01/2027-03-31',contentHash:'a'.repeat(64),source:'https://issuer.example.com/public-guidance',sourceTier:'public',kind:'assumption',eventAt:'2026-10-22T01:00:00.000Z',availableAt:at};
 const receipt={schemaVersion:'vnext-forecast-source-receipt-v1',stockId:id(3),symbol:'2409',evidenceHash:inputHash(evidence),classification:'source_estimate_not_reported_or_fair_value',verificationId:id(2),revisionId:id(4),sourceHash:'b'.repeat(64),publisherAuthorityId:id(5),sourceAuthorityId:id(6),policyId:id(7),manifestHash:'c'.repeat(64),estimateKind:'analyst_estimate',estimateHorizon:'next_twelve_months',shareBasis:'source_diluted_eps_denominator_not_supplied',denominatorShares:null,annualEps:null,nextFourQuarterEps:null};
 const forecast={schemaVersion:'vnext-current-forecasts-v1',stockId:id(3),symbol:'2409',asOf:at,evidence:[evidence],receipts:[receipt],gaps:['forecast_annual_and_four_quarter_share_authority_missing']};
 const member={symbol:'2409',inputHash:'d'.repeat(64),evidence:{},publication:null},trace=[],records=[];
 const client={from(table){trace.push({table});const response={data:table==='stocks'?[{id:stockDrift?id(99):id(3),symbol:'2409'}]:[],error:null};const chain={then:resolve=>Promise.resolve(response).then(resolve)};for(const method of ['select','eq','in','lte','or','order'])chain[method]=()=>chain;chain.limit=async()=>response;return chain;},rpc(name,args){trace.push({rpc:name,args});if(name==='read_financial_facts_for_stocks_as_of')return {limit:async()=>({data:[],error:null})};assert.equal(name,'vnext_forecast_active_read_v1');return Promise.resolve({data:{schemaVersion:'vnext-active-forecasts-v1',asOf:at,members:[{symbol:member.symbol,inputHash:drift?'e'.repeat(64):member.inputHash,forecast}]},error:sourceError?{message:'synthetic revoked'}:null});}};
 const modules={
  './cached-price-factors.ts':{historicalPriceFactors(){throw Error('unexpected price computation');},currentPriceEvidence(){throw Error('unexpected price projection');}},
  './thesis-runtime.ts':{async thesisCommand(identity,action,body){trace.push({action});if(action==='context')return {members:[member]};if(action==='source-current')return {valid:[]};assert.equal(action,'record');records.push(body);return {reviewed:body.reports.length};}},
  './forecast-active.ts':{readActiveForecasts},'./thesis-cycle.ts':{auditThesisCycle},'./thesis-audit.ts':{currentEvidenceFromFacts},
  './analysis-runtime.ts':{analysisWriter:work=>work(),analysisCommand:async()=>({})},'../supabase-server.ts':{getSupabaseServerClient:()=>client},'./calendar-sync.ts':{synchronizeCachedCalendar:async()=>({})},
  './store.ts':{command:async()=>({session:'2026-10-23',priceSessions:[],market:{risk:'unknown'}})},'../tw-entry-plan-authority.ts':{loadTwEntryHistoricalPriceAuthority(){throw Error('unexpected historical reader');}}
 };
 const filename='web/src/lib/vnext/weekly-worker.ts',source=fs.readFileSync(filename,'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:filename}).outputText;const output={exports:{}};
 vm.compileFunction(compiled,['exports','require','module'],{filename})(output.exports,name=>{assert.ok(Object.hasOwn(modules,name),'unexpected weekly dependency '+name);return modules[name];},output);
 return {run:output.exports.runWeeklyThesisAudit,trace,records,evidence};
}
test('actual weekly composition reads server-selected current forecasts before real audit/record with unchanged scoring authority',async()=>{
 const f=lab();const result=await f.run({role:'operator',principal:'synthetic-configured-operator'});assert.equal(result.reviewed,1);assert.equal(f.records.length,1);const report=f.records[0].reports[0];assert.ok(report.materialReasons.includes('current_source_forecast_changed'));assert.deepEqual(report.materialEvidence.forecasts,[{key:f.evidence.key,value:3.2,unit:'TWD_per_share',period:f.evidence.period,source:f.evidence.source,eventAt:f.evidence.eventAt}]);assert.equal(report.materialEvidence.factCount,0);assert.equal(report.deepInputs.valuation.base,null);assert.ok(result.cacheGaps.some(g=>g.includes('forecast_annual_and_four_quarter_share_authority_missing')));assert.ok(f.trace.findIndex(e=>e.rpc==='vnext_forecast_active_read_v1')<f.trace.findIndex(e=>e.action==='record'));assert.deepEqual(f.trace.find(e=>e.rpc==='vnext_forecast_active_read_v1').args,{p_principal:'synthetic-configured-operator'});assert.equal(f.trace.some(e=>['claim','prepare','reserve'].includes(e.action)),false);
});
test('actual membership race or source refusal stops before caches/record and wrong role stops before all IO',async()=>{
 for(const options of [{drift:true},{sourceError:true}]){const f=lab(options);await assert.rejects(()=>f.run({role:'operator',principal:'synthetic-configured-operator'}),/vnext_forecast_(membership_changed|active_source_unavailable)/u);assert.equal(f.records.length,0);assert.equal(f.trace.some(e=>e.table),false);}
 const f=lab();await assert.rejects(()=>f.run({role:'author',principal:'synthetic-configured-author'}),/operator_required/);assert.deepEqual(f.trace,[]);
});

test('actual weekly composition rejects source/roster stock identity crosswire before recording an audit',async()=>{
 const f=lab({stockDrift:true});await assert.rejects(()=>f.run({role:'operator',principal:'synthetic-configured-operator'}),/vnext_forecast_issuer_binding/u);assert.equal(f.records.length,0);assert.equal(f.trace.some(e=>['claim','prepare','reserve','record'].includes(e.action)),false);
});
