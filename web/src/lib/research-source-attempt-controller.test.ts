import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleSourceControllerRun, inspectSourceBody, publicSourceGrant, sourceControllerUrl,
  validateSourceControllerInput, SOURCE_CONTROLLER_LIMITS, type SourceScope, type SourceReadObservation,
  type SourceControllerInput } from './research-source-attempt-controller.ts';
import { validateResearchInboxItem, researchInboxContentHash, type ResearchInboxItem } from './research-inbox.ts';
import { selectResearchPriority } from './research-agent-priority.ts';

const at='2026-10-05T00:00:00.000Z';
const earlier='2026-10-04T23:00:00.000Z';
const runId='11111111-1111-4111-8111-111111111111';
const summary: ResearchInboxItem={sourcePlatform:'threads',sourceUrl:'https://www.threads.net/@analyst/post/rumor',
  author:'local analyst',publishedAt:'2026-10-04T22:00:00.000Z',observedAt:earlier,
  symbols:['2409'],shortSummary:'市場出現一項未證實合作傳聞，尚無官方訂單證據。',
  catalyst:'僅作研究線索，等待官方驗證。',risk:'單一傳聞不能當作公司指引。',claimStatus:'rumor',
  visibility:'authenticated_summary',contentForm:'research_summary',acquisitionMethod:'authenticated_browser_summary'};
function local(overrides: Partial<SourceScope>={}): SourceScope {
  return {id:'one-rumor',platform:'threads',url:summary.sourceUrl,scope:'one authorized Mac summary, exact post',
    method:'local_authorized_summary',contentScope:'article_body',rights:{basis:'authorized_local_summary',checkedAt:earlier,checkedBy:'local-rights-review'},
    summary:{...summary},localRead:{attemptedAt:at,outcome:'read_success'},...overrides};
}
function pub(overrides:Partial<SourceScope>={}):SourceScope {
  return {id:'official',platform:'official',url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
    scope:'one official dataset GET, not exhaustive search',method:'public_read',contentScope:'official_document',
    rights:{basis:'official_public_document',checkedAt:earlier,checkedBy:'reviewed-public-domain'},...overrides};
}
function obs(overrides: Partial<SourceReadObservation>={}):SourceReadObservation {
  return {attemptedAt:at,completedAt:at,outcome:'read_success',httpStatus:null,bytes:0,responseHash:null,
    bodyPresent:true,publishedAt:null,errorCode:null,...overrides};
}
const input=(scopes:SourceScope[],priorItems:ResearchInboxItem[]=[]):SourceControllerInput=>({runId,scopes,priorItems});

test('SC01 single authorized rumor survives; output matches existing inbox and priority contracts',()=>{
  const run=assembleSourceControllerRun(input([local()]),[obs()],at);
  assert.equal(run.inboxRequest.items.length,1);
  assert.equal(validateResearchInboxItem(run.inboxRequest.items[0]),true);
  assert.equal(run.inboxRequest.items[0].claimStatus,'rumor');
  const attempt=run.priorityRequest.sourceAttempts[0];
  assert.equal(attempt.status,'success');assert.equal(attempt.resultCount,1);
  assert.equal(attempt.errorCode,null);assert.match(attempt.receiptHash!,/^[0-9a-f]{64}$/u);
  assert.equal(run.receipts[0].platformEnabled,false);
  assert.equal(run.receipts[0].legacyConnectorDisposition,'blocked_auth');
});

const industrySummary: ResearchInboxItem = {...summary,symbols:[],subjectScope:'industry_context',industryTerms:['CPO','光學測試'],
  shortSummary:'合成產業原文僅說明光學測試需求，未提及公司。',catalyst:'可提出產業研究問題，尚無個別公司關聯。',
  risk:'產業需求不證明個別公司已有客戶或訂單。',claimStatus:'reported'};

