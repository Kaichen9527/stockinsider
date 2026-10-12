import test from 'node:test';
import assert from 'node:assert/strict';
import { admitDiscoveryCandidate, projectDiscoveryAdmission, discoveryCardPresentation, admissionForLegacyCard,
  type DiscoveryEvidence, type DiscoverySource, type PttArticleEvidence } from './candidate-discovery-admission.ts';
const symbol = '2409';
const source = (id: string, platform = 'threads', publisher = id, root = id): DiscoverySource => ({ sourceId: id, platform,
  publisherId: publisher, rootId: root, identityResolved: true, status: 'current', kind: 'public', mentionedSymbols: [symbol] });
const evidence = (sources: DiscoverySource[]): DiscoveryEvidence => ({ complete: true, sources, pttArticles: [] });
const admit = (sources: DiscoverySource[]) => admitDiscoveryCandidate(symbol, evidence(sources));
test('only a pair with different canonical publishers and roots enters general research', () => {
  const result = admit([source('a'), source('b', 'instagram')]); assert.equal(result.status, 'admitted'); assert.equal(result.lane, 'general'); assert.equal(result.investmentQualified, false);
});
for (const [reason, sources] of [
  ['same author across platforms', [source('a', 'threads', 'creator'), source('b', 'instagram', 'creator')]],
  ['syndicated original root', [source('a', 'threads', 'a', 'root'), source('b', 'news', 'b', 'root')]],
] as Array<[string, DiscoverySource[]]>) test(reason, () => assert.equal(admit(sources).status, 'not_admitted'));
test('same-platform original authors with independent roots qualify; platform diversity is display-only', () => {
  assert.equal(admit([source('a'), source('b')]).status, 'admitted');
  assert.equal(admit([source('a', 'threads', 'p1', 'r1'), source('b', 'instagram', 'p1', 'r2'), source('c', 'instagram', 'p2', 'r1')]).status, 'admitted');
});
test('retracted root cannot be laundered by a current repost', () => {
  const withdrawn = { ...source('withdrawn', 'official', 'company', 'root'), status: 'retracted' as const };
  assert.notEqual(admit([withdrawn, source('repost', 'news', 'news', 'root'), source('other', 'threads')]).status, 'admitted');
});
test('industry-only and unresolved aliases cannot count as direct company confirmation', () => {
  assert.notEqual(admit([source('a'), { ...source('b', 'instagram'), mentionedSymbols: [] }]).status, 'admitted');
  assert.equal(admit([source('a'), { ...source('b', 'instagram'), identityResolved: false }]).status, 'unsupported');
});
test('bounded legacy links, counters and missing PTT detail are unsupported', () => {
  assert.equal(admitDiscoveryCandidate(symbol, { ...evidence([source('a'), source('b', 'instagram')]), complete: false }).status, 'unsupported');
  assert.equal(admissionForLegacyCard({ symbol }).reason, 'complete_source_lineage_missing');
  assert.equal(admitDiscoveryCandidate(symbol, { ...evidence([source('a')]), pttArticles: null }).gaps.includes('per_reply_ptt_stock_mentions'), true);
});
function ptt(count: number): PttArticleEvidence { return { sourceId: 'ptt-a', body: '討論股票 2409 的風險', bodyMentionedSymbols: [symbol],
  replies: Array.from({ length: count }, (_, i) => ({ authorId: `user${i}`, text: '2409 尚待查證', mentionedSymbols: [symbol], kind: 'reply' })) }; }
