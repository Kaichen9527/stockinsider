import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(name)=>require(path.join(root,'scripts/runtime',name));

function outcome(symbol='2303') {
  return {raw:'公開研究提及成熟製程庫存回補',claimId:`claim-${symbol}`,mentionId:`mention-${symbol}`,
    claimAsOf:'2026-08-03T09:00:00Z',sourceKey:'ptt',sourceName:'公開討論區',
    sourceUrl:'https://www.ptt.cc/bbs/Stock/index.html',sourcePublishedAt:'2026-08-03T09:00:00Z',
    sourceCollectedAt:'2026-08-03T09:10:00Z',sourceClass:'community',sourcePriority:60,
    link:{disposition:'linked',stockId:`stock-${symbol}`,symbol},claimEligible:true};
}

test('V3.18 keeps no-new source candidates through twenty completed sessions without re-promoting them',()=>{
  const {buildCandidateFunnel}=runtime('candidate-funnel.js');
  const sessions=Array.from({length:22},(_,index)=>`2026-08-${String(index+1).padStart(2,'0')}`);
  const first=buildCandidateFunnel({outcomes:[outcome()],seedSymbols:[],priorLedger:[],currentSession:sessions[0],completedSessions:sessions});
  assert.equal(first.candidateLedger.length,1);
  assert.equal(first.candidateLedger[0].lastObservedSession,sessions[0]);
  assert.equal(first.candidateLedger[0].retainedSessionCount,0);
  const retained=buildCandidateFunnel({outcomes:[],seedSymbols:[],priorLedger:first.candidateLedger,currentSession:sessions[20],completedSessions:sessions});
  assert.equal(retained.candidateLedger.length,1);
  assert.equal(retained.candidateLedger[0].retainedSessionCount,20);
  assert.equal(retained.candidateLedger[0].disposition,'unchanged');
  assert.equal(retained.candidateLedger[0].reason,'same_material_evidence',
    'the persisted ledger reason remains within its closed enum');
  assert.equal(retained.candidateLedger[0].retentionReason,'source_evidence_retained_within_20_sessions',
    'the V3.18-specific retention explanation is additive metadata');
  assert.equal(retained.discoveryDelta.added.length,0);
  assert.deepEqual(retained.discoveryDelta.retained,['2303']);
  const retry=buildCandidateFunnel({outcomes:[],seedSymbols:[],priorLedger:retained.candidateLedger,
    currentSession:sessions[20],completedSessions:sessions});
  assert.equal(retry.candidateLedger[0].retainedSessionCount,20,
    'the same frozen cutoff retry cannot consume a second retention session');
  const unavailable=buildCandidateFunnel({outcomes:[],seedSymbols:[],priorLedger:first.candidateLedger,currentSession:sessions[1],completedSessions:sessions,sourceAvailable:false});
  assert.equal(unavailable.candidateLedger[0].reason,'same_material_evidence');
  assert.equal(unavailable.candidateLedger[0].retentionReason,'source_unavailable_retained_last_good');
  const expired=buildCandidateFunnel({outcomes:[],seedSymbols:[],priorLedger:first.candidateLedger,currentSession:sessions[21],completedSessions:sessions});
  assert.equal(expired.candidateLedger.length,0);
  assert.deepEqual(expired.discoveryDelta.exited,['2303']);
});

test('V3.18 reserves the full bounded ledger for still-retained cards and types fresh overflow',()=>{
  const {buildCandidateFunnel}=runtime('candidate-funnel.js');
  const sessions=['2026-08-01','2026-08-02'];
  const retainedSymbols=Array.from({length:60},(_,index)=>String(1000+index));
  const incomingSymbols=Array.from({length:60},(_,index)=>String(2000+index));
  const first=buildCandidateFunnel({outcomes:retainedSymbols.map(outcome),seedSymbols:[],priorLedger:[],
    currentSession:sessions[0],completedSessions:sessions});
  const burst=buildCandidateFunnel({outcomes:incomingSymbols.map(outcome),seedSymbols:[],priorLedger:first.candidateLedger,
    currentSession:sessions[1],completedSessions:sessions});
  assert.equal(burst.candidateLedger.length,60);
  assert.deepEqual(burst.candidateLedger.map((candidate)=>candidate.symbol).sort(),retainedSymbols,
    'an in-window research card cannot be silently evicted by a fresh-source burst');
  assert.equal(burst.discoverySummary.deferred,60);
  assert.deepEqual(burst.discoveryDelta.deferred.map((entry)=>entry.symbol).sort(),incomingSymbols);
  assert.ok(burst.discoveryDelta.deferred.every((entry)=>entry.reason==='candidate_capacity_reserved_for_retention'));
  assert.deepEqual(burst.discoveryDelta.exited,[],'only session expiry or integrity conflict may exit a retained card');
});