test('IS07 authorized industry-only content follows existing controller and inbox contracts',()=>{
  const run=assembleSourceControllerRun(input([local({summary:industrySummary})]),[obs()],at);
  assert.equal(run.inboxRequest.items.length,1);
  assert.equal(validateResearchInboxItem(run.inboxRequest.items[0]),true);
  assert.deepEqual(run.inboxRequest.items[0].symbols,[]);
  assert.equal(run.inboxRequest.items[0].subjectScope,'industry_context');
  assert.equal(run.priorityRequest.sourceAttempts[0].status,'success');
  assert.equal('assessments' in run.priorityRequest,false);
  assert.equal('associations' in run.inboxRequest.items[0],false);
  assert.equal(run.authoritativePublication,false);assert.equal(run.strategyApproved,false);
  for(const bad of [{...industrySummary,symbols:['2409']},{...industrySummary,associationSymbols:['2409']},
    {...industrySummary,industryTerms:['CPO','cpo']}]) {
    assert.throws(()=>validateSourceControllerInput(input([local({summary:bad})]),at));
  }
});

test('IS08 industry replay, repost and withdrawal preserve source roots without company labels',()=>{
  const first=assembleSourceControllerRun(input([local({summary:industrySummary})]),[obs()],at);
  const prior=first.inboxRequest.items;
  const replay=assembleSourceControllerRun(input([local({summary:industrySummary})],prior),[obs()],at);
  assert.equal(replay.receipts[0].outcome,'duplicate');assert.equal(replay.inboxRequest.items.length,0);
  const repost={...industrySummary,sourceUrl:'https://www.threads.net/@reposter/post/industry',parentSourceUrl:industrySummary.sourceUrl};
  const echoed=assembleSourceControllerRun(input([local({url:repost.sourceUrl,summary:repost})],prior),[obs()],at);
  assert.equal(new Set(echoed.roots.map((root)=>root.rootId)).size,1);
  assert.deepEqual(echoed.inboxRequest.items[0].symbols,[]);
  const withdrawn={...industrySummary,observedAt:at,revisionObservedAt:at,retracted:true};
  const next=assembleSourceControllerRun(input([local({summary:withdrawn})],prior),[obs()],at);
  assert.equal(next.inboxRequest.items[0].firstObservedAt,earlier);
  assert.equal(next.inboxRequest.items[0].retracted,true);
  assert.notEqual(researchInboxContentHash(next.inboxRequest.items[0]),researchInboxContentHash(prior[0]));
  assert.equal(next.roots.at(-1)!.status,'retracted');
  assert.equal(next.roots.at(-1)!.rootId,first.roots[0].rootId);
  assert.deepEqual(prior[0].symbols,[]);assert.equal(prior[0].retracted,undefined);
});

test('IS09 industry scope cannot bypass metadata, rights, private content or cutoff failures',()=>{
  const metadata=assembleSourceControllerRun(input([local({summary:industrySummary,
    localRead:{attemptedAt:at,outcome:'metadata_only'}})]),[obs({outcome:'metadata_only',bodyPresent:false})],at);
  assert.equal(metadata.inboxRequest.items.length,0);assert.equal(metadata.priorityRequest.sourceAttempts[0].status,'failed');
  for(const scope of [
    local({summary:{...industrySummary,publishedAt:'2026-02-30T00:00:00Z'}}),
    local({summary:{...industrySummary,observedAt:'2026-10-05T01:00:00Z'}}),
    local({summary:{...industrySummary,shortSummary:'cookie=private'}}),
    local({summary:{...industrySummary,timedExcerpts:[{startSeconds:0,endSeconds:10,text:'private transcript'}]}}),
    local({summary:industrySummary,rights:{basis:'official_public_document',checkedAt:earlier,checkedBy:'invalid-local-grant'}}),
  ]) assert.throws(()=>validateSourceControllerInput(input([scope]),at));
});

test('SC02 failures, auth, metadata and missing transcript never become no_relevant',()=>{
  for(const outcome of ['read_failed','auth_required','metadata_only','missing_transcript'] as const) {
    const run=assembleSourceControllerRun(input([local({localRead:{attemptedAt:at,outcome}})]),
      [obs({outcome,bodyPresent:false,errorCode:outcome==='read_failed' ? 'source_http_404' : null})],at);
    assert.equal(run.inboxRequest.items.length,0);
    assert.equal(run.priorityRequest.sourceAttempts[0].status,'failed');
    assert.equal(run.priorityRequest.sourceAttempts[0].resultCount,null);
    assert.ok(run.priorityRequest.sourceAttempts[0].errorCode);
  }
});

