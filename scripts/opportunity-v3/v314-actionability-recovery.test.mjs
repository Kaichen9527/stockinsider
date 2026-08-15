import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const runtime = (name) => require(path.join(root, 'scripts/runtime', name));
function independentEnvironment(){const environment={...process.env,OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD:'false'};
  delete environment.NODE_TEST_CONTEXT;return environment;}
let migrationEvidenceResult=null;
const MIGRATION_EVIDENCE_PATTERN=[
  'migration applies twice and exposes the exact granted/private function boundary',
  'V3[.]14 official chunks persist under the exact lease, replay idempotently, and complete before DB reread',
  'V3[.]13 database derives successful-empty, missing, auth and provider terminals from 51 connector attempts',
].join('|');
function appliedV314MigrationEvidence(){
  migrationEvidenceResult??=spawnSync(process.execPath,[path.join(root,'scripts/run-node22.js'),
    '--experimental-strip-types','--test',`--test-name-pattern=${MIGRATION_EVIDENCE_PATTERN}`,
    path.join(root,'scripts/opportunity-v3/migration-contract.test.mjs')],{
    cwd:root,encoding:'utf8',env:independentEnvironment(),timeout:240000,maxBuffer:32*1024*1024});
  const diagnostic=`${migrationEvidenceResult.stdout??''}\n${migrationEvidenceResult.stderr??''}`.slice(-12000);
  assert.equal(migrationEvidenceResult.error,undefined,`migration evidence process error\n${diagnostic}`);
  assert.equal(migrationEvidenceResult.signal,null,`migration evidence process signal\n${diagnostic}`);
  assert.equal(migrationEvidenceResult.status,0,`migration evidence process exit\n${diagnostic}`);
  return migrationEvidenceResult.stdout;
}
let browserEvidenceOutput=null;
function v314BrowserEvidence(){
  browserEvidenceOutput??=execFileSync(process.execPath,[path.join(root,'web/node_modules/@playwright/test/cli.js'),'test',
    'v314-readonly-visibility.spec.ts','--config=playwright.v3-correctness.config.ts'],{
    cwd:path.join(root,'web'),encoding:'utf8',env:independentEnvironment(),timeout:180000,maxBuffer:16*1024*1024});
  return browserEvidenceOutput;
}

const E2E_FLOW_FACTS=new Set(['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense',
  'quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense',
  'quarterly_noncontrolling_interest','quarterly_net_income','quarterly_net_income_attributable_to_common',
  'quarterly_diluted_eps','diluted_weighted_average_shares','quarterly_ebitda','depreciation_amortization']);
function e2eOfficialFact(symbol,key,end,value){
  const flow=E2E_FLOW_FACTS.has(key);const monthly=key==='monthly_revenue';
  const unit=['quarterly_diluted_eps','book_value_per_share'].includes(key)?'TWD_per_share'
    :key==='diluted_weighted_average_shares'?'thousand_shares':'TWD_thousand';
  return [symbol,key,flow?`${end.slice(0,4)}-01-01`:monthly?`${end.slice(0,7)}-01`:null,end,
    flow?'quarterly':monthly?'monthly':'instant',value,unit,'official_filing',`${end}T00:00:00Z`,
    `${end}T00:00:00Z`,`${end}T01:00:00Z`,`${end}T01:00:00Z`,
    `twse-openapi:statement:${key}:${end}`,null,'reported','reported_period'];
}
function e2eOfficialFacts(symbol='1101'){
  const ends=['2024-06-30','2024-09-30','2024-12-31','2025-03-31','2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const values={quarterly_revenue:[2200,3600,5200,1000,2200,3600,5200,1000,2200],
    quarterly_gross_profit:[880,1450,2100,400,880,1450,2100,400,880],quarterly_operating_expense:[650,1060,1520,300,650,1060,1520,300,650],
    quarterly_operating_income:[230,390,580,100,230,390,580,100,230],quarterly_non_operating_income:[20,30,40,10,20,30,40,10,20],
    quarterly_pretax_income:[250,420,620,110,250,420,620,110,250],quarterly_income_tax_expense:[45,75,110,20,45,75,110,20,45],
    quarterly_noncontrolling_interest:[20,30,40,10,20,30,40,10,20],quarterly_net_income:[205,345,510,90,205,345,510,90,205],
    quarterly_net_income_attributable_to_common:[185,315,470,80,185,315,470,80,185],quarterly_diluted_eps:[1.85,3.15,4.7,.8,1.85,3.15,4.7,.8,1.85],
    diluted_weighted_average_shares:Array(9).fill(100),quarterly_ebitda:[272,456,672,120,272,456,672,120,272],
    depreciation_amortization:[42,66,92,20,42,66,92,20,42]};
  const monthly=Array.from({length:18},(_,index)=>{const date=new Date(Date.UTC(2025,index,1));
    const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
    return e2eOfficialFact(symbol,'monthly_revenue',end,900+index*12);});
  return [...Object.entries(values).flatMap(([key,series])=>ends.map((end,index)=>e2eOfficialFact(symbol,key,end,series[index]))),
    ...monthly,...ends.map((end,index)=>e2eOfficialFact(symbol,'book_value_per_share',end,55+index*.625)),
    e2eOfficialFact(symbol,'cash_and_equivalents','2026-06-30',2000),e2eOfficialFact(symbol,'total_debt','2026-06-30',1000),
    e2eOfficialFact(symbol,'total_assets','2026-06-30',10000),e2eOfficialFact(symbol,'total_equity','2026-06-30',6000)];
}

test('V314-001 calendar authority loss preserves checksum-valid last-good research as readonly', async () => {
  const { assessProjectionFreshness } = await import('../../web/src/lib/opportunity-v3/projection-freshness.ts');
  const { withProjectionHealth } = await import('../../web/src/lib/opportunity-v3/projection-readonly.ts');
  const health = assessProjectionFreshness({
    contentAsOf: '2026-08-08T11:09:55Z',
    evaluatedAt: '2026-08-08T11:09:55Z',
    publishedAt: '2026-08-08T11:10:00Z',
    tradingSessions: [],
    now: new Date('2026-08-11T00:00:00Z'),
  });
  const payload = withProjectionHealth({
    schemaVersion: 'legacy-radar-v3.12.0',
    sourceSignals: [{ symbol: '4760', newPositionAction: 'buy', opportunityAction: 'setup_ready' }],
    earlyWatchlist: [{ symbol: '6285', newPositionAction: 'buy' }],
    sourceLedCorrectness: { window: 'home' },
    loadStatus: 'ready',
    loadWarnings: [],
  }, health);
  assert.equal(payload.projectionHealth.integrityStatus, 'valid');
  assert.equal(payload.projectionHealth.freshnessStatus, 'unavailable');
  assert.equal(payload.projectionHealth.researchVisibility, 'last_good_readonly');
  assert.equal(payload.projectionHealth.actionAuthority, 'disabled');
  assert.equal(payload.sourceSignals.length, 1);
  assert.equal(payload.earlyWatchlist.length, 1);
  assert.equal(payload.sourceSignals[0].projectionReadOnly, true);
  assert.equal(payload.sourceSignals[0].newPositionAction, 'valuation_review');
  assert.equal(payload.sourceSignals[0].decisionEnvelope, undefined);
  assert.equal(payload.sourceSignals[0].detailHref, undefined);
  assert.deepEqual(payload.sourceSignals[0].projectionBlockers,
    ['legacy_schema_without_v314_decision_authority']);
  assert.equal(payload.compatibilityAdapter.version, 'legacy-readonly-adapter-v3.14.0');
  const incompatible=withProjectionHealth({
    sourceSignals:[{symbol:'2330',newPositionAction:'buy',opportunityAction:'setup_ready',
      decisionEnvelope:{userAction:'buy'}}],sourceLedCorrectness:{schema:'legacy-radar-v3.14.0'},
    loadStatus:'ready',loadWarnings:[],
  },{...health,status:'fresh',freshnessStatus:'fresh',researchVisibility:'live',
    actionAuthority:'disabled',actionsEnabled:false,reason:'release_identity_incompatible'});
  assert.equal(incompatible.sourceSignals[0].projectionReadOnly,true);
  assert.equal(incompatible.sourceSignals[0].newPositionAction,'valuation_review');
  assert.equal(incompatible.sourceSignals[0].lastKnownAction,'buy');
  assert.deepEqual(incompatible.loadWarnings,['projection_release_identity_incompatible']);
});

test('V314-002 unchanged discovery outcomes conserve seed membership', () => {
  const { deriveDiscoveryDisposition } = runtime('discovery-disposition.js');
  const common = {
    linked: { disposition: 'linked', stockId: 'stock-1', symbol: '2337' },
    priorLedger: [{ stockId: 'stock-1', materialEvidenceHash: 'a'.repeat(64) }],
    evidenceHash: 'a'.repeat(64),
  };
  assert.equal(deriveDiscoveryDisposition({ ...common, seedSymbols: ['2337'] }).seedMembership, 'in_seed');
  assert.equal(deriveDiscoveryDisposition({ ...common, seedSymbols: [] }).seedMembership, 'out_of_seed');
});

