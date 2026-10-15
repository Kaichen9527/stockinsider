// Test-only full original draft construction; no synthetic DB rows/RPCs.
// Body copied from articleFixture at 79fd, adapting only actual revision/context.
import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function nativeArticle(symbol,revision,set){
 const cutoff=revision.canonical_payload.clocks.researchCutoff;
 const cite=node=>Object.fromEntries([...['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash'].map(k=>[k,set.context[k]]),...['pointer','kind','value','unit','period','periodKind','classification','scenarioId'].map(k=>[k,node[k]])]);
 const draftPacket=JSON.parse(gunzipSync(fs.readFileSync(new URL('../fixtures/research-historical-cash/article-drafts-15d4.json.gz',import.meta.url))));
 const f=draftPacket.files[symbol==='2409'?0:1],bytes=Buffer.from(f.rawBase64,'base64');assert.equal(sha(bytes),f.sha256);assert.equal(bytes.length,f.bytes);const markdown=bytes.toString('utf8');
 const keys=['market_expectation','industry_position','rumors_and_orders','earnings_transmission','valuation','entry_conditions','next_evidence'];
 const [body,appendix='']=markdown.split('<details>');const sections=body.split(/^## /m);const preface=sections.shift();assert.equal(sections.length,7);
 const reference={kind:'calculation',pointer:'/scenarios/1/nextFourUnreported/dilutedEpsConditional'};
 // Preserve every source section byte (including printed Markdown table rows) in
 // bounded text chunks. These inference labels are synthetic mapping only: no
 // claim that the original text has completed citation/semantic author review.
 const articleSections=sections.map((section,i)=>{
  const at=section.indexOf('\n'),title=section.slice(0,at),text=section.slice(at+1);const chunks=[];let chunk='';
  for(const line of text.split('\n')){if(chunk.length+line.length+1>1800){chunks.push(chunk);chunk='';}chunk+=line+'\n';}if(chunk)chunks.push(chunk);
  if(chunks.at(-1).trim().length<20&&chunks.length>1)chunks[chunks.length-2]+=chunks.pop();
  assert.equal(chunks.join(''),text+'\n');return{key:keys[i],title,paragraphs:chunks.map((text,j)=>({id:`section_${i}_${j}`,text,kind:'inference',references:[reference]}))};
 });
 const article={schemaVersion:'candidate-deep-research-v3',businessModel:'business_scenarios_cash_v3',symbol,researchCompanyId:revision.research_company_id,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,authoredAt:new Date().toISOString(),evidenceCutoffAt:cutoff,summary:{id:'summary',text:preface,kind:'inference',references:[reference]},sections:articleSections,catalysts:[{name:'Synthetic contract catalyst',stage:'discussion',paragraphIds:['section_3_0'],affectedBusiness:'Original model',earliestFinancialPeriod:'2027',financialTransmission:'Synthetic mapping retains the original model and does not claim confirmed orders.',strongestCounterEvidence:'Competition, delayed validation and changed customer demand remain relevant counterevidence.',falsifier:'If customers delay validation or margins decline, revisit assumptions instead of claiming confirmation.'}],valuation:['bear','base','bull'].map((scenarioId,i)=>({scenarioId,period:i===1?'full_forecast_year':'next_four_unreported',fiscalYear:i===1?'2027':null,peMultiple:20,yearsToValue:1,discountRate:.1,rationale:'Uncalibrated multiple sensitivity only, never a fair target price or investment approval.'})),tables:[{id:'next_four',title:'Next four conditional EPS',rows:[{label:'base',reference}]},{id:'full_year',title:'Full forecast year EPS',rows:[{label:'2027',reference:{kind:'calculation',pointer:'/scenarios/1/fullForecastYears/0/dilutedEpsConditional'}}]},{id:'reported',title:'Actual reported and monthly observations',rows:[{label:'income',reference:{kind:'reported_observation',pointer:'/reportedFacts/0/value'}},{label:'month',reference:{kind:'reported_observation',pointer:'/monthlyFacts/0/value'}}]},{id:'assumptions',title:'Explicit future assumption',rows:[{label:'weighted denominator input',reference:{kind:'assumption',pointer:'/scenarios/1/quarters/0/shares/openingOrdinaryMillion'}}]},{id:'cash',title:'Historical cash proxy and group ratio',rows:['/cash/reported/operatingCash/0','/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0','/cash/ratio/cfoToGroupNetProfit/0',...(symbol==='2409'?['/capital/derived/ownersEquityPerIssuedCommonShare']:[])].map(pointer=>({label:pointer,reference:{kind:'cash_citation',citation:cite(set.nodes.find(n=>n.pointer===pointer))}}))}],companyBackground:'<details>'+appendix};
 return {article,draftSha:f.sha256,markdown,sourceProseMapping:"synthetic nonsemantic mapping, not formal author output"};
}