test('SC03 actual public body without summary adapter remains awaiting_summary',()=>{
  const s=pub();const inspected=inspectSourceBody(s,'[{"公司代號":"2409","公司名稱":"合成"}]','application/json');
  const run=assembleSourceControllerRun(input([s]),[obs({...inspected,httpStatus:200,bytes:64})],at);
  assert.equal(run.receipts[0].bodyPresent,true);
  assert.equal(run.receipts[0].outcome,'awaiting_summary');assert.equal(run.inboxRequest.items.length,0);
  assert.equal(run.priorityRequest.sourceAttempts[0].errorCode,'source_awaiting_summary');
});

test('SC04 podcast index and YouTube watch metadata do not prove transcript content',()=>{
  const podcast=pub({platform:'podcast',url:'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
    contentScope:'metadata_index',rights:{basis:'creator_published_index',checkedAt:earlier,checkedBy:'creator-rss-policy'}});
  assert.equal(publicSourceGrant(podcast),true);
  assert.equal(inspectSourceBody(podcast,'<rss><item><title>title</title><description>index only</description></item></rss>','application/rss+xml').outcome,'metadata_only');
  assert.equal(inspectSourceBody(local({contentScope:'transcript'}),'<html><title>video</title></html>','text/html').outcome,'missing_transcript');
  assert.equal(publicSourceGrant(pub({platform:'youtube',url:'https://www.youtube.com/watch?v=known'})),false);
});

test('SC05 HTML code is discarded, login stays visible, unrecognized body is not inferred',()=>{
  const s=pub({url:'https://www.auo.com/zh-TW/News_Archive/detail/example',contentScope:'article_body'});
  assert.equal(inspectSourceBody(s,'<script>globalThis.compromised=true</script><article>'+('visible research text '.repeat(8))+'</article>','text/html').bodyPresent,true);
  assert.equal((globalThis as unknown as Record<string,unknown>).compromised,undefined);
  assert.equal(inspectSourceBody(s,'<form><input type="password"></form>','text/html').outcome,'auth_required');
  assert.equal(inspectSourceBody(s,'<html><title>index</title></html>','text/html').bodyPresent,false);
  assert.throws(()=>inspectSourceBody(s,'x'.repeat(SOURCE_CONTROLLER_LIMITS.bodyBytes+1),'text/plain'),/body_bound/);
});

test('SC06 SSRF, credential URLs, injected query destinations and unreviewed hosts reject',()=>{
  for(const url of ['http://www.auo.com/','https://127.0.0.1/','https://user:pass@www.auo.com/',
    'https://www.auo.com/zh-TW/News_Archive?token=secret','https://www.auo.com/zh-TW/News_Archive?url=https://127.0.0.1/',
    'https://www.auo.com:8443/zh-TW/News_Archive','https://www.auo.com/zh-TW/News_Archive#fragment',
    'https://www.auo.com.evil.test/zh-TW/News_Archive']) {
    assert.throws(()=>validateSourceControllerInput(input([pub({url})]),at));
  }
  assert.throws(()=>sourceControllerUrl('https://www.youtube.com/watch?v=abc&authorization=xxx'),/url_rejected/);
});

test('SC07 unknown/secret fields and unbounded authenticated/full text cannot enter packet',()=>{
  for(const bad of [
    {...input([local()]),cookie:'hidden'},
    input([{...local(),rights:{...local().rights,secret:'hidden'}} as SourceScope]),
    input([local({summary:{...summary,shortSummary:'Bearer abcdefghijklmnopqrstuvwxyz'}})]),
    input([local({summary:{...summary,shortSummary:'password=private'}})]),
    input([local({summary:{...summary,shortSummary:'x'.repeat(601)}})]),
    input([local({summary:{...summary,fullText:'member article'} as ResearchInboxItem})]),
    input([local({summary:{...summary,timedExcerpts:[{startSeconds:0,endSeconds:10,text:'private transcript'}]}})]),
  ]) assert.throws(()=>validateSourceControllerInput(bad,at));
});

test('SC08 future publication/observation, rights and stale local terminals reject',()=>{
  const future='2026-10-05T01:00:00.000Z';
  for(const s of [local({summary:{...summary,publishedAt:future}}),local({summary:{...summary,observedAt:future}}),
    local({rights:{...local().rights,checkedAt:future}}),local({localRead:{attemptedAt:future,outcome:'read_success'}}),
    local({localRead:{attemptedAt:'2026-10-02T00:00:00Z',outcome:'read_success'}})])
    assert.throws(()=>validateSourceControllerInput(input([s]),at));
  const run=assembleSourceControllerRun(input([pub()]),[obs({httpStatus:200,responseHash:'a'.repeat(64),publishedAt:future})],at);
  assert.equal(run.receipts[0].outcome,'future_source');assert.equal(run.inboxRequest.items.length,0);
});

