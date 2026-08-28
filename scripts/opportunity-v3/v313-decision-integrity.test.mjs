import assert from 'node:assert/strict';
import { execFileSync,spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(name)=>require(path.join(root,'scripts/runtime',name));
const RELATIVE_EVIDENCE={algorithm:'official-relative-pe-evidence-v1',evidenceRoot:'a'.repeat(64),
  currentObservationRoot:'b'.repeat(64),historyMembershipRoot:'c'.repeat(64),
  sectorMembershipRoot:'d'.repeat(64),historySessions:252,sectorPeers:8};
function independentTestEnvironment(){
  const environment={...process.env,OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD:'false'};
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}
let migrationContractResult;
function appliedMigrationContract(){
  migrationContractResult??=spawnSync(process.execPath,[path.join(root,'scripts/run-node22.js'),
    '--experimental-strip-types','--test',path.join(root,'scripts/opportunity-v3/migration-contract.test.mjs')],{
    cwd:root,encoding:'utf8',env:independentTestEnvironment(),timeout:420000,maxBuffer:32*1024*1024,
  });
  const diagnostic=`${migrationContractResult.stdout??''}\n${migrationContractResult.stderr??''}`.slice(-12000);
  assert.equal(migrationContractResult.error,undefined,`migration evidence process error\n${diagnostic}`);
  assert.equal(migrationContractResult.signal,null,`migration evidence process signal\n${diagnostic}`);
  assert.equal(migrationContractResult.status,0,`migration evidence process exit\n${diagnostic}`);
  return migrationContractResult.stdout;
}

const FLOW_FACTS=new Set(['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense',
  'quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense',
  'quarterly_noncontrolling_interest','quarterly_net_income','quarterly_net_income_attributable_to_common',
  'quarterly_diluted_eps','diluted_weighted_average_shares','quarterly_ebitda','depreciation_amortization']);
function officialFactRow(symbol,key,end,value,ref=`twse-openapi:statement:${key}:${end}`){
  const flow=FLOW_FACTS.has(key);const monthly=key==='monthly_revenue';const unit=['quarterly_diluted_eps','book_value_per_share'].includes(key)
    ?'TWD_per_share':key==='diluted_weighted_average_shares'?'thousand_shares':key==='roe'?'percentage_points':'TWD_thousand';
  return [symbol,key,flow?`${end.slice(0,4)}-01-01`:monthly?`${end.slice(0,7)}-01`:null,end,
    flow?'quarterly':monthly?'monthly':'instant',value,unit,'official_filing',
    `${end}T00:00:00Z`,`${end}T00:00:00Z`,`${end}T01:00:00Z`,`${end}T01:00:00Z`,ref,null,'reported','reported_period'];
}
function completeOfficialFacts(symbol='1101'){
  const ends=['2024-06-30','2024-09-30','2024-12-31','2025-03-31','2025-06-30','2025-09-30','2025-12-31',
    '2026-03-31','2026-06-30'];
  const quarterValues={quarterly_revenue:[2200,3600,5200,1000,2200,3600,5200,1000,2200],
    quarterly_gross_profit:[880,1450,2100,400,880,1450,2100,400,880],
    quarterly_operating_expense:[650,1060,1520,300,650,1060,1520,300,650],
    quarterly_operating_income:[230,390,580,100,230,390,580,100,230],
    quarterly_non_operating_income:[20,30,40,10,20,30,40,10,20],
    quarterly_pretax_income:[250,420,620,110,250,420,620,110,250],
    quarterly_income_tax_expense:[45,75,110,20,45,75,110,20,45],
    quarterly_noncontrolling_interest:[20,30,40,10,20,30,40,10,20],
    quarterly_net_income:[205,345,510,90,205,345,510,90,205],
    quarterly_net_income_attributable_to_common:[185,315,470,80,185,315,470,80,185],
    quarterly_diluted_eps:[1.85,3.15,4.7,.8,1.85,3.15,4.7,.8,1.85],
    diluted_weighted_average_shares:[100,100,100,100,100,100,100,100,100],
    quarterly_ebitda:[272,456,672,120,272,456,672,120,272],depreciation_amortization:[42,66,92,20,42,66,92,20,42]};
  const monthly=Array.from({length:18},(_,index)=>{const date=new Date(Date.UTC(2025,index,1));
    const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
    return officialFactRow(symbol,'monthly_revenue',end,900+index*12);});
  const book=ends.map((end,index)=>officialFactRow(symbol,'book_value_per_share',end,55+index*.625));
  return [...Object.entries(quarterValues).flatMap(([key,values])=>ends.map((end,index)=>officialFactRow(symbol,key,end,values[index]))),
    ...monthly,...book,officialFactRow(symbol,'cash_and_equivalents','2026-06-30',2000),
    officialFactRow(symbol,'total_debt','2026-06-30',1000),officialFactRow(symbol,'total_assets','2026-06-30',10000),
    officialFactRow(symbol,'total_equity','2026-06-30',6000)];
}

function relativeInput(state='at_support',discounted=true) {
  const noZone=['below_support','reclaim_required','extended'].includes(state);const invalidated=state==='invalidated';
  return { valuation:{status:'valuation_review',reason:'formal_target_unavailable'},currentPrice:100,
    researchScore:{axes:{valuation:{trustworthy:true,currentPe:discounted?10:15,historyPeP25:10,
      historyPeMedian:15,historyPeP75:20,sectorPe:16,historySampleCount:252,sectorCount:8,
      valuationEvidence:RELATIVE_EVIDENCE,asOf:'2026-08-07',sourceRefs:['twse-openapi:official']}}},qualityActionEligible:true,marketAllowsAction:true,
    technical:{technicalState:state,plane:{current:100}},geometry:{availability:invalidated?'invalidated':noZone?'conditional':'available',
      entryZone:noZone||invalidated?null:[99,101],invalidation:noZone||invalidated?null:94,
      trigger:state==='breakout_pending'?{kind:'breakout',threshold:102}
        :['below_support','reclaim_required'].includes(state)?{kind:'reclaim',threshold:102}
          :state==='extended'?{kind:'pullback',threshold:98}:null},lastEvaluatedAt:'2026-08-07T10:20:00Z' };
}

function formalInput(state) {
  return { ...relativeInput(state),valuation:{status:'normal',valuationRange:{bear:90,base:132,bull:165},
    method:{method:'pe'},asOf:'2026-08-07',evidence:{sourceRefs:['official-filing']}},
    technical:{technicalState:state,plane:{current:100}},geometry:{availability:'available',entryZone:[99,101],
      invalidation:90,trigger:null} };
}

function citedBrief(ref) {
  return { thesis:['一','二','三'],risks:['甲','乙','丙'],evidence:[
    {point:'thesis:0',refs:[ref]},{point:'thesis:1',refs:[ref]},{point:'thesis:2',refs:[ref]},
    {point:'risk:0',refs:[ref]},{point:'risk:1',refs:[ref]},{point:'risk:2',refs:[ref]},
  ] };
}

function acceptanceTest(caseId, name, implementation) {
  if (process.env.OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD === 'true' &&
      process.env.OPPORTUNITY_V3_ACCEPTANCE_CASE !== caseId) return;
  test(name, implementation);
}

acceptanceTest('DI-001','V3.13 decision envelope closes all eight user actions without an action quota',async()=>{
  const materialChange=runtime('analysis-material-change.js');
  const goldenMaterial=materialChange.hashMaterialAnalysisChange({symbol:'2337',sourceEvidence:['source-ref-a'],
    facts:[['fact-2337-eps','quarterly_diluted_eps',0.9,'TWD_per_share','2026-04-30T06:00:00Z']],
    priceTrigger:['price_trigger','available','reclaim_required','reclaim'],
    technical:['technical','reclaim_required',43,50],valuation:['valuation','d'.repeat(64)],risk:['risk','none'],
    factor:['factor','available',0.75,6,'available','low','normal','wait_trigger',4,'normal']});
  assert.equal(goldenMaterial.materialChangeHash,'ce1fde50d6378ebf0de9e0ac978351e95ea8c398993baa2b91120d55c54cb70b');
  assert.deepEqual(materialChange.materialChangedReasons(goldenMaterial.materialIdentity,
    [...goldenMaterial.materialIdentity.slice(0,8),['factor','available',0.75,7,'available','low','normal','wait_trigger',4,'normal']]),
  ['factor_correctness_changed']);
  const decide=runtime('decision-envelope.js').deriveDecisionEnvelope;
  const cases=[
    ['buy',formalInput('breakout_confirmed')],['accumulate',formalInput('at_support')],
    ['research_starter',relativeInput('at_support')],['wait_breakout',relativeInput('breakout_pending')],
    ['wait_reclaim',relativeInput('below_support')],['avoid_chase',relativeInput('extended')],
    ['avoid',relativeInput('at_support',false)],['unavailable',{valuation:{status:'valuation_review',reason:'missing_bridge_inputs'},
      qualityActionEligible:true,marketAllowsAction:true,technical:{technicalState:'at_support',plane:{current:100}},
      geometry:{availability:'available',entryZone:[99,101],invalidation:94}}],
  ];
  for(const [expected,input] of cases)assert.equal(decide(input).userAction,expected,expected);
  assert.equal(new Set(cases.map(([action])=>action)).size,8);
  const technicalAuthorityMatrix={at_support:'research_starter',breakout_confirmed:'research_starter',
    breakout_pending:'wait_breakout',below_support:'wait_reclaim',reclaim_required:'wait_reclaim',
    extended:'avoid_chase',invalidated:'avoid'};
  for(const qualityReadiness of ['missing','failed','available'])for(const marketReadiness of ['missing','failed','available']) {
    for(const [technicalState,readyAction] of Object.entries(technicalAuthorityMatrix)) {
      const input={...relativeInput(technicalState),qualityReadiness,marketReadiness};
      const expected=qualityReadiness==='available'&&marketReadiness==='available'?readyAction:'unavailable';
      assert.equal(decide(input).userAction,expected,`${qualityReadiness}/${marketReadiness}/${technicalState}`);
    }
  }
  const productionAction=runtime('action-decision.js').deriveActionDecision;
  const plane=(overrides)=>({availability:'available',current:105,previousClose:104,support:100,resistance:110,
    atr14:2,ma20:100,rsi14:55,volumeRatio20:1,macdHistogram:-1,relativeStrengthTaiex20:-1,
    brokeSupportPrior20:false,bias:{bias20Atr:0},...overrides});
  const productionBase={researchScore:relativeInput().researchScore,qualityActionEligible:true,marketAllowsAction:true};
  const productionStates=[
    ['below_support','wait_reclaim',plane({current:99.5,previousClose:101})],
    ['reclaim_required','wait_reclaim',plane({current:100.2,previousClose:99,brokeSupportPrior20:true})],
    ['breakout_pending','wait_breakout',plane({current:105})],
    ['extended','avoid_chase',plane({current:115,resistance:120,rsi14:76})],
    ['invalidated','avoid',plane({current:95,previousClose:96})],
  ];
  for(const [expectedState,expectedAction,technicalPlane] of productionStates){
    const produced=productionAction({...productionBase,plane:technicalPlane,support:technicalPlane.support,
      resistance:technicalPlane.resistance});
    assert.deepEqual([produced.technical.technicalState,produced.decisionEnvelope.userAction],
      [expectedState,expectedAction],`${expectedState} production action`);
    assert.ok(runtime('decision-envelope.js').validateDecisionEnvelopeV313(produced.decisionEnvelope));
  }
  const {derivePublicOpportunityView,addResearchDecisions,publishCompactRadarProjection}=runtime('compact-radar-projection.js');
  const avoidEnvelope=decide(relativeInput('at_support',false));
  const conflicting=derivePublicOpportunityView({symbol:'1101',action:'starter_now',opportunityAction:'setup_ready',
    decisionEnvelope:avoidEnvelope,lastEvaluatedAt:'2026-08-07T10:20:00Z'});
  assert.equal(conflicting.decisionEnvelope.decisionRevisionId,avoidEnvelope.decisionRevisionId);
  assert.equal(conflicting.opportunityAction,'avoid');
  const missingEnvelope=derivePublicOpportunityView({symbol:'1104',researchScore:{underreactionScore:99,
    coverage:1,confidence:1,axes:{fundamental:{trustworthy:true,score:99},valuation:{trustworthy:true,score:99},
      priceDislocation:{trustworthy:true,score:99},timing:{trustworthy:true,score:99}}}});
  assert.equal(missingEnvelope.decisionEnvelope.userAction,'unavailable');
  assert.equal(missingEnvelope.decisionEnvelope.reason,'authoritative_decision_envelope_missing');
  assert.throws(()=>derivePublicOpportunityView({symbol:'1105',decisionEnvelope:{userAction:'buy'}}),
    /present decision envelope invalid/,'a malformed present envelope cannot be replaced in the serializer');
  const legacy={opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],recentFormal7d:[],
    fallbackOpportunities90d:[],hotTracking:[]};
  const zeroEligible=addResearchDecisions(legacy,[], '2026-08-07T10:20:00Z',[
    {symbol:'1102',name:'無權威封包',raw:'來源',lastEvaluatedAt:'2026-08-07T10:20:00Z'},
    {symbol:'1103',name:'明確避開',raw:'來源',decisionEnvelope:avoidEnvelope,lastEvaluatedAt:'2026-08-07T10:20:00Z'},
  ]).sourceSignals;
  assert.equal(zeroEligible.filter((card)=>['buy','accumulate','research_starter'].includes(card.decisionEnvelope.userAction)).length,0);
  assert.ok(zeroEligible.every((card)=>card.decisionRevisionId===card.decisionEnvelope.decisionRevisionId));
  const schedule=['2026-08-07','2026-08-10'].map((session_id)=>({session_id,status:'completed'}));
  const first=publishCompactRadarProjection({decisions:[],legacyPayload:legacy,window:'home',
    asOf:'2026-08-07T10:20:00Z',freshnessSchedule:schedule,producerIdentity:{commitSha:'a'.repeat(40)}});
  const heartbeat=publishCompactRadarProjection({decisions:[],legacyPayload:legacy,window:'home',
    asOf:'2026-08-08T10:20:00Z',evaluatedAt:'2026-08-08T10:20:00Z',publishedAt:'2026-08-08T10:21:00Z',
    contentAsOf:'2026-08-08T10:20:00Z',materialChanged:false,priorProjection:first.payload,
    freshnessSchedule:schedule,producerIdentity:{commitSha:'a'.repeat(40)}});
  assert.equal(heartbeat.payload.sourceLedCorrectness.contentAsOf,'2026-08-07T10:20:00Z');
  assert.equal(heartbeat.payload.sourceLedCorrectness.evaluatedAt,'2026-08-08T10:20:00Z');
  const validated=runtime('source-run-config.js').validateAuthSourceDagConfig(
    readFileSync(path.join(root,'config/runtime/auth-source-dag.json')));
  const handlers=runtime('auth-source-worker-cli.js').buildStageHandlers(validated,'a'.repeat(40),'b'.repeat(64),{
    internalApiKey:'test-internal-key-0001'});
  const stageDecision={symbol:'1101',name:'測試公司',sourceClass:'official',sourceSummary:'官方研究更新',
    decisionEnvelope:decide(formalInput('breakout_confirmed')),claimAsOf:'2026-08-07T09:00:00Z',lastEvaluatedAt:'2026-08-07T10:20:00Z',
    sourceCollectedAt:'2026-08-07T09:30:00Z',analysisGeneratedAt:'2026-08-07T10:20:00Z',
    claimId:'claim-stage',sourceKey:'mops',sourceName:'公開資訊觀測站',sourceUrl:'https://mops.twse.com.tw/mops/web/index',
    evaluationDisposition:'appended',decisionBrief:citedBrief('claim-stage')};
  const firstRead=runtime('codec.js').immutableBundle('compact_projection_input',{analysisResult:{decisions:[stageDecision],
    sourceCandidates:[],dislocationCandidates:[],projectionFreshnessSchedule:schedule},sourceCutoff:'2026-08-07T10:20:00Z',
    legacyPayloads:{daily:legacy,hot:legacy,weekly:legacy,home:legacy}});
  const firstStage=await handlers.compact_radar_projection({readKind:'compact_projection_input',readJson:firstRead.json,
    readCanonical:firstRead.canonical,readHash:firstRead.hash});
  const evaluationClockRead=runtime('codec.js').immutableBundle('compact_projection_input',{
    analysisResult:{decisions:[stageDecision],sourceCandidates:[],dislocationCandidates:[],
      projectionFreshnessSchedule:schedule},sourceCutoff:'2026-08-07T10:20:00Z',
    evaluationTimestamp:'2026-08-08T10:30:00Z',
    legacyPayloads:{daily:legacy,hot:legacy,weekly:legacy,home:legacy}});
  const evaluationClockStage=await handlers.compact_radar_projection({readKind:'compact_projection_input',
    readJson:evaluationClockRead.json,readCanonical:evaluationClockRead.canonical,
    readHash:evaluationClockRead.hash});
  assert.ok(evaluationClockStage.json.projections.every((projection)=>
    projection.payload.sourceLedCorrectness.contentAsOf==='2026-08-07T10:20:00Z'
      &&projection.payload.sourceLedCorrectness.evaluatedAt==='2026-08-08T10:30:00Z'
      &&projection.payload.sourceLedCorrectness.publishedAt==='2026-08-08T10:30:00Z'),
  'immutable run-start heartbeat must not rewrite the point-in-time content cutoff');
  const v314Envelope=runtime('decision-envelope-v314.js').deriveDecisionEnvelopeV314({
    ...formalInput('breakout_confirmed'),qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
  });
  const mixedVersionRead=runtime('codec.js').immutableBundle('compact_projection_input',{analysisResult:{
    decisions:[stageDecision],sourceCandidates:[{symbol:'1102',name:'相容層研究訊號',sourceClass:'official',
      sourceSummary:'官方研究待補',lastEvaluatedAt:'2026-08-07T10:20:00Z',
      decisionEnvelope:v314Envelope,
      claimId:'claim-stage-v313',claimAsOf:'2026-08-07T09:00:00Z',sourceKey:'mops',sourceName:'公開資訊觀測站',
      sourceUrl:'https://mops.twse.com.tw/mops/web/index',sourcePublishedAt:'2026-08-07T09:00:00Z',
      sourceCollectedAt:'2026-08-07T09:30:00Z'}],dislocationCandidates:[],projectionFreshnessSchedule:schedule},
    sourceCutoff:'2026-08-07T10:20:00Z',legacyPayloads:{daily:legacy,hot:legacy,weekly:legacy,home:legacy}});
  const mixedVersionStage=await handlers.compact_radar_projection({readKind:'compact_projection_input',
    readJson:mixedVersionRead.json,readCanonical:mixedVersionRead.canonical,readHash:mixedVersionRead.hash});
  assert.deepEqual(Object.fromEntries(mixedVersionStage.json.decisionRevisions.map((revision)=>[
    revision.bundle.json.decisionEnvelope.version,revision.bundle.kind])),{
    'decision-envelope-v3.14.0':'legacy_decision_revision_v3_14',
    'decision-envelope-v3.13.0':'legacy_decision_revision_v3_13',
  },'mixed compatibility cards must use the bundle kind matching their decision-envelope version');
  const secondEnvelope=decide({...formalInput('breakout_confirmed'),lastEvaluatedAt:'2026-08-08T10:20:00Z'});
  assert.equal(secondEnvelope.decisionRevisionId,stageDecision.decisionEnvelope.decisionRevisionId);
  const priorProjections=Object.fromEntries(firstStage.json.projections.map((projection)=>[projection.storageWindow,projection.payload]));
  const secondRead=runtime('codec.js').immutableBundle('compact_projection_input',{analysisResult:{decisions:[{
    ...stageDecision,decisionEnvelope:secondEnvelope,lastEvaluatedAt:'2026-08-08T10:20:00Z',evaluationDisposition:'unchanged'}],
    sourceCandidates:[],dislocationCandidates:[],projectionFreshnessSchedule:schedule},sourceCutoff:'2026-08-08T10:20:00Z',
    priorProjections,legacyPayloads:{daily:legacy,hot:legacy,weekly:legacy,home:legacy}});
  const secondStage=await handlers.compact_radar_projection({readKind:'compact_projection_input',readJson:secondRead.json,
    readCanonical:secondRead.canonical,readHash:secondRead.hash});
  assert.equal(secondStage.json.projections[3].payload.sourceSignals[0].decisionRevisionId,
    firstStage.json.projections[3].payload.sourceSignals[0].decisionRevisionId);
  assert.equal(secondStage.json.projections[3].payload.sourceLedCorrectness.contentHash,
    firstStage.json.projections[3].payload.sourceLedCorrectness.contentHash);
  assert.equal(secondStage.json.projections[3].payload.sourceLedCorrectness.contentAsOf,'2026-08-07T10:20:00Z');
  assert.equal(secondStage.json.projections[3].payload.sourceLedCorrectness.evaluatedAt,'2026-08-08T10:20:00Z');
  assert.equal(secondStage.json.decisionRevisions[0].decisionRevisionId,
    firstStage.json.decisionRevisions[0].decisionRevisionId);
  assert.equal(secondStage.json.decisionRevisions[0].bundle.hash,
    firstStage.json.decisionRevisions[0].bundle.hash,
    'a no-change heartbeat must retain byte-identical immutable decision material');
  assert.equal(secondStage.json.decisionRevisions[0].bundle.json.sourceProvenance.publishedAt,'2026-08-07T09:00:00Z');
  assert.equal(secondStage.json.decisionRevisions[0].bundle.json.sourceProvenance.collectedAt,'2026-08-07T09:30:00Z');
  assert.equal(secondStage.json.decisionRevisions[0].bundle.json.sourceProvenance.evaluatedAt,'2026-08-07T10:20:00Z');
  assert.equal(secondStage.json.decisionRevisions[0].bundle.json.decisionEnvelope.evaluatedAt,undefined);
  const disclosureHash='e'.repeat(64);
  const oldDisclosure={...stageDecision,materialChangeHash:disclosureHash,currentPrice:100,
    researchScore:{underreactionScore:60,coverage:.8,confidence:'high',researchDisposition:'watch',reasons:[],risks:[],
      priceContext:{currentPrice:100},axes:{valuation:{}}}};
  const currentDisclosure={...oldDisclosure,currentPrice:101,lastEvaluatedAt:'2026-08-08T10:20:00Z',
    researchScore:{...oldDisclosure.researchScore,priceContext:{currentPrice:101}}};
  const analysisInput=runtime('codec.js').immutableBundle('analysis_revision_input',{factsResult:{decisions:[currentDisclosure],
    sourceCandidates:[],dislocationCandidates:[],projectionFreshnessSchedule:schedule},
    sourceCutoff:'2026-08-08T10:20:00Z',evaluationTimestamp:'2026-08-09T10:20:00Z',priorRevisions:[{
    symbol:'1101',revisionId:'analysis-prior',materialChangeHash:disclosureHash,
    analysisGeneratedAt:'2026-08-07T10:20:00Z',facts:oldDisclosure}]});
  const analysisStage=await handlers.analysis_revision({readKind:'analysis_revision_input',readJson:analysisInput.json,
    readCanonical:analysisInput.canonical,readHash:analysisInput.hash});
  assert.equal(analysisStage.json.decisions[0].analysisRevision.revisionId,'analysis-prior');
  assert.equal(analysisStage.json.decisions[0].researchScore.priceContext.currentPrice,101,
    'unchanged analysis lineage retains the current disclosure price');
  assert.deepEqual(analysisStage.json.decisions[0].decisionBrief,oldDisclosure.decisionBrief,
    'unchanged lineage retains prior cited narrative authority');
  assert.equal(analysisStage.json.decisions[0].lastEvaluatedAt,'2026-08-09T10:20:00Z');
  assert.match(analysisStage.json.decisions[0].noChangeMessage,/2026-08-09T10:20:00Z/u);
  const disclosureCompactInput=runtime('codec.js').immutableBundle('compact_projection_input',{
    analysisResult:analysisStage.json,sourceCutoff:'2026-08-08T10:20:00Z',
    legacyPayloads:{daily:legacy,hot:legacy,weekly:legacy,home:legacy}});
  const disclosureCompact=await handlers.compact_radar_projection({readKind:'compact_projection_input',
    readJson:disclosureCompactInput.json,readCanonical:disclosureCompactInput.canonical,
    readHash:disclosureCompactInput.hash});
  const oldDisclosureCard=addResearchDecisions(legacy,[oldDisclosure],'2026-08-07T10:20:00Z').sourceSignals[0];
  const currentDisclosureCard=disclosureCompact.json.projections[3].payload.sourceSignals[0];
  assert.notEqual(currentDisclosureCard.decisionRevisionId,oldDisclosureCard.decisionRevisionId,
    'price-only disclosure creates a new decision revision without rewriting analysis lineage');
  assert.equal(currentDisclosureCard.currentPrice,101);
  const material=runtime('auth-source-worker-cli.js').materialDecisionValue;
  assert.deepEqual(material({asOf:'2026-08-07T10:20:00Z',valuation:{base:120,asOf:'2026-08-07'},
    evaluatedAt:'2026-08-07T10:20:00Z'}),material({asOf:'2026-08-08T10:20:00Z',
    valuation:{base:120,asOf:'2026-08-08'},evaluatedAt:'2026-08-08T10:20:00Z'}));
  assert.notDeepEqual(material({valuation:{base:120,asOf:'2026-08-07'}}),
    material({valuation:{base:121,asOf:'2026-08-07'}}));
  const priceRows=Array.from({length:130},(_,index)=>{const session=new Date(Date.UTC(2025,0,index+1)).toISOString();
    const close=100+index/20;return {session,open:close-.2,high:close+1,low:close-1,close,volume:1000+index,
      sourceRef:`twse-rwd:STOCK_DAY:${session.slice(0,10)}:1101`};});
  const materialCandidate={stockId:'123e4567-e89b-42d3-a456-426614171101',symbol:'1101',name:'台泥',
    canonicalSector:'cement',sourcePriority:70,claimId:'claim-1101',claimAsOf:'2025-01-01T00:00:00Z',
    materialEvidenceHash:'a'.repeat(64)};
  const decisionAt=(sourceCutoff)=>runtime('auth-source-worker-cli.js').buildLegacyCandidateDecision({
    candidate:materialCandidate,facts:[],history:priceRows,benchmark:priceRows,sourceCutoff});
  const firstDecision=decisionAt('2026-08-07T10:20:00Z');
  const heartbeatDecision=decisionAt('2026-08-08T10:20:00Z');
  assert.equal(firstDecision.materialChangeHash,heartbeatDecision.materialChangeHash,
    'evaluation cutoff alone cannot create a material revision');
  assert.deepEqual(firstDecision.materialIdentity,heartbeatDecision.materialIdentity);
  const marketAuthorizedDecision=runtime('auth-source-worker-cli.js').buildLegacyCandidateDecision({
    candidate:materialCandidate,facts:[],history:priceRows,benchmark:priceRows,
    sourceCutoff:'2026-08-08T10:20:00Z',marketAnalysis:{status:'risk_on'} });
  assert.notEqual(firstDecision.materialChangeHash,marketAuthorizedDecision.materialChangeHash,
    'a market-authority blocker change must create a new immutable analysis revision');
  assert.notDeepEqual(firstDecision.materialIdentity,marketAuthorizedDecision.materialIdentity);
  const sameEnvelope=decide(formalInput('breakout_confirmed'));
  const disclosedPriceCard=(price)=>addResearchDecisions(legacy,[], '2026-08-07T10:20:00Z',[{
    symbol:'9103',name:'價格身分',claimId:'claim-price',claimAsOf:'2026-08-07T09:00:00Z',
    sourceUrl:'https://example.com/price',sourceCollectedAt:'2026-08-07T10:00:00Z',
    decisionEnvelope:sameEnvelope,currentPrice:price,researchScore:{underreactionScore:50,coverage:.5,
      confidence:'low',researchDisposition:'watch',reasons:[],risks:[],priceContext:{currentPrice:price},axes:{valuation:{}}},
  }]).sourceSignals[0];
  const disclosedPrice100=disclosedPriceCard(100);const disclosedPrice101=disclosedPriceCard(101);
  assert.notEqual(disclosedPrice100.decisionRevisionId,disclosedPrice101.decisionRevisionId,
    'any persisted disclosure change must produce a different decision revision ID');
  assert.equal(disclosedPrice100.decisionRevisionId,disclosedPrice100.decisionEnvelope.decisionRevisionId);
  const identityCards=addResearchDecisions(legacy,[], '2026-08-07T10:20:00Z',[
    {symbol:'9101',name:'甲',claimId:'claim-a',sourceKey:'official',sourceName:'官方來源',claimAsOf:'2026-08-07T09:00:00Z',sourceUrl:'https://example.com/a',
      sourceCollectedAt:'2026-08-07T10:00:00Z',decisionEnvelope:sameEnvelope,materialChangeHash:'1'.repeat(64),
      analysisRevision:{revisionId:'revision-a'},decisionBrief:citedBrief('claim-a')},
    {symbol:'9102',name:'乙',claimId:'claim-b',sourceKey:'official',sourceName:'官方來源',claimAsOf:'2026-08-07T09:00:00Z',sourceUrl:'https://example.com/b',
      sourceCollectedAt:'2026-08-07T10:00:00Z',decisionEnvelope:sameEnvelope,materialChangeHash:'1'.repeat(64),
      analysisRevision:{revisionId:'revision-a'},decisionBrief:citedBrief('claim-b')},
  ]).sourceSignals;
  assert.notEqual(identityCards[0].decisionRevisionId,identityCards[1].decisionRevisionId);
  assert.ok(identityCards.every((card)=>card.decisionBrief?.evidence?.length===6&&card.citations.length===1));
  const uncitedBrief=addResearchDecisions(legacy,[],'2026-08-07T10:20:00Z',[{
    symbol:'9104',claimId:'claim-uncited',sourceKey:'official',sourceName:'官方來源',
    sourceUrl:'https://example.com/uncited',claimAsOf:'2026-08-07T09:00:00Z',
    sourceCollectedAt:'2026-08-07T10:00:00Z',lastEvaluatedAt:'2026-08-07T10:20:00Z',
    decisionEnvelope:sameEnvelope,decisionBrief:{thesis:['一','二','三'],risks:['甲','乙','丙']},
  }]).sourceSignals[0];
  assert.deepEqual(uncitedBrief.decisionBrief,{availability:'unavailable',reason:'insufficient_cited_decision_brief'},
    'three uncited strings become a typed unavailable brief, never synthetic padding');
  const projectionRuntime=runtime('compact-radar-projection.js');
  const validCitation={ref:'authority',sourceKey:'official',sourceName:'官方來源',sourceUrl:'https://example.com/a',
    publishedAt:'2026-08-07T09:00:00Z',collectedAt:'2026-08-07T10:00:00Z',evaluatedAt:'2026-08-07T10:20:00Z'};
  assert.equal(projectionRuntime.validHttpsUrl('https://'),false);
  assert.equal(projectionRuntime.validHttpsUrl('https://user:secret@example.com/a'),false);
  assert.equal(projectionRuntime.validHttpsUrl('https://example.com:99999/a'),false);
  assert.equal(projectionRuntime.validCitation({...validCitation,evaluatedAt:'2026-99-99T00:00:00Z'}),false);
  assert.equal(projectionRuntime.validCitation({...validCitation,evaluatedAt:'2026-02-30T00:00:00Z'}),false);
  assert.equal(projectionRuntime.validCitation({...validCitation,evaluatedAt:'2026-08-07T10:20:00'}),false);
  assert.equal(projectionRuntime.validCitation({...validCitation,publishedAt:'2026-08-08T00:00:00Z'}),false);
  const exactEvidence=['thesis:0','thesis:1','thesis:2','risk:0','risk:1','risk:2']
    .map((point)=>({point,refs:['authority']}));
  const validBrief={thesis:['一','二','三'],risks:['甲','乙','丙'],evidence:exactEvidence};
  assert.ok(projectionRuntime.citedDecisionBrief(validBrief,[validCitation],validCitation));
  assert.equal(projectionRuntime.citedDecisionBrief({...validBrief,evidence:[...exactEvidence,exactEvidence[0]]},
    [validCitation],validCitation),null);
  assert.equal(projectionRuntime.citedDecisionBrief({...validBrief,evidence:exactEvidence.map((row,index)=>
    index===1?{...row,point:'thesis:0'}:row)},[validCitation],validCitation),null);
  assert.equal(projectionRuntime.citedDecisionBrief(validBrief,[validCitation],{}),null);
  assert.deepEqual(projectionRuntime.navigableCitations({citations:[validCitation,{...validCitation,sourceName:'衝突來源'}],
    sourceEvidence:[]}),[],'duplicate or conflicting citation refs fail closed rather than being silently dropped');
  const envelopeValidator=runtime('decision-envelope.js').validateDecisionEnvelopeV313;
  assert.equal(envelopeValidator({...sameEnvelope,recommendationAuthority:'none',userAction:'buy'}),null);
  assert.equal(envelopeValidator({...sameEnvelope,valuationSummary:undefined}),null);
  const webPublication=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  assert.equal(webPublication.validRfc3339Instant('2026-02-30T00:00:00Z'),false);
  assert.equal(webPublication.validRfc3339Instant('2026-08-07T10:20:00'),false);
  assert.equal(webPublication.validHttpsPublicationUrl('https://example.com:99999/a'),false);
  const sourceOnly={symbol:'9105',name:'來源待研究',claimId:'claim-source-only',sourceKey:'official',sourceName:'官方來源',
    sourceUrl:'https://example.com/source-only',claimAsOf:'2026-08-07T09:00:00Z',
    sourceCollectedAt:'2026-08-07T10:00:00Z',lastEvaluatedAt:'2026-08-07T10:20:00Z'};
  const sourceOnlyProjection=publishCompactRadarProjection({decisions:[],sourceCandidates:[sourceOnly],legacyPayload:legacy,
    window:'home',asOf:'2026-08-07T10:20:00Z',freshnessSchedule:schedule,
    producerIdentity:{commitSha:'a'.repeat(40)}});
  const sourceOnlyCard=sourceOnlyProjection.payload.sourceSignals[0];
  const sourceOnlyValidated=webPublication.validatePublishedDecisionCard(sourceOnlyCard);
  assert.equal(sourceOnlyValidated?.briefAvailability,'unavailable');
  assert.equal(sourceOnlyValidated?.briefBlocker,'insufficient_cited_decision_brief');
  assert.equal(sourceOnlyValidated?.envelope.userAction,'unavailable');
  assert.equal(sourceOnlyValidated?.detailAvailability,'unavailable');
  assert.equal(projectionRuntime.DECISION_BRIEF_UNAVAILABLE_REASON,'insufficient_cited_decision_brief');
  const sourceOnlyDetail=webPublication.buildPublishedDecisionDetailResult(sourceOnlyValidated);
  assert.equal(sourceOnlyDetail.statusCode,409);
  assert.equal(sourceOnlyDetail.cacheControl,'no-store');
  assert.equal(sourceOnlyDetail.body.status,'unavailable');
  assert.equal(sourceOnlyDetail.body.reason,'insufficient_cited_decision_brief');
  assert.equal('decisionEnvelope' in sourceOnlyDetail.body,false,
    'source-only detail never publishes an actionable envelope');
  assert.equal(webPublication.validatePublishedDecisionCard({...sourceOnlyCard,
    decisionBrief:{availability:'unavailable',reason:'arbitrary_blocker'}}),null,
  'the unavailable blocker vocabulary is closed across Runtime and Web');
  const validators=[envelopeValidator,webPublication.validateDecisionEnvelopeV313];
  const thresholdFormal=decide({...formalInput('breakout_confirmed'),valuation:{status:'normal',
    valuationRange:{bear:90,base:115,bull:130},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},geometry:{availability:'available',entryZone:[99,101],
    invalidation:92.5,trigger:null}});
  const lowUpside=decide({...formalInput('breakout_confirmed'),valuation:{status:'normal',
    valuationRange:{bear:90,base:114.9,bull:130},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},geometry:{availability:'available',entryZone:[99,101],
    invalidation:92.5,trigger:null}});
  const lowRewardRisk=decide({...formalInput('breakout_confirmed'),valuation:{status:'normal',
    valuationRange:{bear:90,base:120,bull:140},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},geometry:{availability:'available',entryZone:[99,101],
    invalidation:89,trigger:null}});
  const relativeAt15=decide({...relativeInput('at_support'),researchScore:{axes:{valuation:{trustworthy:true,
    currentPe:12.75,historyPeP25:10,historyPeMedian:15,historyPeP75:20,sectorPe:16,
    historySampleCount:252,sectorCount:8,valuationEvidence:RELATIVE_EVIDENCE,
    asOf:'2026-08-07',sourceRefs:['twse-openapi:official']}}}});
  const relativeAt149=decide({...relativeInput('at_support'),researchScore:{axes:{valuation:{trustworthy:true,
    currentPe:12.765,historyPeP25:10,historyPeMedian:15,historyPeP75:20,sectorPe:16,
    historySampleCount:252,sectorCount:8,valuationEvidence:RELATIVE_EVIDENCE,
    asOf:'2026-08-07',sourceRefs:['twse-openapi:official']}}}});
  const roundedUpUpside=decide({...formalInput('at_support'),valuation:{status:'normal',
    valuationRange:{bear:90,base:114.99,bull:130},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}}});
  const roundedUpReward=decide({...formalInput('at_support'),valuation:{status:'normal',
    valuationRange:{bear:90,base:115,bull:130},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},geometry:{availability:'available',entryZone:[99,101],
    invalidation:92.49625,trigger:null}});
  const roundedUpRelative=decide({...relativeInput('at_support'),researchScore:{axes:{valuation:{trustworthy:true,
    currentPe:12.7515,historyPeP25:10,historyPeMedian:15,historyPeP75:20,sectorPe:16,
    historySampleCount:252,sectorCount:8,valuationEvidence:RELATIVE_EVIDENCE,
    asOf:'2026-08-07',sourceRefs:['twse-openapi:official']}}}});
  assert.equal(thresholdFormal.userAction,'buy');assert.equal(thresholdFormal.valuationSummary.baseUpsidePct,15);
  assert.equal(thresholdFormal.entryPlan.rewardRisk,2);assert.equal(relativeAt15.userAction,'research_starter');
  assert.equal(relativeAt15.valuationSummary.relativeDiscountPct,15);assert.equal(relativeAt149.userAction,'avoid');
  assert.equal(roundedUpUpside.userAction,'avoid');assert.equal(roundedUpReward.userAction,'avoid');
  assert.equal(roundedUpRelative.userAction,'avoid');
  const negativeHalfTie=decide({...formalInput('at_support'),valuation:{status:'normal',
    valuationRange:{bear:80,base:98.75,bull:120},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}}});
  assert.equal(negativeHalfTie.valuationSummary.baseUpsidePct,-1.3,
    'Runtime follows canonical negative half-away-from-zero rounding');
  assert.ok(webPublication.validateDecisionEnvelopeV313(negativeHalfTie),
    'Web accepts the same negative half-tie envelope as Runtime');
  for(const validate of validators){
    assert.ok(validate(thresholdFormal));assert.ok(validate(relativeAt15));assert.ok(validate(relativeAt149));
    assert.equal(validate({...lowUpside,userAction:'buy'}),null,'14.9% upside cannot be elevated to buy');
    assert.equal(validate({...lowRewardRisk,userAction:'buy'}),null,'1.82 reward/risk cannot be elevated to buy');
    assert.equal(validate({...relativeAt149,userAction:'research_starter'}),null,'14.9% relative discount cannot be elevated');
    assert.equal(validate({...thresholdFormal,valuationSummary:{...thresholdFormal.valuationSummary,method:null}}),null);
    assert.equal(validate({...thresholdFormal,valuationSummary:{...thresholdFormal.valuationSummary,asOf:null}}),null);
    assert.equal(validate({...thresholdFormal,valuationSummary:{...thresholdFormal.valuationSummary,sourceRefs:[]}}),null);
    const wrongTriggerCases=[
      [decide(relativeInput('below_support')),{kind:'breakout',threshold:102}],
      [decide(relativeInput('reclaim_required')),{kind:'pullback',threshold:98}],
      [decide(relativeInput('breakout_pending')),{kind:'pullback',threshold:98}],
      [decide(relativeInput('extended')),{kind:'reclaim',threshold:102}],
      [decide(relativeInput('invalidated')),{kind:'reclaim',threshold:102}],
      [decide(relativeInput('at_support')),102],
      [decide(relativeInput('below_support')),{threshold:102}],
      [decide(relativeInput('below_support')),{kind:'reclaim',threshold:102,arbitrary:true}],
    ];
    for(const [subject,trigger] of wrongTriggerCases){
      assert.equal(validate({...subject,entryPlan:{...subject.entryPlan,trigger}}),null,
        `state-specific trigger union must reject ${subject.entryPlan?.technicalState}`);
    }
    assert.equal(validate({...relativeAt15,valuationSummary:{...relativeAt15.valuationSummary,
      thresholdAuthority:{...relativeAt15.valuationSummary.thresholdAuthority,historySessions:253}}}),null);
    const unavailable=runtime('decision-envelope.js').unavailableDecisionEnvelope({reason:'valuation_missing'});
    assert.equal(validate({...unavailable,userAction:'avoid'}),null,'missing authority is unavailable, never avoid');
  }
  const validPublished=identityCards[0];
  const validatedAvailable=webPublication.validatePublishedDecisionCard(validPublished);
  assert.ok(validatedAvailable);
  const readyDetail=webPublication.buildPublishedDecisionDetailResult(validatedAvailable);
  assert.equal(readyDetail.statusCode,200);assert.equal(readyDetail.body.status,'ready');
  assert.ok('decisionEnvelope' in readyDetail.body);
  const staleBuyCard={...validPublished,projectionReadOnly:true,lastKnownAction:'buy'};
  const staleBuy=webPublication.validatePublishedDecisionCard(staleBuyCard);
  assert.equal(staleBuy?.detailAvailability,'stale_readonly');
  assert.equal(staleBuy?.lastKnownAction,'buy');
  const staleDetail=webPublication.buildPublishedDecisionDetailResult(staleBuy);
  assert.equal(staleDetail.statusCode,409);assert.equal(staleDetail.cacheControl,'no-store');
  assert.equal(staleDetail.body.status,'stale_readonly');assert.equal(staleDetail.body.lastKnownAction,'buy');
  assert.equal('decisionEnvelope' in staleDetail.body,false,
    'stale detail may disclose lastKnownAction but never an actionable envelope');
  assert.equal('valuationSummary' in staleDetail.body,false);
  assert.equal(webPublication.validatePublishedDecisionCard({...staleBuyCard,lastKnownAction:'accumulate'}),null,
    'stale marker cannot contradict the immutable envelope action');
  const nestedMismatch={...validPublished,researchDecision:{decisionEnvelope:{...validPublished.decisionEnvelope,
    reason:'contradictory_nested_envelope'}}};
  assert.equal(webPublication.validatePublishedDecisionCard(nestedMismatch),null);
  const invalidDuplicate={symbol:validPublished.symbol,decisionRevisionId:validPublished.decisionRevisionId,
    decisionEnvelope:validPublished.decisionEnvelope};
  assert.equal(webPublication.selectUniquePublishedDecisionCard({sourceSignals:[validPublished,invalidDuplicate]},
    String(validPublished.symbol),String(validPublished.decisionRevisionId)),null,
  'a raw invalid duplicate cannot be discarded before uniqueness is established');
  const legacyNonDecision={symbol:validPublished.symbol,newPositionAction:'valuation_review',
    researchDecision:{availability:'unavailable',reason:'projection_missing'}};
  assert.equal(webPublication.selectUniquePublishedDecisionCard({sourceSignals:[validPublished],
    earlyWatchlist:[legacyNonDecision]},String(validPublished.symbol),String(validPublished.decisionRevisionId))?.card,
  validPublished,'a legacy non-decision row must not make an exact decision revision ambiguous');
  const exactReadSource=readFileSync(path.join(root,'web/src/lib/opportunity-v3/compact-radar-read.ts'),'utf8');
  const exactReadBody=exactReadSource.slice(exactReadSource.indexOf('export async function loadCompactRadarDecisionRevision'));
  assert.doesNotMatch(exactReadBody,/loadCompactRadarProjection[(]/u,
    'exact revision lookup must not scan or require the newest projection');
  assert.match(exactReadBody,/legacy_decision_revision_evaluations_v3_13/u);
  assert.match(exactReadBody,/order\('evaluated_at',\{ascending:false\}\)/u);
  assert.match(exactReadBody,/heartbeats\[0\][?][.]evaluated_at===heartbeats\[1\][?][.]evaluated_at/u);
  assert.match(exactReadBody,/sourceSignals:\[exact/u);
  const decisionBriefSource=readFileSync(path.join(root,'web/src/app/stock/[symbol]/RevisionBoundDecisionBrief.tsx'),'utf8');
  assert.match(decisionBriefSource,/formatDateTime\(String\(provenance[?][.]evaluatedAt/u);
  assert.doesNotMatch(decisionBriefSource,/formatDateTime\(envelope[.]evaluatedAt\)/u);
  const stockDetailSource=readFileSync(path.join(root,'web/src/app/stock/[symbol]/page.tsx'),'utf8');
  const invalidBoundary=stockDetailSource.indexOf('revisionParameterPresent && !validRequestedRevision');
  assert.ok(invalidBoundary>stockDetailSource.indexOf('parseDecisionRevisionQuery'));
  for(const forbiddenAfterBoundary of ["loadPublishedRadarProjection('home')"]){
    assert.ok(invalidBoundary<stockDetailSource.indexOf(forbiddenAfterBoundary),
      `invalid revision must return before ${forbiddenAfterBoundary}`);
  }
  assert.match(stockDetailSource,/revisionQuery[.]status==='valid'/u);
  assert.match(stockDetailSource,/decision_revision_parameter_invalid_or_ambiguous/u);
  assert.match(stockDetailSource,/authoritative_decision_envelope_missing/u);
  assert.doesNotMatch(stockDetailSource,/runStockResearchRefresh|tradeDecision|entryDecision|recommendationStance|technicalEntrySignal|nextSessionPlaybook/u,
    'generic detail is a closed revision read and contains no independent legacy action authority');
  assert.match(stockDetailSource,/RevisionBoundDecisionUnavailable/u);
  assert.doesNotMatch(stockDetailSource,/目前沒有第三項可驗證 thesis/u);
  assert.match(decisionBriefSource,/decision_brief_unavailable/u);
  assert.ok(decisionBriefSource.indexOf("detailAvailability==='stale_readonly'")
    <decisionBriefSource.indexOf("detailAvailability==='unavailable'"),
  'stale read-only state has precedence over an underlying brief state');
  const technicalDetailSource=readFileSync(path.join(root,'web/src/app/stock/[symbol]/technical/page.tsx'),'utf8');
  assert.match(technicalDetailSource,/redirect\(`/u);
  assert.match(technicalDetailSource,/values[.]length>1/u);
  assert.match(technicalDetailSource,/RevisionBoundDecisionUnavailable/u);
  assert.doesNotMatch(technicalDetailSource,/getStockTechnicalLookup|technicalEntrySignal|nextSessionPlaybook|queueStockResearchRefresh/u);
  for(const apiPath of ['deep-dive','insight']){
    const apiSource=readFileSync(path.join(root,`web/src/app/api/stocks/[symbol]/${apiPath}/route.ts`),'utf8');
    assert.doesNotMatch(apiSource,/getStockDeepDiveLookup|getStockTechnicalLookup|getStockInsight|queueStockResearchRefresh/u);
    if(apiPath==='deep-dive'){
      assert.match(apiSource,/buildPublishedDecisionDetailResult/u);
      assert.match(apiSource,/[.]getAll\('decisionRevisionId'\)/u);
      assert.match(apiSource,/revisionValues[.]length!==1/u);
      assert.match(apiSource,/decision_revision_ambiguous/u);
    }
  }
});

acceptanceTest('DI-002','V3.13 formal valuation requires four consecutive quarters and rejects the 2337 one-quarter shortcut',()=>{
  const {valuationFactInput}=runtime('auth-source-worker-cli.js');
  const oneQuarter=['quarterly_revenue','quarterly_gross_profit','quarterly_operating_income','quarterly_pretax_income',
    'quarterly_net_income_attributable_to_common','quarterly_diluted_eps'].map((key,index)=>officialFactRow('2337',key,'2026-03-31',
      key==='quarterly_diluted_eps'?0.9:[56390000,18000000,5639000,2100000,1772100][index]));
  assert.equal(valuationFactInput(oneQuarter).periodReadiness,'missing_complete_official_bridge');
  assert.equal(valuationFactInput(oneQuarter).dilutedShares,null);
  const ttm=valuationFactInput(completeOfficialFacts('2337'),'2026-08-07T10:20:00Z');
  assert.equal(ttm.periodReadiness,'ttm_from_four_official_quarters');
  assert.equal(ttm.revenue,5_200_000);assert.equal(ttm.netIncome,470_000);assert.equal(ttm.dilutedShares,100_000);
  assert.deepEqual(ttm.bridgeQuarterPeriods,['2025-09-30','2025-12-31','2026-03-31','2026-06-30']);
  const mixedPeriods=completeOfficialFacts('2337').map((row)=>row[1]==='quarterly_gross_profit'
    ?[...row.slice(0,2),`${Number(row[2].slice(0,4))-1}${row[2].slice(4)}`,
      `${Number(row[3].slice(0,4))-1}${row[3].slice(4)}`,...row.slice(4)]:row);
  assert.notEqual(valuationFactInput(mixedPeriods,'2026-08-07T10:20:00Z').periodReadiness,
    'ttm_from_four_official_quarters');
  const futureQuarter=completeOfficialFacts('2337').map((row)=>row[3]==='2026-06-30'
    ?[...row.slice(0,3),'2027-06-30',...row.slice(4,8),'2026-07-31T00:00:00Z',
      '2026-07-31T00:00:00Z','2026-07-31T01:00:00Z','2026-07-31T01:00:00Z',...row.slice(12)]:row);
  const futureResult=valuationFactInput(futureQuarter,'2026-08-07T10:20:00Z');
  assert.notEqual(futureResult.periodReadiness,'ttm_from_four_official_quarters');
  assert.ok(futureResult.missingFacts?.length>0,
    'future reported period identities are rejected before point-in-time TTM selection');
});

test('V3.14 cumulative reported EPS is reconciled without subtracting EPS across changing share counts',()=>{
  const {valuationFactInput}=runtime('auth-source-worker-cli.js');
  const facts=completeOfficialFacts('2337');
  const cumulativeShares=new Map([
    ['2024-06-30',110],['2024-09-30',120],['2024-12-31',130],['2025-03-31',140],['2025-06-30',150],
    ['2025-09-30',160],['2025-12-31',170],['2026-03-31',180],['2026-06-30',190],
  ]);
  const cumulativeIncome=new Map(facts.filter((row)=>row[1]==='quarterly_net_income_attributable_to_common')
    .map((row)=>[row[3],Number(row[5])]));
  const adjusted=facts.map((row)=>row[1]==='diluted_weighted_average_shares'
    ?[...row.slice(0,5),cumulativeShares.get(row[3]),...row.slice(6)]
    :row[1]==='quarterly_diluted_eps'
      ?[...row.slice(0,5),cumulativeIncome.get(row[3])/cumulativeShares.get(row[3]),...row.slice(6)]
      :row);
  const result=valuationFactInput(adjusted,'2026-08-07T10:20:00Z');
  assert.equal(result.periodReadiness,'ttm_from_four_official_quarters');
  assert.ok(result.dilutedShares>0);
});

acceptanceTest('DI-003','V3.13 official facts and 252-session peer authority reach a formal valuation without hidden inputs',()=>{
  const worker=runtime('auth-source-worker-cli.js');
  const candidate={stockId:'10000000-0000-4000-8000-000000000001',symbol:'1101',canonicalSector:'food'};
  const facts=completeOfficialFacts('1101');
  const dates=[];for(let cursor=new Date('2026-08-07T00:00:00Z');dates.length<252;cursor.setUTCDate(cursor.getUTCDate()-1)){
    if(![0,6].includes(cursor.getUTCDay()))dates.unshift(cursor.toISOString().slice(0,10));
  }
  const hash='a'.repeat(64);
  const own=dates.map((session,index)=>({stockId:candidate.stockId,symbol:'1101',sector:'food',exchange:'TWSE',
    session,close:44,peRatio:8+index%5,publishedAt:`${session}T06:30:00Z`,sourceTimestamp:`${session}T06:30:00Z`,
    collectedAt:`${session}T07:00:00Z`,sourceRef:`twse-rwd:BWIBBU_d:${session}:1101`,tradingSessionAuthorityHash:hash}));
  const current=own.at(-1).session;
  const peers=Array.from({length:8},(_,index)=>({ ...own.at(-1),stockId:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    symbol:String(1200+index),session:current,peRatio:11+index/10,sharesOutstanding:1_000_000+index,
    sourceRef:`twse-openapi:BWIBBU_ALL:${current}:${String(1200+index)}` }));
  const input=worker.valuationAuthorityInput(candidate,facts,{reportedRows:[...own,...peers]},'2026-08-07T10:20:00Z');
  const valuation=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:candidate.stockId,
    subjectStockId:candidate.stockId,sector:candidate.canonicalSector,cutoff:'2026-08-07T10:20:00Z',
    asOf:'2026-08-07T10:20:00Z',facts:worker.valuationFactInput(facts),...input});
  assert.equal(valuation.status,'normal',JSON.stringify({valuation,
    timestamps:worker.valuationFactInput(facts).currentAnchorSourceTimestamps}));assert.equal(valuation.method.method,'pe');
  assert.deepEqual(valuation.valuationRange,
    {bear:42.542273817721515,base:57.06275949367089,bull:74.3056969670886});
  assert.equal(valuation.reportedPe.ownReference.count,252);assert.equal(valuation.reportedPe.sectorReference.count,8);
  assert.ok(valuation.valuationRange.bear<=valuation.valuationRange.base&&valuation.valuationRange.base<=valuation.valuationRange.bull);
  assert.ok(valuation.evidence.sourceRefs.every((ref)=>ref.startsWith('twse-openapi:statement:')));
  for(const [caseName,scenario] of Object.entries(valuation.scenarios)) {
    assert.equal(scenario.case,caseName);assert.equal(scenario.value,scenario.targetPrice);
    assert.ok(scenario.inputs.length>=3&&scenario.inputs.every((row)=>row.sourceRef&&row.asOf));
    assert.equal(scenario.sensitivity.length,4);assert.ok(scenario.sensitivity.every((row)=>Number.isFinite(row.result)));
  }
  const currentAxis={...own.at(-1),authority:'exchange_reported',pbRatio:null,
    sourceUrl:'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
    sourceRef:`twse-openapi:BWIBBU_ALL:${current}:1101`};
  const historyAxis=own.slice(0,-1).map((row)=>({...row,authority:'exchange_reported_history'}));
  const exactReference=worker.exactSectorPeReference(currentAxis,peers.map((row)=>({...row,authority:'exchange_reported'})));
  assert.deepEqual(exactReference&&{count:exactReference.count,exchange:exactReference.exchange,
    session:exactReference.session,sector:exactReference.sector},{count:8,exchange:'TWSE',session:current,sector:'food'});
  assert.equal(worker.valuationResearchAxis(currentAxis,exactReference,historyAxis).historySampleCount,252);
  assert.equal(worker.valuationResearchAxis(currentAxis,exactReference,historyAxis.slice(1)).historySampleCount,251);
  assert.equal(worker.exactSectorPeReference(currentAxis,[...peers.slice(0,7).map((row)=>({...row,authority:'exchange_reported'})),
    {...peers[7],authority:'exchange_reported',exchange:'TPEX'}]),null);
  const withoutBook=facts.filter((row)=>row[1]!=='book_value_per_share');
  const bookA=officialFactRow('1101','book_value_per_share','2025-12-31',60,'twse-openapi:book:a');
  const bookB=officialFactRow('1101','book_value_per_share','2025-12-31',80,'twse-openapi:book:b');
  for(const pair of [[bookA,bookB],[bookB,bookA]]){
    const conflictedFacts=worker.valuationFactInput([...withoutBook,...pair],'2026-08-07T10:20:00Z');
    assert.equal(conflictedFacts.authorityConflict,'authority_conflict');
    assert.equal(conflictedFacts.periodReadiness,'conflicting_point_in_time_fact');
    assert.deepEqual(conflictedFacts.sourceRefs,[]);
  }

  const financeCandidate={...candidate,symbol:'2888',canonicalSector:'finance_insurance'};
  const financeOwn=own.map((row,index)=>({...row,symbol:'2888',stockId:financeCandidate.stockId,sector:'finance_insurance',
    pbRatio:1.05+(index%5)/100}));
  const financePeers=peers.map((row,index)=>({...row,sector:'finance_insurance',pbRatio:.9+index/10}));
  const financeInput=worker.valuationAuthorityInput(financeCandidate,completeOfficialFacts('2888'),
    {reportedRows:[...financeOwn,...financePeers]},'2026-08-07T10:20:00Z');
  const finance=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:financeCandidate.stockId,
    subjectStockId:financeCandidate.stockId,sector:financeCandidate.canonicalSector,cutoff:'2026-08-07T10:20:00Z',
    asOf:'2026-08-07T10:20:00Z',facts:worker.valuationFactInput(completeOfficialFacts('2888')),...financeInput});
  assert.equal(finance.status,'normal',JSON.stringify(finance));assert.equal(finance.method.method,'pb_roe');
  assert.deepEqual(finance.valuationRange,{bear:64.15,base:71.375,bull:78.60000000000001},
    JSON.stringify({scenarios:financeInput.scenarios,methodAuthority:financeInput.methodAuthority}));
  assert.ok(finance.bridge.roe>0);
  assert.ok(finance.valuationRange.base>0);
  const roeDates=['2024-09-30','2024-12-31','2025-03-31','2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const residualFacts=[...completeOfficialFacts('2888'),...roeDates.map((end,index)=>officialFactRow('2888','roe',end,8+index))];
  const residualInput=worker.valuationAuthorityInput(financeCandidate,residualFacts,
    {reportedRows:[...financeOwn,...financePeers]},'2026-08-07T10:20:00Z');
  const residual=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:financeCandidate.stockId,
    subjectStockId:financeCandidate.stockId,sector:'finance_insurance',cutoff:'2026-08-07T10:20:00Z',
    asOf:'2026-08-07T10:20:00Z',facts:worker.valuationFactInput(residualFacts),...residualInput});
  assert.equal(residual.status,'normal',JSON.stringify(residual));assert.equal(residual.method.method,'residual_income');
  assert.deepEqual(residual.valuationRange,{bear:48.75,base:72.85714285714286,bull:165});
  assert.deepEqual(residual.crossChecks[0].scenarios.base.targetPrice,71.375);
  assert.equal(worker.valuationAuthorityInput(financeCandidate,completeOfficialFacts('2888'),
    {reportedRows:[...financeOwn.slice(0,251),...financePeers]},'2026-08-07T10:20:00Z').scenarios,null);
  assert.equal(worker.valuationAuthorityInput(financeCandidate,completeOfficialFacts('2888'),
    {reportedRows:[...financeOwn,...financePeers.slice(0,7)]},'2026-08-07T10:20:00Z').scenarios,null);
  const conflictInput=worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own.map((row,index)=>index===own.length-1
      ?{...row,authorityConflict:'authority_conflict'}:row),...peers]},'2026-08-07T10:20:00Z');
  assert.equal(conflictInput.authorityConflict,'authority_conflict');
  const conflictValuation=runtime('candidate-valuation.js').evaluateCandidateValuation({
    stockId:candidate.stockId,subjectStockId:candidate.stockId,sector:candidate.canonicalSector,
    cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07T10:20:00Z',facts:worker.valuationFactInput(facts),
    ...conflictInput,
  });
  assert.equal(conflictValuation.status,'valuation_review');
  assert.equal(conflictValuation.reason,'authority_conflict');
  assert.deepEqual(conflictValuation.reportedPe.current,
    {status:'unavailable',reason:'authority_conflict',value:null,asOf:null,sourceRef:null,manifestRef:null});
  assert.equal(conflictValuation.reportedPe.ownHistory.reason,'authority_conflict');
  assert.equal(conflictValuation.reportedPe.sector.reason,'authority_conflict');
  const duplicatedCurrent={...own.at(-1)};
  const conflictedCurrent={...duplicatedCurrent,authorityConflict:'authority_conflict',sourceRef:null,
    publishedAt:null,sourceTimestamp:null,collectedAt:null};
  for(const pair of [[conflictedCurrent,duplicatedCurrent],[duplicatedCurrent,conflictedCurrent]]) {
    const permutation=worker.valuationAuthorityInput(candidate,facts,
      {reportedRows:[...own.slice(0,-1),...pair,...peers]},'2026-08-07T10:20:00Z');
    assert.equal(permutation.authorityConflict,'authority_conflict');
  }
  const sharesA={...duplicatedCurrent,sharesOutstanding:1_000_000,sourceRef:'twse-openapi:shares:a'};
  const sharesB={...duplicatedCurrent,sharesOutstanding:2_000_000,sourceRef:'twse-openapi:shares:b'};
  for(const pair of [[sharesA,sharesB],[sharesB,sharesA]]) {
    const permutation=worker.valuationAuthorityInput(candidate,facts,
      {reportedRows:[...own.slice(0,-1),...pair,...peers]},'2026-08-07T10:20:00Z');
    assert.equal(permutation.authorityConflict,'authority_conflict');
  }
  const wrongExchangePeer={...peers[0],stockId:'30000000-0000-4000-8000-000000000001',exchange:'TPEX'};
  const crossExchange=worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own,...peers.slice(0,7),wrongExchangePeer]},'2026-08-07T10:20:00Z');
  assert.equal(crossExchange.scenarios,null);
  assert.equal(crossExchange.rows.filter((row)=>row.stockId===wrongExchangePeer.stockId).length,0);
  const workerSource=readFileSync(path.join(root,'scripts/runtime/auth-source-worker-cli.js'),'utf8');
  assert.doesNotMatch(workerSource,/valuationInput:\s*\{\s*[.][.][.]persistedValuationInput/u);
  assert.match(workerSource,/compatibility valuationInputs forbidden/u);
  assert.doesNotMatch(workerSource,/financialFacts:\s*[(]acquisitionSnapshot[?][.]financialFacts[^\n]+slice[(]0,600[)]/u);
  assert.match(workerSource,/const financialFacts=resumeAllowed[\s\S]*newFinancialFactsV314\(snapshot[?][.]financialFacts[?][?]\[\],[\s\S]*priorFinancialRows/u);
  assert.match(workerSource,/\['financial_facts','financialFacts',financialFacts,20\]/u);
  assert.match(workerSource,/priorFinancialRows:bundle[.]financialRows[?][?]\[\]/u);
  assert.match(workerSource,/items[.]slice\(offset,offset[+]chunkSize\)/u);
  const missingSharesInput=worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own,...peers.map((row)=>({...row,sharesOutstanding:null}))]},'2026-08-07T10:20:00Z');
  assert.equal(runtime('reported-pe-authority.js').selectOfficialReportedPe({stockId:candidate.stockId,
    asOf:'2026-08-07T10:20:00Z',rows:missingSharesInput.rows,sector:candidate.canonicalSector,
    tradingSessionAuthorityHash:hash}).sectorReference.availability,'unavailable');
  assert.deepEqual(worker.valuationAuthorityInput({...candidate,canonicalSector:'unknown'},facts,
    {reportedRows:[...own,...peers]},'2026-08-07T10:20:00Z'),{});
  assert.deepEqual(worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own.map((row)=>({...row,sector:'unknown'})),...peers]},'2026-08-07T10:20:00Z'),{});
  assert.deepEqual(worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own.map((row)=>({...row,sector:'semiconductor'})),...peers]},'2026-08-07T10:20:00Z'),{});
  const incompleteAuthority=worker.valuationAuthorityInput(candidate,facts,
    {reportedRows:[...own.slice(1),...peers]},'2026-08-07T10:20:00Z');
  assert.equal(runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:candidate.stockId,
    subjectStockId:candidate.stockId,sector:'food',cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07T10:20:00Z',
    facts:worker.valuationFactInput(facts),...incompleteAuthority}).reason,'insufficient_multiple_reference');
  const staleAuthority={...input,methodAuthority:{...input.methodAuthority,asOf:'2026-01-01'}};
  assert.equal(runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:candidate.stockId,
    subjectStockId:candidate.stockId,sector:'food',cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07T10:20:00Z',
    facts:worker.valuationFactInput(facts),...staleAuthority}).reason,'stale_financial_inputs');

  const methodRows=(subject,sector,field)=>{
    const factKey={evSalesRatio:'ev_sales_multiple',evEbitdaRatio:'ev_ebitda_multiple',navMultiple:'net_asset_value'}[field];
    const ownRows=own.map((row,index)=>({...row,stockId:subject.stockId,symbol:subject.symbol,sector,
      peRatio:null,pbRatio:null,[field]:.8+(index%5)/10,metricSources:factKey?{[factKey]:{
        sourceRef:`twse-openapi:${factKey}:${row.session}:${subject.symbol}`,asOf:`${row.session}T06:30:00Z`}}:{}}));
    const peerRows=peers.map((row,index)=>({...row,sector,peRatio:null,pbRatio:null,[field]:.9+index/10,
      metricSources:factKey?{[factKey]:{sourceRef:`twse-openapi:${factKey}:${row.session}:${row.symbol}`,
        asOf:`${row.session}T06:30:00Z`}}:{}}));
    return {ownRows,peerRows};
  };
  const assetCandidate={...candidate,symbol:'2601',canonicalSector:'construction'};
  const assetFacts=[...completeOfficialFacts('2601'),officialFactRow('2601','net_asset_value','2026-06-30',8000)];
  const assetRows=methodRows(assetCandidate,'construction','navMultiple');
  const assetInput=worker.valuationAuthorityInput(assetCandidate,assetFacts,
    {reportedRows:[...assetRows.ownRows,...assetRows.peerRows]},'2026-08-07T10:20:00Z');
  const nav=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:assetCandidate.stockId,
    subjectStockId:assetCandidate.stockId,sector:'construction',cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07',
    facts:worker.valuationFactInput(assetFacts),...assetInput});
  assert.equal(nav.status,'normal');assert.equal(nav.method.method,'nav');
  assert.deepEqual(nav.valuationRange,{bear:52,base:64,bull:76});
  assert.equal(worker.valuationAuthorityInput(assetCandidate,assetFacts,
    {reportedRows:[...assetRows.ownRows.slice(0,251),...assetRows.peerRows]},'2026-08-07T10:20:00Z').scenarios,null);
  assert.equal(worker.valuationAuthorityInput(assetCandidate,assetFacts,
    {reportedRows:[...assetRows.ownRows,...assetRows.peerRows.slice(0,7)]},'2026-08-07T10:20:00Z').scenarios,null);

  const priorCycle=[
    ['2023-06-30',110],['2023-09-30',180],['2023-12-31',260],['2024-03-31',60],
  ].map(([end,value])=>officialFactRow('2002','quarterly_net_income_attributable_to_common',end,value));
  const steelCandidate={...candidate,symbol:'2002',canonicalSector:'steel'};
  const steelFacts=[...completeOfficialFacts('2002'),...priorCycle];
  const steelOwn=own.map((row)=>({...row,stockId:steelCandidate.stockId,symbol:'2002',sector:'steel',evEbitdaRatio:6,
    metricSources:{ev_ebitda_multiple:{sourceRef:`twse-openapi:ev_ebitda_multiple:${row.session}:2002`,
      asOf:`${row.session}T06:30:00Z`}}}));
  const steelPeers=peers.map((row,index)=>({...row,sector:'steel',evEbitdaRatio:5.7+index/10,
    metricSources:{ev_ebitda_multiple:{sourceRef:`twse-openapi:ev_ebitda_multiple:${row.session}:${row.symbol}`,
      asOf:`${row.session}T06:30:00Z`}}}));
  const steelInput=worker.valuationAuthorityInput(steelCandidate,steelFacts,
    {reportedRows:[...steelOwn,...steelPeers]},'2026-08-07T10:20:00Z');
  const steel=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:steelCandidate.stockId,
    subjectStockId:steelCandidate.stockId,sector:'steel',cutoff:'2026-08-07T10:20:00Z',
    asOf:'2026-08-07T10:20:00Z',facts:worker.valuationFactInput(steelFacts),...steelInput});
  assert.equal(steel.status,'normal',JSON.stringify(steel));assert.equal(steel.method.method,'normalized_pe');
  assert.deepEqual(steel.valuationRange,{bear:29.55648,base:44.26800000000001,bull:61.58671999999999});
  assert.deepEqual(steel.crossChecks[0].scenarios.base.targetPrice,56.59937215189872);
  assert.equal(steelInput.cycleHistory.length,12);assert.ok(steelInput.crossCheck);

  const reconciledLossFacts=(symbol,negativeEbitda=false)=>{const rows=completeOfficialFacts(symbol);
    const operatingByPeriod=new Map(rows.filter((row)=>row[1]==='quarterly_operating_income')
      .map((row)=>[row[3],row[5]]));
    return rows.map((row)=>{const operating=operatingByPeriod.get(row[3]);
      const replacements={quarterly_non_operating_income:-2*operating,quarterly_pretax_income:-operating,
        quarterly_income_tax_expense:0,quarterly_noncontrolling_interest:0,quarterly_net_income:-operating,
        quarterly_net_income_attributable_to_common:-operating,quarterly_diluted_eps:-operating/100,
        ...(negativeEbitda?{quarterly_ebitda:-Math.abs(row[5])}:{})};
      return Object.hasOwn(replacements,row[1])?[...row.slice(0,5),replacements[row[1]],...row.slice(6)]:row;});};
  const ebitdaCandidate={...candidate,symbol:'9997',canonicalSector:'information_service'};
  const ebitdaFacts=reconciledLossFacts('9997');
  const ebitdaRows=methodRows(ebitdaCandidate,'information_service','evEbitdaRatio');
  const ebitdaInput=worker.valuationAuthorityInput(ebitdaCandidate,ebitdaFacts,
    {reportedRows:[...ebitdaRows.ownRows,...ebitdaRows.peerRows]},'2026-08-07T10:20:00Z');
  const ebitda=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:ebitdaCandidate.stockId,
    subjectStockId:ebitdaCandidate.stockId,sector:'information_service',cutoff:'2026-08-07T10:20:00Z',
    asOf:'2026-08-07',facts:worker.valuationFactInput(ebitdaFacts),...ebitdaInput});
  assert.equal(ebitda.status,'normal',JSON.stringify(ebitda));assert.equal(ebitda.method.method,'ev_ebitda');
  assert.deepEqual(ebitda.valuationRange,
    {bear:15.987365113924053,base:18.514835443037974,bull:21.51763211139241});

  const lossCandidate={...candidate,symbol:'9998',canonicalSector:'information_service'};
  const lossFacts=reconciledLossFacts('9998',true);
  const lossRows=methodRows(lossCandidate,'information_service','evSalesRatio');
  const lossInput=worker.valuationAuthorityInput(lossCandidate,lossFacts,
    {reportedRows:[...lossRows.ownRows,...lossRows.peerRows]},'2026-08-07T10:20:00Z');
  const loss=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:lossCandidate.stockId,
    subjectStockId:lossCandidate.stockId,sector:'information_service',cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07',
    facts:worker.valuationFactInput(lossFacts),...lossInput});
  assert.equal(loss.status,'normal',JSON.stringify(loss));assert.equal(loss.method.method,'ev_sales');assert.equal(loss.eps,null);
  assert.deepEqual(loss.valuationRange,{bear:60.21661063291139,base:75.8886075949367,bull:92.72332455696203});
  assert.equal(worker.valuationAuthorityInput(lossCandidate,lossFacts,
    {reportedRows:[...lossRows.ownRows.slice(0,251),...lossRows.peerRows]},'2026-08-07T10:20:00Z').scenarios,null);
  assert.equal(worker.valuationAuthorityInput(lossCandidate,lossFacts,
    {reportedRows:[...lossRows.ownRows,...lossRows.peerRows.slice(0,7)]},'2026-08-07T10:20:00Z').scenarios,null);

  const evaluateWithFacts=(subject,sector,officialFacts,authorityInput)=>runtime('candidate-valuation.js')
    .evaluateCandidateValuation({stockId:subject.stockId,subjectStockId:subject.stockId,sector,
      cutoff:'2026-08-07T10:20:00Z',asOf:'2026-08-07T10:20:00Z',facts:officialFacts,...authorityInput});
  const staleFacts=(officialFacts,key)=>({...officialFacts,currentAnchorSourceTimestamps:{
    ...officialFacts.currentAnchorSourceTimestamps,[key]:'2025-01-01T00:00:00Z'}});
  const freshnessCases=[
    [candidate,candidate.canonicalSector,worker.valuationFactInput(facts),input,'monthly_revenue'],
    [financeCandidate,financeCandidate.canonicalSector,worker.valuationFactInput(completeOfficialFacts('2888')),financeInput,
      'book_value_per_share'],
    [financeCandidate,financeCandidate.canonicalSector,worker.valuationFactInput(residualFacts),residualInput,'roe'],
    [assetCandidate,'construction',worker.valuationFactInput(assetFacts),assetInput,'net_asset_value'],
    [steelCandidate,'steel',worker.valuationFactInput(steelFacts),steelInput,'quarterly_net_income_attributable_to_common'],
    [ebitdaCandidate,'information_service',worker.valuationFactInput(ebitdaFacts),ebitdaInput,'quarterly_ebitda'],
    [lossCandidate,'information_service',worker.valuationFactInput(lossFacts),lossInput,'monthly_revenue'],
  ];
  for(const [subject,sector,officialFacts,authorityInput,key] of freshnessCases) {
    const stale=evaluateWithFacts(subject,sector,staleFacts(officialFacts,key),authorityInput);
    assert.equal(stale.status,'valuation_review',`${key}:${JSON.stringify(stale)}`);
    assert.equal(stale.reason,'stale_financial_inputs',key);
  }
  for(const [subject,sector,officialFacts,authorityInput] of [
    [financeCandidate,'finance_insurance',worker.valuationFactInput(residualFacts),residualInput],
    [steelCandidate,'steel',worker.valuationFactInput(steelFacts),steelInput],
  ]) {
    const missing=evaluateWithFacts(subject,sector,officialFacts,{...authorityInput,crossCheck:null});
    assert.equal(missing.reason,'cross_check_unavailable');
    const futureCross=structuredClone(authorityInput.crossCheck);futureCross.scenarios.base.asOf='2027-01-01';
    assert.equal(evaluateWithFacts(subject,sector,officialFacts,{...authorityInput,crossCheck:futureCross}).reason,
      'cross_check_unavailable');
    const unorderedCross=structuredClone(authorityInput.crossCheck);
    unorderedCross.scenarios.bear.multiple=unorderedCross.scenarios.bull.multiple*2;
    assert.equal(evaluateWithFacts(subject,sector,officialFacts,{...authorityInput,crossCheck:unorderedCross}).reason,
      'cross_check_unavailable');
    const divergentCross=structuredClone(authorityInput.crossCheck);
    for(const scenario of Object.values(divergentCross.scenarios))scenario.multiple*=3;
    const divergent=evaluateWithFacts(subject,sector,officialFacts,{...authorityInput,crossCheck:divergentCross});
    assert.equal(divergent.reason,'method_divergence');
    assert.ok(divergent.valuationRange&&Number.isFinite(divergent.valuationRange.base));
    assert.equal(divergent.crossChecks[0].scenarios.base.value,divergent.crossChecks[0].base);
  }
  assert.equal(evaluateWithFacts(steelCandidate,'steel',staleFacts(worker.valuationFactInput(steelFacts),'quarterly_ebitda'),
    steelInput).reason,'stale_financial_inputs');
});

acceptanceTest('DI-004','V3.13 FULL detail remains authoritative while LIGHT fills only genuinely missing leaves',async()=>{
  const {mergeAuthoritativeDeepDiveLeaves}=await import('../../web/src/lib/deep-dive-merge.ts');
  const publication=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  const full={targetSnapshot:null,valuationPanel:{base:120},tradeDecision:{action:'wait_reclaim'},
    technicalEntrySignal:{stop:90},chart:[],nested:{full:null,retained:'yes'}};
  const light={targetSnapshot:{base:80},valuationPanel:null,tradeDecision:{action:'avoid'},
    technicalEntrySignal:{stop:110},chart:[{close:100}],nested:{full:'filled',retained:'no'}};
  assert.deepEqual(mergeAuthoritativeDeepDiveLeaves(full,light),{...full,nested:{full:null,retained:'yes'}});
  const revisionId=`decision-v3.13:${'a'.repeat(64)}`;
  assert.deepEqual(publication.parseDecisionRevisionQuery({}),{status:'absent',revisionId:null});
  assert.deepEqual(publication.parseDecisionRevisionQuery({refresh:'1'}),{status:'absent',revisionId:null});
  assert.deepEqual(publication.parseDecisionRevisionQuery({decisionRevisionId:revisionId,refresh:'1'}),
    {status:'valid',revisionId});
  for(const decisionRevisionId of ['bad',`decision-v3.13:${'A'.repeat(64)}`,
    `decision-v3.13:${'a'.repeat(63)}`,[revisionId,revisionId],[revisionId,`decision-v3.13:${'b'.repeat(64)}`]]){
    assert.deepEqual(publication.parseDecisionRevisionQuery({decisionRevisionId}),
      {status:'invalid_or_ambiguous',revisionId:null});
  }
  const decide=runtime('decision-envelope.js').deriveDecisionEnvelope;
  const legacy={opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],recentFormal7d:[],
    fallbackOpportunities90d:[],hotTracking:[]};
  const current=runtime('compact-radar-projection.js').addResearchDecisions(legacy,[],'2026-08-07T10:20:00Z',[{
    symbol:'9101',name:'同版詳情',claimId:'claim-di004',sourceKey:'official',sourceName:'官方來源',
    claimAsOf:'2026-08-07T09:00:00Z',sourceUrl:'https://example.com/di004',
    sourceCollectedAt:'2026-08-07T10:00:00Z',decisionEnvelope:decide(formalInput('breakout_confirmed')),
    materialChangeHash:'4'.repeat(64),analysisRevision:{revisionId:'revision-di004'},
    decisionBrief:citedBrief('claim-di004'),
  }]).sourceSignals[0];
  assert.ok(publication.validatePublishedDecisionCard(current));
  assert.equal(publication.selectUniquePublishedDecisionCard({sourceSignals:[current]},'9101')?.card,current,
    'an absent query may select only the current validated DecisionEnvelope card');
  const duplicate={...current};
  assert.equal(publication.selectUniquePublishedDecisionCard({sourceSignals:[current,duplicate]},'9101'),null);
  const stockDetailSource=readFileSync(path.join(root,'web/src/app/stock/[symbol]/page.tsx'),'utf8');
  const invalidBoundary=stockDetailSource.indexOf("revisionParameterPresent && !validRequestedRevision");
  assert.ok(invalidBoundary>stockDetailSource.indexOf('parseDecisionRevisionQuery'));
  assert.ok(invalidBoundary<stockDetailSource.indexOf("loadPublishedRadarProjection('home')"));
  assert.doesNotMatch(stockDetailSource,
    /runStockResearchRefresh|tradeDecision|entryDecision|recommendationStance|technicalEntrySignal|nextSessionPlaybook/u);
  for(const apiPath of ['deep-dive','insight']){
    const apiSource=readFileSync(path.join(root,`web/src/app/api/stocks/[symbol]/${apiPath}/route.ts`),'utf8');
    assert.doesNotMatch(apiSource,/getStockDeepDiveLookup|getStockTechnicalLookup|getStockInsight|queueStockResearchRefresh/u);
  }
});

acceptanceTest('DI-005','V3.13 projection freshness uses scheduled trading runs, not a 24-hour wall clock',async()=>{
  const {assessProjectionFreshness,PROJECTION_FRESHNESS_POLICY}=await import('../../web/src/lib/opportunity-v3/projection-freshness.ts');
  const {withProjectionHealth}=await import('../../web/src/lib/opportunity-v3/projection-readonly.ts');
  const publication=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  const {radarResponseHeaders}=await import('../../web/src/lib/radar-response-policy.ts');
  const runtimeAssess=runtime('projection-freshness.js').assessProjectionFreshness;
  assert.deepEqual(PROJECTION_FRESHNESS_POLICY,JSON.parse(readFileSync(path.join(root,'config/runtime/projection-freshness-policy.json'),'utf8')));
  // 2026-08-11 is an exchange holiday: every consumer must use the same cutoff-visible schedule embedded in the projection.
  const sessions=['2026-08-07','2026-08-10','2026-08-12','2026-08-13'].map((session_id,index)=>
    ({session_id,status:index===0?'completed':'scheduled'}));
  const base={contentAsOf:'2026-08-07T10:20:00Z',evaluatedAt:'2026-08-07T10:20:00Z',publishedAt:'2026-08-07T10:21:00Z',tradingSessions:sessions};
  const examples=['2026-08-09T23:00:00Z','2026-08-10T13:00:00Z','2026-08-11T13:00:00Z','2026-08-13T13:00:00Z'];
  assert.deepEqual(examples.map((now)=>assessProjectionFreshness({...base,now:new Date(now)}).status),
    ['fresh','stale_readonly','stale_readonly','unavailable']);
  for(const now of examples)assert.deepEqual(assessProjectionFreshness({...base,now:new Date(now)}),
    runtimeAssess({...base,now:new Date(now)}));
  const doctor=readFileSync(path.join(root,'scripts/runtime/runtime-health-observer.js'),'utf8');
  const health=readFileSync(path.join(root,'web/src/app/api/internal/health-check/route.ts'),'utf8');
  assert.match(doctor,/correctness\.freshnessSchedule/u);assert.doesNotMatch(doctor,/FROM public\.tw_trading_sessions_v3/u);
  assert.match(health,/sourceCorrectness\?\.freshnessSchedule/u);assert.doesNotMatch(health,/\.from\('tw_trading_sessions_v3'\)/u);
  const weekend=assessProjectionFreshness({...base,now:new Date('2026-08-09T23:00:00Z')});
  assert.equal(weekend.missedExpectedRuns,0);assert.equal(weekend.nextExpectedAt,'2026-08-10T10:20:00.000Z');
  assert.equal(assessProjectionFreshness({...base,tradingSessions:[],now:new Date('2026-08-09T23:00:00Z')}).reason,
    'calendar_authority_unavailable');

  // Revision-bound actionable bodies are never shared-cacheable. Advancing the
  // authoritative exchange clock across a missed run produces only a no-store,
  // envelope-free readonly response through the same deep-dive/insight path.
  const decide=runtime('decision-envelope.js').deriveDecisionEnvelope;
  const card=runtime('compact-radar-projection.js').addResearchDecisions({
    opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],recentFormal7d:[],
    fallbackOpportunities90d:[],hotTracking:[],
  },[],'2026-08-07T10:20:00Z',[{
    symbol:'9102',name:'快取邊界',claimId:'claim-cache-boundary',sourceKey:'official',sourceName:'官方來源',
    claimAsOf:'2026-08-07T09:00:00Z',sourceUrl:'https://example.com/cache-boundary',
    sourceCollectedAt:'2026-08-07T10:00:00Z',decisionEnvelope:decide(formalInput('breakout_confirmed')),
    materialChangeHash:'5'.repeat(64),analysisRevision:{revisionId:'revision-cache-boundary'},
    decisionBrief:citedBrief('claim-cache-boundary'),
  }]).sourceSignals[0];
  const freshHealth=assessProjectionFreshness({...base,now:new Date('2026-08-10T10:19:59Z')});
  const freshProjection=withProjectionHealth({sourceSignals:[card],sourceLedCorrectness:{schema:'legacy-radar-v3.14.0',window:'home'},
    loadStatus:'ready',loadWarnings:[]},freshHealth);
  const freshCard=publication.validatePublishedDecisionCard(freshProjection.sourceSignals[0]);
  assert.ok(freshCard);const readyResult=publication.buildPublishedDecisionDetailResult(freshCard);
  assert.equal(readyResult.statusCode,200);assert.equal(readyResult.cacheControl,'no-store');
  assert.ok('decisionEnvelope' in readyResult.body);assert.ok('valuationSummary' in readyResult.body);
  const staleHealth=assessProjectionFreshness({...base,now:new Date('2026-08-10T13:00:00Z')});
  const staleProjection=withProjectionHealth({sourceSignals:[card],sourceLedCorrectness:{schema:'legacy-radar-v3.14.0',window:'home'},
    loadStatus:'ready',loadWarnings:[]},staleHealth);
  const staleCard=staleProjection.sourceSignals[0];
  assert.ok(staleCard);assert.equal(staleCard.decisionEnvelope,undefined);
  assert.equal(staleCard.decisionRevisionId,card.decisionRevisionId);
  assert.equal(staleCard.lastKnownAction,'buy');assert.equal(staleCard.projectionReadOnly,true);
  assert.equal(publication.validatePublishedDecisionCard(staleCard),null);
  const deepDiveRoute=readFileSync(path.join(root,'web/src/app/api/stocks/[symbol]/deep-dive/route.ts'),'utf8');
  const insightRoute=readFileSync(path.join(root,'web/src/app/api/stocks/[symbol]/insight/route.ts'),'utf8');
  assert.match(deepDiveRoute,/headers:\{'Cache-Control':result[.]cacheControl\}/u);
  assert.doesNotMatch(deepDiveRoute,/stale-while-revalidate|s-maxage/u);
  assert.match(insightRoute,/import \{ GET as getDecisionRevision \} from '[.][.]\/deep-dive\/route'/u);
  for(const state of ['fresh','stale_readonly','degraded','checksum_conflict','error'])
    assert.deepEqual(radarResponseHeaders(state),{'Cache-Control':'private, no-store'});
  for(const window of ['daily','hot','weekly']){
    const route=readFileSync(path.join(root,`web/src/app/api/radar/${window}/route.ts`),'utf8');
    assert.match(route,/radarResponseHeaders\('fresh'\)/u);
    assert.doesNotMatch(route,/ETag|if-none-match|s-maxage|stale-while-revalidate|public,/u);
    assert.equal((route.match(/headers: NO_STORE/gu)??[]).length,5,`${window} all result classes must be no-store`);
  }
});

test('generic migration discovery is a closed legacy allowlist and the V3.13 plan is authority-bound',()=>{
  const policy=require(path.join(root,'scripts/generic-migration-policy.js'));
  const future=['20990101_future_v3_99.sql','20990102_unknown_schema.sql'];
  const canonical=path.join(root,'migrations');
  const selected=policy.listGenericMigrationFiles(fs,canonical,canonical).map((value)=>path.basename(value));
  assert.deepEqual(selected,policy.GENERIC_MIGRATION_ALLOWLIST);
  assert.ok(selected.every((name)=>!/_v3(?:_|[.])/u.test(name)));
  assert.ok(future.every((name)=>!selected.includes(name)));
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'stockinsider-generic-migrations-'));
  try {
    for(const name of policy.GENERIC_MIGRATION_ALLOWLIST)fs.copyFileSync(path.join(canonical,name),path.join(temporary,name));
    assert.throws(()=>policy.loadGenericMigrationPlan(fs,temporary,canonical),/directory_not_canonical/u);
    const planBeforeSwap=policy.loadGenericMigrationPlan(fs,temporary,temporary);
    const missingTarget=path.join(temporary,policy.GENERIC_MIGRATION_ALLOWLIST.at(-1));
    fs.unlinkSync(missingTarget);
    assert.throws(()=>policy.loadGenericMigrationPlan(fs,temporary,temporary),/plan_incomplete/u);
    fs.copyFileSync(path.join(canonical,policy.GENERIC_MIGRATION_ALLOWLIST.at(-1)),missingTarget);
    const target=path.join(temporary,policy.GENERIC_MIGRATION_ALLOWLIST[0]);
    fs.writeFileSync(target,'SELECT malicious_substitute;');
    assert.throws(()=>policy.loadGenericMigrationPlan(fs,temporary,temporary),/digest_mismatch/u);
    assert.doesNotMatch(planBeforeSwap[0].sql,/malicious_substitute/u);
    fs.copyFileSync(path.join(canonical,policy.GENERIC_MIGRATION_ALLOWLIST[0]),target);
    const symlinkTarget=path.join(temporary,policy.GENERIC_MIGRATION_ALLOWLIST[1]);
    fs.unlinkSync(symlinkTarget);fs.symlinkSync(path.join(canonical,policy.GENERIC_MIGRATION_ALLOWLIST[1]),symlinkTarget);
    assert.throws(()=>policy.loadGenericMigrationPlan(fs,temporary,temporary),/not_regular/u);
    const linkedDirectory=`${temporary}-link`;fs.symlinkSync(temporary,linkedDirectory,'dir');
    assert.throws(()=>policy.loadGenericMigrationPlan(fs,linkedDirectory,linkedDirectory),/directory_not_regular/u);
    fs.unlinkSync(linkedDirectory);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
  const applySource=readFileSync(path.join(root,'apply_migrations.js'),'utf8');
  assert.ok(applySource.indexOf('const migrationPlan = loadMigrationPlan()')<applySource.indexOf('await connectAnyRegion()'));
  assert.ok(applySource.indexOf('const migrationPlan = loadMigrationPlan()')<applySource.indexOf('Missing required env vars'));
  assert.doesNotMatch(applySource,/readFileSync\(file/u);
  const plan=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/run-node22.js'),
    path.join(root,'scripts/opportunity-v3/migration-plan.mjs')],{cwd:root,encoding:'utf8'}));
  assert.equal(plan.protocol,'source-led-opportunity-v3-migration-plan-v2');
  assert.deepEqual(plan.migrations.map((row)=>row.migration),[
    'migrations/20260724_source_led_opportunity_engine_v3.sql',
    'migrations/20260809_product_value_recovery_v3_12.sql',
    'migrations/20260809_decision_integrity_v3_13.sql',
    'migrations/20260811_actionability_recovery_v3_14.sql',
    'migrations/20260813_opportunity_recovery_v3_15.sql',
    'migrations/20260814_official_ingestion_chunk_apply_v3_15.sql',
    'migrations/20260816_claim_handoff_lease_v3_16.sql',
    'migrations/20260816_official_ingestion_partial_resume_v3_16.sql',
    'migrations/20260816_official_ingestion_transaction_time_v3_16_9.sql',
    'migrations/20260816_official_ingestion_same_transaction_visibility_v3_16_10.sql',
    'migrations/20260816_calendar_dependency_recovery_occurrence_v3_16_11.sql',
    'migrations/20260816_candidate_fact_plane_bound_v3_16_12.sql',
    'migrations/20260816_analysis_payload_reuse_v3_16_15.sql',
    'migrations/20260816_financial_fact_recollection_idempotency_v3_16_16.sql',
    'migrations/20260817_analysis_payload_exact_reuse_v3_16_18.sql',
    'migrations/20260817_runtime_health_bootstrap_v3_16_19.sql',
    'migrations/20260817_evaluation_clock_v3_16_20.sql',
    'migrations/20260817_provider_acquisition_v3_16_21.sql',
    'migrations/20260817_official_ingestion_roster_chunk_snapshot_v3_16_21.sql',
    'migrations/20260817_projection_evaluation_supersession_v3_16_21.sql',
    'migrations/20260822_candidate_ledger_retention_v3_18.sql',
    'migrations/20260823_release_reconciliation_v3_19.sql',
    'migrations/20260827_runtime_diagnostic_contract_v3_19_1.sql',
    'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql',
    'migrations/20260828_decision_revision_identity_dossier_v3_19_3.sql',
    'migrations/20260828_legacy_evaluation_schema_v3_19_6.sql',
    'migrations/20260828_reused_acquisition_lineage_v3_19_7.sql',
    'migrations/20260828_candidate_retention_authority_v3_19_10.sql',
    'migrations/20260828_full_candidate_retention_authority_v3_19_11.sql',
    'migrations/20260828_retained_candidate_jsonb_cardinality_v3_19_12.sql',
    'migrations/20260828_final_claim_handoff_lease_v3_19_16.sql',
    'migrations/20260828_kol_first_runtime_recovery_v3_20.sql',
  ]);
  assert.ok(plan.migrations.every((row)=>/^[0-9a-f]{64}$/u.test(row.sha256)&&row.additiveOnly));
  assert.match(plan.orderedChainSha256,/^[0-9a-f]{64}$/u);
  assert.match(plan.authorityArtifact.sha256,/^[0-9a-f]{64}$/u);
  assert.equal(plan.authorityArtifact.productionDatabaseMigrationAuthorized,true);
  assert.equal(plan.applyAuthorized,true);
  assert.equal(plan.dedicatedApplyCommand,
    'npm run db:v3:apply-reviewed -- --source-commit <reviewed-commit> --attestation-commit <attestation-commit>');
});

test('V3.13 operator docs and positive consumers use tracked authority and exact decision revisions',()=>{
  const runbook=readFileSync(path.join(root,'docs/operations_runbook.md'),'utf8');
  const readme=readFileSync(path.join(root,'README.md'),'utf8');
  assert.match(runbook,/V3[.]14 reviewed release and activation/u);
  assert.match(runbook,/17×5 terminal matrix/u);
  assert.match(runbook,/items_found.*successful_empty.*metadata_only.*missing_endpoint.*auth_failed.*provider_failed/su);
  assert.match(runbook,/STOCKINSIDER_SUPABASE_URL_REF=keychain:stockinsider-runtime:supabase-url/u);
  assert.match(runbook,/STOCKINSIDER_SUPABASE_SERVICE_ROLE_KEY_REF=keychain:stockinsider-runtime:supabase-service-role-key/u);
  assert.match(runbook,/Legacy Night-Shift Research Runtime/u);
  assert.match(runbook,/cookie,[\s\S]*watchlist-seed[\s\S]*not be used[\s\S]*to claim V3[.]14/u);
  assert.match(readme,/V3[.]14 tracked runtime 不讀取上述 raw login\/cookie/u);
  assert.doesNotMatch(readme,/\]\(\/Users\/kaerchen\//u);
  const positiveConsumers=['web/e2e/radar-layering.spec.ts','web/e2e/deep-dive-story.spec.ts',
    'scripts/audit_valuation_assumptions.js'];
  for(const relative of positiveConsumers){
    const source=readFileSync(path.join(root,relative),'utf8');
    assert.match(source,/decisionRevisionId=/u,`${relative} must bind its positive detail read`);
    assert.doesNotMatch(source,/request[.]get\([`'"]\/api\/radar\/deep-dive[`'"]\)/u,
      `${relative} must not make a revisionless positive deep-dive API read`);
  }
});

acceptanceTest('DI-006','V3.20 approved source acquisition conserves the five-connector terminal matrix and only ingests analyzable source material',async()=>{
  const roster=structuredClone(JSON.parse(readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8')));
  assert.equal(roster.threadsSearchEndpoint,'https://graph.threads.net/keyword_search');
  roster.profiles[0].podcastFeed='https://creator.example/feed.xml';
  const rss='<rss><channel><item><guid>episode-1</guid><title>產業更新</title><pubDate>Fri, 07 Aug 2026 08:00:00 GMT</pubDate><link>https://creator.example/e/1</link><podcast:transcript url="https://creator.example/e/1.txt" type="text/plain" /></item></channel></rss>';
  const fetchImpl=async(url)=>url.endsWith('feed.xml')?new Response(rss,{status:200,headers:{'content-type':'application/rss+xml'}})
    :url.endsWith('.txt')?new Response('台積電 2330 先進製程需求更新。',{status:200,headers:{'content-type':'text/plain'}})
      :new Response('{}',{status:404});
  const result=await runtime('official-source-acquisition.js').acquireApprovedSources({roster,credentials:{},fetchImpl,
    now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(result.outcomes.length,17);assert.equal(result.documents.length,1);
  assert.equal(result.itemOutcomes.length,1);assert.equal(result.itemOutcomes[0].acquisitionDisposition,'transcript_ready');
  assert.equal(result.itemOutcomes[0].analysisDisposition,'eligible_for_claim_extraction');
  assert.equal(result.documents[0].sourceKey,'podcast');assert.ok(Array.isArray(result.documents[0].rawFieldPayload[2]));
  const acquisitionRuntime=runtime('official-source-acquisition.js');
  assert.equal(acquisitionRuntime.approvedHttpsUrl('https://www.threads.net/@fixture/post/1'),
    'https://www.threads.net/@fixture/post/1');
  assert.throws(()=>acquisitionRuntime.approvedHttpsUrl('https://user:secret@creator.example/e/1'),
    /source URL authority/u);
  for(const unsafe of ['https://127.0.0.1/feed','https://[::1]/feed','https://localhost/feed','https://metadata.internal/feed'])
    assert.throws(()=>acquisitionRuntime.approvedHttpsUrl(unsafe),/source URL public host/u);
  for(const unsafeAddress of ['127.0.0.1','169.254.1.2','192.0.2.1','198.51.100.2','203.0.113.3',
    '::1','fe80::1','ff02::1','2001:db8::1','::ffff:127.0.0.1','::ffff:7f00:1'])
    assert.equal(acquisitionRuntime.isPublicAddress(unsafeAddress),false,unsafeAddress);
  assert.equal(acquisitionRuntime.isPublicAddress('93.184.216.34'),true);
  assert.equal(acquisitionRuntime.isPublicAddress('2606:2800:220:1:248:1893:25c8:1946'),true);
  await assert.rejects(()=>acquisitionRuntime.resolvePublicAddresses('creator.example',async()=>[
    {address:'93.184.216.34',family:4},{address:'10.0.0.4',family:4}]),/resolved private address/u);
  assert.throws(()=>acquisitionRuntime.normalizedSourceInstant('2026-08-07T08:00:00'),
    /source timestamp authority/u);
  assert.throws(()=>acquisitionRuntime.documentRevision({sourceKey:'podcast',profile:roster.profiles[0],
    stableId:'credential-url',title:'測試',sourceUrl:'https://user:secret@creator.example/e/1',
    publishedAt:'2026-08-07T08:00:00Z',transcript:'內容',collectedAt:'2026-08-09T10:20:00Z'}),
  /source URL authority/u);
  assert.throws(()=>acquisitionRuntime.documentRevision({sourceKey:'podcast',profile:roster.profiles[0],
    stableId:'timezone-free',title:'測試',sourceUrl:'https://creator.example/e/1',
    publishedAt:'2026-08-07T08:00:00',transcript:'內容',collectedAt:'2026-08-09T10:20:00Z'}),
  /source timestamp authority/u);
  assert.equal(Object.hasOwn(result.outcomes.find((row)=>row.profileId==='gooaye'),'status'),false);
  assert.equal(result.connectorAttempts.length,85);
  assert.equal(result.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='podcast').status,'items_found');
  assert.equal(runtime('official-source-acquisition.js').parsePodcastFeed(
    rss.replaceAll('podcast:transcript','podcasting:transcript'),roster.profiles[0])[0].transcriptUrl,null);

  const metadataRss=rss.replace(/<podcast:transcript[^>]+\/>/u,'');
  const metadata=await runtime('official-source-acquisition.js').acquireApprovedSources({roster,credentials:{},
    fetchImpl:async(url)=>url.endsWith('feed.xml')?new Response(metadataRss,{status:200,headers:{'content-type':'application/rss+xml'}})
      :new Response('{}',{status:404}),now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(metadata.documents.length,0);assert.equal(metadata.itemOutcomes[0].acquisitionDisposition,'metadata_only');
  assert.equal(metadata.itemOutcomes[0].analysisDisposition,'no_claim');
  const rejectedTranscript=await runtime('official-source-acquisition.js').acquireApprovedSources({roster,credentials:{},
    fetchImpl:async(url)=>url.endsWith('feed.xml')?new Response(rss.replace('text/plain','application/octet-stream'),
      {status:200,headers:{'content-type':'application/rss+xml'}})
      :new Response('not-authorized',{status:200,headers:{'content-type':'application/octet-stream'}}),
    now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(rejectedTranscript.documents[0].terminalDisposition,'rejected');
  assert.equal(rejectedTranscript.itemOutcomes[0].acquisitionDisposition,'rejected');
  assert.equal(rejectedTranscript.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='podcast').status,'items_found');
  const crossOrigin=await runtime('official-source-acquisition.js').acquireApprovedSources({roster,credentials:{},
    fetchImpl:async(url)=>url.endsWith('feed.xml')?new Response(rss.replaceAll('https://creator.example/e/1.txt',
      'https://unapproved.example/transcript.txt'),{status:200,headers:{'content-type':'application/rss+xml'}})
      :new Response('must-not-fetch',{status:200,headers:{'content-type':'text/plain'}}),
    now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(crossOrigin.documents[0].terminalDisposition,'rejected');
  assert.match(crossOrigin.documents[0].rawFieldPayload[2][0][2],/origin not approved/u);
  const redirectRoster=structuredClone(roster);redirectRoster.profiles[0].podcastFeed='https://creator.example/redirect.xml';
  const redirected=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:redirectRoster,credentials:{},
    fetchImpl:async(url)=>url.endsWith('redirect.xml')?new Response('',{status:302,headers:{location:'https://127.0.0.1/feed.xml'}})
      :new Response(rss,{status:200,headers:{'content-type':'application/rss+xml'}}),
    now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(redirected.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='podcast').status,'provider_failed');
  const emptyRoster=structuredClone(roster);emptyRoster.threadsSearchEndpoint='https://graph.threads.net/keyword_search';
  emptyRoster.profiles=emptyRoster.profiles.map((profile,index)=>({...profile,threads:index===0?'stockcancer':null,
    podcastFeed:null,youtubeHandle:null,youtubeChannelId:null}));
  const successfulEmpty=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:emptyRoster,
    credentials:{threadsAccessToken:'test-token'},fetchImpl:async()=>new Response(JSON.stringify({data:[]}),
      {status:200,headers:{'content-type':'application/json'}}),now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(successfulEmpty.documents.length,0);assert.equal(successfulEmpty.itemOutcomes.length,0);
  const emptyAttempt=successfulEmpty.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='threads');
  assert.equal(emptyAttempt.status,'successful_empty');assert.deepEqual(emptyAttempt.responseEvidence,
    {kind:'http_response',statusCode:200,responseBytes:22,itemCount:0,documentCount:0});

  const youtubeRoster=structuredClone(roster);youtubeRoster.threadsSearchEndpoint=null;
  youtubeRoster.profiles=youtubeRoster.profiles.map((profile,index)=>({...profile,threads:null,podcastFeed:null,
    youtubeHandle:null,youtubeChannelId:index===0?'UC-authorized-test':null}));
  const youtubeFetch=async(url)=>{
    const value=String(url);
    if(value.includes('/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'UU-test'}}}]}),
      {status:200,headers:{'content-type':'application/json'}});
    if(value.includes('/playlistItems?'))return new Response(JSON.stringify({items:[{snippet:{title:'產業更新',
      publishedAt:'2026-08-07T08:00:00Z',resourceId:{videoId:'video-1'}}}]}),
    {status:200,headers:{'content-type':'application/json'}});
    if(value.includes('/captions?'))return new Response(JSON.stringify({items:[{id:'caption-1',snippet:{status:'serving',isDraft:false}}]}),
      {status:200,headers:{'content-type':'application/json'}});
    if(value.includes('/captions/caption-1'))return new Response('WEBVTT\n\n00:00.000 --> 00:02.000\n台積電 2330 先進製程更新',
      {status:200,headers:{'content-type':'text/vtt'}});
    return new Response('{}',{status:404});
  };
  const youtubeMetadata=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key'},fetchImpl:youtubeFetch,now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(youtubeMetadata.documents.length,0);assert.equal(youtubeMetadata.itemOutcomes.length,1);
  assert.equal(youtubeMetadata.itemOutcomes[0].analysisDisposition,'no_claim');
  const youtubeAuthorized=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key',youtubeOauthToken:'test-oauth'},fetchImpl:youtubeFetch,
    now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(youtubeAuthorized.documents.length,1);assert.equal(youtubeAuthorized.documents[0].sourceKey,'youtube');
  assert.equal(youtubeAuthorized.itemOutcomes[0].analysisDisposition,'eligible_for_claim_extraction');
  const partialYoutube=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key',youtubeOauthToken:'test-oauth'},fetchImpl:async(url)=>{
      const value=String(url);
      if(value.includes('/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'UU-test'}}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/playlistItems?'))return new Response(JSON.stringify({items:[
        {snippet:{title:'無擁有權影片',publishedAt:'2026-08-07T07:00:00Z',resourceId:{videoId:'video-denied'}}},
        {snippet:{title:'授權影片',publishedAt:'2026-08-07T08:00:00Z',resourceId:{videoId:'video-ok'}}}]}),
      {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('videoId=video-denied'))return new Response('{}',{status:403,headers:{'content-type':'application/json'}});
      if(value.includes('videoId=video-ok'))return new Response(JSON.stringify({items:[{id:'caption-ok',snippet:{status:'serving',isDraft:false}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/captions/caption-ok'))return new Response('WEBVTT\n\n00:00.000 --> 00:02.000\n台積電 2330 更新',
        {status:200,headers:{'content-type':'text/vtt'}});
      return new Response('{}',{status:404});
    },now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(partialYoutube.documents.length,1);
  assert.equal(partialYoutube.itemOutcomes.length,2);
  assert.equal(partialYoutube.itemOutcomes.find((row)=>row.stableId==='video-denied').acquisitionDisposition,'metadata_only');
  assert.equal(partialYoutube.itemOutcomes.find((row)=>row.stableId==='video-ok').acquisitionDisposition,'transcript_ready');
  assert.equal(partialYoutube.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='youtube').status,'items_found');
  const rejectedYoutubeOauth=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key',youtubeOauthToken:'invalid-oauth'},fetchImpl:async(url)=>{
      const value=String(url);
      if(value.includes('/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'UU-test'}}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/playlistItems?'))return new Response(JSON.stringify({items:[{snippet:{title:'影片',
        publishedAt:'2026-08-07T08:00:00Z',resourceId:{videoId:'video-1'}}}]}),
      {status:200,headers:{'content-type':'application/json'}});
      return new Response('{}',{status:401,headers:{'content-type':'application/json'}});
    },now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(rejectedYoutubeOauth.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='youtube').status,
    'auth_failed');
  const failedYoutubeCaption=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key',youtubeOauthToken:'test-oauth'},fetchImpl:async(url)=>{
      const value=String(url);
      if(value.includes('/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'UU-test'}}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/playlistItems?'))return new Response(JSON.stringify({items:[{snippet:{title:'影片',
        publishedAt:'2026-08-07T08:00:00Z',resourceId:{videoId:'video-1'}}}]}),
      {status:200,headers:{'content-type':'application/json'}});
      return new Response('{}',{status:500,headers:{'content-type':'application/json'}});
    },now:new Date('2026-08-09T10:20:00Z')});
  const failedYoutubeAttempt=failedYoutubeCaption.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='youtube');
  assert.equal(failedYoutubeAttempt.status,'provider_failed');
  assert.equal(failedYoutubeAttempt.responseEvidence.statusCode,500);
  assert.equal(failedYoutubeCaption.itemOutcomes[0].acquisitionDisposition,'deferred');
  const youtubeEmpty=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:youtubeRoster,
    credentials:{youtubeApiKey:'test-key'},fetchImpl:async(url)=>String(url).includes('/channels?')
      ?new Response('{"items":[]}',{status:200,headers:{'content-type':'application/json'}})
      :new Response('{}',{status:404}),now:new Date('2026-08-09T10:20:00Z')});
  const youtubeEmptyAttempt=youtubeEmpty.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='youtube');
  assert.deepEqual([youtubeEmptyAttempt.status,youtubeEmptyAttempt.reasonCode,youtubeEmptyAttempt.responseEvidence.statusCode],
    ['successful_empty','youtube_channel_successful_empty',200]);

  const threadsRoster=structuredClone(roster);threadsRoster.threadsSearchEndpoint='https://graph.threads.net/keyword_search';
  const threadsResult=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:threadsRoster,
    credentials:{threadsAccessToken:'test-token'},fetchImpl:async(url)=>String(url).startsWith('https://graph.threads.net/')
      ?new Response(JSON.stringify({data:[{id:'thread-1',username:'stockcancer',text:'台積電 2330 先進製程更新',permalink:'https://www.threads.net/@stockcancer/post/1',timestamp:'2026-08-07T08:00:00Z'}]}),{status:200,headers:{'content-type':'application/json'}})
      :new Response('{}',{status:404}),now:new Date('2026-08-09T10:20:00Z')});
  assert.ok(threadsResult.documents.filter((row)=>row.sourceKey==='threads').length>=1);
  assert.ok(threadsResult.documents.filter((row)=>row.sourceKey==='threads')
    .every((row)=>threadsRoster.profiles.some((profile)=>profile.id===row.profileId)));
  const badThreads=structuredClone(roster);badThreads.threadsSearchEndpoint='https://example.com/search';
  badThreads.profiles=badThreads.profiles.map((profile)=>({...profile,podcastFeed:null,youtubeHandle:null,youtubeChannelId:null}));
  const rejected=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:badThreads,
    credentials:{threadsAccessToken:'test-token'},fetchImpl,now:new Date('2026-08-09T10:20:00Z')});
  assert.equal(rejected.connectorAttempts.find((row)=>row.profileId==='gooaye'&&row.sourceKey==='threads').status,
    'provider_failed');
  assert.equal(Object.hasOwn(rejected.outcomes.find((row)=>row.profileId==='gooaye'),'status'),false);
  const overflow=runtime('official-source-acquisition.js').documentRevision({sourceKey:'youtube',profile:{id:'overflow'},
    stableId:'overflow-video',title:'',sourceUrl:'https://youtube.com/watch?v=overflow',publishedAt:'2026-08-07T08:00:00Z',
    transcript:'字'.repeat(100001),collectedAt:'2026-08-09T10:20:00Z'});
  assert.equal(overflow.acquisitionStatus,'content_overflow');assert.equal(overflow.rawCodePointCount,100001);
  assert.equal(overflow.terminalDisposition,'rejected');
  assert.equal(overflow.rawFieldPayload,null);assert.equal(overflow.ingestionContentRevisionSha256,null);
  assert.equal(overflow.ingestionCanonicalContentHashV3,null);
  const merged=runtime('candidate-funnel.js').buildCandidateFunnel({outcomes:[
    {claimId:'official-claim',mentionId:'official-mention',revisionId:'official-revision',sourceKey:'mops_material_event',
      sourceClass:'official',sourceUrl:'https://mops.twse.com.tw/mops/web/index',raw:'2330 官方法說',claimAsOf:'2026-08-07T08:00:00Z',
      link:{disposition:'linked',stockId:'stock-2330',symbol:'2330'}},
    {claimId:'threads-claim',mentionId:'threads-mention',revisionId:'threads-revision',sourceKey:'threads',
      sourceClass:'community',sourceUrl:'https://www.threads.net/@stockcancer/post/1',raw:'2330 產業觀察',claimAsOf:'2026-08-07T09:00:00Z',
      nominationAuthority:'approved_kol_threads_api',
      link:{disposition:'linked',stockId:'stock-2330',symbol:'2330'}},
  ],seedSymbols:[],priorLedger:[]});
  assert.equal(merged.candidateLedger.length,1);assert.equal(merged.candidateLedger[0].evidenceCount,2);
  assert.deepEqual(new Set(merged.candidateLedger[0].evidence.map((row)=>row.claimId)),
    new Set(['official-claim','threads-claim']));
  const overflowText='字'.repeat(100001);
  const overflowRoster=structuredClone(roster);overflowRoster.threadsSearchEndpoint='https://graph.threads.net/keyword_search';
  overflowRoster.profiles=overflowRoster.profiles.map((profile,index)=>({...profile,
    threads:index===0?'stockcancer':null,podcastFeed:index===0?'https://creator.example/overflow-feed.xml':null,
    youtubeHandle:null,youtubeChannelId:index===0?'UC-overflow':null}));
  const overflowRss='<rss><channel><item><guid>overflow-podcast</guid><title>overflow</title>'+
    '<pubDate>Fri, 07 Aug 2026 08:00:00 GMT</pubDate><link>https://creator.example/e/overflow</link>'+
    '<podcast:transcript url="https://creator.example/e/overflow.txt" type="text/plain" /></item></channel></rss>';
  const overflowAcquisition=await runtime('official-source-acquisition.js').acquireApprovedSources({roster:overflowRoster,
    credentials:{threadsAccessToken:'test-token',youtubeApiKey:'test-key',youtubeOauthToken:'test-oauth'},
    fetchImpl:async(url)=>{
      const value=String(url);
      if(value.startsWith('https://graph.threads.net/'))return new Response(JSON.stringify({data:[{id:'overflow-thread',username:'stockcancer',
        text:overflowText,permalink:'https://www.threads.net/@stockcancer/post/overflow',timestamp:'2026-08-07T08:00:00Z'}]}),
      {status:200,headers:{'content-type':'application/json'}});
      if(value.endsWith('overflow-feed.xml'))return new Response(overflowRss,{status:200,headers:{'content-type':'application/rss+xml'}});
      if(value.endsWith('overflow.txt'))return new Response(overflowText,{status:200,headers:{'content-type':'text/plain'}});
      if(value.includes('/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'UU-overflow'}}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/playlistItems?'))return new Response(JSON.stringify({items:[{snippet:{title:'overflow',
        publishedAt:'2026-08-07T08:00:00Z',resourceId:{videoId:'overflow-video'}}}]}),
        {status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/captions?'))return new Response(JSON.stringify({items:[{id:'overflow-caption',
        snippet:{status:'serving',isDraft:false}}]}),{status:200,headers:{'content-type':'application/json'}});
      if(value.includes('/captions/overflow-caption'))return new Response(overflowText,
        {status:200,headers:{'content-type':'text/vtt'}});
      return new Response('{}',{status:404});
    },now:new Date('2026-08-09T10:20:00Z')});
  const overflowDocuments=overflowAcquisition.documents.filter((row)=>row.profileId===overflowRoster.profiles[0].id);
  const overflowItems=overflowAcquisition.itemOutcomes.filter((row)=>row.profileId===overflowRoster.profiles[0].id);
  assert.deepEqual(overflowDocuments.map((row)=>[row.sourceKey,row.acquisitionStatus,row.terminalDisposition]).sort(),
    [['podcast','content_overflow','rejected'],['threads','content_overflow','rejected'],
      ['youtube','content_overflow','rejected']]);
  assert.ok(overflowItems.length===3&&overflowItems.every((row)=>row.acquisitionDisposition==='rejected'
    &&row.analysisDisposition==='rejected'));
  const migration=readFileSync(path.join(root,'migrations/20260809_decision_integrity_v3_13.sql'),'utf8');
  assert.match(migration,/acquisitionStatus'='content_overflow'[\s\S]{0,260}rawCodePointCount'\)::integer<>100001/u);
  assert.match(migration,/acquisitionStatus'='content_overflow'[\s\S]{0,420}terminalDisposition'<>'rejected'/u);
  assert.match(migration,/content_overflow_parse_failure/u);
  const applied=appliedMigrationContract();
  assert.match(applied,/V3\.13 source acquisition persists seventeen terminals, citation, and typed claim\/entity conservation/u);
  assert.match(applied,/# fail 0/u);
});

