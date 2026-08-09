#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalJson, immutableBundle, sha256, invariant } = require('./codec');
const { runDurableAuthSourceWorker } = require('./auth-source-worker');
const { validateAuthSourceDagConfig } = require('./source-run-config');
const { buildCandidateFunnel } = require('./candidate-funnel');
const { calculateAdjustedTechnicalPlane } = require('./technical-plane');
const { calculateFundamentalQualityAxes } = require('./fundamental-quality');
const { evaluateCandidateValuation } = require('./candidate-valuation');
const { deriveActionDecision } = require('./action-decision');
const { selectBiasTechnicalHistory } = require('./bias-technical-history');
const { appendAnalysisRevision } = require('./analysis-revision');
const { publishCompactRadarProjection } = require('./compact-radar-projection');
const { computeUnderreactionResearchScore } = require('./underreaction-score');
const { loadOfficialTwMarketSnapshot, validateReportedValuation } = require('./official-twse-valuation');
const { buildMarketAnalysis } = require('./market-analysis');
const { runtimeBundleBytes } = require('./tracked-runtime-bundle');
const { assertExactRuntimeEnvironment, hydrateRuntimeCredentials } = require('./credential-resolver');

const LEGACY_RADAR_PATHS = Object.freeze({ daily: '/api/radar/daily', hot: '/api/radar/hot', weekly: '/api/radar/weekly' });
const LEGACY_RADAR_FETCH_TIMEOUT_MS = 60000;
const SOURCE_CLASS_BY_KEY = Object.freeze({
  bulltalk: 'community', earnings_call: 'official', instagram: 'community',
  investanchors: 'curated_thesis', mops_material_event: 'official', podcast: 'curated_thesis',
  ptt: 'community', public_broker_research: 'public_research', telegram: 'community',
  threads: 'community', youtube: 'curated_thesis',
});

