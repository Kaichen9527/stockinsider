import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(name)=>require(path.join(root,'scripts/runtime',name));

function kolOutcome({symbol='2330',stockId=`stock-${symbol}`,sourceKey='telegram',authority='public_telegram_channel'}={}) {
  return {
    symbol,stockId,name:symbol==='2605'?'新興':'台積電',raw:`${symbol} 供需與獲利轉強。`,
    sourceSummary:'核准 KOL 公開內容提名。',sourceUrl:'https://t.me/example/1',sourceName:'核准 KOL',
    sourcePriority:80,claimAsOf:'2026-08-28T09:00:00Z',sourceCollectedAt:'2026-08-28T10:00:00Z',
    sourceKey,sourceClass:'kol',nominationAuthority:authority,claimEligible:true,
    structuredClaim:false,rightsAttested:false,revisionId:`revision-${symbol}`,claimId:`claim-${symbol}`,
    mentionId:`mention-${symbol}`,link:{disposition:'linked',stockId,symbol},
  };
}

test('V3.20 admits only KOL-authorized nominations and evicts legacy official-only retention immediately',()=>{
  const {buildCandidateFunnel}=runtime('candidate-funnel.js');
  const prior=[{...kolOutcome({symbol:'6419',sourceKey:'official_market_factor',authority:'official_market_factor'}),
    firstObservedSession:'2026-08-27',lastObservedSession:'2026-08-27',retentionCountedThroughSession:'2026-08-27'}];
  const result=buildCandidateFunnel({outcomes:[kolOutcome()],priorLedger:prior,seedSymbols:['2330'],
    currentSession:'2026-08-28',completedSessions:['2026-08-27','2026-08-28']});
  assert.deepEqual(result.candidateLedger.map((row)=>row.symbol),['2330']);
  assert.deepEqual(result.discoveryDelta.exited,['6419']);
  assert.deepEqual(result.discoveryDelta.exitedDetails,[{symbol:'6419',reason:'nomination_authority_revoked'}]);
  const official=buildCandidateFunnel({outcomes:[{...kolOutcome({sourceKey:'official_market_factor',authority:'official_market_factor'})}],
    priorLedger:[],seedSymbols:[],currentSession:'2026-08-28',completedSessions:['2026-08-28']});
  assert.equal(official.candidateLedger.length,0);
  assert.equal(official.discoveryDelta.rejected[0].reason,'nomination_authority_revoked');
});

test('V3.20 rejects the 2605 new-emerging-market ETF false positive but accepts a public Telegram nomination',()=>{
  const {extractRevisionCandidates}=runtime('auth-source-worker-cli.js');
  const authorityPages=[['roster',null,null,[
    ['stock-2605','2605','TWSE','common_stock','active','新興','新興航運'],
  ]]];
  const rejected=extractRevisionCandidates({authorityPages,frozenRevision:{revisionId:'32000000-0000-4000-8000-000000000001',
    sourceKey:'youtube',rawFieldPayload:{text:'新興市場 ETF 近期資金流入。'},sourceCollectedAt:'2026-08-28T10:00:00Z'}});
  assert.deepEqual(rejected.candidates,[]);
  const accepted=extractRevisionCandidates({authorityPages,frozenRevision:{revisionId:'32000000-0000-4000-8000-000000000002',
    sourceKey:'telegram',rawFieldPayload:{text:'2605 新興航運受惠運價回升，持續追蹤。'},
    sourceCollectedAt:'2026-08-28T10:00:00Z',sourcePublishedAt:'2026-08-28T09:00:00Z'}});
  assert.deepEqual(accepted.candidates.map((row)=>row.symbol),['2605']);
  assert.equal(accepted.candidates[0].nominationAuthority,'public_telegram_channel');
});