function pttInput(article: PttArticleEvidence): DiscoveryEvidence { return { ...evidence([source('ptt-a', 'ptt')]), pttArticles: [article] }; }
test('PTT 19/20 actual different stock-mention authors boundary', () => {
  assert.equal(admitDiscoveryCandidate(symbol, pttInput(ptt(19))).status, 'not_admitted');
  const admitted = admitDiscoveryCandidate(symbol, pttInput(ptt(20))); assert.equal(admitted.status, 'admitted'); assert.equal(admitted.effectivePttAuthors, 20);
});
test('PTT duplicate authors, reactions, irrelevant text, unverified mentions and substrings never inflate 20', () => {
  const article = ptt(19); article.replies.push({ ...article.replies[0], authorId: 'USER0' }, { authorId: 'push', text: '2409', mentionedSymbols: [symbol], kind: 'reaction' },
    { authorId: 'unrelated', text: '推', mentionedSymbols: [symbol], kind: 'reply' }, { authorId: 'unmatched', text: '2409', mentionedSymbols: [], kind: 'reply' },
    { authorId: 'substring', text: '124099', mentionedSymbols: [symbol], kind: 'reply' });
  assert.equal(admitDiscoveryCandidate(symbol, pttInput(article)).effectivePttAuthors, 19);
});
test('PTT requires stock in body, current article, and one post, not pooled reply totals', () => {
  assert.notEqual(admitDiscoveryCandidate(symbol, pttInput({ ...ptt(20), body: '產業討論' })).status, 'admitted');
  const input = pttInput(ptt(10)); input.sources.push(source('ptt-b', 'ptt')); input.pttArticles!.push({ ...ptt(10), sourceId: 'ptt-b' });
  assert.equal(admitDiscoveryCandidate(symbol, input).effectivePttAuthors, 10);
  const removed = pttInput(ptt(20)); removed.sources[0].status = 'retracted'; assert.notEqual(admitDiscoveryCandidate(symbol, removed).status, 'admitted');
});
test('reasoned new official event can enter low-volume lane, never multi-source confirmation', () => {
  const input = evidence([{ ...source('official', 'official'), kind: 'official' }]);
  input.lowVolumeLead = { sourceId: 'official', kind: 'major_official_event', reason: '明確重大事件待研究', newInformation: true };
  const result = admitDiscoveryCandidate(symbol, input); assert.equal(result.lane, 'low_volume'); assert.equal(result.investmentQualified, false);
  input.lowVolumeLead.newInformation = false; assert.equal(admitDiscoveryCandidate(symbol, input).status, 'not_admitted');
});
test('high-impact new lead requires explained known direct source; ordinary news is not official', () => {
  const input = evidence([source('news', 'news')]); input.lowVolumeLead = { sourceId: 'news', kind: 'major_official_event', reason: '具名新線索待研究', newInformation: true };
  assert.equal(admitDiscoveryCandidate(symbol, input).status, 'not_admitted'); input.lowVolumeLead.kind = 'high_impact_new_lead'; assert.equal(admitDiscoveryCandidate(symbol, input).lane, 'low_volume');
});
test('existing ordered inputs retain every audit row; 15+5 cap and weekly5 are not a new scheduler', () => {
  const rows = Array.from({ length: 40 }, (_, i) => { const sym = String(1000 + i); const low = i >= 20;
    const input = evidence(low ? [{ ...source('official', 'official'), kind: 'official' }] : [source('a'), source('b', 'instagram')]);
    input.sources.forEach(s => { s.mentionedSymbols = [sym]; });
    if (low) input.lowVolumeLead = { sourceId: 'official', kind: 'major_official_event', reason: '重大新事實待查證', newInformation: true };
    return { symbol: sym, evidence: input }; });
  const original = JSON.stringify(rows), projected = projectDiscoveryAdmission(rows);
  assert.equal(projected.selectedSymbols.length, 20); assert.equal(projected.audit.filter(r => r.selected && r.admission.lane === 'general').length, 15);
  assert.equal(projected.audit.filter(r => r.selected && r.admission.lane === 'low_volume').length, 5); assert.equal(projected.accountedCount, 40);
  assert.equal(projected.weeklyNewDeepResearchLimit, 5); assert.equal(projected.schedulingIntegrated, false); assert.equal(JSON.stringify(rows), original);
});
test('bounds fail closed without truncate-success; invalid platform and duplicate symbols reject', () => {
  assert.throws(() => admitDiscoveryCandidate(symbol, evidence(Array.from({ length: 513 }, (_, i) => source(String(i))))), /bound/u);
  assert.throws(() => admit([source('a', 'Threads'), source('b', 'threads')]), /invalid/u);
  assert.throws(() => projectDiscoveryAdmission([{ symbol, evidence: null }, { symbol, evidence: null }]), /cohort/u);
});
const card = { technical: { close: 42, sessionDate: '2026-10-08' }, valuation: { status: 'complete', method: 'pb_reference', baseTarget: 60, currentPrice: 99 }, stale: false };
test('technical.close and exact completed session govern freshness, not availableAt or seven-day TTL', () => {
  const latest = discoveryCardPresentation(card, '2026-10-08'); assert.equal(latest.close, 42); assert.equal(latest.priceStatus, 'latest_complete_close');
  assert.equal(discoveryCardPresentation({ ...card, technical: { close: 41, sessionDate: '2026-10-07' } }, '2026-10-08').priceStatus, 'older_close');
  // Oct9 TWSE substitute holiday + weekend: supplied official latest remains Oct8.
  assert.equal(discoveryCardPresentation(card).priceStatus, 'latest_session_unverified'); assert.equal(latest.baseUpsidePct, null);
});
test('PB/TTM are reference methods, never forward targets; stale and unknown method hide target and upside', () => {
  assert.match(discoveryCardPresentation(card).valuationLabel, /歷史估值參考/u);
  assert.equal(discoveryCardPresentation({ ...card, valuation: { ...card.valuation, method: 'ttm_pe_reference' } }).forwardTarget, null);
  assert.equal(discoveryCardPresentation({ ...card, stale: true }).referenceValue, null);
  assert.equal(discoveryCardPresentation({ ...card, valuation: { ...card.valuation, method: 'forward_pe' } }).referenceValue, null);
});
test('missing, future, malformed dates never manufacture a displayed current close', () => {
  assert.equal(discoveryCardPresentation({ ...card, technical: { close: null, sessionDate: '2026-10-08' } }).close, null);
  assert.equal(discoveryCardPresentation(card, '2026-10-07').close, null);
  assert.equal(discoveryCardPresentation({ ...card, technical: { close: 42, sessionDate: '2026-99-99' } }).close, null);
});