async function loadLegacyRadarPayloads(baseUrl, fetchImpl = globalThis.fetch, internalApiKey = process.env.INTERNAL_API_KEY) {
  invariant(typeof baseUrl === 'string' && /^https?:\/\/[^/?#]+(?::\d+)?$/u.test(baseUrl), 'legacy radar base URL');
  invariant(typeof fetchImpl === 'function', 'legacy radar fetch unavailable');
  invariant(typeof internalApiKey === 'string' && internalApiKey.length >= 16, 'legacy radar internal credential unavailable');
  const entries = await Promise.all(Object.entries(LEGACY_RADAR_PATHS).map(async ([window, pathname]) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LEGACY_RADAR_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${internalApiKey}`,
          'X-StockInsider-Projection-Source': 'tracked-producer' },
        signal: controller.signal,
      });
      invariant(response.ok, `legacy radar ${window} unavailable`);
      const bytes = Buffer.from(await response.arrayBuffer());
      invariant(bytes.length > 1 && bytes.length <= 150000, `legacy radar ${window} size`);
      const payload = JSON.parse(bytes.toString('utf8'));
      invariant(payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.opportunities), `legacy radar ${window} payload`);
      return [window, payload];
    } finally { clearTimeout(timer); }
  }));
  const payloads = Object.fromEntries(entries);
  payloads.home = payloads.daily;
  return Object.freeze(payloads);
}

function args(argv) {
  const configIndex = argv.indexOf('--config');
  if (configIndex < 0 || !argv[configIndex + 1]) throw new Error('invalid_arguments');
  return { configPath: path.resolve(argv[configIndex + 1]), dryRun: argv.includes('--dry-run') };
}

function readBundle(claim, expectedKind) {
  invariant(claim.readKind === expectedKind && claim.readJson && claim.readCanonical && claim.readHash, `invalid ${expectedKind} read bundle`);
  const bytes = Buffer.isBuffer(claim.readCanonical) ? claim.readCanonical : Buffer.from(claim.readCanonical);
  invariant(sha256(bytes) === claim.readHash && canonicalJson(JSON.parse(bytes.toString('utf8'))) === canonicalJson(claim.readJson), `mismatched ${expectedKind} read bundle`);
  return claim.readJson;
}

function readRuntimeHealthObservation(sourceCommitSha, workerSha256, configSha256) {
  const runtimeRoot = process.env.STOCKINSIDER_RUNTIME_ROOT
    ? path.resolve(process.env.STOCKINSIDER_RUNTIME_ROOT)
    : path.join(os.homedir(), 'Library', 'Application Support', 'StockInsiderRuntime');
  const filename = path.join(runtimeRoot, 'current', 'runtime-health-observation.json');
  try {
    const text = fs.readFileSync(filename, 'utf8');
    const value = JSON.parse(text);
    invariant(`${canonicalJson(value)}\n` === text, 'runtime health observation noncanonical');
    invariant(value.producerCommitSha === sourceCommitSha && value.workerSha256 === workerSha256
      && value.schedulerConfigSha256 === configSha256, 'runtime health observation identity mismatch');
    return value;
  } catch {
    return null;
  }
}

function sourceText(raw) {
  const values = [];
  const walk = (value) => {
    if (typeof value === 'string') values.push(value.normalize('NFKC'));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(raw);
  return values.join('\n');
}

function tickerHasStockContext(text, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const occurrences = [...text.matchAll(new RegExp(`(^|[^0-9])(${escaped})(?=[^0-9]|$)`, 'gu'))];
  const stockWords = /(?:股票|個股|台股|代號|股價|買進|賣出|看多|看空|本益比|籌碼|財報|EPS)/iu;
  return occurrences.some((match) => {
    const start = (match.index ?? 0) + match[1].length;
    const after = text.slice(start + symbol.length, start + symbol.length + 8);
    const afterSignificant = after.trimStart();
    if (/^(?:點|年|月|日|人|萬|億)/u.test(afterSignificant)) return false;
    const local = text.slice(Math.max(0, start - 12), Math.min(text.length, start + symbol.length + 12));
    return text[start - 1] === '$' || /^\.(?:TW|TWO)\b/iu.test(afterSignificant) || stockWords.test(local);
  });
}

function nameHasStockContext(text, name, symbol) {
  if (typeof name !== 'string' || name.length < 2) return false;
  let offset = text.indexOf(name);
  const stockWords = /(?:股票|個股|台股|代號|股價|買進|賣出|看多|看空|本益比|籌碼|財報|EPS|營收|法說|目標價)/iu;
  while (offset >= 0) {
    const local = text.slice(Math.max(0, offset - 16), Math.min(text.length, offset + name.length + 16));
    if (stockWords.test(local) || tickerHasStockContext(local, String(symbol))) return true;
    offset = text.indexOf(name, offset + name.length);
  }
  return false;
}

function extractMatchedEvidenceSnippet(text, { symbol, names = [] }) {
  invariant(typeof text === 'string' && typeof symbol === 'string', 'matched evidence input');
  const normalized = text.normalize('NFC').replace(/[\r\n]+/gu, '。');
  const terms = [symbol, ...names.filter((name) => typeof name === 'string' && name.length >= 2)];
  const occurrences = terms.flatMap((term) => {
    const rows = [];
    let index = normalized.indexOf(term);
    while (index >= 0) {
      rows.push({ term, index });
      index = normalized.indexOf(term, index + term.length);
    }
    return rows;
  }).sort((left, right) => left.index - right.index || right.term.length - left.term.length);
  invariant(occurrences.length > 0, 'matched evidence unavailable');
  let best = null;
  for (const occurrence of occurrences) {
    const priorBoundary = Math.max(
      normalized.lastIndexOf('。', occurrence.index - 1), normalized.lastIndexOf('！', occurrence.index - 1),
      normalized.lastIndexOf('？', occurrence.index - 1), normalized.lastIndexOf(';', occurrence.index - 1),
      normalized.lastIndexOf('；', occurrence.index - 1),
    );
    const following = ['。', '！', '？', ';', '；'].map((token) => normalized.indexOf(token, occurrence.index + occurrence.term.length))
      .filter((index) => index >= 0);
    const nextBoundary = following.length ? Math.min(...following) + 1 : normalized.length;
    const start = Math.max(priorBoundary + 1, occurrence.index - 70);
    const end = Math.min(nextBoundary, occurrence.index + occurrence.term.length + 105);
    const candidate = normalized.slice(start, end).trim();
    const hasSymbol = candidate.includes(symbol);
    const hasName = names.some((name) => typeof name === 'string' && name.length >= 2 && candidate.includes(name));
    const score = (hasSymbol ? 2 : 0) + (hasName ? 2 : 0) + Math.min(candidate.length, 180) / 1000;
    if (!best || score > best.score) best = { candidate, score, hasSymbol, hasName };
  }
  const textOut = [...best.candidate].slice(0, 180).join('').trim();
  return Object.freeze({ text: textOut, matchBasis: best.hasSymbol && best.hasName ? 'symbol_and_name'
    : best.hasSymbol ? 'symbol' : 'name' });
}

function uuidFromHash(value) {
  const digest = sha256(value);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function canonicalUtc(value, label) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), `${label} unavailable`);
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

function extractRevisionCandidates(bundle) {
  const frozen = bundle.frozenRevision;
  invariant(frozen && typeof frozen.revisionId === 'string', 'frozen revision unavailable');
  const pages = Array.isArray(bundle.authorityPages) ? bundle.authorityPages : [];
  const rowsByKind = (kind) => pages.filter((page) => Array.isArray(page) && page[0] === kind)
    .flatMap((page) => Array.isArray(page[3]) ? page[3] : []);
  const roster = rowsByKind('roster').filter((row) => Array.isArray(row) && row[3] === 'common_stock' && row[4] === 'active');
  const aliasByStock = new Map();
  for (const row of rowsByKind('alias')) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string') continue;
    const selected = aliasByStock.get(row[0]) ?? [];
    selected.push(row[1]);
    aliasByStock.set(row[0], selected);
  }
  const sectorByStock = new Map(rowsByKind('taxonomy').filter(Array.isArray).map((row) => [row[0], row[3]]));
  const text = sourceText(frozen.rawFieldPayload);
  const collectedAt = typeof frozen.sourceCollectedAt === 'string'
    ? canonicalUtc(frozen.sourceCollectedAt, 'frozen source collected-at') : null;
  const publishedAt = typeof frozen.sourcePublishedAt === 'string'
    ? canonicalUtc(frozen.sourcePublishedAt, 'frozen source published-at') : null;
  const sourceEffectiveAt = publishedAt && collectedAt && Date.parse(publishedAt) <= Date.parse(collectedAt)
    ? publishedAt : collectedAt;
  const matches = roster.flatMap((row) => {
    const [stockId, symbol, exchange, , , legalName, shortName] = row;
    const aliases = aliasByStock.get(stockId) ?? [];
    const nameMatch = [shortName, legalName, ...aliases].some((name) => nameHasStockContext(text, name, symbol));
    const tickerMatch = typeof symbol === 'string' && (nameMatch || tickerHasStockContext(text, symbol));
    if (!tickerMatch && !nameMatch) return [];
    const matched = extractMatchedEvidenceSnippet(text, { symbol: String(symbol), names: [shortName, legalName, ...aliases] });
    const raw = tickerMatch ? String(symbol) : String([shortName, ...aliases, legalName].find((name) => typeof name === 'string' && text.includes(name)));
    const claimId = uuidFromHash(`claim:${frozen.revisionId}:${stockId}:${raw}`);
    return [{ sourceKey: frozen.sourceKey, revisionId: frozen.revisionId, stockId, symbol, exchange,
      name: typeof shortName === 'string' && [...shortName].length <= 40 ? shortName
        : typeof legalName === 'string' && [...legalName].length <= 40 ? legalName : null,
      sourceSummary: matched.text, matchBasis: matched.matchBasis,
      canonicalSector: sectorByStock.get(stockId) ?? 'unknown', raw, claimId,
      claimAsOf: sourceEffectiveAt,
      mentionId: uuidFromHash(`mention:${frozen.revisionId}:${stockId}:${raw}`), claimEligible: true,
      link: { disposition: 'linked', stockId, symbol },
      sourceClass: SOURCE_CLASS_BY_KEY[frozen.sourceKey] ?? 'community' }];
  }).slice(0, 200);
  return { schema: 'legacy-mention-claim-result-v3.11', revisionId: frozen.revisionId,
    candidates: matches, parseOutcome: matches.length ? 'processed_with_claims' : 'processed_no_claim' };
}

function legacyFactInput(rows) {
  const latest = Object.fromEntries(rows.filter((row) => Array.isArray(row) && typeof row[1] === 'string' && Number.isFinite(row[5]))
    .map((row) => [row[1], Number(row[5])]));
  return {
    revenue: latest.quarterly_revenue, grossProfit: latest.quarterly_gross_profit,
    operatingIncome: latest.quarterly_operating_income, pretaxIncome: latest.quarterly_pretax_income,
    netIncome: latest.quarterly_net_income_attributable_to_common ?? latest.quarterly_net_income,
    dilutedShares: latest.diluted_shares, ebitda: latest.quarterly_ebitda,
    bookValue: latest.book_value_per_share, nav: latest.net_asset_value,
    cash: latest.cash_and_equivalents, totalDebt: latest.total_debt, netDebt: latest.net_debt,
  };
}

function researchHistory(rows, symbol) {
  return (rows ?? []).filter((row) => Array.isArray(row) && row[0] === symbol && Number.isFinite(Number(row[5])))
    .map((row) => ({ session: String(row[1]),open:Number(row[2]),high:Number(row[3]),low:Number(row[4]),
      close:Number(row[5]),volume:Number(row[6]) }))
    .filter((row) => Number.isFinite(Date.parse(row.session)) && row.close > 0)
    .sort((left, right) => left.session.localeCompare(right.session))
    .filter((row, index, all) => index === 0 || row.session !== all[index - 1].session)
    .slice(-130);
}

function average(values) { return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null; }
function ema(values,period) {
  if (values.length<period) return null; const multiplier=2/(period+1); let value=average(values.slice(0,period));
  for (const next of values.slice(period)) value=(next-value)*multiplier+value; return value;
}
function rsi14(closes) {
  if (closes.length<15) return null; const changes=closes.slice(-15).slice(1).map((value,index)=>value-closes.slice(-15)[index]);
  const gain=average(changes.map((value)=>Math.max(value,0))); const loss=average(changes.map((value)=>Math.max(-value,0)));
  if (loss===0) return gain===0?50:100; return 100-100/(1+gain/loss);
}

function priceResearchAxes(history, stats = null, benchmarkRows = []) {
  const closes = history.map((row) => row.close);
  const current = Number(stats?.currentPrice ?? closes.at(-1));
  const high20 = Number(stats?.high20 ?? (closes.length ? Math.max(...closes.slice(-20)) : Number.NaN));
  const high60 = Number(stats?.high60 ?? (closes.length ? Math.max(...closes.slice(-60)) : Number.NaN));
  const high120 = Number(stats?.high120 ?? (closes.length>=120 ? Math.max(...closes.slice(-120)) : Number.NaN));
  const ma20 = Number(stats?.ma20 ?? (closes.length >= 20 ? closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20 : Number.NaN));
  const ma60 = Number(stats?.ma60 ?? (closes.length >= 60 ? closes.slice(-60).reduce((sum, value) => sum + value, 0) / 60 : Number.NaN));
  const ma120 = Number(stats?.ma120 ?? (closes.length >= 120 ? closes.slice(-120).reduce((sum, value) => sum + value, 0) / 120 : Number.NaN));
  if (![current, high60, ma20].every(Number.isFinite) || current <= 0 || high60 <= 0 || ma20 <= 0) {
    return { priceDislocation: { score: null, trustworthy: false, reason: 'price_history_unavailable' },
      timing: { score: null, trustworthy: false, reason: 'price_history_unavailable' }, context: null };
  }
  const drawdown20Pct = 100*(current/high20-1); const drawdown60Pct = 100 * (current / high60 - 1);
  const drawdown120Pct = Number.isFinite(high120)&&high120>0?100*(current/high120-1):null;
  const bias20Pct = 100 * (current / ma20 - 1);
  const bias60Pct = Number.isFinite(ma60) && ma60 > 0 ? 100 * (current / ma60 - 1) : null;
  const bias120Pct = Number.isFinite(ma120)&&ma120>0?100*(current/ma120-1):null;
  const rsi = rsi14(closes); const ema12=ema(closes,12); const ema26=ema(closes,26); const macd=Number.isFinite(ema12)&&Number.isFinite(ema26)?ema12-ema26:null;
  const trueRanges=history.slice(-15).map((row,index,selected)=>Math.max(Number(row.high)-Number(row.low),
    index?Math.abs(Number(row.high)-selected[index-1].close):0,index?Math.abs(Number(row.low)-selected[index-1].close):0)).filter(Number.isFinite);
  const atr14=trueRanges.length>=14?average(trueRanges.slice(-14)):null;
  const volumes=history.slice(-20).map((row)=>row.volume).filter((value)=>Number.isFinite(value)&&value>=0);
  const volumeRatio20=volumes.length>=20&&average(volumes.slice(0,-1))>0?volumes.at(-1)/average(volumes.slice(0,-1)):null;
  const benchmarkCloses=(benchmarkRows??[]).slice(-20).map((row)=>Number(row.close)).filter((value)=>Number.isFinite(value)&&value>0);
  const relativeStrength20Pct=closes.length>=20&&benchmarkCloses.length>=20
    ? 100*((current/closes.at(-20))/(benchmarkCloses.at(-1)/benchmarkCloses.at(-20))-1):null;
  const governingDrawdown=Math.min(drawdown60Pct,Number.isFinite(drawdown120Pct)?drawdown120Pct:drawdown60Pct);
  const dislocationScore = governingDrawdown <= -20 ? 92 : governingDrawdown <= -12 ? 80
    : governingDrawdown <= -7 ? 68 : governingDrawdown <= -3 ? 52 : bias20Pct >= 8 ? 20 : 38;
  const technicalState = bias20Pct <= -3 ? 'reclaim_required' : bias20Pct >= 8 || rsi>=70 ? 'extended' : 'breakout_pending';
  const timingScore = technicalState === 'reclaim_required' ? 38 : technicalState === 'extended' ? 18 : 58;
  return { priceDislocation: { score: dislocationScore, trustworthy: true, drawdown60Pct, drawdown120Pct,bias20Pct,
    reason: governingDrawdown <= -12 ? 'large_drawdown' : bias20Pct >= 8 ? 'extended' : 'moderate_dislocation' },
  timing: { score: timingScore, trustworthy: true, technicalState,
    reason: technicalState === 'reclaim_required' ? 'below_ma20_reclaim_required' : technicalState },
  context: { currentPrice:current,high20,high60,high120:Number.isFinite(high120)?high120:null,ma20,
    ma60:Number.isFinite(ma60)?ma60:null,ma120:Number.isFinite(ma120)?ma120:null,drawdown20Pct,drawdown60Pct,drawdown120Pct,
    bias20Pct,bias60Pct,bias120Pct,rsi14:rsi,macd,atr14,volumeRatio20,relativeStrength20Pct,technicalState } };
}

function revenueResearchAxis(row, sourceCutoff) {
  if (!row || row.authority !== 'exchange_reported' || !/^https:\/\/(?:openapi[.]twse[.]com[.]tw|www[.]tpex[.]org[.]tw)\//u.test(row.sourceUrl ?? '')
      || !Number.isFinite(Number(row.yoyGrowth)) || !Number.isFinite(Date.parse(`${row.asOf}T00:00:00Z`))) {
    return { score: null, trustworthy: false, reason: 'official_revenue_unavailable' };
  }
  const ageDays = (Date.parse(sourceCutoff) - Date.parse(`${row.asOf}T00:00:00Z`)) / 86400000;
  if (ageDays < 0 || ageDays > 120) return { score: null, trustworthy: false, reason: 'official_revenue_stale' };
  const yoy = Number(row.yoyGrowth);
  return { score: yoy >= 20 ? 88 : yoy >= 8 ? 76 : yoy >= 0 ? 64 : yoy >= -8 ? 48 : 25,
    trustworthy: true, trend: yoy >= 0 ? 'stable_or_growing' : yoy >= -8 ? 'softening' : 'deteriorating',
    reason: yoy >= 0 ? 'official_revenue_not_deteriorating' : 'official_revenue_deteriorating', yoyGrowth: yoy,
    momGrowth: Number.isFinite(Number(row.momGrowth)) ? Number(row.momGrowth) : null, asOf: row.asOf, sourceRef: row.sourceRef };
}

function relativePeScore(ratio) {
  return ratio <= 0.7 ? 92 : ratio <= 0.9 ? 78 : ratio <= 1.1 ? 58 : ratio <= 1.35 ? 38 : 20;
}

function valuationResearchAxis(row, sectorReference, historyRows = []) {
  const verified = validateReportedValuation(row);
  if (verified.availability !== 'available') return { score: null, trustworthy: false, reason: verified.reason };
  if (!Number.isFinite(row.peRatio)) {
    return { score: null, trustworthy: false, reason: 'sector_pe_reference_unavailable', currentPe: row.peRatio,
      currentPb: row.pbRatio, sourceRef: row.sourceRef, asOf: row.session };
  }
  const officialHistory = historyRows.filter((item) => item?.symbol === row.symbol && item.authority === 'exchange_reported_history'
      && item.session < row.session && Number.isFinite(item.peRatio) && item.peRatio > 0 && item.peRatio <= 200
      && (/^twse-rwd:BWIBBU_d:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(item.sourceRef ?? '')
        || /^tpex-rwd:peratio:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(item.sourceRef ?? '')))
    .sort((left,right)=>left.session.localeCompare(right.session));
  const historyPes = officialHistory.map((item)=>item.peRatio); const historyPeMedian = median(historyPes);
  const hasHistoryReference = historyPes.length >= 2 && Number.isFinite(historyPeMedian);
  const hasSectorReference = sectorReference?.count >= 3 && Number.isFinite(sectorReference.medianPe);
  if (!hasSectorReference && !hasHistoryReference) return { score: null, trustworthy: false,
    reason: 'pe_reference_unavailable', currentPe: row.peRatio,currentPb:row.pbRatio,historySampleCount:historyPes.length,
    sourceRef:row.sourceRef,asOf:row.session };
  const sectorRelativePe = hasSectorReference ? row.peRatio / sectorReference.medianPe : null;
  const historyRelativePe = hasHistoryReference ? row.peRatio / historyPeMedian : null;
  const referenceScores = [sectorRelativePe,historyRelativePe].filter(Number.isFinite).map(relativePeScore);
  const score = referenceScores.reduce((sum,value)=>sum+value,0)/referenceScores.length;
  const reason = hasSectorReference && hasHistoryReference ? 'pe_compared_with_sector_and_own_history'
    : hasHistoryReference ? 'pe_compared_with_own_history' : 'pe_compared_with_sector_reference';
  return { score,trustworthy:true,reason,currentPe:row.peRatio,currentPb:row.pbRatio,
    sectorPe:hasSectorReference?sectorReference.medianPe:null,sectorCount:hasSectorReference?sectorReference.count:0,
    relativePe:sectorRelativePe,historyPeMedian,historyPeMin:historyPes.length?Math.min(...historyPes):null,
    historyPeMax:historyPes.length?Math.max(...historyPes):null,historySampleCount:historyPes.length,
    historyRelativePe,historyAsOf:officialHistory.map((item)=>item.session),
    sourceRefs:[row.sourceRef,...officialHistory.map((item)=>item.sourceRef)],sourceRef:row.sourceRef,asOf:row.session };
}

function median(values) {
  const selected = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!selected.length) return null;
  const middle = Math.floor(selected.length / 2);
  return selected.length % 2 ? selected[middle] : (selected[middle - 1] + selected[middle]) / 2;
}

function buildResearchScore(candidate, { priceRows = [], officialSnapshot = null, sectorReferences = new Map(), stats = null, sourceCutoff }) {
  const price = priceResearchAxes(researchHistory(priceRows, candidate.symbol), stats, officialSnapshot?.twseIndex ?? []);
  const revenue = officialSnapshot?.revenues?.find((row) => row.symbol === candidate.symbol) ?? null;
  const valuation = officialSnapshot?.valuations?.find((row) => row.symbol === candidate.symbol) ?? null;
  const fundamental = revenueResearchAxis(revenue, sourceCutoff);
  const valuationAxis = valuationResearchAxis(valuation, sectorReferences.get(candidate.canonicalSector),
    officialSnapshot?.valuationHistory ?? []);
  const score = computeUnderreactionResearchScore({ symbol: candidate.symbol,
    discovery: { score: Number.isFinite(candidate.sourcePriority) ? candidate.sourcePriority : stats ? 62 : 50,
      trustworthy: true, reason: stats ? 'price_dislocation_scan' : `${candidate.sourceClass ?? 'community'}_source_signal` },
    fundamental, priceDislocation: price.priceDislocation, valuation: valuationAxis, timing: price.timing });
  return Object.freeze({ ...score, axes: { fundamental, priceDislocation: price.priceDislocation,
    valuation: valuationAxis, timing: price.timing }, priceContext: price.context });
}

function indexComponent(rows) {
  if (!Array.isArray(rows) || rows.length < 20) return null;
  const closes = rows.slice(-60).map((row) => Number(row.close)).filter((value) => Number.isFinite(value) && value > 0);
  if (closes.length < 20) return null;
  const current = closes.at(-1); const ma20 = closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20;
  const high = Math.max(...closes); const drawdownPct = 100 * (current / high - 1);
  return { state: current >= ma20 ? 'uptrend' : drawdownPct <= -12 ? 'drawdown' : 'pullback',
    current, ma20, drawdownPct, session: rows.at(-1).session };
}

function legacyQualityMaterial(facts) {
  const row = (key) => facts.find((item) => Array.isArray(item) && item[1] === key && Number.isFinite(item[5]));
  const value = (item) => item?.[5];
  const roeRow = row('roe'); const revenueRow = row('quarterly_revenue');
  const operatingRow = row('quarterly_operating_income');
  const attributableIncomeRow = row('quarterly_net_income_attributable_to_common');
  const netIncomeRow = attributableIncomeRow ?? row('quarterly_net_income');
  const ocfRow = row('operating_cash_flow'); const capexRow = row('capital_expenditure');
  const ebitdaRow = row('quarterly_ebitda'); const debtRow = row('total_debt');
  const cashRow = row('cash_and_equivalents'); const interestRow = row('interest_expense');
  const revenue = value(revenueRow); const operating = value(operatingRow);
  const netIncome = value(netIncomeRow); const ocf = value(ocfRow); const capex = value(capexRow);
  const ebitda = value(ebitdaRow); const debt = value(debtRow); const cash = value(cashRow);
  const interest = value(interestRow);
  const usedRows = [roeRow];
  if (Number.isFinite(revenue) && revenue !== 0 && Number.isFinite(operating)) usedRows.push(revenueRow, operatingRow);
  if (Number.isFinite(netIncome) && netIncome !== 0 && Number.isFinite(ocf) && Number.isFinite(capex)) usedRows.push(netIncomeRow, ocfRow, capexRow);
  if (Number.isFinite(ebitda) && ebitda > 0 && Number.isFinite(debt)) usedRows.push(ebitdaRow, debtRow, ...(Number.isFinite(cash) ? [cashRow] : []));
  if (Number.isFinite(interest) && interest > 0 && Number.isFinite(operating)) usedRows.push(interestRow, operatingRow);
  return { input: { roe: value(roeRow), operatingMargin: Number.isFinite(revenue) && revenue !== 0 && Number.isFinite(operating) ? operating / revenue : null,
    freeCashFlowConversion: Number.isFinite(netIncome) && netIncome !== 0 && Number.isFinite(ocf) && Number.isFinite(capex) ? (ocf - Math.abs(capex)) / Math.abs(netIncome) : null,
    netDebtToEbitda: Number.isFinite(ebitda) && ebitda > 0 && Number.isFinite(debt) ? (debt - (Number.isFinite(cash) ? cash : 0)) / ebitda : null,
    interestCoverage: Number.isFinite(interest) && interest > 0 && Number.isFinite(operating) ? operating / interest : null },
  usedRows: [...new Set(usedRows.filter(Boolean))] };
}

function legacyQualityInput(facts) {
  return legacyQualityMaterial(facts).input;
}

function legacyFundamentalNarrative(candidate, usedRows, quality, sourceCutoff) {
  const score = Number.isFinite(quality.score) ? Math.round(quality.score) : null;
  invariant(usedRows.every((row) => typeof row[12] === 'string' && row[12].length > 0), 'quality fact evidence unavailable');
  const directRefs = [...new Set(usedRows.map((row) => row[12])
    .filter((value) => typeof value === 'string' && value.length > 0))];
  const qualityEvidence = usedRows.map((row) => [row[1], row[5], canonicalUtc(row[9], 'quality fact as-of'), row[12]]);
  const evidenceRefs = score === null ? [candidate.claimId].filter((value) => typeof value === 'string' && value.length > 0)
    : directRefs.length <= 8 ? directRefs : [`fundamental-input-set:${sha256(canonicalJson(qualityEvidence))}`];
  invariant(evidenceRefs.length > 0, 'legacy fundamental evidence unavailable');
  const factAsOf = usedRows.map((row) => canonicalUtc(row[9], 'quality fact as-of'))
    .sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1);
  const narrativeAsOf = score === null ? canonicalUtc(candidate.claimAsOf, 'candidate claim as-of') : factAsOf;
  invariant(typeof narrativeAsOf === 'string' && Date.parse(narrativeAsOf) <= Date.parse(sourceCutoff), 'fundamental evidence after cutoff');
  const thesis = score === null
    ? `${candidate.symbol} 已有可追溯來源訊號，但 point-in-time 基本面輸入尚不足。`
    : `${candidate.symbol} 的 point-in-time 基本面品質分數為 ${score}，仍須結合估值與技術狀態判斷。`;
  const risks = [
    quality.availableWeight < 0.65 ? '基本面品質輸入覆蓋不足，不能形成買進型建議。' : null,
    quality.qualityActionEligible !== true ? '基本面品質尚未達到新倉動作門檻。' : null,
    '財務與來源證據仍須依最新公告持續更新。',
  ].filter((value) => value !== null).slice(0, 4);
  return Object.freeze({
    thesis,
    latestChange: '本次依最新可用的 point-in-time 財務與來源證據重新檢查基本面品質。',
    risks,
    evidenceRefs,
    asOf: narrativeAsOf,
  });
}

function buildLegacyCandidateDecision({ candidate, facts, history, benchmark, sourceCutoff, valuationInput = {} }) {
  const qualityMaterial = legacyQualityMaterial(facts);
  const quality = calculateFundamentalQualityAxes(qualityMaterial.input);
  const fundamental = legacyFundamentalNarrative(candidate, qualityMaterial.usedRows, quality, sourceCutoff);
  const plane = calculateAdjustedTechnicalPlane({ rows: history, asOf: sourceCutoff, benchmark });
  const biasHistory = selectBiasTechnicalHistory({ rows: history, asOf: sourceCutoff });
  const valuation = evaluateCandidateValuation({ stockId: candidate.stockId, subjectStockId: candidate.stockId,
    cutoff: sourceCutoff, asOf: sourceCutoff, sector: candidate.canonicalSector, facts: legacyFactInput(facts), ...valuationInput });
  const actionDecision = deriveActionDecision({ plane, support: plane.support, resistance: plane.resistance,
    valuationStatus: valuation.status, qualityActionEligible: quality.qualityActionEligible,
    bias20Atr: plane.bias?.bias20Atr, atrDistance: plane.bias?.bias20Atr });
  const timingScore = actionDecision.technical?.technicalState === 'breakout_confirmed' ? 85
    : actionDecision.technical?.technicalState === 'at_support' ? 70
      : ['below_support', 'reclaim_required', 'invalidated'].includes(actionDecision.technical?.technicalState) ? 0 : 35;
  const factorScores = {
    discovery: Number.isFinite(candidate.sourcePriority) ? candidate.sourcePriority : 50,
    quality: quality.score,
    valuation: valuation.status === 'normal' ? valuation.valuationAxisScore : null,
    timingRisk: Number.isFinite(timingScore) ? timingScore : null,
  };
  const factorAxes = Object.values(factorScores).every(Number.isFinite)
    ? { availability: 'available', axes: factorScores }
    : { availability: 'unavailable', reason: 'factor_axis_unavailable', axes: factorScores };
  const technical = actionDecision.technical?.availability === 'unavailable'
    ? { technicalState: null, plane, availability: 'unavailable', reason: actionDecision.technical.reason }
    : { ...actionDecision.technical, plane: { ...plane, bias: plane.availability === 'available'
      ? { ...plane.bias, ownHistory: biasHistory.availability === 'available' ? { ...biasHistory.quantiles, label: biasHistory.current.label } : null }
      : null } };
  const fundamentalSnapshot = ['legacy-fundamental-provenance-v2', fundamental.evidenceRefs, fundamental.asOf];
  const materialChangeHash = sha256(canonicalJson([candidate.materialEvidenceHash, facts, history.at(-1) ?? null,
    benchmark.at(-1) ?? null, valuation, technical, factorAxes, fundamentalSnapshot]));
  return { ...candidate, researchMaturity: valuation.status === 'normal' && quality.qualityActionEligible ? 'decision_ready'
    : quality.availability === 'available' ? 'fundamental_review' : 'source_signal',
    action: actionDecision.action, fundamental, technical, geometry: actionDecision.geometry,
    valuation, factorAxes, reason: actionDecision.reason, lastEvaluatedAt: sourceCutoff,
    materialChangeHash, materialChangedBecause: ['factor_correctness_changed'] };
}

function buildStageHandlers(validated, sourceCommitSha, workerSha256, {
  legacyRadarBaseUrl = validated.config.legacyRadarBaseUrl,
  fetchImpl = globalThis.fetch,
  internalApiKey = process.env.INTERNAL_API_KEY,
} = {}) {
  let legacyPayloadsPromise;
  const officialSnapshotsByCutoff = new Map();
  const authorityPagesByHash = new Map();
  return {
    source_sync: async (claim) => {
      legacyPayloadsPromise ??= loadLegacyRadarPayloads(legacyRadarBaseUrl, fetchImpl, internalApiKey);
      const legacyPayloads = await legacyPayloadsPromise;
      return immutableBundle('legacy_source_sync_result_v3_11', {
        schema: 'legacy-source-sync-result-v3.11', authorityHash: claim.authorityHash,
        sourceCutoff: claim.payloadJson?.[3] ?? null, legacyPayloads,
        legacyPayloadHashes: Object.fromEntries(Object.entries(legacyPayloads)
          .map(([window, payload]) => [window, sha256(canonicalJson(payload))])),
      });
    },
    mention_claim_extraction: async (claim) => {
      if (claim.jobKind === 'revision_shard') {
        const bundle = readBundle(claim, 'frozen_revision_authority');
        const pages = Array.isArray(bundle.authorityPages) ? bundle.authorityPages : [];
        invariant(typeof bundle.authorityHash === 'string' && /^[0-9a-f]{64}$/u.test(bundle.authorityHash),
          'frozen authority hash unavailable');
        if (pages.length > 0) authorityPagesByHash.set(bundle.authorityHash, pages);
        const authorityPages = pages.length > 0 ? pages : authorityPagesByHash.get(bundle.authorityHash);
        invariant(Array.isArray(authorityPages) && authorityPages.length > 0, 'frozen authority cache unavailable');
        return immutableBundle('legacy_mention_claim_result_v3_11',
          extractRevisionCandidates({ ...bundle, authorityPages }));
      }
      const bundle = readBundle(claim, 'mention_shard_results');
      const candidates = (bundle.results ?? []).flatMap((result) => Array.isArray(result?.candidates) ? result.candidates : []);
      return immutableBundle('legacy_mention_barrier_result_v3_11', { schema: 'legacy-mention-barrier-result-v3.11', candidates });
    },
    candidate_funnel: async (claim) => {
      const bundle = readBundle(claim, 'candidate_funnel_input');
      const outcomes = (bundle.mentionResult?.candidates ?? []).map((candidate) => ({
        ...candidate, raw: candidate.raw, claimId: candidate.claimId, mentionId: candidate.mentionId,
        claimEligible: true, link: { disposition: 'linked', stockId: candidate.stockId, symbol: candidate.symbol },
      }));
      const funnel = buildCandidateFunnel({ outcomes, seedSymbols: bundle.seedSymbols ?? [], priorLedger: bundle.priorLedger ?? [] });
      return immutableBundle('legacy_candidate_funnel_result_v3_11', { schema: 'legacy-candidate-funnel-result-v3.11',
        candidates: funnel.candidateLedger, discoverySummary: funnel.discoverySummary,
        discoveryDelta: funnel.discoveryDelta });
    },
    facts_refresh: async (claim) => {
      const bundle = readBundle(claim, 'candidate_fact_plane');
      const candidates = bundle.candidateResult?.candidates ?? [];
      const bridgeAvailable = bundle.bridgeSchema === 'legacy-product-value-bridge-v3.12';
      if (bridgeAvailable && !officialSnapshotsByCutoff.has(bundle.sourceCutoff)) {
        officialSnapshotsByCutoff.set(bundle.sourceCutoff,loadOfficialTwMarketSnapshot({ cutoff:bundle.sourceCutoff,fetchImpl })
          .catch((error)=>({ availability:'unavailable',reason:'official_market_snapshot_unavailable',
            detail:error instanceof Error?error.message:String(error),valuations:[],valuationHistory:[],revenues:[],twseIndex:[],
            tpexIndex:[],foreignFlow:null,sourceFailures:[] })));
      }
      const officialSnapshot = bridgeAvailable ? await officialSnapshotsByCutoff.get(bundle.sourceCutoff) : null;
      const dislocationInputs = Array.isArray(bundle.dislocationCandidates) ? bundle.dislocationCandidates : [];
      const officialValuationBySymbol = new Map((officialSnapshot?.valuations ?? []).map((row) => [row.symbol, row]));
      const sectorMembers = (bundle.sectorValuationUniverse ?? []).reduce((map, row) => {
        if (!Array.isArray(row) || !/^\d{4}$/u.test(String(row[0])) || typeof row[1] !== 'string') return map;
        const pe = Number(officialValuationBySymbol.get(String(row[0]))?.peRatio);
        if (!Number.isFinite(pe) || pe <= 0) return map;
        const selected = map.get(row[1]) ?? [];
        selected.push(pe); map.set(row[1],selected); return map;
      }, new Map());
      const sectorReferences = new Map([...sectorMembers].map(([sector, values]) => [sector,
        { medianPe: median(values), count: values.length }]));
      const researchPriceRows = [...(bundle.priceRows ?? []), ...(bundle.legacyPriceRows ?? [])];
      const decisions = candidates.filter((candidate) => candidate.deepSelected === true).map((candidate) => {
        const facts = (bundle.financialRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol);
        const history = (bundle.priceRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol)
          .map((row) => ({ session: row[1], open: row[2], high: row[3], low: row[4], close: row[5], volume: row[6] }))
          .sort((left, right) => String(left.session).localeCompare(String(right.session)));
        const benchmark = (bundle.benchmarkRows ?? []).filter(Array.isArray)
          .map((row) => ({ session: row[0], close: row[1] }))
          .sort((left, right) => String(left.session).localeCompare(String(right.session)));
        const decision = buildLegacyCandidateDecision({ candidate, facts, history, benchmark, sourceCutoff: bundle.sourceCutoff,
          valuationInput: bundle.valuationInputs?.[candidate.symbol] ?? {} });
        return { ...decision, researchScore: buildResearchScore(candidate, { priceRows: researchPriceRows,
          officialSnapshot, sectorReferences, sourceCutoff: bundle.sourceCutoff }) };
      });
      const shallowObservations = candidates.filter((candidate) => candidate.shallowSelected === true && candidate.deepSelected !== true)
        .map((candidate) => {
          const latest = researchPriceRows.filter((row) => Array.isArray(row) && row[0] === candidate.symbol)
            .sort((left, right) => String(right[1]).localeCompare(String(left[1])))[0];
          return { ...candidate, researchMaturity: 'source_signal', newPositionAction: 'valuation_review',
            shallowStatus: 'enriched_observation', currentPrice: Array.isArray(latest) && Number.isFinite(latest[5]) ? latest[5] : null,
            lastEvaluatedAt: bundle.sourceCutoff, researchScore: buildResearchScore(candidate, { priceRows: researchPriceRows,
              officialSnapshot, sectorReferences, sourceCutoff: bundle.sourceCutoff }) };
        });
      const deferredSignals = candidates.filter((candidate) => candidate.shallowSelected !== true).map((candidate) => ({
        ...candidate, lastEvaluatedAt: bundle.sourceCutoff, researchScore: buildResearchScore(candidate, { priceRows: researchPriceRows,
          officialSnapshot, sectorReferences, sourceCutoff: bundle.sourceCutoff }),
      }));
      const dislocationCandidates = dislocationInputs.map((row) => {
        const candidate = { stockId: row.stockId, symbol: row.symbol, name: row.name ?? null,
          canonicalSector: row.canonicalSector ?? 'unknown', sourceClass: 'price_dislocation', sourcePriority: 62,
          claimId: row.sourceRef, disposition: 'promoted', reason: 'price_dislocation',
          sourceSummary: `${row.symbol} 近 60 個交易日自高點回落 ${Math.abs(Number(row.drawdown60Pct)).toFixed(1)}%，納入基本面未惡化檢查。`,
          lastEvaluatedAt: bundle.sourceCutoff };
        return { ...candidate, researchMaturity: 'fundamental_review', newPositionAction: 'valuation_review',
          researchScore: buildResearchScore(candidate, { priceRows: researchPriceRows, officialSnapshot, sectorReferences,
            stats: row, sourceCutoff: bundle.sourceCutoff }) };
      });
      const decisionSymbols = new Set(decisions.map((row) => row.symbol));
      const sourceCandidates = [...shallowObservations, ...deferredSignals, ...dislocationCandidates]
        .filter((row) => !decisionSymbols.has(row.symbol))
        .sort((left, right) => (right.researchScore?.underreactionScore ?? -1) - (left.researchScore?.underreactionScore ?? -1)
          || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0) || left.symbol.localeCompare(right.symbol))
        .filter((row, index, all) => all.findIndex((candidate) => candidate.symbol === row.symbol) === index)
        .slice(0, Math.max(0, 60 - decisions.length));
      const marketAnalysis = buildMarketAnalysis({ asOf: bundle.sourceCutoff,
        taiex: indexComponent(officialSnapshot?.twseIndex), otc: indexComponent(officialSnapshot?.tpexIndex),
        breadth: bundle.marketBreadth && Number(bundle.marketBreadth.trackedCount) >= 20
          ? { aboveMa20Pct: Number(bundle.marketBreadth.aboveMa20Pct), trackedCount: Number(bundle.marketBreadth.trackedCount),
            scope: bundle.marketBreadth.scope,asOf:bundle.marketBreadth.asOf } : null,
        foreignFlow: officialSnapshot?.foreignFlow ?? null });
      return immutableBundle('legacy_facts_refresh_result_v3_11', { schema: 'legacy-facts-refresh-result-v3.11', decisions,
        shallowObservations, sourceCandidates, marketAnalysis,
        officialSnapshotStatus: officialSnapshot?.availability === 'unavailable'
          ? { availability:'unavailable',reason:officialSnapshot.reason }
          : { availability:bridgeAvailable ? officialSnapshot?.sourceFailures?.length ? 'partial' : 'available' : 'not_requested',
            sourceFailures:officialSnapshot?.sourceFailures ?? [] },
        discoveryDelta: bundle.candidateResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] } });
    },
    analysis_revision: async (claim) => {
      const bundle = readBundle(claim, 'analysis_revision_input');
      const priorBySymbol = new Map((bundle.priorRevisions ?? []).map((revision) => [revision.symbol, revision]));
      const decisions = (bundle.factsResult?.decisions ?? []).map((decision) => {
        const revision = appendAnalysisRevision({ priorRevision: priorBySymbol.get(decision.symbol) ?? null,
          input: { materialChangeHash: decision.materialChangeHash, facts: decision, lockedNarrativeClaims: [decision.claimId] },
          changedBecause: decision.materialChangedBecause, now: bundle.sourceCutoff });
        return { ...decision, analysisRevision: revision, evaluationDisposition: revision.disposition === 'unchanged' ? 'unchanged' : 'appended',
          analysisGeneratedAt: revision.revision.analysisGeneratedAt,
          noChangeMessage: revision.disposition === 'unchanged' ? `已於 ${bundle.sourceCutoff} 檢查，無重大變化` : null };
      });
      return immutableBundle('legacy_analysis_revision_result_v3_11', { schema: 'legacy-analysis-revision-result-v3.11', decisions,
        sourceCandidates: bundle.factsResult?.sourceCandidates ?? [],
        marketAnalysis: bundle.factsResult?.marketAnalysis ?? null,
        discoveryDelta: bundle.factsResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] } });
    },
    compact_radar_projection: async (claim) => {
      const bundle = readBundle(claim, 'compact_projection_input');
      const decisions = bundle.analysisResult?.decisions ?? [];
      const runtimeHealthObservation = readRuntimeHealthObservation(sourceCommitSha, workerSha256, validated.sha256);
      const producerIdentity = { commitSha: sourceCommitSha, workerSha256, configSha256: validated.sha256,
        ...(runtimeHealthObservation ? { runtimeHealthObservation } : {}) };
      const legacyPayloads = bundle.legacyPayloads;
      invariant(legacyPayloads && ['daily', 'hot', 'weekly', 'home'].every((window) =>
        legacyPayloads[window] && typeof legacyPayloads[window] === 'object'), 'legacy radar capture unavailable');
      const projections = ['daily', 'hot', 'weekly', 'home'].map((window) => publishCompactRadarProjection({ decisions,
        sourceCandidates: bundle.analysisResult?.sourceCandidates ?? [],
        marketAnalysis: bundle.analysisResult?.marketAnalysis ?? null,
        discoveryDelta: bundle.analysisResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] },
        window, asOf: bundle.sourceCutoff, producerIdentity, legacyPayload: legacyPayloads[window] }));
      return immutableBundle('legacy_compact_projection_result_v3_11', { schema: 'legacy-compact-projection-result-v3.11', projections });
    },
  };
}

async function main() {
  const options = args(process.argv.slice(2));
  const bytes = fs.readFileSync(options.configPath);
  const validated = validateAuthSourceDagConfig(bytes);
  if ((process.env.SOURCE_LED_OPPORTUNITY_V3 || 'disabled') !== 'disabled') throw new Error('v3_runtime_must_remain_disabled');
  if (options.dryRun) {
    process.stdout.write(`${canonicalJson({ schema: 'tracked-auth-source-worker-v1', disposition: 'validated_non_mutating', configSha256: validated.sha256 })}\n`);
    return;
  }
  assertExactRuntimeEnvironment(process.env);
  const runtimeEnvironment = hydrateRuntimeCredentials(process.env, undefined, { requireReferences: true });
  if (!runtimeEnvironment.STOCKINSIDER_REVIEWED_COMMIT_SHA) throw new Error('reviewed_runtime_environment_incomplete');
  // Load the production-only database driver only after dry-run/config checks, so
  // the reviewed CLI can be verified without installing runtime dependencies.
  const { createPostgresLegacyProducerAdapter } = require('./postgres-legacy-producer-adapter');
  const adapter = createPostgresLegacyProducerAdapter({ connectionString: runtimeEnvironment.STOCKINSIDER_DATABASE_URL });
  const workerBytes = runtimeBundleBytes(path.resolve(__dirname, '..', '..'));
  const stageHandlers = buildStageHandlers(validated, runtimeEnvironment.STOCKINSIDER_REVIEWED_COMMIT_SHA, sha256(workerBytes), {
    internalApiKey: runtimeEnvironment.INTERNAL_API_KEY,
  });
  try {
    const result = await runDurableAuthSourceWorker({ configBytes: bytes, adapter, sourceCommitSha: runtimeEnvironment.STOCKINSIDER_REVIEWED_COMMIT_SHA,
      workerBytes, stageHandlers });
    process.stdout.write(`${canonicalJson({ schema: 'tracked-auth-source-worker-v1', ...result })}\n`);
  } finally {
    await adapter.close();
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`tracked auth-source worker failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

module.exports = { args, buildLegacyCandidateDecision, buildStageHandlers, extractRevisionCandidates,
  extractMatchedEvidenceSnippet, LEGACY_RADAR_FETCH_TIMEOUT_MS, legacyFactInput, legacyQualityInput, loadLegacyRadarPayloads, main, readBundle, readRuntimeHealthObservation,
  tickerHasStockContext, uuidFromHash, valuationResearchAxis };
