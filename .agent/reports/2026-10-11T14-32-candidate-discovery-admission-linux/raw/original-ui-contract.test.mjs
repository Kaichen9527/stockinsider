import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { admitDiscoveryCandidate, admissionForLegacyCard, discoveryCardPresentation } from '/workspace/cloud-reviewer-result-http-vm-oct09/web/src/lib/candidate-discovery-admission.ts';
import * as filters from '/workspace/cloud-reviewer-result-http-vm-oct09/web/src/lib/radar-stage-view.ts';
const require = createRequire(import.meta.url), ts = require('/workspace/cloud-reviewer-result-http-vm-oct09/web/node_modules/typescript'), React = require('/workspace/cloud-reviewer-result-http-vm-oct09/web/node_modules/react');
const { renderToStaticMarkup } = require('/workspace/cloud-reviewer-result-http-vm-oct09/web/node_modules/react-dom/server');
const source = readFileSync(new URL('file:///tmp/si-admission-msky7769/original-RadarTabs.tsx'), 'utf8');
const modules = {
  react: React, 'react/jsx-runtime': require('/workspace/cloud-reviewer-result-http-vm-oct09/web/node_modules/react/jsx-runtime'),
  'next/link': { default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) },
  '@/lib/candidate-discovery-admission': { admitDiscoveryCandidate, admissionForLegacyCard, discoveryCardPresentation },
  '@/lib/radar-stage-view': filters,
  '@/lib/opportunity-v3/decision-publication': {}, '@/lib/opportunity-v3/research-display': {},
  '@/lib/stage-classifier': {}, '@/lib/candidate-stage-contract': {}, '@/lib/local-research-state': {},
  './CandidateTradePlanSummary': { default: () => null }, './CurrentTechnicalResearchLink': { default: () => null },
};
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
vm.runInNewContext(compiled + '\nexports.CandidateStageCardView = CandidateStageCardView; exports.CandidateStagesView = CandidateStagesView;',
  { exports, require: key => { assert.ok(modules[key], key); return modules[key]; }, Set, Map, Date, console });
function card(symbol = '2409', lifecycleStage = 'found') {
  return { symbol, chineseName: `公司${symbol}`, market: 'TW', sector: '測試', lifecycleStage,
    latestMentionAt: '2026-10-08T12:00:00Z', rawMentionCount: 272, effectiveMentionCount: 200, publisherCount: 30, platformCount: 8,
    positivePublisherCount: 20, negativePublisherCount: 2, generalPublisherCount: 8, dominantPlatformShare: 0.5,
    sources: ['ptt', 'official', 'news', 'telegram', 'broker', 'threads', 'instagram', 'investanchors'].map(platform => ({ platform,
      sourceUrl: `https://example.com/${platform}`, sourceName: null, publisherName: null, author: null, stance: null, mentionedAt: '2026-10-08T12:00:00Z' })),
    scores: { discovery: 80, research: 70, actionability: 60, dataConfidence: 75 },
    technical: { sessionDate: '2026-10-08', close: 42, ma20: 40, ma60: 41, rsi14: 60 },
    valuation: { status: 'complete', method: 'pb_reference', currentPrice: 99, baseTarget: 60, baseUpsidePct: 888 },
    stale: false, unmetConditions: [], consecutiveCloses: { passed: 0 }, riskAction: null,
  };
}
const renderCard = value => renderToStaticMarkup(React.createElement(exports.CandidateStageCardView, { card: value }));
test('actual main card displays technical dated close and reference method, hides old price and upside', () => {
  const html = renderCard(card()); assert.match(html, /2026-10-08.*收盤價/u); assert.match(html, />42\.00</u);
  assert.doesNotMatch(html, /99\.00|888\.0%|Base 目標/u); assert.match(html, /pb_reference/u); assert.match(html, /估值來源日期待接線/u);
});
test('actual card exposes every bounded source link including Threads, IG and InvestAnchors when present', () => {
  const html = renderCard(card()); assert.match(html, /example\.com\/threads/u); assert.match(html, /example\.com\/instagram/u);
  assert.match(html, /example\.com\/investanchors/u); assert.equal((html.match(/target="_blank"/gu) || []).length, 8);
});
test('missing technical close cannot fall back to valuation currentPrice; stale reference not a target', () => {
  const value = card(); value.technical.close = null; value.stale = true;
  const html = renderCard(value); assert.doesNotMatch(html, /99\.00|60\.00|888\.0%/u); assert.match(html, /估值待重估/u);
});
test('actual main funnel defaults to research scope and clearly preserves all clues plus unsupported reason', () => {
  const radar = { stages: { found: [card()], waiting: [], actionable: [] }, asOf: '2026-10-11T00:00:00Z' };
  const html = renderToStaticMarkup(React.createElement(exports.CandidateStagesView, { radar }));
  assert.match(html, /aria-pressed="true"[^>]*>研究候選/u); assert.match(html, /所有線索（1）/u);
  assert.match(html, /完整來源准入待接線/u); assert.match(html, /尚未接研究排程/u);
  assert.doesNotMatch(html, /data-testid="candidate-stage-2409"/u); assert.equal(radar.stages.found.length, 1);
});
test('existing waiting/actionable data are retained; discovery screen does not reclassify or delete positions', () => {
  const c = card('2409', 'actionable'); const before = JSON.stringify(c); renderCard(c); assert.equal(JSON.stringify(c), before);
  assert.match(source, /selected === 'found' && discoveryMode === 'research'/u);
});