test('clue pagination accounts for all 272 existing hits, maximum20 per page, no qualification or mutation', async () => {
  const { pageDiscoveryClues } = await import('./candidate-discovery-admission.ts');
  const rows = Array.from({ length: 272 }, (_, i) => ({ symbol: String(1000 + i) }));
  const before = JSON.stringify(rows), all = [];
  for (let page = 0; page < 14; page++) { const result = pageDiscoveryClues(rows, page); assert.ok(result.items.length <= 20); all.push(...result.items); }
  assert.deepEqual(all, rows); assert.equal(JSON.stringify(rows), before);
  assert.equal(pageDiscoveryClues(rows, 99).items.length, 12); assert.equal(pageDiscoveryClues(rows, -1).pageIndex, 0);
  assert.equal(pageDiscoveryClues([], NaN).start, 0); assert.throws(() => pageDiscoveryClues(new Array(5001), 0), /bound/u);
});
test('coverage states distinguish retired/blocked/duplicate without inventing source enablement', async () => {
  const { discoveryCoverageNotes } = await import('./candidate-discovery-admission.ts');
  const notes = discoveryCoverageNotes([
    { connector: 'instagram', status: 'retired', lastTerminalStatus: 'success' },
    { connector: 'threads', status: 'blocked_auth', lastTerminalStatus: 'success' },
    { connector: 'telegram', status: 'duplicate_only', lastAttemptAt: '2026-10-11T14:00:00Z' },
    { connector: 'investanchors', status: 'manual_only' },
  ]);
  assert.match(notes[0].summary, /退役/u); assert.match(notes[1].summary, /等待官方授權/u);
  assert.match(notes[2].summary, /重複.*沒有新增獨立/u); assert.equal(notes[2].observedAt, '2026-10-11T14:00:00Z');
  assert.match(notes[3].summary, /並非自動取得全文/u);
  assert.ok(discoveryCoverageNotes().every(row => /不能宣稱已啟用/u.test(row.summary)));
});
test('coverage empty, partial, metadata, duplicates and contradictory rows cannot claim full success', async () => {
  const { discoveryCoverageNotes } = await import('./candidate-discovery-admission.ts');
  for (const status of ['partial', 'failed', 'metadata_only', 'successful_empty', 'success', 'unknown']) {
    const summary = discoveryCoverageNotes([{ connector: 'telegram', status, recordsWrittenThisRun: 0 }])[2].summary;
    assert.doesNotMatch(summary, /本輪有新增記錄/u);
  }
  assert.match(discoveryCoverageNotes([{ connector: 'telegram', status: 'success', recordsWrittenThisRun: 3 }])[2].summary, /仍需核對/u);
  assert.match(discoveryCoverageNotes([{ connector: 'telegram', status: 'success' }, { connector: 'telegram', status: 'failed' }])[2].summary, /不能宣稱/u);
  assert.throws(() => discoveryCoverageNotes(new Array(65)), /bound/u);
});