test('V314-003 research ranking never improves when an available axis is removed', () => {
  const { computeResearchRankingV314 } = runtime('research-ranking-v314.js');
  const axes = {
    valuation: 90, fundamentalQuality: 80, momentumTechnical: 75, sourceCatalyst: 70, marketLiquidity: 65,
  };
  const all = computeResearchRankingV314(axes);
  assert.equal(all.coverage, 1);
  for (const axis of Object.keys(axes)) {
    const missing = computeResearchRankingV314({...axes,[axis]:null});
    assert.ok(all.rankingScore>missing.rankingScore,`${axis} removal must reduce score`);
    assert.ok(all.coverage>missing.coverage,`${axis} removal must reduce coverage`);
  }
  const cheapButPoor = computeResearchRankingV314({valuation:100,fundamentalQuality:20,
    momentumTechnical:75,sourceCatalyst:70,marketLiquidity:65});
  assert.notEqual(cheapButPoor.lane,'near_buy');
});

test('V314-004 discovery and report visibility are backed by payload data', () => {
  const tabs = readFileSync(path.join(root, 'web/src/app/components/RadarTabs.tsx'), 'utf8');
  const home = readFileSync(path.join(root, 'web/src/app/page.tsx'), 'utf8');
  assert.doesNotMatch(tabs, /const sourceSignals: SourceSignalCard\[\] = \[\]/u);
  assert.match(tabs, /radar\.sourceSignals/u);
  assert.match(home, /\.\.\.\(radar\.sourceSignals \|\| \[\]\)/u);
  const browser=readFileSync(path.join(root,'web/e2e/v314-readonly-visibility.spec.ts'),'utf8');
  assert.match(browser,/股票研究 46/u);assert.match(browser,/社群發現 30/u);
  assert.match(browser,/getByRole\('article'\)[\s\S]*?toHaveCount\(30\)/u);
  assert.match(browser,/readonly-report-link/u);
  const executed=v314BrowserEvidence();
  assert.match(executed,/V3\.14 V3\.12 last-good compatibility preserves all 46 unique stocks and 30 source signals/u);
  assert.match(executed,/2 passed/u);
});

test('V314-004a internal health uses the reviewed release SHA when Vercel git metadata is absent', async () => {
  const { resolveReviewedConsumerCommitSha } = await import(
    '../../web/src/lib/opportunity-v3/reviewed-release-identity.ts'
  );
  const reviewed = '1'.repeat(40);
  const vercel = '2'.repeat(40);
  assert.equal(resolveReviewedConsumerCommitSha({
    STOCKINSIDER_REVIEWED_RELEASE_SHA: reviewed,
    VERCEL_GIT_COMMIT_SHA: vercel,
  }), reviewed);
  assert.equal(resolveReviewedConsumerCommitSha({ VERCEL_GIT_COMMIT_SHA: vercel }), vercel);
  assert.equal(resolveReviewedConsumerCommitSha({
    STOCKINSIDER_REVIEWED_RELEASE_SHA: 'invalid',
    VERCEL_GIT_COMMIT_SHA: vercel,
  }), vercel);
  assert.equal(resolveReviewedConsumerCommitSha({}), null);

  const health = readFileSync(path.join(root, 'web/src/app/api/internal/health-check/route.ts'), 'utf8');
  assert.match(health, /resolveReviewedConsumerCommitSha\(\)/u);
  assert.doesNotMatch(health, /process\.env\.VERCEL_GIT_COMMIT_SHA/u);
});

test('V314-005 one actionable card without a cited brief degrades only that card', () => {
  const projection = runtime('compact-radar-projection.js');
  const decision = runtime('decision-envelope.js').deriveDecisionEnvelope({
    valuation: { status: 'normal', valuationRange: { bear: 90, base: 132, bull: 165 },
      method: { method: 'pe' }, asOf: '2026-08-07', evidence: { sourceRefs: ['official-filing'] } },
    currentPrice: 100, qualityActionEligible: true, marketAllowsAction: true,
    qualityReadiness: 'available', marketReadiness: 'available',
    technical: { technicalState: 'breakout_confirmed', plane: { current: 100 } },
    geometry: { availability: 'available', entryZone: [99, 101], invalidation: 90, trigger: null },
    lastEvaluatedAt: '2026-08-07T10:20:00Z',
  });
  const legacy = { opportunities: [], scenarioUpsideCandidates: [], earlyWatchlist: [], recentFormal7d: [],
    fallbackOpportunities90d: [], hotTracking: [], hotThemes: [], discoveredStocks: [], reports: [], connectorStatus: [] };
  const candidate = { symbol: '9999', name: '引用待補', claimId: 'claim-9999', sourceKey: 'official',
    sourceName: '官方來源', sourceUrl: 'https://example.com/9999', claimAsOf: '2026-08-07T09:00:00Z',
    sourceCollectedAt: '2026-08-07T10:00:00Z', lastEvaluatedAt: '2026-08-07T10:20:00Z',
    decisionEnvelope: decision, decisionBrief: null };
  const citationless={...candidate,symbol:'9998',claimId:null,sourceUrl:null};
  const published = projection.publishCompactRadarProjection({ decisions: [], sourceCandidates: [candidate,citationless],
    discoveryDelta: { added: ['9999','9998'], exited: [], continued: [], unchangedReasons: [] }, legacyPayload: legacy,
    window: 'home', asOf: '2026-08-07T10:20:00Z', freshnessSchedule: [
      { session_id: '2026-08-07', status: 'completed' },
    ], producerIdentity: { commitSha: 'a'.repeat(40) } });
  const card = published.payload.sourceSignals[0];
  assert.equal(card.decisionEnvelope.userAction, 'unavailable');
  assert.equal(card.decisionEnvelope.reason, 'insufficient_cited_decision_brief');
  assert.equal(card.decisionBrief.availability, 'unavailable');
  assert.deepEqual(published.payload.sourceSignals.map((row)=>row.symbol),['9999']);
  assert.deepEqual(published.payload.discoveryDelta.added,['9999']);
});

test('V314-006 selective market raises thresholds and exposes wait_value or wait_market without score gate', () => {
  const { deriveDecisionEnvelopeV314, validateDecisionEnvelopeV314 } = runtime('decision-envelope-v314.js');
  const input = (base, marketAllowsAction = true) => ({
    valuation: { status: 'normal', valuationRange: { bear: 90, base, bull: base * 1.2 },
      method: { method: 'pe' }, asOf: '2026-08-07', evidence: { sourceRefs: ['official-filing'] } },
    currentPrice: 100, qualityActionEligible: true, marketAllowsAction,
    qualityReadiness: 'available', marketReadiness: 'available', marketRegime: 'selective_or_defensive',
    technical: { technicalState: 'breakout_confirmed', plane: { current: 100 } },
    geometry: { availability: 'available', entryZone: [99, 101], invalidation: 90, trigger: null },
    lastEvaluatedAt: '2026-08-07T10:20:00Z',
  });
  const near = deriveDecisionEnvelopeV314(input(121));
  assert.equal(near.userAction, 'wait_value');
  assert.ok(near.nextUnlock.price < 100);
  const ready = deriveDecisionEnvelopeV314(input(130));
  assert.equal(ready.userAction, 'buy');
  assert.ok(validateDecisionEnvelopeV314(ready));
  const marketWait = deriveDecisionEnvelopeV314(input(130, false));
  assert.equal(marketWait.userAction, 'wait_market');
  assert.equal(marketWait.reason, 'market_regime_gate');
  assert.equal(near.thresholdAuthority.requiredRewardRisk,2.5);
  assert.ok(Math.abs((near.nextUnlock.price*10)%1)<1e-9);
});

test('V314-006a raw authority metrics cannot round up into an actionable decision', () => {
  const {deriveDecisionEnvelopeV314,validateDecisionEnvelopeV314}=runtime('decision-envelope-v314.js');
  const input=(base,invalidation)=>({valuation:{status:'normal',valuationRange:{bear:80,base,bull:140},
    method:{method:'pe'},asOf:'2026-08-07',evidence:{sourceRefs:['official-filing']}},currentPrice:100,
    qualityActionEligible:true,marketAllowsAction:true,qualityReadiness:'available',marketReadiness:'available',
    marketRegime:'risk_on',technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation,trigger:null},
    lastEvaluatedAt:'2026-08-07T10:20:00Z'});
  const roundedMargin=deriveDecisionEnvelopeV314(input(114.95,90));
  assert.equal(roundedMargin.userAction,'unavailable');
  assert.ok(roundedMargin.thresholdAuthority.actualMarginPct<15);
  const roundedRewardRisk=deriveDecisionEnvelopeV314(input(120,89.98));
  assert.equal(roundedRewardRisk.userAction,'wait_value');
  assert.ok(roundedRewardRisk.thresholdAuthority.actualRewardRisk<2);
  assert.ok(validateDecisionEnvelopeV314(roundedMargin));
  assert.ok(validateDecisionEnvelopeV314(roundedRewardRisk));
});

test('V314-006b action overrides clear incompatible V3.14-only fields', () => {
  const {deriveDecisionEnvelopeV314,validateDecisionEnvelopeV314}=runtime('decision-envelope-v314.js');
  const {overrideDecisionEnvelopeAction}=runtime('decision-envelope.js');
  const base={valuation:{status:'normal',valuationRange:{bear:80,base:140,bull:170},method:{method:'pe'},
    asOf:'2026-08-07',evidence:{sourceRefs:['official-filing']}},currentPrice:100,qualityActionEligible:true,
    marketAllowsAction:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},lastEvaluatedAt:'2026-08-07T10:20:00Z'};
  const ready=deriveDecisionEnvelopeV314(base);assert.equal(ready.userAction,'buy');
  const avoided=overrideDecisionEnvelopeAction(ready,'avoid','bias_observe_only');
  assert.equal(avoided.thresholdAuthority,null);assert.equal(avoided.nextUnlock,null);
  assert.ok(validateDecisionEnvelopeV314(avoided));
  const waiting=deriveDecisionEnvelopeV314({...base,valuation:{...base.valuation,
    valuationRange:{bear:80,base:116,bull:140}}});assert.equal(waiting.userAction,'wait_value');
  const unavailable=overrideDecisionEnvelopeAction(waiting,'unavailable','insufficient_cited_decision_brief');
  assert.equal(unavailable.nextUnlock,null);assert.ok(validateDecisionEnvelopeV314(unavailable));
});