test('V3.20 produces a complete five-connector terminal matrix and metadata-only input cannot become a thesis',async()=>{
  const acquisition=runtime('official-source-acquisition.js');
  const roster=JSON.parse(readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  const result=await acquisition.acquireApprovedSources({roster,credentials:{},now:new Date('2026-08-28T10:20:00Z'),
    fetchImpl:async()=>new Response('{}',{status:404,headers:{'content-type':'application/json'}})});
  assert.equal(result.schema,'official-source-acquisition-v3.20');
  assert.equal(result.connectorAttempts.length,85);
  assert.equal(new Set(result.connectorAttempts.map((row)=>`${row.profileId}:${row.sourceKey}`)).size,85);
  assert.ok(result.connectorAttempts.every((row)=>['items_found','successful_empty','metadata_only','auth_failed','missing_endpoint','provider_failed'].includes(row.status)));
  const metadata=runtime('auth-source-worker-cli.js').extractRevisionCandidates({frozenRevision:{
    revisionId:'32000000-0000-4000-8000-000000000003',sourceKey:'youtube',analysisDisposition:'no_claim',
    rawFieldPayload:{text:'2330 only metadata'},sourceCollectedAt:'2026-08-28T10:00:00Z'}});
  assert.deepEqual(metadata.candidates,[]);
  assert.equal(metadata.documentOutcome.reason,'metadata_only_no_claim');
  const compatibility=runtime('auth-source-worker-cli.js').legacySourceAcquisitionCompatibilityV320(result);
  assert.equal(compatibility.schema,'official-source-acquisition-v3.13');
  assert.equal(compatibility.connectorAttempts.length,51);
  assert.ok(compatibility.connectorAttempts.every((row)=>['threads','podcast','youtube'].includes(row.sourceKey)));
  assert.equal(result.connectorAttempts.length,85,'the complete V3.20 terminal evidence is retained beside the legacy projection');
});

test('V3.20 records Telegram publication time only when the public message provides one and advertises cursor authority',()=>{
  const acquisition=runtime('official-source-acquisition.js');
  const parsed=acquisition.parseTelegramPublicPosts('<div data-post="example/11"><div class="tgme_widget_message_text">2605 新興航運</div><time datetime="2026-08-28T09:00:00Z"></time></div><div data-post="example/12"><div class="tgme_widget_message_text">2330 台積電</div></div>');
  assert.deepEqual(parsed,[{id:11,body:'2605 新興航運',publishedAt:'2026-08-28T09:00:00.000Z'},
    {id:12,body:'2330 台積電',publishedAt:null}]);
  const projection=runtime('compact-radar-projection.js').publishCompactRadarProjection({decisions:[],sourceCandidates:[],
    discoveryDelta:{added:[],exited:[],continued:[],unchangedReasons:[]},legacyPayload:{opportunities:[]},
    freshnessSchedule:[{session_id:'2026-08-28',status:'completed'}],window:'daily',asOf:'2026-08-28T10:20:00Z',
    producerIdentity:{commitSha:'a'.repeat(40)},schemaVersion:'legacy-radar-v3.20.0'});
  assert.deepEqual(projection.payload.authorizationStatus,{telegram:'public_channel_cursor_required',
    investanchors:'structured_claim_authorization_required',sourceClaims:'authorized_terminal_outcomes_required'});
});

test('V3.20 bounds live and reused connector envelopes without refetching or losing item conservation',()=>{
  const acquisition=runtime('official-source-acquisition.js');
  const html=Array.from({length:20},(_,index)=>`<div data-post="example/${index+1}"><div class="tgme_widget_message_text">${index+1} 台股研究</div><time datetime="2026-08-28T${String(index%10).padStart(2,'0')}:00:00Z"></time></div>`).join('');
  assert.deepEqual(acquisition.parseTelegramPublicPosts(html).map((row)=>row.id),[11,12,13,14,15,16,17,18,19,20]);
  const documents=Array.from({length:20},(_,index)=>({profileId:'investanchors',sourceKey:'telegram',
    stableConnectorDocumentId:`investanchors:${index+1}`,publishedAt:`2026-08-${String(index+1).padStart(2,'0')}T09:00:00Z`,
    collectedAt:'2026-08-28T10:20:00Z'}));
  const frozen={schema:'official-source-acquisition-v3.20',documents,itemOutcomes:documents.map((row)=>({
    profileId:row.profileId,sourceKey:row.sourceKey,stableId:row.stableConnectorDocumentId,
    acquisitionDisposition:'transcript_ready',analysisDisposition:'eligible_for_claim_extraction'})),
    connectorAttempts:[{profileId:'investanchors',sourceKey:'telegram',status:'items_found',
      responseEvidence:{itemCount:20,documentCount:20}}],outcomes:[{profileId:'investanchors',documentCount:20}]};
  const bounded=runtime('auth-source-worker-cli.js').boundedSourceAcquisitionV320(frozen);
  assert.equal(frozen.documents.length,20,'the provider envelope remains immutable evidence');
  assert.deepEqual(bounded.documents.map((row)=>row.stableConnectorDocumentId),
    ['investanchors:11','investanchors:12','investanchors:13','investanchors:14','investanchors:15',
      'investanchors:16','investanchors:17','investanchors:18','investanchors:19','investanchors:20']);
  assert.equal(bounded.itemOutcomes.length,10);
  assert.deepEqual(bounded.connectorAttempts[0].responseEvidence,{itemCount:10,documentCount:10});
  assert.equal(bounded.outcomes[0].documentCount,10);
});

test('V3.20 authority bootstrap appends only the new public Telegram and structured-claim identities',()=>{
  const bootstrap=readFileSync(path.join(root,'scripts/runtime/production-authority-bootstrap.js'),'utf8');
  assert.match(bootstrap,/approved-source-roster-v3[.]20/u);
  assert.match(bootstrap,/telegramPublicChannel/u);
  assert.match(bootstrap,/structured_claim_authorized/u);
  assert.match(bootstrap,/sourceIdentityVersion=\['telegram','investanchors'\]/u);
});

test('V3.20 turns a lost lease into an authoritative recoverable terminal instead of leaving a stuck run',async()=>{
  const stages=runtime('source-run-config.js').LEGACY_STAGES;
  let call=null;let reaped=null;
  const result=await runtime('auth-source-worker.js').runDurableAuthSourceWorker({
    configBytes:readFileSync(path.join(root,'config/runtime/auth-source-dag.json')),
    sourceCommitSha:'a'.repeat(40),workerBytes:Buffer.from('reviewed-worker'),heartbeatIntervalMs:1,
    adapter:{
      acquireLegacyProducerLease:async()=>({runId:'run-v320',job:{jobId:'job-v320'},disposition:'created'}),
      reapExpiredLegacyProducerRun:async(input)=>{reaped=input;return {disposition:null,terminalized:false};},
      claimLegacyProducerJob:async()=>({jobId:'job-v320',stage:stages[0],jobKind:'source_sync',readHash:'a'.repeat(64)}),
      heartbeatLegacyProducerJob:async()=>false,completeLegacyProducerJob:async()=>{ throw new Error('completion after lease loss'); },
      terminalizeExpiredLegacyProducerRun:async(input)=>{call=input;return {disposition:'failed_recoverable',terminalized:true};},
      appendLegacyRuntimeFailureDiagnostic:async()=>true,failLegacyProducerJob:async()=>{ throw new Error('should not fall through'); },
    },stageHandlers:{[stages[0]]:async()=>{await new Promise((resolve)=>setTimeout(resolve,5));return runtime('codec.js').immutableBundle('v320',[]);}},
  });
  assert.equal(result.disposition,'failed_recoverable');assert.equal(result.terminalized,true);assert.equal(result.failure,'lease_expired');
  assert.equal(call.runId,'run-v320');assert.equal(call.jobId,'job-v320');
  assert.equal(reaped.sourceCommitSha,'a'.repeat(40));
  assert.match(reaped.workerSha256,/^[0-9a-f]{64}$/u);
  assert.match(reaped.configSha256,/^[0-9a-f]{64}$/u);
});

test('V3.20 recovery CLI accepts only a complete exact reviewed identity',()=>{
  const {parseArguments}=runtime('reap-expired-producer-run-v320-cli.js');
  const parsed=parseArguments(['--source-commit','a'.repeat(40),'--worker-sha256','b'.repeat(64),
    '--config-sha256','c'.repeat(64)]);
  assert.equal(parsed.sourceCommitSha,'a'.repeat(40));
  assert.throws(()=>parseArguments(['--source-commit','a'.repeat(40)]),/invalid_arguments/u);
});
