import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleSourceControllerRun, validateSourceControllerInput, type SourceScope } from './research-source-attempt-controller.ts';
const now = '2026-10-08T09:00:00Z';
function scope(): SourceScope {
  return { id:'public-news', platform:'news', url:'https://money.udn.com/money/story/5612/9766808',
    scope:'one attributed public summary, not all news',method:'public_summary_relay',contentScope:'article_body',
    rights:{basis:'public_summary_relay',checkedAt:now,checkedBy:'operator'},
    localRead:{attemptedAt:now,completedAt:now,outcome:'read_success'},
    publicRelay:{observer:'public-reader',observedAt:now,publication:{precision:'instant',value:'2026-09-21T02:30:56+08:00'}},
    summary:{sourcePlatform:'news',sourceUrl:'https://money.udn.com/money/story/5612/9766808',author:'public publisher',
      publishedAt:'2026-09-21T02:30:56+08:00',observedAt:now,symbols:['2409'],shortSummary:'合成測試摘要：合作傳聞尚無正式訂單確認。',
      catalyst:'僅供進一步研究核對。',risk:'轉載不增加獨立根源。',claimStatus:'rumor',visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'} };
}
function run(s=scope(),priorItems: unknown[] = []) {
  return assembleSourceControllerRun({runId:'10000000-0000-4000-8000-000000000001',scopes:[s],priorItems} as Parameters<typeof assembleSourceControllerRun>[0],
    [{attemptedAt:s.localRead!.attemptedAt,completedAt:s.localRead!.completedAt || now,outcome:s.localRead!.outcome,httpStatus:null,bytes:0,responseHash:null,
      bodyPresent:s.localRead!.outcome==='read_success',publishedAt:s.summary?.publishedAt || null,errorCode:s.localRead!.errorCode || null}],now);
}
test('PR01 exact public relay enters inbox without authenticated label or VM fetch claim',()=>{
  const result=run();assert.equal(result.inboxRequest.items.length,1);assert.equal(result.inboxRequest.items[0].visibility,'public');
  assert.equal(result.receipts[0].vmHttpRead,false);assert.equal(result.receipts[0].historicalPITEligible,false);
});
for (const [precision,value] of [['date','2026-09-21'],['unknown',null],['unverified_timezone','2026/09/20 23:34:22']] as const) {
  test(`PR02 ${precision} preserves precision and stays pending without invented instant`,()=>{
    const s=scope();delete s.summary;s.publicRelay!.publication={precision,value};s.publicRelay!.pendingSummary='已讀公開正文，尚缺可核對發布時區。';
    const result=run(s);assert.equal(result.inboxRequest.items.length,0);assert.equal(result.roots.length,0);
    assert.equal(result.receipts[0].outcome,'pending_publication_precision');assert.equal(result.priorityRequest.sourceAttempts[0].status,'failed');
    assert.equal(result.receipts[0].publishedAt,null);assert.deepEqual(result.receipts[0].publicRelay?.publication,{precision,value});
  });
}
test('PR03 date-only precision cannot conceal an exact-time summary',()=>{
  const s=scope();s.publicRelay!.publication={precision:'date',value:'2026-09-21'};assert.throws(()=>run(s),/public_relay_invalid/);
});
test('PR04 impossible date and future relay clocks rejected',()=>{
  for(const date of ['2026-02-30','2027-01-01']) {const s=scope();delete s.summary;s.publicRelay!.publication={precision:'date',value:date};assert.throws(()=>run(s));}
  const s=scope();s.publicRelay!.observedAt='2026-10-09T09:00:00Z';assert.throws(()=>run(s));
});
test('PR05 public relay cannot impersonate authenticated browser or carry secrets',()=>{
  const s=scope();s.summary!.visibility='authenticated_summary';s.summary!.acquisitionMethod='authenticated_browser_summary';assert.throws(()=>run(s));
  const secret={...scope(),headers:{authorization:'Bearer fictional-but-forbidden-value'}};
  assert.throws(()=>validateSourceControllerInput({runId:'10000000-0000-4000-8000-000000000001',scopes:[secret]},now),/forbidden_field/);
});
test('PR06 metadata and read failure never become full body or no relevant result',()=>{
  const metadata=scope();metadata.contentScope='metadata_index';assert.equal(run(metadata).receipts[0].outcome,'metadata_only');
  const failed=scope();failed.localRead!.outcome='read_failed';failed.localRead!.errorCode='source_network_failed';
  assert.equal(run(failed).priorityRequest.sourceAttempts[0].status,'failed');assert.equal(run(failed).inboxRequest.items.length,0);
});
test('PR07 exact public rerun retains root and deduplicates content',()=>{
  const first=run();const replay=run(scope(),first.inboxRequest.items);assert.equal(replay.inboxRequest.items.length,0);
  assert.equal(replay.receipts[0].outcome,'duplicate');assert.equal(replay.roots[0]?.rootId,first.roots[0]?.rootId);
});

for (const method of ['public_summary_relay','local_authorized_summary'] as const) {
  test(`PR08 ${method} preserves actual start before observed/completed clocks`,()=>{
    const s=scope();s.localRead!.attemptedAt='2026-10-08T08:59:59Z';
    if(method==='local_authorized_summary') {s.method=method;s.rights.basis='authorized_local_summary';delete s.publicRelay;
      s.summary!.visibility='authenticated_summary';s.summary!.acquisitionMethod='authenticated_browser_summary';}
    s.rights.checkedAt=s.localRead!.attemptedAt;
    assert.equal(run(s).inboxRequest.items.length,1);
    s.summary!.observedAt='2026-10-08T09:00:01Z';assert.throws(()=>run(s));
  });
}
test('PR09 conflicting/reversed/future completion and injected surface URL rejected',()=>{
  for(const completedAt of ['2026-10-08T08:59:59Z','2026-10-09T09:00:00Z']) {
    const s=scope();s.localRead!.completedAt=completedAt;assert.throws(()=>run(s));
  }
  const s=scope();s.localRead!.readSurfaceUrl='https://www.threads.com/@reader/post/id?token=secret';assert.throws(()=>run(s));
});