test('V314-007 runtime diagnostics never serialize SQL text or connection credentials', () => {
  const { safeFailureDiagnostic } = runtime('safe-diagnostics.js');
  const secret = 'postgresql://user:password@example.com:5432/postgres';
  const error = Object.assign(new Error(`insert into private_table values ('${secret}') violates constraint`),
    { code: '23514', constraint: 'legacy_candidate_discovery_ledger_v3_11_check' });
  const diagnostic = safeFailureDiagnostic(error,{stage:'candidate_funnel',jobKind:'candidate_batch',origin:'persistence',itemOrdinal:59,
    inputHash:'a'.repeat(64),producerSha:'b'.repeat(40)});
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.sqlstate,'23514');
  assert.equal(diagnostic.constraint,'legacy_candidate_discovery_ledger_v3_11_check');
  assert.doesNotMatch(serialized,/postgresql|password|insert into|private_table/u);
  assert.equal(diagnostic.stage,'candidate_funnel');
  assert.equal(diagnostic.jobKind,'candidate_batch');
  assert.equal(diagnostic.origin,'persistence');
  const barrier=safeFailureDiagnostic(new Error('completion failed'),{stage:'facts_refresh',jobKind:'stage_barrier',
    origin:'handler',producerSha:'b'.repeat(40)});
  assert.equal(barrier.jobKind,'stage_barrier');
});

test('V314-008 Web and runtime share exact release compatibility authority', () => {
  const { assessReleaseCompatibility } = require(path.join(root,
    'web/src/lib/opportunity-v3/release-compatibility-runtime.js'));
  const identity={producerCommitSha:'a'.repeat(40),runtimeManifestSha256:'b'.repeat(64),
    migrationLevel:'decision-integrity-v3.14'};
  assert.deepEqual(assessReleaseCompatibility({schema:'legacy-radar-v3.14.0',releaseIdentity:identity,
    expectedConsumerSha:'a'.repeat(40),expectedRuntimeManifestSha:'b'.repeat(64)}),
  {compatible:true,reason:'compatible'});
  assert.equal(assessReleaseCompatibility({schema:'legacy-radar-v3.14.0',releaseIdentity:identity,
    expectedConsumerSha:'c'.repeat(40),expectedRuntimeManifestSha:'b'.repeat(64)}).reason,'consumer_mismatch');
  const cases=[
    [{schema:'legacy-radar-v3.13.0',releaseIdentity:identity,expectedConsumerSha:'a'.repeat(40),
      expectedRuntimeManifestSha:'b'.repeat(64)},'legacy_schema'],
    [{schema:'legacy-radar-v3.14.0',releaseIdentity:null,expectedConsumerSha:'a'.repeat(40),
      expectedRuntimeManifestSha:'b'.repeat(64)},'identity_missing'],
    [{schema:'legacy-radar-v3.14.0',releaseIdentity:identity,expectedConsumerSha:'a'.repeat(40),
      expectedRuntimeManifestSha:'c'.repeat(64)},'runtime_mismatch'],
    [{schema:'legacy-radar-v3.14.0',releaseIdentity:{...identity,migrationLevel:'decision-integrity-v3.13'},
      expectedConsumerSha:'a'.repeat(40),expectedRuntimeManifestSha:'b'.repeat(64)},'migration_mismatch'],
  ];
  for(const [input,reason] of cases)assert.equal(assessReleaseCompatibility(input).reason,reason);
  const packageScripts=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).scripts;
  assert.equal(packageScripts['db:v3:apply-reviewed'],
    'node scripts/run-node22.js scripts/opportunity-v3/apply-reviewed-migrations.mjs --apply');
  const migrationApply=readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  assert.match(migrationApply,/resolveReviewedRuntimeRelease/u);
  assert.match(migrationApply,/keychain:stockinsider-runtime:database-url/u);
  assert.match(migrationApply,/stockinsider-reviewed-v3-migration-v1/u);
  assert.match(migrationApply,/productionDatabaseMigrationAuthorized/u);
  assert.doesNotMatch(migrationApply,/error[?][.]message|connectionString.*process[.]env/u);
  const runbook=readFileSync(path.join(root,'docs/operations_runbook.md'),'utf8');
  assert.match(runbook,/STOCKINSIDER_REVIEWED_RELEASE_SHA=<reviewed-commit>/u);
  assert.match(runbook,/STOCKINSIDER_RUNTIME_MANIFEST_SHA256=<prepared-runtime-manifest-sha256>/u);
  assert.match(runbook,/restore the prior runtime pointer\/plist and\s+Vercel alias/u);
  const {assessTrackedRuntimeHealth}=runtime('runtime-health.js');
  const observation={checkedAt:'2026-08-11T00:00:00Z',manifestPresent:true,manifestCanonical:true,
    reviewBindingValid:true,workerHashMatches:true,configHashMatches:true,schedulerRollbackPackagePresent:true,
    schedulerRollbackHashMatches:true,activationJournalComplete:true,activePointerValid:true,schedulerPlistMatches:true,
    schedulerOwner:'com.stockinsider.auth-source-worker',competingOwners:[],leaseStatus:'absent',
    stateSchema:'stockinsider-producer-state-v1',lastTerminalStatus:'success',lastRunNonterminal:false,
    negativeRunDuration:false,stuckRunCount:0,projectionFreshness:'fresh'};
  for(const compatibility of ['compatible','producer_newer','consumer_newer','unknown']){
    const health=assessTrackedRuntimeHealth({...observation,consumerCompatibility:compatibility});
    assert.equal(health.reasons.includes('consumer_producer_incompatible'),compatibility!=='compatible');
    assert.equal(health.consumer.compatibility,compatibility);
  }
  const doctor=readFileSync(path.join(root,'scripts/runtime/runtime-health-observer.js'),'utf8');
  assert.match(doctor,/release-compatibility-runtime/u);
  assert.match(doctor,/assessReleaseCompatibility/u);
});