test('V3.19 dossier stays within one decision revision and keeps the full readiness contract',async()=>{
  const projection=runtime('compact-radar-projection.js');
  const publication=await import('../../web/src/lib/opportunity-v3/decision-publication.ts');
  const asOf='2026-08-20T10:20:00Z';
  const candidate={symbol:'2303',name:'聯電',sourceClass:'community',sourceSummary:'公開來源提及庫存回補。',
    claimId:'claim-v318-2303',sourceKey:'ptt',sourceName:'公開討論區',sourceUrl:'https://www.ptt.cc/bbs/Stock/index.html',
    claimAsOf:'2026-08-20T09:00:00Z',sourceCollectedAt:'2026-08-20T09:30:00Z',lastEvaluatedAt:asOf,
    researchScore:{underreactionScore:72,coverage:.35,confidence:.5,axes:{timing:{score:76,trustworthy:true,technicalState:'at_support'},
      priceDislocation:{score:80,trustworthy:true},fundamental:{score:null,trustworthy:false},valuation:{score:null,trustworthy:false}},
      priceContext:{technicalState:'at_support',currentPrice:45.2,bias20Pct:.4,rsi14:48,atr:1.1}},
    researchRanking:{rankingScore:52,coverage:.35,softBlockers:['missing:fundamental','missing:valuation']}};
  const published=projection.publishCompactRadarProjection({
    decisions:[],sourceCandidates:[candidate],
    discoveryDelta:{added:['2303'],exited:[],continued:[],unchangedReasons:[]},legacyPayload:{opportunities:[]},
    freshnessSchedule:[{session_id:'2026-08-20',status:'completed'}],window:'daily',asOf,
    producerIdentity:{commitSha:'a'.repeat(40)},schemaVersion:'legacy-radar-v3.19.0',
  });
  const card=published.payload.sourceSignals[0];
  const revisionCard=published.decisionRevisionCards[0];
  assert.equal('researchDossier' in card,false,'the landing payload remains compact');
  const dossier=revisionCard.researchDossier;
  assert.equal(dossier.decisionRevisionId,card.decisionRevisionId);
  assert.deepEqual(dossier.researchReadiness,revisionCard.researchReadiness,
    'the persisted dossier and landing readiness must keep the identical closed V3.19 contract');
  assert.equal(dossier.researchReadiness.rankingScore,52);
  assert.equal(dossier.researchReadiness.coverage,.35);
  assert.equal(dossier.ranking.readiness,'data_needed');
  assert.equal(dossier.valuation.formalRange,null);
  assert.equal(dossier.valuation.status,'valuation_review');
  const validated=publication.validatePublishedDecisionCard(revisionCard);
  assert.equal(validated?.detailAvailability,'research_only');
  const response=publication.buildPublishedDecisionDetailResult(validated);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.schema,'stock-detail-v3.19.0');
  assert.equal(response.body.researchDossier.decisionRevisionId,card.decisionRevisionId);
  const changed=projection.publishCompactRadarProjection({
    decisions:[],sourceCandidates:[{...candidate,fundamental:{latestChange:'官方月營收較前期改善'}}],
    discoveryDelta:{added:['2303'],exited:[],continued:[],unchangedReasons:[]},legacyPayload:{opportunities:[]},
    freshnessSchedule:[{session_id:'2026-08-20',status:'completed'}],window:'daily',asOf,
    producerIdentity:{commitSha:'a'.repeat(40)},schemaVersion:'legacy-radar-v3.19.0',
  });
  assert.notEqual(changed.decisionRevisionCards[0].decisionRevisionId,revisionCard.decisionRevisionId,
    'detail-only material must create a new immutable decision revision');
  const {collectDecisionRevisionCards}=projection;
  const weeklyOnly={...revisionCard,symbol:'2304',decisionRevisionId:`decision-v3.14:${'f'.repeat(64)}`,
    decisionEnvelope:{...revisionCard.decisionEnvelope,decisionRevisionId:`decision-v3.14:${'f'.repeat(64)}`},
    researchDossier:{...revisionCard.researchDossier,symbol:'2304',decisionRevisionId:`decision-v3.14:${'f'.repeat(64)}`}};
  const persisted=collectDecisionRevisionCards([{decisionRevisionCards:[revisionCard]},{decisionRevisionCards:[weeklyOnly]}]);
  assert.deepEqual(persisted.map((item)=>item.symbol),['2303','2304'],
    'a card visible only outside home still receives its immutable detail revision');
  assert.throws(()=>collectDecisionRevisionCards([{decisionRevisionCards:[revisionCard]},
    {decisionRevisionCards:[{...revisionCard,sourceSummary:'conflicting payload'}]}]),/window conflict/u);
});