test('SC09 replay suppresses same content but correction retains original first observation',()=>{
  const first=assembleSourceControllerRun(input([local()]),[obs()],at);
  const prior=first.inboxRequest.items;
  const replay=assembleSourceControllerRun(input([local()],prior),[obs()],at);
  assert.equal(replay.inboxRequest.items.length,0);assert.equal(replay.receipts[0].outcome,'duplicate');
  assert.equal(replay.receipts[0].contentHash,researchInboxContentHash(prior[0]));
  const corrected={...summary,observedAt:at,revisionObservedAt:at,shortSummary:'訂正：原先合作傳聞遭到否認。',claimStatus:'denied' as const};
  const next=assembleSourceControllerRun(input([local({summary:corrected})],prior),[obs()],at);
  assert.equal(next.inboxRequest.items.length,1);
  assert.equal(next.inboxRequest.items[0].firstObservedAt,earlier);
  assert.equal(next.inboxRequest.items[0].revisionObservedAt,at);
  assert.deepEqual(prior,first.inboxRequest.items);
});

test('SC10 repost chain shares root; original withdrawal is not resurrected by repost',()=>{
  const original={...summary,retracted:true,revisionObservedAt:earlier};
  const repost={...summary,sourceUrl:'https://www.threads.net/@other/post/repost',parentSourceUrl:summary.sourceUrl,
    retracted:false,author:'reposter'};
  const run=assembleSourceControllerRun(input([local({id:'repost',url:repost.sourceUrl,summary:repost})],[original]),[obs()],at);
  assert.equal(run.inboxRequest.items.length,1);assert.equal(run.inboxRequest.items[0].parentSourceUrl,summary.sourceUrl);
  assert.equal(new Set(run.roots.map((root)=>root.rootId)).size,1);
  const rated={level:0 as const,reason:'尚未完成人工評分'};
  const ranked=selectResearchPriority({asOf:at,candidates:[{symbol:'2409',sector:'test',roots:run.roots,
    attempts:run.priorityRequest.sourceAttempts,profitImpact:rated,novelty:rated,researchability:rated,
    lane:'general',inProgress:false,disposition:'queued'}]});
  assert.equal(ranked.rows[0].independentRootCount,0);
  const second={...repost,sourceUrl:'https://www.threads.net/@third/post/repost',parentSourceUrl:repost.sourceUrl};
  const chain=assembleSourceControllerRun(input([local({id:'chain',url:second.sourceUrl,summary:second})],[original,repost]),[obs()],at);
  assert.equal(chain.inboxRequest.items[0].parentSourceUrl,summary.sourceUrl);
  assert.equal(new Set(chain.roots.map((root)=>root.rootId)).size,1);
});

test('SC11 public item requires exact response hash and reviewed content scope',()=>{
  const item={...summary,sourcePlatform:'official' as const,sourceUrl:pub().url,visibility:'public' as const,
    acquisitionMethod:'public_document' as const};
  const scope=pub({summary:item,summaryReadHash:'a'.repeat(64)});
  const mismatch=assembleSourceControllerRun(input([scope]),[obs({httpStatus:200,responseHash:'b'.repeat(64)})],at);
  assert.equal(mismatch.receipts[0].errorCode,'source_summary_read_hash_mismatch');
  assert.equal(mismatch.inboxRequest.items.length,0);
  const accepted=assembleSourceControllerRun(input([scope]),[obs({httpStatus:200,responseHash:'a'.repeat(64)})],at);
  assert.equal(accepted.inboxRequest.items.length,1);
  assert.throws(()=>assembleSourceControllerRun(input([scope]),[obs({httpStatus:404,responseHash:'a'.repeat(64)})],at),/observation_invalid/);
});

