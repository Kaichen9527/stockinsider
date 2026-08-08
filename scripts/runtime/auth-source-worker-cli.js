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
  const matches = roster.flatMap((row) => {
    const [stockId, symbol, exchange, , , legalName, shortName] = row;
    const aliases = aliasByStock.get(stockId) ?? [];
    const nameMatch = [shortName, legalName, ...aliases].some((name) => nameHasStockContext(text, name, symbol));
    const tickerMatch = typeof symbol === 'string' && (nameMatch || tickerHasStockContext(text, symbol));
    if (!tickerMatch && !nameMatch) return [];
    const raw = tickerMatch ? String(symbol) : String([shortName, ...aliases, legalName].find((name) => typeof name === 'string' && text.includes(name)));
    const claimId = uuidFromHash(`claim:${frozen.revisionId}:${stockId}:${raw}`);
    return [{ sourceKey: frozen.sourceKey, revisionId: frozen.revisionId, stockId, symbol, exchange,
      canonicalSector: sectorByStock.get(stockId) ?? 'unknown', raw, claimId,
      claimAsOf: typeof frozen.sourceCollectedAt === 'string' ? canonicalUtc(frozen.sourceCollectedAt, 'frozen source collected-at') : null,
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
  const materialChangeHash = sha256(canonicalJson([candidate.materialEvidenceHash, facts, history.at(-1) ?? null,
    benchmark.at(-1) ?? null, valuation, technical, factorAxes]));
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
      const decisions = candidates.filter((candidate) => candidate.deepSelected === true).map((candidate) => {
        const facts = (bundle.financialRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol);
        const history = (bundle.priceRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol)
          .map((row) => ({ session: row[1], open: row[2], high: row[3], low: row[4], close: row[5], volume: row[6] }))
          .sort((left, right) => String(left.session).localeCompare(String(right.session)));
        const benchmark = (bundle.benchmarkRows ?? []).filter(Array.isArray)
          .map((row) => ({ session: row[0], close: row[1] }))
          .sort((left, right) => String(left.session).localeCompare(String(right.session)));
        return buildLegacyCandidateDecision({ candidate, facts, history, benchmark, sourceCutoff: bundle.sourceCutoff,
          valuationInput: bundle.valuationInputs?.[candidate.symbol] ?? {} });
      });
      const shallowObservations = candidates.filter((candidate) => candidate.shallowSelected === true && candidate.deepSelected !== true)
        .map((candidate) => {
          const latest = (bundle.priceRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol)
            .sort((left, right) => String(right[1]).localeCompare(String(left[1])))[0];
          return { ...candidate, researchMaturity: 'source_signal', newPositionAction: 'valuation_review',
            shallowStatus: 'enriched_observation', currentPrice: Array.isArray(latest) && Number.isFinite(latest[5]) ? latest[5] : null };
        });
      const deferredSignals = candidates.filter((candidate) => candidate.shallowSelected !== true);
      return immutableBundle('legacy_facts_refresh_result_v3_11', { schema: 'legacy-facts-refresh-result-v3.11', decisions,
        shallowObservations, sourceCandidates: [...shallowObservations, ...deferredSignals],
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
  LEGACY_RADAR_FETCH_TIMEOUT_MS, legacyFactInput, legacyQualityInput, loadLegacyRadarPayloads, main, readBundle, readRuntimeHealthObservation,
  tickerHasStockContext, uuidFromHash };