test('V3.18 uses an explicit contrasting CTA rather than inherited foreground colour',()=>{
  const css=readFileSync(path.join(root,'web/src/app/globals.css'),'utf8');
  const radar=readFileSync(path.join(root,'web/src/app/components/RadarTabs.tsx'),'utf8');
  const formalDetail=readFileSync(path.join(root,'web/src/app/stock/[symbol]/RevisionBoundDecisionBrief.tsx'),'utf8');
  assert.match(css,/\.cta-primary\s*\{[\s\S]*color:\s*var\(--cta-foreground\)/u);
  assert.match(radar,/className="cta-primary inline-flex/u);
  assert.match(formalDetail,/data-testid="research-dossier"/u);
  assert.match(formalDetail,/估值[\s\S]*技術狀態[\s\S]*基本面/u);
});

test('V3.18 uses reviewed topic scopes for Threads and still requires the approved author',async()=>{
  const acquisition=runtime('official-source-acquisition.js');
  const roster=JSON.parse(readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  const queries=[];
  const result=await acquisition.acquireApprovedSources({roster,credentials:{threadsAccessToken:'test-token'},
    now:new Date('2026-08-20T10:20:00Z'),fetchImpl:async(url)=>{
      const parsed=new URL(String(url));
      if(parsed.origin==='https://graph.threads.net'){
        const query=parsed.searchParams.get('q');queries.push(query);
        const rows=query==='台股'?[{id:'gooaye-topic-1',username:'stockcancer',text:'2330 先進製程需求更新',
          permalink:'https://www.threads.net/@stockcancer/post/gooaye-topic-1',timestamp:'2026-08-20T09:00:00Z'},
          {id:'unapproved-1',username:'unapproved',text:'2330',permalink:'https://www.threads.net/@unapproved/post/1',
            timestamp:'2026-08-20T09:00:00Z'}]:[];
        return new Response(JSON.stringify({data:rows}),{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
    }});
  assert.ok(queries.includes('台股'));
  assert.ok(queries.includes('產業'));
  const threadDocuments=result.documents.filter((row)=>row.sourceKey==='threads');
  assert.deepEqual(threadDocuments.map((row)=>[row.profileId,row.stableConnectorDocumentId]),[['gooaye','gooaye-topic-1']]);
  assert.equal(result.connectorAttempts.length,51);
});

test('V3.19 preserves unapproved or metadata-only source terminals and accepts only structured authorized claims',()=>{
  const {extractRevisionCandidates}=runtime('auth-source-worker-cli.js');
  for(const sourceKey of ['telegram','investanchors']){
    const result=extractRevisionCandidates({frozenRevision:{
      revisionId:`71300000-0000-4000-8000-0000000000${sourceKey==='telegram'?'31':'32'}`,
      sourceKey,rawFieldPayload:{text:'2330 未經授權的內容不得參與研究。'},
    }});
    assert.equal(result.schema,'legacy-mention-claim-result-v3.11');
    assert.equal(result.parseOutcome,'processed_no_claim');
    assert.equal(result.documentOutcome.reason,`${sourceKey}_structured_claim_authorization_required`);
    assert.deepEqual(result.candidates,[]);
    assert.deepEqual(result.claimOutcomes,[]);
    assert.deepEqual(result.entityOutcomes,[]);
    assert.equal(result.conservation.outcome,'not_authorized');
  }
  const metadataOnly=extractRevisionCandidates({frozenRevision:{
    revisionId:'71300000-0000-4000-8000-000000000033',sourceKey:'youtube',analysisDisposition:'no_claim',
    rawFieldPayload:{text:'2330 只有影片 metadata。'},
  }});
  assert.equal(metadataOnly.documentOutcome.reason,'metadata_only_no_claim');
  assert.deepEqual(metadataOnly.candidates,[]);
  const authorized=extractRevisionCandidates({authorityPages:[['roster',null,null,[
    ['stock-2330','2330','TWSE','common_stock','active','台灣積體電路製造','台積電'],
  ]]],frozenRevision:{revisionId:'71300000-0000-4000-8000-000000000034',sourceKey:'investanchors',
    contentAuthorization:'structured_claim_authorized',structuredClaim:true,
    rawFieldPayload:{text:'2330 台積電先進製程需求的結構化研究摘要。'},
    sourceCollectedAt:'2026-08-20T10:00:00Z',sourcePublishedAt:'2026-08-20T09:00:00Z',
  }});
  assert.equal(authorized.parseOutcome,'processed_with_claims');
  assert.deepEqual(authorized.candidates.map((candidate)=>candidate.symbol),['2330']);
  assert.equal(authorized.candidates[0].sourceKey,'investanchors');
});

test('V3.18 research dossier code is part of the reviewed runtime bundle identity',()=>{
  const {TRACKED_RUNTIME_PATHS,runtimeBundleSha256}=runtime('tracked-runtime-bundle.js');
  assert.ok(TRACKED_RUNTIME_PATHS.includes('scripts/runtime/research-dossier-v318.js'));
  assert.match(runtimeBundleSha256(root),/^[0-9a-f]{64}$/u);
});