test('SC12 bounds, parent cycles, forged observations and unknown scope keys reject',()=>{
  assert.throws(()=>validateSourceControllerInput(input(Array.from({length:21},(_,i)=>local({id:`item${i}`}))),at),/input_invalid/);
  assert.throws(()=>validateSourceControllerInput(input([local(),local()]),at),/scope_invalid/);
  assert.throws(()=>validateSourceControllerInput(input([local({pageLimit:99} as unknown as Partial<SourceScope>)]),at),/unknown_field/);
  assert.throws(()=>assembleSourceControllerRun(input([local()]),[],at),/observation_count/);
  assert.throws(()=>assembleSourceControllerRun(input([local({summary:{...summary,parentSourceUrl:summary.sourceUrl}})]),[obs()],at),/parent_cycle/);
});

test('SC13 skipped deadline scopes are not_attempted, never claimed as a real read',()=>{
  const run=assembleSourceControllerRun(input([pub()]),[obs({outcome:'not_attempted',httpStatus:null,
    bodyPresent:false,errorCode:'source_run_deadline'})],at);
  assert.equal(run.priorityRequest.sourceAttempts[0].status,'not_attempted');
  assert.equal(run.priorityRequest.sourceAttempts[0].errorCode,null);
  assert.equal(run.receipts[0].readAttempted,false);
});

test('SC14 a parent discovery cannot backdate a newly observed repost document',()=>{
  const original={...summary,observedAt:earlier,firstObservedAt:earlier};
  const repost={...summary,sourceUrl:'https://www.threads.net/@other/post/new',parentSourceUrl:summary.sourceUrl,
    observedAt:at,firstObservedAt:at};
  const run=assembleSourceControllerRun(input([local({url:repost.sourceUrl,summary:repost})],[original]),[obs()],at);
  assert.equal(run.inboxRequest.items[0].firstObservedAt,at);
  assert.equal(new Set(run.roots.map((root)=>root.rootId)).size,1);
});

test('SC15 JSON primitive types and actual local terminal cannot be substituted',()=>{
  assert.throws(()=>validateSourceControllerInput(input([local({summary:{...summary,symbols:[2409]} as unknown as ResearchInboxItem})]),at),/item_invalid/);
  assert.throws(()=>validateSourceControllerInput(input([local({localRead:{attemptedAt:at,outcome:'read_failed',errorCode:999} as unknown as SourceScope['localRead']})]),at),/local_receipt_invalid/);
  assert.throws(()=>assembleSourceControllerRun(input([local({localRead:{attemptedAt:at,outcome:'read_failed'}})]),[obs()],at),/local_observation_mismatch/);
});

test('SC16 actual AUO detail markers establish body, but index/template drift do not',()=>{
  const s=pub({url:'https://www.auo.com/zh-TW/News_Archive/detail/News_Archive_Product_20260831',contentScope:'article_body'});
  const page='<h1 class="title font-32">Synthetic official release</h1><div class="html-edit"><p>'
    + 'Synthetic public research text. '.repeat(8)+'</p></div>';
  assert.equal(inspectSourceBody(s,page,'text/html').outcome,'read_success');
  assert.equal(inspectSourceBody({...s,url:'https://www.auo.com/zh-TW/News_Archive/index'},page,'text/html').outcome,'metadata_only');
  const index={...s,url:'https://www.auo.com/zh-TW/News_Archive/index'};
  assert.equal(publicSourceGrant(index),false);
  assert.equal(inspectSourceBody(index,'<article>'+('Synthetic index teaser. '.repeat(8))+'</article>','text/html').outcome,'metadata_only');
  assert.equal(inspectSourceBody(s,page.replace('html-edit','changed-template'),'text/html').outcome,'metadata_only');
  assert.equal(inspectSourceBody(s,page.replace(/<h1[\s\S]*?<\/h1>/u,''),'text/html').outcome,'metadata_only');
});

test('SC17 public RSS/JSON login wording is content, not authentication failure',()=>{
  const podcast=pub({platform:'podcast',url:'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
    contentScope:'metadata_index',rights:{basis:'creator_published_index',checkedAt:earlier,checkedBy:'creator-rss-policy'}});
  assert.equal(inspectSourceBody(podcast,'<rss><item><title>登入後才能看會員內容</title></item></rss>','application/rss+xml').outcome,'metadata_only');
  assert.equal(inspectSourceBody(pub(),'[{"note":"login required"}]','application/json').outcome,'read_success');
  assert.equal(inspectSourceBody(pub(),'<html>sign in to continue</html>','text/html').outcome,'auth_required');
});

