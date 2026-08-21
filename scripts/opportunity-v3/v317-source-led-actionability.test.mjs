import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(name)=>require(path.join(root,'scripts/runtime',name));

test('V317 preserves a research-only detail and waiting next step while global action authority is disabled',async()=>{
  const projection=runtime('compact-radar-projection.js');
  const publication=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  const {withProjectionHealth}=await import('../../web/src/lib/opportunity-v3/projection-readonly.ts');
  const asOf='2026-08-20T10:20:00Z';
  const published=projection.publishCompactRadarProjection({
    decisions:[],sourceCandidates:[{symbol:'2303',name:'聯電',sourceClass:'community',sourceSummary:'公開文章提及成熟製程庫存回補。',
      claimId:'claim-v317-2303',sourceKey:'ptt',sourceName:'公開討論區',sourceUrl:'https://www.ptt.cc/bbs/Stock/index.html',
      claimAsOf:'2026-08-20T09:00:00Z',sourceCollectedAt:'2026-08-20T09:30:00Z',lastEvaluatedAt:asOf,
      researchScore:{underreactionScore:72,coverage:.35,confidence:.5,axes:{
        timing:{score:76,trustworthy:true,technicalState:'at_support'},
        priceDislocation:{score:80,trustworthy:true},fundamental:{score:null,trustworthy:false},valuation:{score:null,trustworthy:false},
      },priceContext:{technicalState:'at_support',currentPrice:45.2,bias20Pct:.4,rsi14:48,atr14:1.1}},
      researchRanking:{rankingScore:52,coverage:.35,softBlockers:['missing:fundamental','missing:valuation']}}],
    discoveryDelta:{added:['2303'],exited:[],continued:[],unchangedReasons:[]},legacyPayload:{opportunities:[]},
    freshnessSchedule:[{session_id:'2026-08-20',status:'completed'}],window:'daily',asOf,
    producerIdentity:{commitSha:'a'.repeat(40)},schemaVersion:'legacy-radar-v3.17.0',
  });
  const card=published.payload.sourceSignals[0];
  assert.equal(card.symbol,'2303');
  assert.equal(card.researchSnapshot.version,'research-snapshot-v3.17.0');
  assert.equal(card.researchSnapshot.technical.state,'at_support');
  assert.equal(card.researchNextStep.kind,'wait_refresh');
  assert.equal(card.researchSnapshot.gateWaterfall.find((gate)=>gate.gate==='technical').status,'pass');
  assert.equal(card.researchSnapshot.gateWaterfall.find((gate)=>gate.gate==='valuation').status,'missing');
  assert.equal(card.gateWaterfall.find((gate)=>gate.gate==='technical').status,'pass');
  assert.deepEqual(published.payload.authorizationStatus,{telegram:'not_authorized',investanchors:'internal_methodology_only',
    sourceClaims:'authorized_terminal_outcomes_required'});
  const readonly=withProjectionHealth(published.payload,{status:'stale_readonly',reason:'missed_scheduled_runs',
    missedExpectedRuns:1,actionsEnabled:false,actionAuthority:'disabled',researchVisibility:'last_good_readonly',
    calendarAuthority:'tw_trading_sessions_v3'});
  const readonlyCard=readonly.sourceSignals[0];
  assert.ok(readonlyCard.decisionEnvelope,'V317 keeps the exact envelope for a safe research-only detail');
  assert.equal(readonlyCard.actionAuthorityDisabled,true);
  const validated=publication.validatePublishedDecisionCard(readonlyCard);
  assert.equal(validated?.detailAvailability,'stale_readonly');
  assert.equal(publication.buildPublishedDecisionDetailResult(validated).statusCode,200);
  assert.equal(runtime('research-next-step-v317.js').deriveResearchNextStep({
    decisionEnvelope:{userAction:'wait_breakout'},technicalState:'breakout_pending',trigger:48,invalidation:44,
  }).kind,'wait_breakout');
});