test('V314-009 official calendar and backfill coverage remain typed and non-synthetic', () => {
  const { buildOfficialTradingScheduleV314,coverageReportV314,FLOW_FACT_KEYS,BALANCE_FACT_KEYS }=
    runtime('official-market-authority-v314.js');
  const codec=runtime('codec.js');
  const completed=Array.from({length:300},(_,index)=>{const date=new Date(Date.UTC(2025,0,1+index));
    return date.toISOString().slice(0,10);});
  const calendarSessions=completed.flatMap((session,index)=>['TWSE','TPEX'].map((market)=>({market,session,
    status:'completed',closeAt:`${session}T05:30:00Z`,sourceUrl:market==='TWSE'
      ?'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?date=20250101'
      :'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_114.htm',
    sourceRef:`${market.toLowerCase()}-annual-calendar:2025:${session}:${'a'.repeat(64)}`,sourceSha256:'a'.repeat(64),index})));
  const calendar=buildOfficialTradingScheduleV314({calendarSessions,evaluatedAt:'2026-08-11T00:00:00Z'});
  const anchor=completed.at(-1);
  const priceObservations=completed.slice(-130).map((session)=>{
    const actionDays=completed.filter((day)=>day>session&&day<=anchor).map((day)=>[day,
      '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','b'.repeat(64),null,1]);
    const evidence=['adjusted-price-evidence-v3.1',anchor,'11111111-1111-4111-8111-111111111111',
      `twse-rwd:STOCK_DAY:${session}:2330`,'22222222-2222-4222-8222-222222222222',100,105,95,102,
      actionDays,1,100,105,95,102];
    return {symbol:'2330',exchange:'TWSE',session,open:100,high:105,low:95,close:102,
      rawSourceRef:evidence[3],rawSourceUrl:'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20250101&stockNo=2330',
      adjustmentEvidence:evidence,adjustmentEvidenceRef:codec.sha256(codec.canonicalJson(evidence))};
  });
  const valuations=completed.slice(-252).map((session)=>({symbol:'2330',exchange:'TWSE',canonicalSector:'semiconductor',
    session,peRatio:18,
    sourceUrl:'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20250101',
    sourceRef:`twse-rwd:BWIBBU_d:${session}:2330`})).concat(Array.from({length:8},(_,index)=>({
      symbol:String(9100+index),exchange:'TWSE',canonicalSector:'semiconductor',session:completed.at(-1),peRatio:20+index,
      sourceUrl:'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20250101',
      sourceRef:`twse-rwd:BWIBBU_d:${completed.at(-1)}:${9100+index}`})));
  const periods=['2025-03-31','2025-06-30','2025-09-30','2025-12-31'];
  const flowValue=(factKey,index)=>({quarterly_revenue:1000,quarterly_gross_profit:400,
    quarterly_operating_expense:300,quarterly_operating_income:100,quarterly_non_operating_income:10,
    quarterly_pretax_income:110,quarterly_income_tax_expense:20,quarterly_noncontrolling_interest:10,
    quarterly_net_income:90,quarterly_net_income_attributable_to_common:80,
    quarterly_diluted_eps:.8,diluted_weighted_average_shares:100}[factKey])*(
    factKey==='diluted_weighted_average_shares'?1:index+1);
  const financialFacts=periods.flatMap((period,index)=>FLOW_FACT_KEYS.map((factKey)=>({symbol:'2330',factKey,
    periodStart:'2025-01-01',periodEnd:period,durationKind:'quarterly',value:flowValue(factKey,index),
    unit:factKey==='quarterly_diluted_eps'?'TWD_per_share':factKey==='diluted_weighted_average_shares'?'share':'TWD',
    filingPublishedAt:`${period}T06:00:00Z`,sourceTimestamp:`${period}T06:00:00Z`,collectedAt:`${period}T07:00:00Z`,
    sourceRef:`twse-mops-inline:${period}:2330:${factKey}:${'c'.repeat(64)}`})))
    .concat(BALANCE_FACT_KEYS.map((factKey)=>({symbol:'2330',factKey,periodStart:null,periodEnd:periods.at(-1),
      durationKind:'instant',value:{cash_and_equivalents:200,total_debt:100,total_assets:1000,total_equity:600,
        book_value_per_share:6}[factKey],unit:factKey==='book_value_per_share'?'TWD_per_share':'TWD',
      filingPublishedAt:'2025-12-31T06:00:00Z',sourceTimestamp:'2025-12-31T06:00:00Z',
      collectedAt:'2025-12-31T07:00:00Z',
      sourceRef:`twse-mops-inline:${periods.at(-1)}:2330:${factKey}:${'d'.repeat(64)}`})));
  const coverage=coverageReportV314({calendar,candidates:[{symbol:'2330',exchange:'TWSE',canonicalSector:'semiconductor'}],officialSnapshot:{
    priceObservations,valuations,valuationHistory:[],financialFacts}});
  assert.equal(coverage.ready,true);
  assert.equal(coverage.completedSessions,300);
  assert.equal(coverage.candidates[0].relativeReady,true);
  assert.throws(()=>buildOfficialTradingScheduleV314({calendarSessions:[{market:'TWSE',session:'2026-08-11',
    status:'completed',closeAt:'2026-08-11T05:30:00Z',sourceUrl:'https://example.com/',sourceRef:'fake'}],
    evaluatedAt:'2026-08-11T00:00:00Z'}),/official calendar/u);
  const applied=appliedV314MigrationEvidence();
  assert.match(applied,/V3\.14 official chunks persist under the exact lease, replay idempotently, and complete before DB reread/u);
  assert.match(applied,/# pass 3/u);
  assert.match(applied,/# fail 0/u);
});

test('V314-009a candidate authority metadata remains separate from the peer population', () => {
  const {resolveOfficialAuthorityCandidatesV314}=runtime('auth-source-worker-cli.js');
  const resolved=resolveOfficialAuthorityCandidatesV314([
    {symbol:'2330',stockId:'candidate-id',canonicalSector:'unknown',deepSelected:true},
  ],[['2330','candidate-id','TWSE','semiconductor']],[['2303','peer-id','TWSE','semiconductor']]);
  assert.equal(resolved.authorityCandidates[0].exchange,'TWSE');
  assert.equal(resolved.authorityCandidates[0].canonicalSector,'semiconductor');
  assert.deepEqual(resolved.peerUniverse.map((row)=>row.symbol),['2303']);
});

test('V314-010 all ten decision actions are closed and operationally reachable', async () => {
  const { ACTIONS,deriveDecisionEnvelopeV314,validateDecisionEnvelopeV314 }=runtime('decision-envelope-v314.js');
  const geometryFor=(state)=>state==='breakout_pending'
    ?{availability:'available',entryZone:[99,101],invalidation:90,trigger:{kind:'breakout',threshold:102}}
    :['below_support','reclaim_required'].includes(state)
      ?{availability:'conditional',entryZone:null,invalidation:null,trigger:{kind:'reclaim',threshold:102}}
      :state==='extended'
        ?{availability:'conditional',entryZone:null,invalidation:null,trigger:{kind:'pullback',threshold:98}}
        :state==='invalidated'
          ?{availability:'invalidated',entryZone:null,invalidation:null,trigger:null}
          :{availability:'available',entryZone:[99,101],invalidation:90,trigger:null};
  const formal=(state,base=140,marketAllowsAction=true)=>({
    valuation:{status:'normal',valuationRange:{bear:90,base,bull:170},method:{method:'pe'},asOf:'2026-08-07',
      evidence:{sourceRefs:['official']}},currentPrice:100,qualityActionEligible:true,marketAllowsAction,
    qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    technical:{technicalState:state,plane:{current:100}},geometry:geometryFor(state),
    lastEvaluatedAt:'2026-08-07T10:20:00Z'});
  const reached=new Set();
  for(const input of [formal('breakout_confirmed'),formal('at_support'),formal('breakout_confirmed',116),
    formal('breakout_confirmed',140,false),formal('breakout_pending'),
    formal('below_support'),formal('extended'),formal('invalidated'),
    {...formal('breakout_confirmed'),valuation:{status:'unavailable',
      reason:'missing_bridge_inputs'}}]){
    const envelope=deriveDecisionEnvelopeV314(input);reached.add(envelope.userAction);
    assert.ok(validateDecisionEnvelopeV314(envelope));
  }
  const hash=(letter)=>letter.repeat(64);
  const relative={...formal('at_support'),valuation:{status:'unavailable',reason:'missing_bridge_inputs'},
    researchScore:{axes:{valuation:{trustworthy:true,currentPe:10,historyPeP25:12,historyPeMedian:14,
      historyPeP75:16,sectorPe:15,historySampleCount:252,sectorCount:8,asOf:'2026-08-07',sourceRefs:['official'],
      valuationEvidence:{algorithm:'official-relative-pe-evidence-v1',currentObservationRoot:hash('a'),
        historyMembershipRoot:hash('b'),sectorMembershipRoot:hash('c'),evidenceRoot:hash('d'),
        historySessions:252,sectorPeers:8}}}}};
  const starter=deriveDecisionEnvelopeV314(relative);reached.add(starter.userAction);
  assert.equal(starter.userAction,'research_starter');
  assert.deepEqual([...reached].sort(),[...ACTIONS].sort());

  const worker=runtime('auth-source-worker-cli.js');
  const candidate={stockId:'10000000-0000-4000-8000-000000000001',symbol:'1101',canonicalSector:'food'};
  const cutoff='2026-08-07T10:20:00Z';
  const rawFacts=e2eOfficialFacts(candidate.symbol);
  const dates=[];for(let cursor=new Date('2026-08-07T00:00:00Z');dates.length<252;cursor.setUTCDate(cursor.getUTCDate()-1))
    if(![0,6].includes(cursor.getUTCDay()))dates.unshift(cursor.toISOString().slice(0,10));
  const own=dates.map((session,index)=>({stockId:candidate.stockId,symbol:candidate.symbol,sector:'food',exchange:'TWSE',
    session,close:40,peRatio:8+index%5,publishedAt:`${session}T06:30:00Z`,sourceTimestamp:`${session}T06:30:00Z`,
    collectedAt:`${session}T07:00:00Z`,sourceRef:`twse-rwd:BWIBBU_d:${session}:1101`,
    tradingSessionAuthorityHash:'a'.repeat(64)}));
  const peers=Array.from({length:8},(_,index)=>({...own.at(-1),
    stockId:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,symbol:String(1200+index),
    peRatio:11+index/10,sharesOutstanding:1_000_000+index,
    sourceRef:`twse-openapi:BWIBBU_ALL:${own.at(-1).session}:${1200+index}`}));
  const valuationInput=worker.valuationAuthorityInput(candidate,rawFacts,{reportedRows:[...own,...peers]},cutoff);
  const valuation=runtime('candidate-valuation.js').evaluateCandidateValuation({stockId:candidate.stockId,
    subjectStockId:candidate.stockId,sector:candidate.canonicalSector,cutoff,asOf:cutoff,
    facts:worker.valuationFactInput(rawFacts,cutoff),...valuationInput});
  assert.equal(valuation.status,'normal');
  const officialDecision=deriveDecisionEnvelopeV314({valuation,currentPrice:40,qualityActionEligible:true,
    marketAllowsAction:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    technical:{technicalState:'breakout_confirmed',plane:{current:40}},
    geometry:{availability:'available',entryZone:[39,41],invalidation:34,trigger:null},lastEvaluatedAt:cutoff});
  assert.equal(officialDecision.userAction,'buy');
  const citation={ref:'official-flow',sourceKey:'twse',sourceName:'臺灣證券交易所',
    sourceUrl:'https://www.twse.com.tw/',publishedAt:'2026-08-07T06:30:00Z',
    collectedAt:'2026-08-07T07:00:00Z',evaluatedAt:cutoff};
  const brief={thesis:['官方四季財務橋接完整','官方歷史估值具可比性','技術突破條件已確認'],
    risks:['需求可能反轉','估值倍數可能收縮','突破可能失敗'],evidence:[
      {point:'thesis:0',refs:[citation.ref]},{point:'thesis:1',refs:[citation.ref]},
      {point:'thesis:2',refs:[citation.ref]},{point:'risk:0',refs:[citation.ref]},
      {point:'risk:1',refs:[citation.ref]},{point:'risk:2',refs:[citation.ref]}]};
  const legacy={opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],recentFormal7d:[],
    fallbackOpportunities90d:[],hotTracking:[],hotThemes:[],discoveredStocks:[],reports:[],connectorStatus:[]};
  const projection=runtime('compact-radar-projection.js').publishCompactRadarProjection({decisions:[{
    symbol:candidate.symbol,name:'水泥公司',claimId:citation.ref,sourceKey:citation.sourceKey,
    sourceName:citation.sourceName,sourceUrl:citation.sourceUrl,claimAsOf:citation.publishedAt,
    sourceCollectedAt:citation.collectedAt,analysisGeneratedAt:citation.evaluatedAt,lastEvaluatedAt:cutoff,
    citations:[citation],decisionEnvelope:officialDecision,decisionBrief:brief,
    technical:{technicalState:'breakout_confirmed'},currentPrice:40}],legacyPayload:legacy,window:'home',asOf:cutoff,
    evaluatedAt:cutoff,publishedAt:cutoff,contentAsOf:cutoff,
    discoveryDelta:{added:[candidate.symbol],exited:[],continued:[],unchangedReasons:[]},
    freshnessSchedule:[{session_id:'2026-08-07',status:'completed'}],
    producerIdentity:{commitSha:'a'.repeat(40),runtimeManifestSha256:'b'.repeat(64)},
    schemaVersion:'legacy-radar-v3.14.0'});
  const [{validateCompactRadarProjectionRow},{validatePublishedDecisionCard},{sha256Canonical}]=await Promise.all([
    import('../../web/src/lib/opportunity-v3/compact-radar-validation.ts'),
    import('../../web/src/lib/opportunity-v3/decision-publication.ts'),
    import('../../web/src/lib/opportunity-v3/canonical.ts')]);
  assert.ok(validatePublishedDecisionCard(projection.payload.sourceSignals[0]),
    JSON.stringify(projection.payload.sourceSignals[0]));
  assert.equal(sha256Canonical(projection.payload),projection.payloadChecksum);
  assert.equal(projection.payload.sourceLedCorrectness.schema,'legacy-radar-v3.14.0');
  const webPayload=validateCompactRadarProjectionRow('home',{
    payload_json:projection.payload,payload_sha256:projection.payloadChecksum});
  assert.ok(webPayload,'official flow projection must cross the Web trust boundary');
  assert.equal(webPayload.sourceSignals[0].decisionEnvelope.userAction,'buy');
  assert.equal(webPayload.sourceSignals[0].decisionRevisionId,
    webPayload.sourceSignals[0].decisionEnvelope.decisionRevisionId);
});

test('V314-011 every approved profile/provider has one honest terminal outcome', async () => {
  const { acquireApprovedSources,CONNECTOR_ATTEMPT }=runtime('official-source-acquisition.js');
  const roster=structuredClone(JSON.parse(readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'))));
  roster.profiles[0].podcastFeed='https://creator.example/metadata.xml';
  roster.profiles[1].podcastFeed='https://provider.example/failure.xml';
  roster.profiles[2].podcastFeed='https://creator.example/transcript.xml';
  const metadata='<rss><channel><item><guid>metadata</guid><title>Metadata only</title><pubDate>Mon, 10 Aug 2026 08:00:00 GMT</pubDate><link>https://creator.example/metadata</link></item></channel></rss>';
  const transcript='<rss><channel><item><guid>transcript</guid><title>Authorized transcript</title><pubDate>Mon, 10 Aug 2026 08:00:00 GMT</pubDate><link>https://creator.example/transcript</link><podcast:transcript url="https://creator.example/transcript.txt" type="text/plain" /></item></channel></rss>';
  const acquired=await acquireApprovedSources({roster,credentials:{},fetchImpl:async(url)=>{
    if(String(url).endsWith('metadata.xml'))return new Response(metadata,{status:200,headers:{'content-type':'application/rss+xml'}});
    if(String(url).endsWith('transcript.xml'))return new Response(transcript,{status:200,headers:{'content-type':'application/rss+xml'}});
    if(String(url).endsWith('transcript.txt'))return new Response('台積電 2330 先進製程需求更新。',{status:200,headers:{'content-type':'text/plain'}});
    if(String(url).endsWith('failure.xml'))throw new Error('provider offline');
    throw new Error('offline');},
    now:new Date('2026-08-11T00:00:00Z')});
  assert.equal(acquired.connectorAttempts.length,51);
  assert.equal(new Set(acquired.connectorAttempts.map((row)=>`${row.profileId}:${row.sourceKey}`)).size,51);
  assert.ok(acquired.connectorAttempts.every((row)=>CONNECTOR_ATTEMPT.has(row.status)));
  const statuses=new Set(acquired.connectorAttempts.map((row)=>row.status));
  for(const status of ['auth_failed','metadata_only','provider_failed','items_found','missing_endpoint'])
    assert.ok(statuses.has(status),`missing mixed terminal ${status}`);
  assert.ok(acquired.itemOutcomes.filter((row)=>row.acquisitionDisposition==='metadata_only')
    .every((row)=>row.analysisDisposition==='no_claim'));
  assert.ok(acquired.documents.some((row)=>Array.isArray(row.rawFieldPayload)&&row.rawFieldPayload.length===3));
  assert.ok(acquired.itemOutcomes.some((row)=>row.acquisitionDisposition==='metadata_only'));
  const applied=appliedV314MigrationEvidence();
  assert.match(applied,/V3\.13 database derives successful-empty, missing, auth and provider terminals from 51 connector attempts/u);
  assert.match(applied,/# pass 3/u);
  assert.match(applied,/# fail 0/u);
});

test('V314-012 migration persists redacted diagnostics append-only with recorded time', () => {
  const sql=readFileSync(path.join(root,'migrations/20260811_actionability_recovery_v3_14.sql'),'utf8');
  assert.match(sql,/legacy_runtime_failure_diagnostics_v3_14/u);
  assert.match(sql,/recorded_at\)\s*VALUES/u);
  assert.match(sql,/ON CONFLICT\(run_id,job_id,diagnostic_hash\) DO NOTHING/u);
  assert.doesNotMatch(sql,/DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE/iu);
  assert.match(sql,/NOT \(coalesce\(v_item->>'sourceRef',''\) LIKE ANY\(ARRAY\['twse-openapi:%','tpex-openapi:%','twse-rwd:%','tpex-rwd:%'\]\)\)/u);
  const applied=appliedV314MigrationEvidence();
  assert.match(applied,/migration applies twice and exposes the exact granted\/private function boundary/u);
  assert.match(applied,/V3\.14 official chunks persist under the exact lease, replay idempotently, and complete before DB reread/u);
  assert.match(applied,/# pass 3/u);
  assert.match(applied,/# fail 0/u);
  assert.match(applied,/# skipped 0/u);
});

test('V314-013 official annual calendar is cross-market source material, not index inference', () => {
  const {parseTwseAnnualCalendar,tpexContainsDate}=runtime('official-calendar-v314.js');
  const payload={data:Array.from({length:10},(_,index)=>[`2026-01-${String(index+1).padStart(2,'0')}`,
    index===1?'國曆新年開始交易日':`休市 ${index}`,'依規定放假'])};
  const rows=parseTwseAnnualCalendar(payload,2026);
  assert.equal(rows.length,10);assert.equal(rows[1].date,'2026-01-02');
  assert.equal(tpexContainsDate('中華民國115年有價證券櫃檯買賣市場開（休）市日期表 1月1日','2026-01-01'),true);
  assert.equal(tpexContainsDate('1月1日','2026-01-02'),false);
});

test('V314-014 MOPS inline parser validates units and never derives diluted shares from rounded EPS', () => {
  const {parseMopsInlineFacts}=runtime('official-mops-v314.js');
  const context='<xbrli:context id="duration"><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-03-31</xbrli:endDate></xbrli:period></xbrli:context>';
  const audit='<ix:nonNumeric name="tifrs-fr1:ReviewAuditDate" contextRef="duration">2026-02-10</ix:nonNumeric>';
  const common=`<html><body>${context}${audit}<ix:nonFraction name="tifrs-fr1:ProfitLossAttributableToOwnersOfParent" contextRef="duration" unitRef="TWD" scale="0">1772000000</ix:nonFraction><ix:nonFraction name="tifrs-fr1:DilutedEarningsPerShare" contextRef="duration" unitRef="EarningsPerShare">0.90</ix:nonFraction>`;
  const options={symbol:'2337',exchange:'TWSE',sourceUrl:'https://mopsov.twse.com.tw/server-java/t164sb01?CO_ID=2337',
    collectedAt:'2026-02-11T00:00:00Z'};
  const withoutShares=parseMopsInlineFacts(`${common}</body></html>`,options);
  assert.equal(withoutShares.some((row)=>row.factKey==='diluted_weighted_average_shares'),false);
  const withShares=parseMopsInlineFacts(`${common}<ix:nonFraction name="tifrs-fr1:WeightedAverageNumberOfDilutedSharesOutstanding" contextRef="duration" unitRef="Shares">1969000000</ix:nonFraction></body></html>`,options);
  assert.equal(withShares.find((row)=>row.factKey==='diluted_weighted_average_shares')?.value,1969000000);
  assert.ok(withShares.every((row)=>row.sourceTimestamp===row.filingPublishedAt));
  assert.ok(withShares.every((row)=>row.collectedAt===new Date(options.collectedAt).toISOString()
    &&row.collectedAt!==row.sourceTimestamp));
  assert.ok(withShares.every((row)=>row.sourceRef.length<=120));
  const wrongUnit=parseMopsInlineFacts(`${common}<ix:nonFraction name="tifrs-fr1:WeightedAverageNumberOfDilutedSharesOutstanding" contextRef="duration" unitRef="TWD">1969000000</ix:nonFraction></body></html>`,options);
  assert.equal(wrongUnit.some((row)=>row.factKey==='diluted_weighted_average_shares'),false);
});

test('V314-014ab MOPS debt aliases cover current and non-current liabilities without double counting',()=>{
  const {parseMopsInlineFacts}=runtime('official-mops-v314.js');
  const context='<xbrli:context id="instant"><xbrli:instant>2026-03-31</xbrli:instant></xbrli:context>';
  const audit='<ix:nonNumeric name="tifrs-fr1:ReviewAuditDate" contextRef="instant">2026-05-12</ix:nonNumeric>';
  const debt=(name,value)=>`<ix:nonFraction name="tifrs-fr1:${name}" contextRef="instant" unitRef="TWD">${value}</ix:nonFraction>`;
  const html=`<html>${context}${audit}${debt('NoncurrentPortionOfNoncurrentBondsIssued',856227503000)}
    ${debt('LongtermLiabilitiesCurrentPortion',136925710000)}${debt('LongtermBorrowings',39834496000)}
    ${debt('NoncurrentPortionOfNoncurrentLoansReceived',39834496000)}</html>`;
  const facts=parseMopsInlineFacts(html,{symbol:'2330',exchange:'TWSE',
    sourceUrl:'https://mopsov.twse.com.tw/server-java/t164sb01?CO_ID=2330',collectedAt:'2026-05-13T00:00:00Z'});
  const totalDebt=facts.find((row)=>row.factKey==='total_debt');
  assert.equal(totalDebt?.value,1032987709000);
  assert.ok(facts.every((row)=>row.sourceRef.length<=120));
  const inheritedConcept=parseMopsInlineFacts(`${html}${debt('constructor',999999999999)}</html>`,{
    symbol:'2330',exchange:'TWSE',sourceUrl:'https://mopsov.twse.com.tw/server-java/t164sb01?CO_ID=2330',
    collectedAt:'2026-05-13T00:00:00Z'});
  assert.equal(inheritedConcept.find((row)=>row.factKey==='total_debt')?.value,1032987709000);
});

test('V314-014a MOPS retains the authoritative year-to-date series and rejects duplicate discrete contexts', () => {
  const {parseMopsInlineFacts}=runtime('official-mops-v314.js');
  const contexts=`<xbrli:context id="ytd"><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:context>
    <xbrli:context id="discrete"><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:context>`;
  const html=`<html>${contexts}<ix:nonNumeric name="tifrs-ar:ReviewAuditDate" contextRef="ytd">2025-08-10</ix:nonNumeric>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="ytd" unitRef="TWD">2200</ix:nonFraction>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="discrete" unitRef="TWD">1200</ix:nonFraction></html>`;
  const facts=parseMopsInlineFacts(html,{symbol:'2330',exchange:'TWSE',
    sourceUrl:'https://mopsov.twse.com.tw/server-java/t164sb01?CO_ID=2330',collectedAt:'2025-08-11T00:00:00Z'});
  assert.deepEqual(facts.filter((row)=>row.factKey==='quarterly_revenue').map((row)=>[row.periodStart,row.value]),
    [['2025-01-01',2200]]);
  assert.ok(facts.every((row)=>row.sourceRef.includes('twse-mops-inline:')));
});

test('V314-014aa MOPS rejects dimensional segment and scenario contexts', () => {
  const {parseMopsInlineFacts}=runtime('official-mops-v314.js');
  const consolidated='<xbrli:context id="issuer"><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:context>';
  const segment='<xbrli:context id="segment"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="segment">memory</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:context>';
  const scenario='<xbrli:context id="scenario"><xbrli:scenario><xbrldi:typedMember dimension="region">TW</xbrldi:typedMember></xbrli:scenario><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:context>';
  const html=`<html>${consolidated}${segment}${scenario}<ix:nonNumeric name="tifrs-ar:ReviewAuditDate" contextRef="issuer">2025-08-10</ix:nonNumeric>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="issuer" unitRef="TWD">2200</ix:nonFraction>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="segment" unitRef="TWD">9999</ix:nonFraction>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="scenario" unitRef="TWD">8888</ix:nonFraction></html>`;
  const facts=parseMopsInlineFacts(html,{symbol:'2330',exchange:'TWSE',
    sourceUrl:'https://mopsov.twse.com.tw/server-java/t164sb01?CO_ID=2330',collectedAt:'2025-08-11T00:00:00Z'});
  assert.deepEqual(facts.filter((row)=>row.factKey==='quarterly_revenue').map((row)=>row.value),[2200]);
});

test('V314-014b MOPS loader binds the requested official URL into parsed provenance', async () => {
  const {loadMopsFinancialHistoryV314,MOPS_INLINE_URL}=runtime('official-mops-v314.js');
  const requested=[];
  const html=`<html><xbrli:context id="duration"><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:context>
    <ix:nonNumeric name="tifrs-ar:ReviewAuditDate" contextRef="duration">2026-05-12</ix:nonNumeric>
    <ix:nonFraction name="ifrs-full:Revenue" contextRef="duration" unitRef="TWD">1000</ix:nonFraction></html>`;
  const result=await loadMopsFinancialHistoryV314({cutoff:'2026-08-11T00:00:00Z',
    candidates:[{symbol:'2330',exchange:'TWSE'}],fetchImpl:async(url)=>{
      requested.push(String(url));
      return new Response(url.includes('SSEASON=3')||url.includes('SSEASON=2')?'<h4>not found</h4>':html,
        {status:200,headers:{'content-type':'text/html'}});
    }});
  assert.ok(result.facts.length>0);assert.ok(result.facts.every((row)=>row.sourceUrl.startsWith(MOPS_INLINE_URL)));
  assert.ok(requested.some((url)=>url.includes('SYEAR=2026')&&url.includes('SSEASON=2')));
  assert.equal(requested.some((url)=>url.includes('SYEAR=2026')&&url.includes('SSEASON=3')),false);
});

test('V314-014c MOPS fact selection preserves cycle history without crossing the 128-row authority bound',()=>{
  const {selectLatestMopsFacts}=runtime('official-mops-v314.js');
  const periods=Array.from({length:14},(_,index)=>{const date=new Date(Date.UTC(2023,index*3+3,0));
    return date.toISOString().slice(0,10);});
  const flowKeys=['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense','quarterly_operating_income',
    'quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense','quarterly_noncontrolling_interest',
    'quarterly_net_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps','diluted_weighted_average_shares'];
  const common={symbol:'2330',exchange:'TWSE',filingPublishedAt:'2026-08-10T00:00:00Z',
    sourceTimestamp:'2026-08-10T00:00:00Z',sourceRef:`twse-mops-inline:${'a'.repeat(64)}`};
  const facts=periods.flatMap((period)=>flowKeys.map((factKey)=>({...common,factKey,periodStart:`${period.slice(0,4)}-01-01`,
    periodEnd:period,durationKind:'quarterly'}))).concat(['cash_and_equivalents','total_debt','total_assets','total_equity']
    .flatMap((factKey)=>periods.map((period)=>({...common,factKey,periodStart:null,periodEnd:period,durationKind:'instant'}))));
  const selected=selectLatestMopsFacts(facts);
  assert.ok(selected.length<=128);
  assert.equal(selected.filter((row)=>row.factKey==='quarterly_revenue').length,12);
  assert.equal(selected.filter((row)=>row.factKey==='quarterly_operating_income').length,8);
  assert.equal(selected.filter((row)=>row.factKey==='total_assets').length,1);
});

test('V314-015 full-market valuation parsers filter the bounded authority set while parsing', () => {
  const {parseTwseValuationRows}=runtime('official-twse-valuation.js');
  const payload=Array.from({length:1000},(_,index)=>({Code:String(1000+index),Name:`公司${index}`,
    Date:'1150810',PEratio:'10',PBratio:'1',DividendYield:'2'}));
  const rows=parseTwseValuationRows(payload,{collectedAt:'2026-08-11T00:00:00Z',allowedSymbols:new Set(['1001','1999'])});
  assert.deepEqual(rows.map((row)=>row.symbol),['1001','1999']);
});

test('V314-015a effective valuation and corporate-action request graphs remain closed after union', () => {
  const {boundedValuationRequests,boundedCompletedCalendarSessions}=runtime('official-twse-valuation.js');
  const sessions=Array.from({length:400},(_,index)=>new Date(Date.UTC(2024,0,index+1)).toISOString().slice(0,10));
  const valuations=['TWSE','TPEX'].flatMap((exchange)=>sessions.map((session)=>({exchange,session,url:`${exchange}:${session}`})));
  const bounded=boundedValuationRequests([...valuations,...valuations.slice(0,100)]);
  assert.equal(bounded.length,504);
  assert.equal(bounded.filter((row)=>row.exchange==='TWSE').length,252);
  const calendar=['TWSE','TPEX'].flatMap((market)=>sessions.map((session)=>({market,session,status:'completed'})))
    .concat([{market:'TWSE',session:'2026-08-11',status:'holiday'}]);
  const actionSessions=boundedCompletedCalendarSessions(calendar);
  assert.equal(actionSessions.length,260);
  assert.ok(actionSessions.every((row)=>row.status==='completed'));
});

test('V314-015b range corporate-action feed counts are scoped to each emitted session', async () => {
  const {CORPORATE_ACTION_FEEDS,loadCorporateActionSnapshotsRange}=runtime('official-twse-valuation.js');
  const sessions=['2026-08-06','2026-08-07'];
  const fetchImpl=async(url)=>{
    const feed=CORPORATE_ACTION_FEEDS.TWSE.find((item)=>String(url).includes(item.path));
    assert.ok(feed);
    const data=feed===CORPORATE_ACTION_FEEDS.TWSE[0]
      ?sessions.map((session,index)=>[session.replaceAll('-','/'),`23${30+index}`,'fixture','100','95']):[];
    return new Response(JSON.stringify({stat:'OK',fields:feed.header,data}),{status:200});
  };
  const snapshots=await loadCorporateActionSnapshotsRange({calendarSessions:sessions.map((session)=>({
    market:'TWSE',status:'completed',session})),fetchImpl,collectedAt:'2026-08-08T00:00:00Z'});
  assert.equal(snapshots.length,2);
  for(const snapshot of snapshots){
    assert.equal(snapshot.feedEvidence.reduce((sum,row)=>sum+row.parsedRowCount,0),snapshot.declaredEventCount);
    assert.equal(snapshot.declaredEventCount,1);
  }
});

test('V314-016 official ingestion streams bounded idempotency-addressed chunks and one terminal root', async () => {
  const {streamOfficialIngestionV314}=runtime('auth-source-worker-cli.js');const seen=[];
  const rows=(length)=>Array.from({length},(_,ordinal)=>({ordinal}));
  const summary=await streamOfficialIngestionV314({claim:{runId:'run',jobId:'job'},sourceCutoff:'2026-08-11T00:00:00Z',
    producerSha:'a'.repeat(40),snapshot:{calendarSessions:rows(401),financialFacts:rows(201),priceObservations:rows(401),
      corporateActionSnapshots:rows(41),valuations:rows(201),valuationHistory:rows(200)},persistChunk:async(row)=>seen.push(row)});
  assert.equal(seen.filter((row)=>row.kind==='terminal').length,1);
  assert.ok(seen.filter((row)=>row.kind!=='terminal').every((row)=>row.items.length<=20));
  assert.ok(seen.filter((row)=>['financial_facts','price_observations','reported_valuations'].includes(row.kind))
    .every((row)=>row.items.length<=20));
  assert.equal(seen.filter((row)=>row.kind==='reported_valuations').length,21);
  assert.equal(summary.counts.trading_sessions,401);assert.equal(summary.counts.reported_valuations,401);
  assert.match(summary.terminalRoot,/^[0-9a-f]{64}$/u);
});

test('V314-016b a staged ingestion resume is replayed without refetching mutable provider state', async () => {
  const {buildStageHandlers}=runtime('auth-source-worker-cli.js');
  const {canonicalJson,sha256}=runtime('codec.js');
  const {validateAuthSourceDagConfig}=runtime('source-run-config.js');
  const config=validateAuthSourceDagConfig(readFileSync(path.join(root,'config/runtime/auth-source-dag.json')));
  const sourceCutoff='2026-08-11T00:00:00Z';const persisted=[];
  const bundle={sourceCutoff,bridgeSchema:'legacy-product-value-bridge-v3.14',candidateResult:{candidates:[],discoveryDelta:{}},
    candidateAuthorityRows:[],peerUniverseRows:[],sourceProvenanceRows:[],financialRows:[],priceRows:[],legacyPriceRows:[],
    benchmarkRows:[],dislocationCandidates:[],projectionFreshnessSchedule:[],reportedPeBackfillSessions:[],
    officialPriceBackfillSymbols:[],corporateActionBackfillSessions:[],officialIngestionResume:{
      schema:'legacy-official-ingestion-resume-v3.15',sourceCutoff,calendarSessions:[],financialFacts:[],
      priceObservations:[],corporateActionSnapshots:[],reportedValuations:[]}};
  const canonical=canonicalJson(bundle);
  const handlers=buildStageHandlers(config,'a'.repeat(40),'b'.repeat(64),{fetchImpl:async()=>{
    throw new Error('provider fetch must not run during immutable resume');},persistOfficialIngestionChunk:async(row)=>persisted.push(row)});
  const output=await handlers.facts_refresh({runId:'run',jobId:'job',ownerToken:'token',readKind:'candidate_fact_plane',
    readCanonical:Buffer.from(canonical),readJson:bundle,readHash:sha256(canonical)});
  assert.equal(output.json.officialIngestion.schema,'legacy-official-ingestion-v3.14');
  assert.deepEqual(persisted.map((row)=>row.kind),['terminal']);
});

test('V316-016c an interrupted legacy chunk graph is verified and continued without identity conflicts',async()=>{
  const {streamOfficialIngestionV314}=runtime('auth-source-worker-cli.js');
  const {canonicalJson,sha256}=runtime('codec.js');
  const sessions=Array.from({length:45},(_,ordinal)=>({ordinal,session:`s${ordinal}`}));
  const first=sessions.slice(0,15);const second=sessions.slice(15,30);
  const existing=[first,second].map((items,ordinal)=>({kind:'trading_sessions',ordinal,itemCount:items.length,
    chunkHash:sha256(canonicalJson(['official-ingestion-chunk-v3.14','trading_sessions',ordinal,items]))}));
  const persisted=[];
  const summary=await streamOfficialIngestionV314({claim:{runId:'run',jobId:'job',ownerToken:'token'},
    sourceCutoff:'2026-08-16T00:00:00Z',producerSha:'a'.repeat(40),snapshot:{calendarSessions:sessions},
    resume:{schema:'legacy-official-ingestion-partial-resume-v3.16',sourceCutoff:'2026-08-16T00:00:00Z',
      calendarSessions:sessions.slice(0,30),financialFacts:[],priceObservations:[],corporateActionSnapshots:[],
      reportedValuations:[],chunks:existing},persistChunk:async(row)=>persisted.push(row)});
  assert.deepEqual(summary.chunks.slice(0,2),existing);
  assert.deepEqual(persisted.filter((row)=>row.kind==='trading_sessions').map((row)=>[row.ordinal,row.items.length]),[[2,15]]);
  assert.equal(persisted.at(-1).kind,'terminal');
  await assert.rejects(streamOfficialIngestionV314({claim:{runId:'run',jobId:'job'},
    sourceCutoff:'2026-08-16T00:00:00Z',producerSha:'a'.repeat(40),snapshot:{calendarSessions:sessions},
    resume:{schema:'legacy-official-ingestion-partial-resume-v3.16',sourceCutoff:'2026-08-16T00:00:00Z',
      calendarSessions:[{ordinal:999}],financialFacts:[],priceObservations:[],corporateActionSnapshots:[],
      reportedValuations:[],chunks:[existing[0]]}}),/official ingestion resume prefix conflict/u);
});

test('V314-016a unchanged financial semantics are not appended on every collection heartbeat', () => {
  const {newFinancialFactsV314}=runtime('auth-source-worker-cli.js');
  const fact={symbol:'2330',factKey:'quarterly_revenue',periodStart:'2026-01-01',periodEnd:'2026-03-31',
    durationKind:'quarterly',value:100,unit:'TWD',authorityTier:'official_filing',
    filingPublishedAt:'2026-05-10T00:00:00Z',sourceTimestamp:'2026-05-10T00:00:00Z',
    collectedAt:'2026-08-11T00:00:00Z',sourceRef:'twse-mops-inline:2026-03-31:2330:quarterly_revenue:'+'a'.repeat(64),
    filingRestatementId:null,estimateKind:'reported',estimateHorizon:'reported_period'};
  const prior=[fact.symbol,fact.factKey,fact.periodStart,fact.periodEnd,fact.durationKind,fact.value,fact.unit,
    fact.authorityTier,fact.filingPublishedAt,fact.sourceTimestamp,'2026-08-10T00:00:00Z','2026-08-10T00:00:01Z',
    fact.sourceRef,null,fact.estimateKind,fact.estimateHorizon];
  const changed={...fact,value:101,sourceRef:fact.sourceRef.replace(/a{64}$/u,'b'.repeat(64))};
  assert.deepEqual(newFinancialFactsV314([fact,changed,fact],[prior]),[changed]);
});

test('V314-017 malformed RuntimeHealth enums fail closed identically in Node and Web', async () => {
  const nodeHealth=runtime('runtime-health.js');
  const webHealth=await import('../../web/src/lib/opportunity-v3/runtime-health.ts');
  const observation={checkedAt:'2026-08-11T00:00:00Z',manifestPresent:true,manifestCanonical:true,
    reviewBindingValid:true,workerHashMatches:true,configHashMatches:true,schedulerRollbackPackagePresent:true,
    schedulerRollbackHashMatches:true,activationJournalComplete:true,activePointerValid:true,schedulerPlistMatches:true,
    schedulerOwner:'com.stockinsider.auth-source-worker',competingOwners:[],leaseStatus:'absent',
    stateSchema:'stockinsider-producer-state-v1',lastTerminalStatus:['failed'],lastRunNonterminal:false,
    negativeRunDuration:false,stuckRunCount:0,projectionFreshness:'fresh',consumerCompatibility:['compatible']};
  const node=nodeHealth.assessTrackedRuntimeHealth(observation);const web=webHealth.assessTrackedRuntimeHealth(observation);
  assert.deepEqual(web,node);assert.equal(node.runtime.lastTerminalStatus,null);
  assert.ok(node.reasons.includes('state_schema_mismatch'));assert.equal(node.consumer.compatibility,'unknown');
});

test('V314-018 provisional valuation refs require real non-future embedded dates', async () => {
  const {validProvisionalRelativeValue}=await import('../../web/src/lib/opportunity-v3/compact-radar-validation.ts');
  const dates=Array.from({length:60},(_,index)=>new Date(Date.UTC(2026,0,1+index)).toISOString().slice(0,10));
  const value={kind:'provisional_relative_value',sampleCount:60,asOf:dates.at(-1),referenceBand:{low:10,base:12,high:15},
    evidenceRoot:'a'.repeat(64),sourceRefs:dates.slice(-8).map((date)=>`twse-rwd:BWIBBU_d:${date}:2330`)};
  assert.equal(validProvisionalRelativeValue({provisionalRelativeValue:value}),true);
  assert.equal(validProvisionalRelativeValue({provisionalRelativeValue:{...value,
    sourceRefs:[...value.sourceRefs.slice(0,-1),'twse-rwd:BWIBBU_d:2026-99-99:2330']}}),false);
  assert.equal(validProvisionalRelativeValue({provisionalRelativeValue:{...value,
    sourceRefs:[...value.sourceRefs.slice(0,-1),'twse-rwd:BWIBBU_d:2027-01-01:2330']}}),false);
  assert.equal(validProvisionalRelativeValue({provisionalRelativeValue:{...value,evidenceRoot:'bad'}}),false);
  assert.equal(validProvisionalRelativeValue({provisionalRelativeValue:{...value,
    sourceRefs:Array.from({length:9},(_,index)=>`twse-rwd:BWIBBU_d:2026-02-${String(index+1).padStart(2,'0')}:2330`)}}),false);
});

test('V314-019 exact-review compatibility boundaries accept V3.14 and remain fail-closed', async () => {
  const worker=runtime('auth-source-worker-cli.js');
  const {deriveDecisionEnvelopeV314,validateDecisionEnvelopeV314}=runtime('decision-envelope-v314.js');
  assert.equal(worker.marketAllowsNewPosition({status:'risk_on'}),true);
  assert.equal(worker.marketAllowsNewPosition({status:'selective_or_defensive'}),false);
  assert.equal(worker.marketAllowsNewPosition({status:'data_incomplete'}),false);

  const calendarModule=runtime('official-calendar-v314.js');
  const annualPayload=(year)=>Array.from({length:10},(_,index)=>({
    Date:`${year-1911}${String(index+1).padStart(2,'0')}01`,Name:'開始交易',Description:'測試權威日曆',
  }));
  const fetchImpl=async(url)=>{
    const year=Number(String(url).match(/(?:date=|trading_date_)(\d{3,4})/u)?.[1]);
    const gregorian=year<1911?year+1911:year;
    const body=String(url).includes('holidaySchedule')?JSON.stringify(annualPayload(gregorian))
      :`中華民國${gregorian-1911}年 證券市場開（休）市日期表`;
    return new Response(body,{status:200});
  };
  const earlyYear=await calendarModule.loadOfficialTradingCalendarV314({
    cutoff:'2026-01-20T06:30:00Z',fetchImpl,
  });
  assert.ok(earlyYear.calendarSessions.filter((row)=>row.market==='TWSE'&&row.status==='completed').length>=300);
  assert.ok(earlyYear.calendarSessions.length<=1200);
  assert.ok(earlyYear.calendarSessions.some((row)=>row.session>'2026-01-20'));

  const unavailableWithThreshold=deriveDecisionEnvelopeV314({
    valuation:{status:'normal',valuationRange:{bear:80,base:105,bull:125},method:{method:'pe'},
      asOf:'2026-01-20',evidence:{sourceRefs:['official']}},currentPrice:100,qualityActionEligible:true,
    marketAllowsAction:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},
    lastEvaluatedAt:'2026-01-20T06:30:00Z',
  });
  assert.equal(unavailableWithThreshold.userAction,'unavailable');
  assert.ok(unavailableWithThreshold.thresholdAuthority);
  assert.ok(validateDecisionEnvelopeV314(unavailableWithThreshold));
  const malformedThreshold={...unavailableWithThreshold,thresholdAuthority:{
    ...unavailableWithThreshold.thresholdAuthority,evidenceRoot:'invalid'}};
  assert.equal(validateDecisionEnvelopeV314(malformedThreshold),null);
  const serialized=runtime('public-projection.js').serializeCorrectnessPublicUnion({symbol:'2330',
    decisionEnvelope:unavailableWithThreshold,lastEvaluatedAt:'2026-01-20T06:30:00Z',
    fundamental:{thesis:'官方資料測試。',latestChange:'已依 point-in-time 資料重估。',risks:['測試風險。'],
      evidenceRefs:['official-filing'],asOf:'2026-01-20T06:00:00Z'}});
  assert.equal(serialized.decisionEnvelope.version,'decision-envelope-v3.14.0');
  assert.equal(serialized.decisionRevisionId,unavailableWithThreshold.decisionRevisionId);
  const mopsRef=`twse-mops-inline:2025-12-31:2330:quarterly_revenue:${'e'.repeat(64)}`;
  const mopsCitation=worker.officialCitation(mopsRef,'2026-02-11T00:00:00Z',{
    publishedAt:'2026-02-10T00:00:00Z',collectedAt:'2026-02-11T00:00:00Z'});
  assert.equal(mopsCitation.sourceUrl,
    'https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2330&SYEAR=2025&SSEASON=4&REPORT_ID=C');
  const webValidation=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  assert.equal(webValidation.validateDecisionEnvelopeV313(malformedThreshold,
    malformedThreshold.decisionRevisionId),null);
  for(const validator of [validateDecisionEnvelopeV314,
    (value)=>webValidation.validateDecisionEnvelopeV313(value,value.decisionRevisionId)]){
    assert.equal(validator({...unavailableWithThreshold,thresholdAuthority:{
      ...unavailableWithThreshold.thresholdAuthority,marketRegime:'selective_or_defensive'}}),null);
    assert.equal(validator({...unavailableWithThreshold,thresholdAuthority:{
      ...unavailableWithThreshold.thresholdAuthority,requiredMarginPct:20}}),null);
    const missingSubfield=structuredClone(unavailableWithThreshold);
    delete missingSubfield.thresholdAuthority.actualRewardRisk;
    assert.equal(validator(missingSubfield),null);
    assert.equal(validator({...unavailableWithThreshold,thresholdAuthority:{
      ...unavailableWithThreshold.thresholdAuthority,unexpected:'not-closed'}}),null);
  }
  const missingPlan={...unavailableWithThreshold,entryPlan:null};
  assert.equal(webValidation.validateDecisionEnvelopeV313(missingPlan,missingPlan.decisionRevisionId),null);
  const selectiveWait=deriveDecisionEnvelopeV314({
    valuation:{status:'normal',valuationRange:{bear:80,base:116,bull:140},method:{method:'pe'},
      asOf:'2026-01-20',evidence:{sourceRefs:['official']}},currentPrice:100,qualityActionEligible:true,
    marketAllowsAction:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'selective_or_defensive',
    technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:95,trigger:null},
    lastEvaluatedAt:'2026-01-20T06:30:00Z',
  });
  assert.equal(selectiveWait.userAction,'wait_value');
  const forgedSelectiveBuy={...selectiveWait,userAction:'buy',reason:'v314_breakout_confirmed',whyNow:'forged',
    blockers:[],valuationSummary:{...selectiveWait.valuationSummary,blockers:[]},nextUnlock:null};
  assert.equal(validateDecisionEnvelopeV314(forgedSelectiveBuy),null);
  assert.equal(webValidation.validateDecisionEnvelopeV313(forgedSelectiveBuy,
    forgedSelectiveBuy.decisionRevisionId),null);
  const rejectedPublic=runtime('public-projection.js').serializeCorrectnessPublicUnion({symbol:'2330',
    decisionEnvelope:forgedSelectiveBuy,lastEvaluatedAt:'2026-01-20T06:30:00Z',
    fundamental:{thesis:'官方資料測試。',latestChange:'已重新檢查。',risks:['測試風險。'],
      evidenceRefs:['official-filing'],asOf:'2026-01-20T06:00:00Z'}});
  assert.equal(rejectedPublic.decisionEnvelope.userAction,'unavailable');

  const route=readFileSync(path.join(root,'web/src/app/api/stocks/[symbol]/deep-dive/route.ts'),'utf8');
  const doctor=readFileSync(path.join(root,'scripts/runtime/runtime-health-observer.js'),'utf8');
  const audit=readFileSync(path.join(root,'scripts/audit_valuation_assumptions.js'),'utf8');
  const radar=readFileSync(path.join(root,'web/src/app/components/RadarTabs.tsx'),'utf8');
  const migration=readFileSync(path.join(root,'migrations/20260811_actionability_recovery_v3_14.sql'),'utf8');
  assert.match(route,/decision-v3\[\.\]\(\?:13\|14\)/u);
  assert.match(doctor,/\['legacy-radar-v3[.]13[.]0','legacy-radar-v3[.]14[.]0'\]/u);
  assert.match(audit,/decision-v3\[\.\]\(\?:13\|14\)/u);
  assert.match(audit,/valuation-assumptions-audit-v3[.]14/u);
  assert.match(radar,/signal[.]projectionReadOnly===true[\s\S]*?validatePublishedDecisionCard/u);
  assert.match(radar,/const href = revision/u);
  assert.match(radar,/rec[.]symbol[}]\?decisionRevisionId=.*availableResearchDecision[.]decisionRevisionId/u);
  assert.match(radar,/readonly-detail-unavailable/u);
  assert.match(migration,/LEFT JOIN candidate_sector candidate[\s\S]*?WHERE candidate[.]stock_id IS NULL/u);
  assert.match(migration,/PARTITION BY exchange,canonical_sector_key/u);
  assert.match(migration,/WHEN sector_rank<=8 THEN 0/u);
});
