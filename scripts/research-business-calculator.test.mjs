import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildModel as auoModel, loadInputs as loadAuo } from '../docs/research/2026-10-08-auo-four-segment-model/recompute.mjs';
import { buildModel as emcModel, loadInputs as loadEmc } from '../docs/research/2026-10-08-emc-company-model/recompute.mjs';
import { recalculateResearchBusinessScenarios, businessCalculatorExecutionHash } from '../web/src/lib/research-business-calculator.ts';

const clock = new Date().toISOString();
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const hashes = value => createHash('sha256').update(value).digest('hex');
async function packet(company) {
  const prefix = `docs/research/2026-10-08-${company}-model/`;
  const original = JSON.parse(await readFile(prefix+'model-results.json','utf8'));
  const inputs = await (company === 'auo-four-segment' ? loadAuo() : loadEmc());
  const recomputed = company === 'auo-four-segment' ? auoModel(...inputs.values, original.asOf, inputs.context) : emcModel(...inputs.values.slice(0,3),original.asOf,...inputs.values.slice(3));
  assert.equal(recomputed.canonicalHash,original.canonicalHash);
  const model = {...recomputed,inputManifest:inputs.manifest};
  // Actual current local relay-artifact read; this is not its original web
  // acquisition time or a formal DB admission. Output remains unsealed.
  const observations = [];
  for (const source of model.inputManifest) {
    const raw = await readFile(source.file);assert.equal(raw.length,source.bytes);assert.equal(hashes(raw),source.sha256);
    observations.push({sourceArtifactHash:source.sha256,observationHash:hashes(JSON.stringify({file:source.file,sha256:source.sha256,locallyReadAt:clock})),observedAt:clock,admittedAt:clock,publication:{precision:'unknown',value:null}});
  }
  const auo = company === 'auo-four-segment';
  const common = q => ({period:q.period,shares:{openingOrdinaryMillion:q.ordinaryWeightedSharesMillionAssumed,issuedOrdinaryMillion:0,fractionOutstanding:0,potentialAwardsMillion:q.potentialWeightedSharesMillionAssumed},taxRate:0,taxFloor:0,nci:q.nonControllingNetProfit});
  const scenarios=model.scenarios.map(s=>({id:s.id,quarters:s.quarters.map(q=>{
    const c={...common(q),taxRate:s.assumptions.taxRate,taxFloor:auo?s.assumptions.taxFloor:0};
    return auo?{...c,segments:q.segments.map(x=>({key:x.key,revenue:x.revenue,grossMargin:x.grossMarginAssumed,operatingMargin:x.operatingMarginAssumed})),interestIncome:q.interestIncome,financeCosts:q.financeCosts,otherIncome:q.otherIncome,equityMethodProfit:q.equityMethodProfit,fxAndOtherRecurring:q.fxAndOtherRecurring}
    :{...c,revenue:q.revenue,grossMargin:q.grossMarginAssumed,opexRatio:q.opexRatioAssumed,bankInterest:q.interestBreakdown.bankInterestAssumed,financeCost:q.interestBreakdown.financeCostAssumed,fx:q.interestBreakdown.fxAssumed,otherGainsExFx:q.interestBreakdown.otherGainsExFxAssumed};
  })}));
  return {model,input:{schemaVersion:'business-scenarios-v2',calculatorId:auo?'auo_four_segment_v1':'emc_ccl_v1',symbol:model.symbol,unit:'TWD_million',originalModelCutoff:model.asOf,researchCutoff:clock,latestReportedQuarter:'2026Q2',observations,scenarios}};
}
const auo=await packet('auo-four-segment'),emc=await packet('emc-company');
for (const [name,fixture]of[['AUO',auo],['EMC',emc]]) {
 for (let i=0;i<3;i++)test(`${name} ${fixture.model.scenarios[i].id}: re-execute six real reviewed quarter bridges and forward/year EPS`,()=>{
  const r=recalculateResearchBusinessScenarios(fixture.input,clock),s=r.scenarios[i],old=fixture.model.scenarios[i];
  for(let k=0;k<6;k++)for(const f of ['revenue','grossProfit','operatingExpenses','operatingProfit','nonOperating','pretaxProfit','taxExpense','netProfit','ownersNetProfit','dilutedEpsConditional'])near(s.quarters[k][f],old.quarters[k][f]);
  near(s.nextFourUnreported.dilutedEpsConditional,old.nextFourUnreported.dilutedEpsConditional);
  near(s.fullForecastYears[0].dilutedEpsConditional,old.calendar2027.dilutedEpsConditional);
  assert.deepEqual(s.partialYears,['2026']);assert.equal(s.calendarActualPlusForecast.status,'incomplete');
  assert.equal(r.publishableResearch,false);assert.equal(r.calculationAuthority,'unsealed_calculation_only');
 });
 test(`${name}: original immutable input files match byte/hash manifest`,()=>assert.ok(fixture.input.observations.length>0));
}
test('AUO Other and jurisdiction tax floor survive; EMC signed NCI and FX separate',()=>{
 const a=recalculateResearchBusinessScenarios(auo.input,clock).scenarios[0].quarters[0];assert.equal(a.segments[3].key,'other');assert.ok(a.pretaxProfit<0&&a.taxExpense>0);assert.equal(a.antiDilutiveExcludedMillion,a.potentialWeightedSharesMillionAssumed);
 const e=recalculateResearchBusinessScenarios(emc.input,clock).scenarios[1].quarters[0];near(e.ownersNetProfit,e.netProfit+1);near(e.nonOperating,Object.values(e.nonOperatingBreakdown).reduce((x,y)=>x+y,0));
});
test('loss/zero excludes potential while actual hypothetical ordinary issuance retains period weight',()=>{
 const input=structuredClone(emc.input),q=input.scenarios[0].quarters[0];q.revenue=0;q.nci=0;q.taxRate=0;q.bankInterest=0;q.otherGainsExFx=0;q.financeCost=-100;q.fx=0;
 q.shares={openingOrdinaryMillion:10,issuedOrdinaryMillion:4,fractionOutstanding:.25,potentialAwardsMillion:2};
 let r=recalculateResearchBusinessScenarios(input,clock).scenarios[0].quarters[0];assert.equal(r.dilutedSharesMillionAssumed,11);assert.equal(r.antiDilutiveExcludedMillion,2);near(r.dilutedEpsConditional,-100/11);
 q.financeCost=0;r=recalculateResearchBusinessScenarios(input,clock).scenarios[0].quarters[0];assert.equal(r.potentialIncludedMillion,0);
 q.bankInterest=100;r=recalculateResearchBusinessScenarios(input,clock).scenarios[0].quarters[0];assert.equal(r.dilutedSharesMillionAssumed,13);near(r.dilutedEpsConditional,100/13);
});
for(const [name,change]of[
 ['arbitrary calculator path',x=>x.calculatorId='../../secret.mjs'],['request command',x=>x.command='touch /tmp/never-run'],['supplied EPS',x=>x.scenarios[0].quarters[0].dilutedEps=100],['qualification',x=>x.strategyApproved=true],
 ['wrong company',x=>x.symbol='2383'],['unit',x=>x.unit='TWD_thousands'],['missing Other',x=>x.scenarios[0].quarters[0].segments.pop()],['duplicate period',x=>x.scenarios[0].quarters[1].period='2026Q3'],['nonfinite margin',x=>x.scenarios[0].quarters[0].segments[0].grossMargin=Infinity],['bad finance sign',x=>x.scenarios[0].quarters[0].financeCosts=1],['issuance weight',x=>x.scenarios[0].quarters[0].shares.fractionOutstanding=1.1],
 ['unknown publication instant',x=>x.observations[0].publication.value='2026-01-01T00:00:00Z'],['fake February date',x=>x.observations[0].publication={precision:'date',value:'2026-02-30'}],['duplicate receipt',x=>x.observations.push(structuredClone(x.observations[0]))],['future nanos',x=>x.researchCutoff=clock.slice(0,19)+'.999999999Z'],['observed after admitted',x=>x.observations[0].observedAt='2027-01-01T00:00:00Z'],['future reported quarter',x=>x.latestReportedQuarter='2027Q1'],
])test(`reject ${name}`,()=>{const input=structuredClone(auo.input);change(input);assert.throws(()=>recalculateResearchBusinessScenarios(input,clock));});
test('nanosecond observation/admission inversion rejects without millisecond truncation',()=>{const x=structuredClone(auo.input);x.observations[0].admittedAt='2026-10-08T07:00:00.000000001Z';x.observations[0].observedAt='2026-10-08T07:00:00.000000002Z';assert.throws(()=>recalculateResearchBusinessScenarios(x,clock));});
test('date-only remains a date with no synthetic publication instant',()=>{const x=structuredClone(auo.input);x.observations[0].publication={precision:'date',value:'2026-07-30'};const r=recalculateResearchBusinessScenarios(x,clock);assert.deepEqual(r.observations[0].publication,x.observations[0].publication);});
test('core hash, input hash and result hash bind deterministic recalculation',()=>{const a=recalculateResearchBusinessScenarios(auo.input,clock),b=recalculateResearchBusinessScenarios(auo.input,clock);assert.equal(a.resultHash,b.resultHash);assert.equal(a.executionCodeHash,businessCalculatorExecutionHash());const x=structuredClone(auo.input);x.scenarios[0].quarters[0].segments[0].revenue+=1;const c=recalculateResearchBusinessScenarios(x,clock);assert.notEqual(c.inputHash,a.inputHash);assert.notEqual(c.resultHash,a.resultHash);});
test('accessor/prototype objects and large packets cannot supply executable behavior',()=>{const x=structuredClone(auo.input);Object.defineProperty(x,'unit',{get(){throw new Error('getter executed');},enumerable:true});assert.throws(()=>recalculateResearchBusinessScenarios(x,clock),/calculator_invalid/);const y=structuredClone(auo.input);Object.setPrototypeOf(y,{command:'untrusted'});assert.throws(()=>recalculateResearchBusinessScenarios(y,clock));const z=structuredClone(auo.input);z.observations[0].observationHash='x'.repeat(170000);assert.throws(()=>recalculateResearchBusinessScenarios(z,clock));});