test('V317 evaluates the current frozen official union and emits a real liquidity input',()=>{
  const worker=runtime('auth-source-worker-cli.js');
  const cutoff='2026-08-20T10:20:00Z';
  const sessions=Array.from({length:20},(_,index)=>`2026-07-${String(index+1).padStart(2,'0')}`);
  const snapshot=worker.persistedOfficialSnapshot({sourceCutoff:cutoff,reportedPeRows:[],legacyRevenueRows:[],financialRows:[],
    benchmarkRows:[],priceRows:[]},{
    calendarSessions:sessions.map((session)=>({market:'TWSE',session,sourceRef:`twse-calendar:${session}`,sourceSha256:'a'.repeat(64)})),
    valuations:[{symbol:'2303',exchange:'TWSE',session:'2026-07-20',close:45,peRatio:14,pbRatio:1.6,
      sourceTimestamp:'2026-07-20T06:30:00Z',collectedAt:'2026-08-20T10:21:00Z',sourceRef:'twse-openapi:BWIBBU_ALL:2026-07-20:2303'}],
    revenues:[],twseIndex:[],tpexIndex:[],sourceFailures:[],
    financialFacts:[{symbol:'2303',factKey:'quarterly_revenue',periodStart:'2026-01-01',periodEnd:'2026-03-31',
      durationKind:'quarterly',value:100,unit:'TWD_thousand',authorityTier:'official_filing',
      filingPublishedAt:'2026-04-01T00:00:00Z',sourceTimestamp:'2026-04-01T00:00:00Z',collectedAt:'2026-08-20T10:21:00Z',
      sourceRef:'twse-openapi:financial-statement:2026-03-31:2303:quarterly_revenue'}],
    priceObservations:sessions.map((session)=>({symbol:'2303',exchange:'TWSE',session,open:44,high:46,low:43,close:45,
      volume:20_000_000,turnoverTwd:900_000_000,sourceTimestamp:`${session}T06:30:00Z`,collectedAt:'2026-08-20T10:21:00Z',
      sourceRef:`twse-rwd:STOCK_DAY:${session}:2303`})),
  },[{symbol:'2303',stockId:'stock-2303',canonicalSector:'semiconductor'}]);
  assert.equal(snapshot.reportedRows.length,1);
  assert.equal(snapshot.reportedRows[0].sourceTimestamp,'2026-07-20T06:30:00Z');
  assert.equal(snapshot.reportedRows[0].collectedAt,'2026-08-20T10:21:00Z');
  assert.equal(worker.officialFactRowsForDecision(snapshot,'2303').length,1);
  assert.equal(worker.officialLiquidityScore({symbol:'2303'},snapshot),90);
  assert.equal(worker.officialPriceRowsForResearch(snapshot).length,20);
});

test('V317 never acquires paid methodology-only sources and leaves no black anchor override',async()=>{
  const acquisition=runtime('official-source-acquisition.js');
  const roster=JSON.parse(readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  let requests=0;
  const output=await acquisition.acquireApprovedSources({roster,credentials:{},now:new Date('2026-08-20T10:20:00Z'),
    fetchImpl:async()=>{requests+=1;return new Response('{}',{status:404});}});
  const investAnchorsAttempts=output.connectorAttempts.filter((row)=>row.profileId==='investanchors');
  assert.equal(investAnchorsAttempts.length,3);
  assert.ok(investAnchorsAttempts.every((row)=>row.status==='missing_endpoint'));
  assert.equal(output.documents.some((row)=>row.profileId==='investanchors'),false);
  assert.equal(output.connectorAttempts.length,51);
  assert.ok(requests>=0);
  const css=readFileSync(path.join(root,'web/src/app/globals.css'),'utf8');
  assert.doesNotMatch(css,/^a\s*\{\s*color:\s*inherit;\s*\}/mu);
  assert.match(css,/--color-accent:/u);
});