acceptanceTest('DI-007','V3.13 official statement parser requires reported diluted shares and never derives the 30.04 shortcut',()=>{
  const official=runtime('official-twse-valuation.js');
  const facts=official.parseStatementFacts([{公司代號:'2337',公司名稱:'旺宏',年度:'115',季別:'1',出表日期:'1150428',
    營業收入:'56390000','營業毛利（毛損）淨額':'18000000','營業費用':'12361000','營業利益（損失）':'5639000',
    '營業外收入及支出':'-3539000','稅前淨利（淨損）':'2100000','所得稅費用（利益）':'200000',
    '本期淨利（淨損）':'1900000','淨利（淨損）歸屬於非控制權益':'127900',
    '淨利（淨損）歸屬於母公司業主':'1772100','稀釋每股盈餘（元）':'0.90',
    '稀釋加權平均流通在外股數':'1969000'}],
  {exchange:'TWSE',statement:'income',sourceUrl:official.statementUrl('TWSE','income','ci'),collectedAt:'2026-08-09T10:20:00Z'});
  const value=(key)=>facts.find((fact)=>fact.factKey===key)?.value;
  assert.equal(value('quarterly_diluted_eps'),.9);assert.equal(value('diluted_weighted_average_shares'),1969000);
  assert.notEqual(value('quarterly_diluted_eps'),30.04);
  const basicOnly=official.parseStatementFacts([{公司代號:'2337',公司名稱:'旺宏',年度:'115',季別:'1',出表日期:'1150428',
    '淨利（淨損）歸屬於母公司業主':'1772100','基本每股盈餘（元）':'0.90'}],
  {exchange:'TWSE',statement:'income',sourceUrl:official.statementUrl('TWSE','income','ci'),collectedAt:'2026-08-09T10:20:00Z'});
  assert.equal(basicOnly.some((fact)=>fact.factKey==='quarterly_diluted_eps'),false);
  assert.equal(basicOnly.some((fact)=>fact.factKey==='diluted_weighted_average_shares'),false);
  const balance=official.parseStatementFacts([{公司代號:'2542',公司名稱:'興富發',年度:'115',季別:'2',出表日期:'1150808',
    '每股參考淨值':'48.5','資產淨值':'120000000','資產總計':'150000000','權益總計':'120000000',
    '現金及約當現金':'10000000','短期借款':'5000000'}],
  {exchange:'TWSE',statement:'balance',sourceUrl:official.statementUrl('TWSE','balance','ci'),collectedAt:'2026-08-09T10:20:00Z'});
  assert.ok(balance.length===6&&balance.every((fact)=>fact.periodStart===null&&fact.durationKind==='instant'));
  assert.equal(balance.find((fact)=>fact.factKey==='book_value_per_share')?.unit,'TWD_per_share');
  assert.deepEqual(balance.find((fact)=>fact.factKey==='net_asset_value')&&{
    value:balance.find((fact)=>fact.factKey==='net_asset_value').value,
    unit:balance.find((fact)=>fact.factKey==='net_asset_value').unit},{value:120000000,unit:'TWD_thousand'});
  const instantKeys=new Set(['book_value_per_share','net_asset_value','total_assets','total_equity',
    'cash_and_equivalents','total_debt']);
  const runtimeRows=[...completeOfficialFacts('2542').filter((row)=>!instantKeys.has(row[1])),...balance.map((fact)=>[
    fact.symbol,fact.factKey,fact.periodStart,fact.periodEnd,fact.durationKind,fact.value,fact.unit,fact.authorityTier,
    fact.filingPublishedAt,fact.sourceTimestamp,fact.collectedAt,fact.sourceUrl,fact.sourceRef,null,
    fact.estimateKind,fact.estimateHorizon])];
  const runtimeFacts=runtime('auth-source-worker-cli.js').valuationFactInput(runtimeRows,'2026-08-09T10:20:00Z');
  assert.equal(runtimeFacts.periodReadiness,'ttm_from_four_official_quarters');
  assert.equal(runtimeFacts.bookValue,48.5);assert.equal(runtimeFacts.nav,120000000000);
});

