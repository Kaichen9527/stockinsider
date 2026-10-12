import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { admitDiscoveryCandidate, admissionForLegacyCard, discoveryCardPresentation, pageDiscoveryClues, discoveryCoverageNotes } from '../web/src/lib/candidate-discovery-admission.ts';
import * as filters from '../web/src/lib/radar-stage-view.ts';
const require = createRequire(import.meta.url), ts = require('../web/node_modules/typescript'), React = require('../web/node_modules/react');
const { renderToStaticMarkup } = require('../web/node_modules/react-dom/server');
const source = readFileSync(new URL('../web/src/app/components/RadarTabs.tsx', import.meta.url), 'utf8');
const modules = {
  react: React, 'react/jsx-runtime': require('../web/node_modules/react/jsx-runtime'),
  'next/link': { default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) },
  '@/lib/candidate-discovery-admission': { admitDiscoveryCandidate, admissionForLegacyCard, discoveryCardPresentation, pageDiscoveryClues, discoveryCoverageNotes },
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
test('actual main defaults to existing clues while research admission remains explicitly pending', () => {
  const radar = { stages: { found: [card()], waiting: [], actionable: [] }, asOf: '2026-10-11T00:00:00Z' };
  const html = renderToStaticMarkup(React.createElement(exports.CandidateStagesView, { radar }));
  assert.match(html, /aria-pressed="true"[^>]*>所有線索（1）/u); assert.match(html, /研究准入（待接線）/u);
  assert.match(html, /尚未通過研究准入/u); assert.match(html, /尚未接研究排程/u);
  assert.match(html, /data-testid="candidate-stage-2409"/u); assert.equal(radar.stages.found.length, 1);
});
test('existing waiting/actionable data are retained; discovery screen does not reclassify or delete positions', () => {
  const c = card('2409', 'actionable'); const before = JSON.stringify(c); renderCard(c); assert.equal(JSON.stringify(c), before);
  assert.match(source, /selected === 'found' && discoveryMode === 'research'/u);
});

test('actual main SSR with272 complete hits renders20 clue cards plus bounded paging, retains input', () => {
  const found = Array.from({ length: 272 }, (_, index) => card(String(1000 + index)));
  const radar = { stages: { found, waiting: [], actionable: [] }, asOf: '2026-10-11T00:00:00Z' };
  const before = JSON.stringify(radar);
  const html = renderToStaticMarkup(React.createElement(exports.CandidateStagesView, { radar }));
  assert.equal((html.match(/data-testid="candidate-stage-/gu) || []).length, 20);
  assert.match(html, /線索 1–20 \/ 272/u); assert.match(html, /aria-label="線索分頁"/u);
  assert.match(html, /所有線索（272）/u); assert.equal(JSON.stringify(radar), before);
  assert.doesNotMatch(html, /已通過研究准入|Top20/u);
  const home = readFileSync(new URL('../web/src/app/page.tsx', import.meta.url), 'utf8');
  assert.match(home, /HOME_FOUND_STAGE_PAGE_SIZE = 20/u);
  assert.match(home, /found: radar\.stages\.found\.slice\(0, HOME_FOUND_STAGE_PAGE_SIZE\)/u);
});
test('actual source coverage renders ledger retirement, blocked Threads and Telegram duplicate without empty enabled cards', () => {
  const radar = { stages: { found: [card()], waiting: [], actionable: [] }, asOf: '2026-10-11T00:00:00Z',
    sourceHealthSummary: { connectorDetails: [
      { connector: 'instagram', status: 'retired' }, { connector: 'threads', status: 'blocked_auth' },
      { connector: 'telegram', status: 'duplicate_only' }, { connector: 'investanchors', status: 'manual_only' },
    ] } };
  const html = renderToStaticMarkup(React.createElement(exports.CandidateStagesView, { radar }));
  assert.match(html, /Instagram：已退役/u); assert.match(html, /Threads：等待官方授權/u);
  assert.match(html, /Telegram：已讀取，但內容重複/u); assert.match(html, /定錨授權摘要：僅限/u);
  assert.match(html, /本機瀏覽器能讀到公開頁，不等於自動收集已啟用或內容已匯入/u);
  assert.match(html, /href="\/sources"/u); assert.doesNotMatch(html, /已啟用取得|完整來源覆蓋成功/u);
});
test('saved source-health compactor actually preserves existing Instagram retirement without fabricating rows', () => {
  const src = readFileSync(new URL('../web/src/lib/radar-public-snapshot.ts', import.meta.url), 'utf8');
  const actualFunction = src.slice(src.indexOf('function compactSourceHealth('), src.indexOf('function compactTheme('));
  const js = ts.transpileModule(actualFunction, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { compactText: value => value, result: null, Set };
  vm.runInNewContext(js + ';result=compactSourceHealth({connectorDetails:[{connector:"instagram",label:"Instagram",status:"retired",recordsWritten:0},{connector:"threads",status:"blocked_auth",recordsWritten:0}]});', sandbox);
  assert.equal(sandbox.result.connectorDetails.length, 2); assert.equal(sandbox.result.connectorDetails[0].status, 'retired');
  const empty = { compactText: value => value, result: null, Set };
  vm.runInNewContext(js + ';result=compactSourceHealth({connectorDetails:[]});', empty);
  assert.equal(empty.result.connectorDetails.length, 0);
});
