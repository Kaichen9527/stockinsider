// Pure consumer contracts over real pinned bytes; RPC responses are synthetic.
// No native DB/role/fence or publication approval is represented by these fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createV3CashCitationConsumer} from '../web/src/lib/research-v3-article-citations.ts';
import {bindingCanonical,bindingSha,fixedBindingInputs,parseBindingCore} from '../web/src/lib/research-versioned-input-binding.ts';
import {completeHash} from '../web/src/lib/research-v3-material-canonical.ts';
import {historicalCashPins as pins} from '../web/src/lib/research-historical-cash-pins.ts';
import {projectScenarioCashMaterial} from '../web/src/lib/research-scenario-cash-material.ts';
import {normalizeScenarioCashMaterial} from '../web/src/lib/research-v3-finite-material.ts';
import {calculateHistoricalCash} from '../web/src/lib/research-historical-cash-core.ts';
const sha=b=>createHash('sha256').update(b).digest('hex'),noop={check(){}};
const gz=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(sha(gz),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const files=JSON.parse(gunzipSync(gz,{maxOutputLength:2000000})).files;
assert.equal(files.length,15);
for(const {pin,rawBase64}of files){const b=Buffer.from(rawBase64,'base64');assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
const raw=new Map(files.map(f=>[f.pin.path,JSON.parse(Buffer.from(f.rawBase64,'base64'))]));
const hs=sha(fs.readFileSync(new URL('../web/src/lib/research-v3-article-citations.ts',import.meta.url))),hc=sha(fs.readFileSync(process.execPath)); // engineering identities, NOT whole source/compiled Next approval
const uid=n=>'a1000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function make(symbol){
 const q=fixedBindingInputs(symbol,'research-article-input-v3');
 const text=bindingCanonical({artifactRootId:'historical15d4-fixed9or7',compiledFingerprintIdentity:hc,financialProfile:pins.profile,inventoryHash:completeHash(q.inventory),schemaTemplateIdentity:bindingSha(bindingCanonical(q.schemaTemplate)),sourceExecutionHash:hs,symbol,validationContract:'research-versioned-input-candidate-v3',wireVersion:'research-article-input-v3'}),binding=parseBindingCore(text);
 const request={owner:'synthetic-consumer-contract',jobId:uid(1),attempt:1,reservationId:uid(2),scope:'research_observed_v1',snapshotHash:sha('synthetic-snapshot'),preparationId:uid(3),preparationHash:sha('synthetic-preparation'),expectedArtifactManifestHash:binding.core.inventoryHash,expectedCalculatorExecutionHash:binding.bindingCapsuleIdentity};
 const readAt=new Date(Date.now()-1000).toISOString();const carrier=Buffer.from(bindingCanonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files:pins.companies[symbol].files.map(p=>({path:p.path,rawBase64:files.find(f=>f.pin.path===p.path).rawBase64}))}));let normalized;
 try{normalized=normalizeScenarioCashMaterial(pins.profile,symbol,JSON.stringify(projectScenarioCashMaterial(pins.profile,symbol,carrier,readAt,noop)),readAt,noop);}finally{carrier.fill(0);}
 const {financialMaterial,...candidate}=normalized,p=financialMaterial.projection,c=financialMaterial.calculation;
 const payload={schemaVersion:binding.core.wireVersion,assemblyStatus:'complete',evidenceStatus:'incomplete',producerAttribution:'internal_controller_asserted',preparation:{id:request.preparationId,inputHash:request.preparationHash},researchIdentity:{researchCompanyId:uid(4),symbol,scope:request.scope,snapshotHash:request.snapshotHash},priority:{},originalJob:{jobId:request.jobId,attempt:1,owner:request.owner},originalReservation:{reservationId:request.reservationId},sources:{},financial:{artifactInventory:q.inventory,material:financialMaterial,candidate,protocol:{...binding.core,bindingCapsuleIdentity:binding.bindingCapsuleIdentity}},hashes:{preparationInputHash:request.preparationHash,artifactInventoryHash:binding.core.inventoryHash,modelHistoricalCanonicalHash:q.historicalHash,sourceManifestHash:completeHash(p.sourceManifest),projectionHash:completeHash(p),scenarioInputHash:completeHash(p.projected.scenarios),resultHash:completeHash(c),sourceClosureHash:hs},clocks:{artifactReadKnownAt:readAt},gaps:[],capabilities:{financialVerified:false,dispatchReady:false,modelDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false}};
 const saved={revision_id:uid(symbol),status:'sealed',dispatchReady:false,binding,job_id:request.jobId,attempt:1,reservation_id:request.reservationId,preparation_id:request.preparationId,snapshot_hash:request.snapshotHash,research_scope:request.scope,research_company_id:uid(4),canonical_request:request,request_hash:completeHash(request),canonical_payload:payload,input_hash:completeHash(payload)};
 const consumer=createV3CashCitationConsumer({bindingTexts:[text],executorFingerprint:hc});const calls=[];
 const db={async rpc(name,args){calls.push({name,args:structuredClone(args)});return{data:structuredClone(saved),error:null};}};
 return{symbol,text,binding,request,saved,consumer,db,calls,normalized,readAt};
}
// All authority/lease/source/assignment rows below are synthetic pure contracts.
// Real fixed model/carrier/draft bytes are used; prose mapping is not semantic review.
export async function articleFixture(symbol,principal){
 const x=make(symbol),p=x.saved.canonical_payload,now=Date.now(),cutoff=x.readAt,expires=new Date(now+120000).toISOString();
 const source={id:uid(90),rowHash:'b'.repeat(64),url:'https://example.invalid/synthetic-summary',observedAt:new Date(now-3000).toISOString(),admittedAt:cutoff,publication:{precision:'unknown',raw:null,timezone:null,instant:null},scope:'company_mentions',symbols:[symbol],rights:'public_summary_only',retracted:false,superseded:false};
 Object.assign(p.originalJob,{leaseExpiresAt:expires});Object.assign(p.originalReservation,{startedAt:new Date(now-10000).toISOString(),leaseExpiresAt:expires});
 p.clocks={originalModelCutoff:p.financial.material.projection.clocks.originalModelCutoff,artifactReadKnownAt:x.readAt,researchCutoff:cutoff};
 p.sources={sealId:uid(91),manifest:[{id:source.id,rowHash:source.rowHash}],coverage:'incomplete'};
 p.gaps=[{namespace:'source',reason:'source_coverage_incomplete'},{namespace:'financial',reason:'financial_source_live_rights_unverified'},{namespace:'execution',reason:'trusted_role_execution_unavailable'},...p.financial.material.projection.gaps.map(reason=>({namespace:'financial',reason}))];
 x.saved.input_hash=completeHash(p);x.saved.replay=true;
 const set=await x.consumer.read(x.db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash);
 const cite=node=>Object.fromEntries([...['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash'].map(k=>[k,set.context[k]]),...['pointer','kind','value','unit','period','periodKind','classification','scenarioId'].map(k=>[k,node[k]])]);
 const draftPacket=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/research-historical-cash/article-drafts-15d4.json.gz',import.meta.url))));
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
 const article={schemaVersion:'candidate-deep-research-v3',businessModel:'business_scenarios_cash_v3',symbol,researchCompanyId:x.saved.research_company_id,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash,authoredAt:new Date().toISOString(),evidenceCutoffAt:cutoff,summary:{id:'summary',text:preface,kind:'inference',references:[reference]},sections:articleSections,catalysts:[{name:'Synthetic contract catalyst',stage:'discussion',paragraphIds:['section_3_0'],affectedBusiness:'Original model',earliestFinancialPeriod:'2027',financialTransmission:'Synthetic mapping retains the original model and does not claim confirmed orders.',strongestCounterEvidence:'Competition, delayed validation and changed customer demand remain relevant counterevidence.',falsifier:'If customers delay validation or margins decline, revisit assumptions instead of claiming confirmation.'}],valuation:['bear','base','bull'].map((scenarioId,i)=>({scenarioId,period:i===1?'full_forecast_year':'next_four_unreported',fiscalYear:i===1?'2027':null,peMultiple:20,yearsToValue:1,discountRate:.1,rationale:'Uncalibrated multiple sensitivity only, never a fair target price or investment approval.'})),tables:[{id:'next_four',title:'Next four conditional EPS',rows:[{label:'base',reference}]},{id:'full_year',title:'Full forecast year EPS',rows:[{label:'2027',reference:{kind:'calculation',pointer:'/scenarios/1/fullForecastYears/0/dilutedEpsConditional'}}]},{id:'reported',title:'Actual reported and monthly observations',rows:[{label:'income',reference:{kind:'reported_observation',pointer:'/reportedFacts/0/value'}},{label:'month',reference:{kind:'reported_observation',pointer:'/monthlyFacts/0/value'}}]},{id:'assumptions',title:'Explicit future assumption',rows:[{label:'weighted denominator input',reference:{kind:'assumption',pointer:'/scenarios/1/quarters/0/shares/openingOrdinaryMillion'}}]},{id:'cash',title:'Historical cash proxy and group ratio',rows:['/cash/reported/operatingCash/0','/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0','/cash/ratio/cfoToGroupNetProfit/0',...(symbol==='2409'?['/capital/derived/ownersEquityPerIssuedCommonShare']:[])].map(pointer=>({label:pointer,reference:{kind:'cash_citation',citation:cite(set.nodes.find(n=>n.pointer===pointer))}}))}],companyBackground:'<details>'+appendix};
 const assignment={assignment_id:uid(92),job_id:x.request.jobId,attempt:x.request.attempt,reservation_id:x.request.reservationId,input_revision_id:x.saved.revision_id,input_hash:x.saved.input_hash,research_company_id:x.saved.research_company_id,snapshot_hash:x.request.snapshotHash,controller_principal:principal,work_owner:x.request.owner,canonical_request:x.request,assigned_at:cutoff,reservation_started_at:p.originalReservation.startedAt,reservation_expires_at:expires,original_job_deadline:expires};
 const {controller_principal,canonical_request,...assignmentProjection}=assignment;void controller_principal;void canonical_request;
 const packet={assignment:assignmentProjection,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash,sourceSealReceivedAt:source.admittedAt,sources:[{descriptor:source,title:'Synthetic summary',summary:'Synthetic source evidence only, not live news or authority.',catalyst:'Unconfirmed product opportunity',risk:'Delayed customer validation',platform:'web',sourceClaimStatus:'rumor',collectedAt:new Date(now-2000).toISOString(),unverifiedPublicationClaim:null,untrustedEvidence:true}],wireVersion:'research-article-input-v3',bindingCapsuleIdentity:x.binding.bindingCapsuleIdentity};
 const calls=[];const db={async rpc(name,args){calls.push({name,args:structuredClone(args)});if(name==='read_research_article_input_candidate_v3')return{data:structuredClone(x.saved),error:null};if(name==='read_research_author_assignment_candidate_v3')return{data:structuredClone(assignment),error:null};if(name==='read_research_author_packet_candidate_v3')return{data:structuredClone(packet),error:null};throw Error('unexpected RPC '+name);}};
 return{...x,source,article,assignment,packet,db,calls,set,markdown,draftSha:f.sha256,sourceProseMapping:'synthetic nonsemantic mapping preserves all section/table text; not formal author output'};
}