acceptanceTest('DI-008','V3.13 official close and bounded raw OHLCV parsers retain exchange authority and reject bad geometry',()=>{
  const official=runtime('official-twse-valuation.js');
  assert.deepEqual(official.parseOfficialCloseRows([{Code:'4760',Date:'1150807',ClosingPrice:'236.50'}],{exchange:'TWSE'}),
    [{symbol:'4760',exchange:'TWSE',session:'2026-08-07',close:236.5,
      sourceRef:'twse-openapi:official-close:2026-08-07:4760'}]);
  const twseUrl=`${official.TWSE_PRICE_HISTORY_URL}?date=20260801&stockNo=4760&response=json`;
  const rows=official.parseOfficialPriceHistory({stat:'OK',data:[
    ['115/08/07','1,000','236,500','234.00','240.00','232.00','236.50'],
    ['115/08/08','1,000','236,500','234.00','230.00','232.00','236.50'],
  ]},{exchange:'TWSE',symbol:'4760',sourceUrl:twseUrl,collectedAt:'2026-08-09T10:20:00Z'});
  assert.equal(rows.length,1);assert.equal(rows[0].session,'2026-08-07');assert.equal(rows[0].volume,1000);
  assert.equal(rows[0].sourceRef,'twse-rwd:STOCK_DAY:2026-08-07:4760');
  const tpexUrl=`${official.TPEX_PRICE_HISTORY_URL}?date=2026%2F08%2F01&code=6285&response=json`;
  const tpex=official.parseOfficialPriceHistory({tables:[{data:[
    ['115/08/07','2,000','410,000','201.00','208.00','199.00','205.00'],
  ]}]},{exchange:'TPEX',symbol:'6285',sourceUrl:tpexUrl,collectedAt:'2026-08-09T10:20:00Z'});
  assert.equal(tpex.length,1);assert.equal(tpex[0].provider,'tpex');
  assert.equal(tpex[0].volume,2000000);assert.equal(tpex[0].turnoverTwd,410000000);
  assert.equal(tpex[0].sourceRef,'tpex-rwd:tradingStock:2026-08-07:6285');
  const applied=appliedMigrationContract();
  assert.match(applied,/DI-008 parser output crosses job completion and persistence before an adjusted read/u);
  assert.match(applied,/# fail 0/u);
});

acceptanceTest('DI-009','V3.13 entity linking rejects naked calendar years even when they are listed symbols',()=>{
  const {tickerHasStockContext}=runtime('auth-source-worker-cli.js');
  assert.equal(tickerHasStockContext('我們回顧 2026 年與 2019 年的產業週期。','2026'),false);
  assert.equal(tickerHasStockContext('公司代號 2026 的財報值得研究。','2026'),true);
  const roster=Array.from({length:201},(_,index)=>{const symbol=String(1000+index);
    return [`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,symbol,'TWSE','common_stock','active',
      `測試股份有限公司${symbol}`,`測試${symbol}`];});
  const parsed=runtime('auth-source-worker-cli.js').extractRevisionCandidates({frozenRevision:{
    revisionId:'71300000-0000-4000-8000-000000000099',sourceKey:'threads',
    sourcePublishedAt:'2026-08-07T08:00:00Z',sourceCollectedAt:'2026-08-07T09:00:00Z',
    rawFieldPayload:{text:roster.map((row)=>`公司代號 ${row[1]} 財報更新。`).join(' ')}},
  authorityPages:[['roster',0,'a'.repeat(64),roster],['taxonomy',0,'b'.repeat(64),[]]]});
  assert.equal(parsed.candidates.length,200);
  assert.equal(parsed.claimOutcomes.filter((row)=>row.outcome==='deferred').length,1);
  assert.match(parsed.claimOutcomes.find((row)=>row.outcome==='deferred').reason,/entity_bound_deferred:1/u);
});

acceptanceTest('DI-010','V3.13 official corporate-action adapter distinguishes complete empty snapshots from transport failure',async()=>{
  const official=runtime('official-twse-valuation.js');
  const feed=official.CORPORATE_ACTION_FEEDS.TWSE[0];
  const payload=Buffer.from(JSON.stringify({stat:'OK',fields:feed.header,data:[
    ['115年08月07日','1210','大成','55.20','52.20'],
  ]}));
  const events=official.parseCorporateActionResponse(payload,{exchange:'TWSE',session:'2026-08-07',feed});
  assert.equal(events.length,1);assert.equal(events[0].eventKind,'ex_right_dividend');
  assert.match(events[0].sourceRowRef,/^[0-9a-f]{64}$/u);
  assert.deepEqual(official.parseCorporateActionResponse(Buffer.from(JSON.stringify({stat:'很抱歉，沒有符合條件的資料!'})),
    {exchange:'TWSE',session:'2026-08-07',feed:official.CORPORATE_ACTION_FEEDS.TWSE[1]}),[]);
  assert.throws(()=>official.parseCorporateActionResponse(Buffer.from('<html>gateway error</html>'),
    {exchange:'TWSE',session:'2026-08-07',feed}),/corporate_action_html/u);
  const fetchImpl=async(url)=>{
    const exchange=url.includes('tpex.org.tw')?'TPEX':'TWSE';
    const selected=official.CORPORATE_ACTION_FEEDS[exchange].find((candidate)=>url.includes(candidate.path));
    const body={stat:'OK',...(exchange==='TWSE'?{fields:selected.header,data:[]}:
      {tables:[{fields:selected.header,data:[]}]})};
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  const snapshots=await official.loadCorporateActionSnapshots({sessions:[['TWSE','2026-08-07'],['TPEX','2026-08-07']],
    fetchImpl,collectedAt:'2026-08-09T10:20:00Z'});
  assert.equal(snapshots.length,2);assert.ok(snapshots.every((snapshot)=>snapshot.feedEvidence.length===3
    &&snapshot.declaredEventCount===0&&snapshot.events.length===0));
});

acceptanceTest('DI-011','V3.13 stale-readonly projection disables compatibility actions without mutating immutable decision identity',async()=>{
  const {withProjectionHealth}=await import('../../web/src/lib/opportunity-v3/projection-readonly.ts');
  const envelope={version:'decision-envelope-v3.13.0',decisionRevisionId:'revision-immutable',userAction:'buy'};
  const projection={sourceSignals:[{decisionEnvelope:envelope,newPositionAction:'buy',opportunityAction:'setup_ready'}],
    sourceLedCorrectness:{schema:'legacy-radar-v3.14.0',window:'daily'},loadStatus:'ready',loadWarnings:[]};
  const degraded=withProjectionHealth(projection,{status:'stale_readonly',reason:'missed_scheduled_runs',
    missedExpectedRuns:1,actionsEnabled:false,calendarAuthority:'tw_trading_sessions_v3'});
  assert.equal(degraded.sourceSignals[0].decisionEnvelope,undefined);
  assert.equal(degraded.sourceSignals[0].decisionRevisionId,'revision-immutable');
  assert.equal(degraded.sourceSignals[0].projectionReadOnly,true);
  assert.equal(degraded.sourceSignals[0].lastKnownAction,'buy');
  assert.equal(degraded.sourceSignals[0].newPositionAction,'valuation_review');
  assert.equal(degraded.sourceSignals[0].opportunityAction,'evidence_watch');
});
