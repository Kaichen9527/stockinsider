// Offline research calculation only. No HTTP, DB, model, publication or strategy authority.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateTechnicalFeatures, technicalHistoryCoverageTerminalReason } from '../../../web/src/lib/technical-features-v2.ts';
import { discoverySession, discoveryInstant, discoveryTaipeiDate, discoveryRelativeReturns, discoveryPricePhase } from '../../../web/src/lib/research-discovery-evidence.ts';
import { researchCanonicalHash } from '../../../web/src/lib/research-agent-qualification.ts';
import { researchDeepInstant } from '../../../web/src/lib/research-deep-claim-context.ts';

const folder = new URL('./', import.meta.url);
const relay = JSON.parse(readFileSync(new URL('root-market-relay.json', folder)));
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function near(a, b) { assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`); }
function roc(value) {
  assert.match(value, /^\d{3}\/\d{2}\/\d{2}$/);
  const [y, m, d] = value.split('/');
  const session = `${Number(y) + 1911}-${m}-${d}`;
  assert.ok(discoverySession(session)); return session;
}
function positive(value, integer = false) {
  assert.equal(typeof value, 'string');
  assert.match(value, integer ? /^(?:\d{1,3}(?:,\d{3})+|\d+)$/ : /^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/);
  const n = Number(value.replaceAll(',', ''));
  assert.ok(Number.isSafeInteger(n) || !integer); assert.ok(Number.isFinite(n) && n > 0); return n;
}
const cutoff = relay.completedAt;
check('relay authority and clock boundaries', () => {
  assert.equal(relay.vmFetchSucceeded, false); assert.equal(relay.productionImported, false);
  assert.equal(relay.rawFilesTransferred, false); assert.equal(relay.rawSourceHashesVerifiedByVm, false);
  assert.equal(relay.rawPricesAdjusted, false); assert.equal(relay.historicalPITEligible, false);
  assert.ok(discoveryInstant(cutoff)); assert.equal(relay.entries.length, 28);
  assert.equal(relay.entries.reduce((s, e) => s + e.bytes, 0), 67188);
});
const stock = [], index = [], ledger = [];
for (const entry of relay.entries) {
  check(`${entry.kind}/${entry.month}: endpoint, time, shape, numeric fields`, () => {
    assert.ok(['stock', 'index'].includes(entry.kind)); assert.match(entry.month, /^202[56](?:0[1-9]|1[0-2])$/);
    const url = new URL(entry.url); assert.equal(url.origin, 'https://www.twse.com.tw'); assert.equal(url.hash, '');
    assert.equal(url.username + url.password, '');
    assert.equal(url.pathname, `/exchangeReport/${entry.kind === 'stock' ? 'STOCK_DAY' : 'FMTQIK'}`);
    assert.deepEqual([...url.searchParams.keys()].sort(), entry.kind === 'stock' ? ['date', 'response', 'stockNo'] : ['date', 'response']);
    assert.equal(url.searchParams.get('date'), entry.month + '01'); assert.equal(url.searchParams.get('response'), 'json');
    if (entry.kind === 'stock') assert.equal(url.searchParams.get('stockNo'), '2409');
    assert.equal(entry.observer, 'root-Mac-public-reader'); assert.equal(entry.vmFetchSucceeded, false);
    assert.equal(entry.status, 'success'); assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0);
    assert.ok(discoveryInstant(entry.observedAt)); assert.ok(researchDeepInstant(entry.observedAt) <= researchDeepInstant(cutoff));
    assert.deepEqual(entry.selectedFields, entry.kind === 'stock'
      ? ['日期', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價', '漲跌價差', '成交筆數', '註記']
      : ['日期', '發行量加權股價指數']);
    assert.equal(entry.originalFieldCount, entry.kind === 'stock' ? 10 : 6);
    for (const raw of entry.selectedRows) {
      assert.equal(raw.length, entry.kind === 'stock' ? 10 : 2);
      const session = roc(raw[0]); assert.equal(session.replaceAll('-', '').slice(0, 6), entry.month);
      assert.ok(session <= discoveryTaipeiDate(cutoff));
      assert.ok(researchDeepInstant(entry.observedAt) >= researchDeepInstant(session + 'T13:30:00+08:00'));
      const provenance = { sourceUrl: entry.url, observedAt: entry.observedAt, publicationAt: null,
        rawSha256ReportedByMac: entry.sha256, rawBytesVerifiedByVm: false, selectedRowCanonicalHash: researchCanonicalHash(raw) };
      if (entry.kind === 'index') index.push({ session, close: positive(raw[1]), availableAt: entry.observedAt, provenance });
      else {
        const [volume, amount, open, high, low, close] = [positive(raw[1], true), positive(raw[2], true), ...raw.slice(3, 7).map(v => positive(v))];
        const trades = positive(raw[8], true); assert.equal(raw[9], '');
        assert.ok(low <= Math.min(open, close) && high >= Math.max(open, close) && low <= high);
        assert.ok(amount / volume >= low - 0.01 && amount / volume <= high + 0.01);
        assert.match(raw[7], /^(?:[+-]\d+\.\d{2}| 0\.00|X0\.00)$/);
        stock.push({ session, open, high, low, close, volume, turnoverTwd: amount, trades,
          reportedChange: raw[7], note: raw[9], availableAt: entry.observedAt, provenance });
      }
    }
  });
  ledger.push({ kind: entry.kind, month: entry.month, url: entry.url, observer: entry.observer,
    observedAt: entry.observedAt, publishedAt: null, rawBytesReportedByMac: entry.bytes,
    rawSha256ReportedByMac: entry.sha256, rawHashVerifiedByVm: false,
    selectedRowsCanonicalHash: researchCanonicalHash(entry.selectedRows), selectedRows: entry.selectedRows.length });
}
check('14 contiguous months, 268 unique ordered matched stock/TAIEX dates', () => {
  assert.deepEqual(relay.entries.filter(e => e.kind === 'stock').map(e => e.month),
    ['202509', '202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609', '202610']);
  assert.equal(stock.length, 268); assert.equal(index.length, 268);
  assert.deepEqual(stock.map(b => b.session), index.map(b => b.session));
  for (let i = 1; i < stock.length; i++) assert.ok(stock[i].session > stock[i - 1].session);
});
const exceptions = [];
check('266 numeric daily close changes and one preserved nonstandard X marker', () => {
  for (let i = 1; i < stock.length; i++) {
    const b = stock[i];
    if (b.reportedChange.startsWith('X')) exceptions.push({ session: b.session, reportedChange: b.reportedChange,
      previousRawClose: stock[i - 1].close, close: b.close, rawCloseDifference: b.close - stock[i - 1].close,
      reason: 'official_nonstandard_change_marker_company_action_reference_not_acquired' });
    else near(b.close - stock[i - 1].close, Number(b.reportedChange));
  }
  assert.equal(exceptions.length, 1); assert.equal(exceptions[0].session, '2026-07-30');
});
check('October repeated acquisition selected values agree', () => {
  const older = JSON.parse(readFileSync(new URL('october-stock-day-relay.json', folder)));
  const raw = relay.entries.find(e => e.kind === 'stock' && e.month === '202610');
  // This first relay supplied nine numeric columns, so compare its original available fields only.
  const rows = older.selectedRows ?? older.rows;
  assert.ok(Array.isArray(rows));
  assert.deepEqual(raw.selectedRows.map(r => r.slice(0, 9).map((v, i) => i === 0 ? v : Number(v.replaceAll(',', '')))), rows);
});
const features = calculateTechnicalFeatures(stock);
const mean = v => v.reduce((s, n) => s + n, 0) / v.length;
const closes = stock.map(b => b.close);
for (const period of [5, 20, 60, 120, 240]) check(`independent MA${period}`, () => near(features[`ma${period}`], mean(closes.slice(-period))));
check('independent MA60 five-session slope', () => near(features.ma60Slope, (mean(closes.slice(-60)) - mean(closes.slice(-65, -5))) / 5));
const sortedVolume = stock.slice(-20).map(b => b.volume).sort((a, b) => a - b);
check('independent latest-volume / median of full 20 sessions', () => near(features.volumeRatio20Median, stock.at(-1).volume / ((sortedVolume[9] + sortedVolume[10]) / 2)));
const tr = stock.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - stock[i - 1].close), Math.abs(b.low - stock[i - 1].close)) : b.high - b.low);
let atr = mean(tr.slice(0, 14)); for (const n of tr.slice(14)) atr += (n - atr) / 14;
check('independent Wilder ATR14', () => near(features.atr14, atr));
// Library RSI seeds a rolling mean of 14 changes including an initial zero.
// This differs from packages seeding 14 nonzero-position changes (15 closes).
const gains = closes.map((c, i) => i ? Math.max(0, c - closes[i - 1]) : 0);
const losses = closes.map((c, i) => i ? Math.max(0, closes[i - 1] - c) : 0);
let gain = mean(gains.slice(0, 14)), loss = mean(losses.slice(0, 14));
for (let i = 14; i < closes.length; i++) { gain += (gains[i] - gain) / 14; loss += (losses[i] - loss) / 14; }
check('independent RSI14, existing library initial-zero seed', () => near(features.rsi14, 100 - 100 / (1 + gain / loss)));
let obv = 0; for (let i = 1; i < stock.length; i++) obv += Math.sign(closes[i] - closes[i - 1]) * stock[i].volume;
check('independent OBV anchored zero at first acquired session', () => near(features.obv, obv));
const ema = (v, n) => { const result = [v[0]]; for (let i = 1; i < v.length; i++) result.push(result.at(-1) + 2 / (n + 1) * (v[i] - result.at(-1))); return result; };
const fast = ema(closes, 12), slow = ema(closes, 26), line = fast.map((v, i) => v - slow[i]), signal = ema(line, 9);
check('independent MACD12/26, EMA9 signal and histogram, first-value seed', () => {
  near(features.macd12_26, line.at(-1)); near(features.macdSignal9, signal.at(-1)); near(features.macdHistogram, line.at(-1) - signal.at(-1));
});
const relative = discoveryRelativeReturns(stock, index, cutoff, { requireComplete61: true });
for (const n of [5, 20, 60]) check(`independent aligned ${n}-session multiplicative raw relative return`, () => {
  const i = stock.length - 1 - n;
  near(relative[`relative${n}d`], (stock.at(-1).close / stock[i].close) / (index.at(-1).close / index[i].close) - 1);
});
check('partial, mismatched and future input cannot become qualified relative returns', () => {
  assert.deepEqual(discoveryRelativeReturns(stock.slice(-6), index.slice(-6), cutoff, { requireComplete61: true }), { relative5d: null, relative20d: null, relative60d: null });
  assert.deepEqual(discoveryRelativeReturns(stock, index.slice(0, -1), cutoff, { requireComplete61: true }), { relative5d: null, relative20d: null, relative60d: null });
  assert.throws(() => discoveryRelativeReturns(stock, index, '2026-10-08T07:19:00Z', { requireComplete61: true }), /discovery_price_invalid/);
  assert.equal(discoverySession('2026-02-30'), false);
});
const phase = discoveryPricePhase({ ...features, officialDatasetVerified: false, breakoutConfirmed: null, pullbackConfirmed: null });
check('no authority escalation from sufficient raw bar count', () => {
  assert.equal(technicalHistoryCoverageTerminalReason(stock.length), null);
  assert.equal(phase, 'unknown'); assert.equal(features.institutionalFlow5dNorm, null); assert.equal(features.institutionalFlow20dNorm, null);
});
check('real date and numeric parser reject impossible dates, wrong units and nonfinite content', () => {
  for (const value of ['115/02/30', '2026/10/08', '115/13/01']) assert.throws(() => roc(value));
  for (const value of ['NaN', '1e9', '1,23', '-1', '0', '275388154 shares']) assert.throws(() => positive(value, true));
  assert.equal(discoveryInstant('2026-02-30T07:22:00Z'), false);
  assert.throws(() => calculateTechnicalFeatures([{ ...stock[0], high: stock[0].low - 1 }]));
});
const dataset = { schemaVersion: 'auo-market-research-input-v1', symbol: '2409', asOf: cutoff,
  sourceObserver: relay.observer, acquiredVia: 'attributed_selected_field_relay_not_vm_http_success',
  productionImported: false, historicalPITEligible: false, rawPricesAdjusted: false,
  units: { prices: 'TWD/share', volume: 'shares', turnover: 'TWD', index: 'TAIEX price-index points', relative: 'fraction, multiplicative stock/index ratio minus one' },
  range: { firstObservedSession: stock[0].session, latestObservedSession: stock.at(-1).session, stockBars: stock.length, indexBars: index.length,
    calendarVerifiedLatestCompletedSession: null, regularCloseObservationClockCheck: 'passed; does not establish calendar completeness' },
  sourceLedger: ledger, stockBars: stock, taiexBars: index, nonstandardChangeMarkers: exceptions,
  rawUnadjustedExploratoryTechnicalFeatures: features, rawUnadjustedExploratoryRelativeReturns: relative,
  rawSeriesDiagnostics: { closeAboveMa5: features.close > features.ma5, closeAboveMa20: features.close > features.ma20,
    closeAboveMa60: features.close > features.ma60, closeAboveMa240: features.close > features.ma240,
    rsiAtLeast75: features.rsi14 >= 75, closeAboveMa20Plus2Atr: features.close > features.ma20 + 2 * features.atr14,
    latestRawCloseReturnFromOctober2Close: features.close / stock.find(b => b.session === '2026-10-02').close - 1,
    diagnosticOnlyNotQualifiedPhaseOrFill: true },
  qualifiedResearchContext: { relative5d: null, relative20d: null, relative60d: null, pricePhase: phase,
    breakoutConfirmed: null, pullbackConfirmed: null, strategyApproved: false, researchQualified: false, automaticEntryEligible: false,
    bookValuePerShare: null, priceToBook: null, targetPrice: null,
    reasons: ['corporate_action_and_adjusted_price_basis_missing', 'official_calendar_completeness_and_latest_completed_session_not_verified',
      'historical_publication_and_availability_not_verified', 'official_institutional_flow_missing', 'no_approved_strategy_or_independent_thesis_qualification', 'period_end_common_shares_net_of_treasury_missing'] },
  formulaProvenance: { technicalRuleset: features.rulesetVersion, library: 'indicatorts@2.2.2',
    atr: 'repo Wilder14: first TR=high-low, seed mean first14 then recursive alpha1/14',
    rsi: 'repo indicatorts rsi14; mean of first14 changes including initial zero, then recursive alpha1/14; not an alternate 15-close seed',
    macd: 'repo EMA12 minus EMA26, EMA9 signal; EMA starts at first input, histogram=line-signal',
    obv: 'repo indicatorts OBV zero seed at 2025-09-01; absolute level depends on acquisition start',
    relative: 'repo discoveryRelativeReturns requireComplete61, all same stock/index sessions; raw price changes, not total returns',
    entryPlanRuleset: 'tw-entry-plan-v0.1; no qualified entry plan constructed' },
  validation: { checksPassed: checks.length, checksFailed: 0, checkNames: checks,
    omittedPriorCloseForFirstAcquiredSession: true, rawSourceHashesReverifiedByVm: false } };
const output = JSON.stringify(dataset, null, 2) + '\n';
const path = new URL('dataset.json', folder);
let canonicalHashesVerified = 0;
if (process.argv.includes('--check')) {
  assert.equal(readFileSync(path, 'utf8'), output, 'dataset does not reproduce');
  const hashes = JSON.parse(readFileSync(new URL('hashes.json', folder)));
  assert.equal(researchCanonicalHash(dataset), hashes.datasetCanonicalHash); canonicalHashesVerified++;
  assert.equal(researchCanonicalHash(relay), hashes.relayCanonicalHash); canonicalHashesVerified++;
  for (const entry of relay.entries) {
    assert.equal(researchCanonicalHash(entry.selectedRows), hashes.selectedRowsCanonicalHashes[`${entry.kind}/${entry.month}`]); canonicalHashesVerified++;
  }
}
else writeFileSync(path, output, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checks: checks.length, stockBars: stock.length, indexBars: index.length,
  datasetCanonicalHash: researchCanonicalHash(dataset), canonicalHashesVerified, features, rawRelative: relative, phase,
  output: fileURLToPath(path) }, null, 2));