test('SC18 known public publication clock cannot be backdated by an exact-byte summary',()=>{
  const item={...summary,sourcePlatform:'official' as const,sourceUrl:pub().url,visibility:'public' as const,
    acquisitionMethod:'public_document' as const};
  const s=pub({summary:item,summaryReadHash:'a'.repeat(64)});
  const sourcePublishedAt='2026-10-04T22:30:00.000Z';
  const conflict=assembleSourceControllerRun(input([s]),[obs({httpStatus:200,responseHash:'a'.repeat(64),publishedAt:sourcePublishedAt})],at);
  assert.equal(conflict.inboxRequest.items.length,0);assert.equal(conflict.roots.length,0);
  assert.equal(conflict.receipts[0].errorCode,'source_summary_publication_conflict');
  assert.equal(conflict.receipts[0].sourcePublishedAt,sourcePublishedAt);
  assert.equal(conflict.receipts[0].summaryPublishedAt,item.publishedAt);
  assert.equal(conflict.receipts[0].publishedAt,sourcePublishedAt);
  assert.equal(conflict.receipts[0].firstObservedAt,null);
  const matched=assembleSourceControllerRun(input([pub({summary:{...item,publishedAt:sourcePublishedAt},summaryReadHash:'a'.repeat(64)})]),
    [obs({httpStatus:200,responseHash:'a'.repeat(64),publishedAt:sourcePublishedAt})],at);
  assert.equal(matched.inboxRequest.items.length,1);
});

test('SC19 corrected ancestors use the latest accepted revision regardless of input order',()=>{
  const a='https://www.threads.net/@root/post/a',b='https://www.threads.net/@root/post/b';
  const old={...summary,parentSourceUrl:a};
  const corrected={...summary,parentSourceUrl:b,observedAt:at,revisionObservedAt:at};
  const repost={...summary,sourceUrl:'https://www.threads.net/@other/post/c',parentSourceUrl:summary.sourceUrl,
    observedAt:at,firstObservedAt:at,revisionObservedAt:at};
  const scope=local({url:repost.sourceUrl,summary:repost});
  for(const prior of [[old,corrected],[corrected,old]]) {
    const run=assembleSourceControllerRun(input([scope],prior),[obs()],at);
    assert.equal(run.inboxRequest.items[0].parentSourceUrl,b);
  }
  assert.throws(()=>assembleSourceControllerRun(input([scope],[corrected,{...corrected,parentSourceUrl:a}]),[obs()],at),/ancestor_revision_conflict/);
  const failed=local({id:'failed-ancestor',summary:corrected,localRead:{attemptedAt:at,outcome:'read_failed'}});
  const run=assembleSourceControllerRun(input([scope,failed]),[obs(),obs({outcome:'read_failed',bodyPresent:false})],at);
  assert.equal(run.inboxRequest.items[0].parentSourceUrl,summary.sourceUrl);
});

test('SC20 all acquired scopes resolve before roots, so reversed repost order cannot revive a withdrawn root',()=>{
  const original={...summary,retracted:true,revisionObservedAt:earlier};
  const a={...summary,sourceUrl:'https://www.threads.net/@other/post/a',parentSourceUrl:summary.sourceUrl,
    author:'reposter a',observedAt:at,firstObservedAt:at,revisionObservedAt:at};
  const b={...a,sourceUrl:'https://www.threads.net/@other/post/b',parentSourceUrl:a.sourceUrl,author:'reposter b'};
  const rated={level:0 as const,reason:'尚未完成人工評分'};
  for(const copies of [[a,b],[b,a]]) {
    const scopes=copies.map((copy,index)=>local({id:`copy${index}`,url:copy.sourceUrl,summary:copy}));
    const run=assembleSourceControllerRun(input(scopes,[original]),[obs(),obs()],at);
    assert.equal(run.inboxRequest.items.length,2);
    assert.ok(run.inboxRequest.items.every((item)=>item.parentSourceUrl===original.sourceUrl));
    const ranked=selectResearchPriority({asOf:at,candidates:[{symbol:'2409',sector:'test',roots:run.roots,
      attempts:run.priorityRequest.sourceAttempts,profitImpact:rated,novelty:rated,researchability:rated,
      lane:'general',inProgress:false,disposition:'queued'}]});
    assert.equal(ranked.rows[0].independentRootCount,0);
  }
});
