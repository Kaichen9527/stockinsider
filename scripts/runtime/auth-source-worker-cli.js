#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalJson, immutableBundle, sha256, invariant, percentile } = require('./codec');
const { runDurableAuthSourceWorker } = require('./auth-source-worker');
const { validateAuthSourceDagConfig } = require('./source-run-config');
const { buildCandidateFunnel } = require('./candidate-funnel');
const { calculateAdjustedTechnicalPlane } = require('./technical-plane');
const { calculateFundamentalQualityAxes } = require('./fundamental-quality');
const { evaluateCandidateValuation } = require('./candidate-valuation');
const { selectSectorValuationMethod } = require('./valuation-method');
const { deriveActionDecision } = require('./action-decision');
const { selectBiasTechnicalHistory } = require('./bias-technical-history');
const { appendAnalysisRevision } = require('./analysis-revision');
const { hashMaterialAnalysisChange, materialChangedReasons } = require('./analysis-material-change');
const { decisionRevisionIdentityBundle, immutableDecisionRevisionCard,
  publishCompactRadarProjection, collectDecisionRevisionCards } = require('./compact-radar-projection');
const { computeUnderreactionResearchScore } = require('./underreaction-score');
const { computeResearchRankingV314 } = require('./research-ranking-v314');
const { deriveResearchNextStep } = require('./research-next-step-v317');
const { buildResearchSnapshotV317 } = require('./research-snapshot-v317');
const { safeFailureDiagnostic } = require('./safe-diagnostics');
const { buildOfficialTradingScheduleV314, coverageReportV314 } = require('./official-market-authority-v314');
const { loadOfficialTwMarketSnapshot,loadOfficialCoarseMarketSnapshot, SOURCE_URL, TPEX_SOURCE_URL, TWSE_REVENUE_URL, TPEX_REVENUE_URL,
  TWSE_PRICE_HISTORY_URL, TPEX_PRICE_HISTORY_URL, validateReportedValuation,
  validOfficialReportedValuationSourceRef } = require('./official-twse-valuation');
const { MOPS_INLINE_URL } = require('./official-mops-v314');
const { buildMarketAnalysis } = require('./market-analysis');
const { buildOfficialFactorCandidatesV315 } = require('./official-factor-discovery-v315');
const { runtimeBundleBytes } = require('./tracked-runtime-bundle');
const { acquireApprovedSources } = require('./official-source-acquisition');
const { acquireFrozenProviderEnvelope } = require('./provider-acquisition-v31621');
const approvedSourceRoster = require('../../config/runtime/approved-source-roster-v3.13.json');
const { assertExactRuntimeEnvironment, hydrateRuntimeCredentials, resolveCredentialReference } = require('./credential-resolver');

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

function readRuntimeManifestSha256(sourceCommitSha, workerSha256, configSha256) {
  const runtimeRoot = process.env.STOCKINSIDER_RUNTIME_ROOT
    ? path.resolve(process.env.STOCKINSIDER_RUNTIME_ROOT)
    : path.join(os.homedir(), 'Library', 'Application Support', 'StockInsiderRuntime');
  const filename = path.join(runtimeRoot, 'current', 'installation-manifest.json');
  try {
    const text = fs.readFileSync(filename, 'utf8');
    const value = JSON.parse(text);
    invariant(`${canonicalJson(value)}\n` === text, 'runtime installation manifest noncanonical');
    invariant(value?.schema === 'stockinsider-runtime-installation-v1.1'
      && value.commitSha === sourceCommitSha
      && value.worker?.repositoryPath === 'scripts/runtime/auth-source-worker-cli.js'
      && value.worker?.sha256 === workerSha256
      && value.config?.repositoryPath === 'config/runtime/auth-source-dag.json'
      && value.config?.sha256 === configSha256,
    'runtime installation manifest identity mismatch');
    return sha256(canonicalJson(value));
  } catch {
    return null;
  }
}

function sourceText(raw) {
  const values = [];
  const walk = (value) => {
    if (typeof value === 'string') values.push(value.toWellFormed().normalize('NFKC'));
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
  const normalized = text.toWellFormed().normalize('NFC').replace(/[\r\n]+/gu, '。');
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
    const candidate = normalized.slice(start, end).toWellFormed().trim();
    const hasSymbol = candidate.includes(symbol);
    const hasName = names.some((name) => typeof name === 'string' && name.length >= 2 && candidate.includes(name));
    const score = (hasSymbol ? 2 : 0) + (hasName ? 2 : 0) + Math.min(candidate.length, 180) / 1000;
    if (!best || score > best.score) best = { candidate, score, hasSymbol, hasName };
  }
  const textOut = [...best.candidate].slice(0, 180).join('').toWellFormed().trim();
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
  // Telegram content is not authorized for this product's AI/ML processing,
  // and paid InvestAnchors material is methodology-only. Keep their terminal
  // acquisition outcome observable, but never turn either into a candidate.
  if(['telegram','investanchors'].includes(String(frozen.sourceKey))) {
    return Object.freeze({ linked:[],rejected:[],deferred:[],conservation:Object.freeze({
      sourceKey:String(frozen.sourceKey),outcome:'not_authorized',candidateCount:0 }) });
  }
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
  const allMatches = roster.flatMap((row) => {
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
  });
  // Authority pages may legitimately repeat an identical active roster head
  // (for example, when an upgrade-safe snapshot carries the same instrument
  // through two bounded page sources).  The persistence contract keys claims
  // and mentions by their deterministic identities, so collapse exact
  // identity duplicates before applying the 200-entity conservation bound.
  // The deterministic identity is the persistence authority here; conflicting
  // roster heads for that identity are rejected by the frozen authority plane
  // before this extraction step.
  const uniqueMatches=[];const seenClaimIds=new Set();
  for(const candidate of allMatches){
    if(seenClaimIds.has(candidate.claimId))continue;
    seenClaimIds.add(candidate.claimId);uniqueMatches.push(candidate);
  }
  const matches=uniqueMatches.slice(0,200);
  const linkedSymbols=new Set(matches.map((candidate)=>candidate.symbol));
  const allRejectedTokens=[...new Set([...text.matchAll(/(^|[^0-9])([0-9]{4})(?=[^0-9]|$)/gu)].map((match)=>match[2]))]
    .filter((symbol)=>!linkedSymbols.has(symbol));
  const rejectedTokens=allRejectedTokens.slice(0,200);
  const rejected=rejectedTokens.map((symbol)=>({
    claimId:uuidFromHash(`claim:${frozen.revisionId}:rejected:${symbol}`),
    mentionId:uuidFromHash(`mention:${frozen.revisionId}:rejected:${symbol}`),symbol,
    outcome:'rejected',reason:'stock_context_or_master_authority_unavailable',stockId:null,
  }));
  const overflowCount=Math.max(0,uniqueMatches.length-matches.length)+Math.max(0,allRejectedTokens.length-rejectedTokens.length);
  const overflow=overflowCount?[{claimId:uuidFromHash(`claim:${frozen.revisionId}:bounded-overflow`),
    mentionId:uuidFromHash(`mention:${frozen.revisionId}:bounded-overflow`),symbol:null,stockId:null,
    outcome:'deferred',reason:`entity_bound_deferred:${overflowCount}`}]:[];
  const claimOutcomes=[...matches.map((candidate)=>({claimId:candidate.claimId,mentionId:candidate.mentionId,
    symbol:candidate.symbol,stockId:candidate.stockId,outcome:'linked',reason:'canonical_master_context_verified'})),...rejected];
  claimOutcomes.push(...overflow);
  const entityOutcomes=claimOutcomes.map((outcome)=>({entityOutcomeId:uuidFromHash(`entity:${outcome.claimId}`),
    claimId:outcome.claimId,symbol:outcome.symbol,stockId:outcome.stockId,outcome:outcome.outcome,
    reason:outcome.reason}));
  const parseOutcome=matches.length?'processed_with_claims':'processed_no_claim';
  return { schema: 'legacy-mention-claim-result-v3.11', revisionId: frozen.revisionId,
    candidates: matches, parseOutcome,documentOutcome:{outcome:parseOutcome,reason:matches.length
      ?'one_or_more_verified_entities':'no_verified_stock_claim'},claimOutcomes,entityOutcomes,
    conservation:{documentCount:1,claimCount:claimOutcomes.length,entityCount:entityOutcomes.length,
      linkedEntityCount:entityOutcomes.filter((row)=>row.outcome==='linked').length,
      rejectedEntityCount:entityOutcomes.filter((row)=>row.outcome==='rejected').length} };
}

function factRestatement(row) { return row.length>=16 ? String(row[13]??'') : ''; }

function selectOfficialFactHeads(rows,sourceCutoff=null) {
  const accepted=rows.filter((row)=>validOfficialFactRow(row,sourceCutoff)).map(normalizeOfficialFactRow);
  const groups=Map.groupBy(accepted,(row)=>canonicalJson([row[1],row[2]??null,row[3],row[4]]));
  const selected=[];const conflicts=[];
  for(const members of groups.values()) {
    const ordered=[...members].sort((left,right)=>String(right[8]).localeCompare(String(left[8]))
      ||String(right[9]).localeCompare(String(left[9]))||String(right[10]).localeCompare(String(left[10]))
      ||String(right[11]).localeCompare(String(left[11]))||factRestatement(right).localeCompare(factRestatement(left))
      ||String(left[12]).localeCompare(String(right[12])));
    const winner=ordered[0];
    const tied=ordered.filter((row)=>String(row[8])===String(winner[8])&&String(row[9])===String(winner[9])
      &&String(row[10])===String(winner[10])&&String(row[11])===String(winner[11])
      &&factRestatement(row)===factRestatement(winner));
    if(new Set(tied.map((row)=>Number(row[5]))).size>1)conflicts.push([winner[1],winner[2]??null,winner[3],winner[4]]);
    else selected.push(winner);
  }
  return {rows:selected,conflicts};
}

function legacyFactInput(rows) {
  const latest = {};
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[1] === 'string' && Number.isFinite(row[5]) && latest[row[1]] === undefined) {
      latest[row[1]] = Number(row[5]);
    }
  }
  return {
    revenue: latest.quarterly_revenue, grossProfit: latest.quarterly_gross_profit,
    operatingIncome: latest.quarterly_operating_income, pretaxIncome: latest.quarterly_pretax_income,
    netIncome: latest.quarterly_net_income_attributable_to_common ?? latest.quarterly_net_income,
    dilutedShares: latest.diluted_weighted_average_shares ?? latest.diluted_shares,
    ebitda: latest.quarterly_ebitda,
    bookValue: latest.book_value_per_share, nav: latest.net_asset_value,
    cash: latest.cash_and_equivalents, totalDebt: latest.total_debt, netDebt: latest.net_debt,
    roe: latest.roe,
  };
}

const VALUATION_FLOW_KEYS = Object.freeze(['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense',
  'quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense',
  'quarterly_noncontrolling_interest','quarterly_net_income','quarterly_net_income_attributable_to_common',
  'quarterly_diluted_eps','diluted_weighted_average_shares']);
// The operating bridge is method-specific.  Official MOPS filings frequently
// publish cumulative diluted EPS without publishing the weighted-average share
// concept as a standalone XBRL fact.  Requiring that optional concept (plus PB
// and balance-sheet inputs) before even constructing a PE bridge made otherwise
// complete official income statements universally unavailable.
const VALUATION_BRIDGE_KEYS = Object.freeze(VALUATION_FLOW_KEYS.filter((key)=>
  !['quarterly_diluted_eps','diluted_weighted_average_shares'].includes(key)));
const OPTIONAL_VALUATION_FLOW_KEYS = Object.freeze(['quarterly_ebitda','depreciation_amortization']);
const VALUATION_BALANCE_KEYS = Object.freeze(['cash_and_equivalents','total_debt','total_assets','total_equity','book_value_per_share']);
const FACT_UNIT_KIND = Object.freeze({
  monthly_revenue:'money',
  quarterly_revenue:'money',quarterly_gross_profit:'money',quarterly_operating_expense:'money',quarterly_operating_income:'money',
  quarterly_non_operating_income:'money',quarterly_pretax_income:'money',quarterly_income_tax_expense:'money',
  quarterly_noncontrolling_interest:'money',quarterly_net_income:'money',quarterly_net_income_attributable_to_common:'money',quarterly_ebitda:'money',
  depreciation_amortization:'money',cash_and_equivalents:'money',total_debt:'money',net_debt:'money',total_assets:'money',
  total_equity:'money',net_asset_value:'money',quarterly_diluted_eps:'per_share',book_value_per_share:'per_share',
  diluted_weighted_average_shares:'shares',diluted_shares:'shares',roe:'percentage',
});

function factUnitAllowed(kind,unit) {
  return kind==='money'?['TWD','TWD_thousand','TWD_million'].includes(unit)
    :kind==='shares'?['share','thousand_shares'].includes(unit)
      :kind==='per_share'?unit==='TWD_per_share':kind==='percentage'&&unit==='percentage_points';
}

function normalizeOfficialFactRow(row) {
  const kind=FACT_UNIT_KIND[row[1]];const normalized=[...row];
  if(kind==='money') {
    normalized[5]=Number(row[5])*({TWD:1,TWD_thousand:1000,TWD_million:1000000})[row[6]];
    normalized[6]='TWD';
  } else if(kind==='shares') {
    normalized[5]=Number(row[5])*(row[6]==='thousand_shares'?1000:1);normalized[6]='share';
  } else normalized[5]=Number(row[5]);
  return normalized;
}

function consecutiveQuarterIndex(periodEnd) {
  const match=/^(\d{4})-(03-31|06-30|09-30|12-31)$/u.exec(String(periodEnd));
  if(!match)return null;
  return Number(match[1])*4+({ '03-31':0,'06-30':1,'09-30':2,'12-31':3 })[match[2]];
}

function quarterDayCounts(quarter) {
  const year=Math.floor(quarter/4);const ordinal=quarter%4;
  const start=Date.UTC(year,ordinal*3,1);const end=Date.UTC(year,ordinal*3+3,1);
  return {quarterDays:(end-start)/86400000,yearToDateDays:(end-Date.UTC(year,0,1))/86400000};
}

function discreteQuarterRows(rows,key,{weightedAverage=false}={}) {
  const byPeriod=new Map();
  for(const row of rows) {
    if(!Array.isArray(row)||row[1]!==key||!Number.isFinite(row[5])||consecutiveQuarterIndex(row[3])===null)continue;
    if(!byPeriod.has(row[3]))byPeriod.set(row[3],row);
  }
  const ordered=[...byPeriod.values()].sort((left,right)=>String(left[3]).localeCompare(String(right[3])));
  const discrete=[];
  for(const row of ordered) {
    const quarter=consecutiveQuarterIndex(row[3]); const withinYear=quarter%4;
    if(withinYear===0) discrete.push({quarter,value:Number(row[5]),row,days:quarterDayCounts(quarter).quarterDays});
    else {
      const prior=ordered.find((candidate)=>consecutiveQuarterIndex(candidate[3])===quarter-1);
      if(prior) {
        const days=quarterDayCounts(quarter);const priorDays=quarterDayCounts(quarter-1).yearToDateDays;
        const value=weightedAverage
          ?(Number(row[5])*days.yearToDateDays-Number(prior[5])*priorDays)/days.quarterDays
          :Number(row[5])-Number(prior[5]);
        if(Number.isFinite(value))discrete.push({quarter,value,row,days:days.quarterDays});
      }
    }
  }
  return discrete;
}

function fourQuarterFlow(rows,key) {
  const discrete=discreteQuarterRows(rows,key,{weightedAverage:key==='diluted_weighted_average_shares'});
  const latest=discrete.slice(-4);
  if(latest.length!==4||latest.some((row,index)=>index>0&&row.quarter!==latest[index-1].quarter+1))return null;
  const value=key==='diluted_weighted_average_shares'
    ?latest.reduce((sum,row)=>sum+row.value*row.days,0)/latest.reduce((sum,row)=>sum+row.days,0)
    :latest.reduce((sum,row)=>sum+row.value,0);
  return { value,rows:latest.map((row)=>row.row),quarters:latest.map((row)=>row.quarter),discrete:latest };
}

function discreteQuarterSeries(rows,key,limit) {
  const output=discreteQuarterRows(rows,key,{weightedAverage:key==='diluted_weighted_average_shares'});
  const latest=output.slice(-limit);
  return latest.length===limit&&latest.every((row,index)=>index===0||row.quarter===latest[index-1].quarter+1)?latest:[];
}

function alignedQuarterSeries(rows,keys,limit) {
  const series=new Map(keys.map((key)=>[key,discreteQuarterRows(rows,key,
    {weightedAverage:key==='diluted_weighted_average_shares'})]));
  const maps=new Map([...series].map(([key,values])=>[key,new Map(values.map((row)=>[row.quarter,row]))]));
  const common=[...new Set(series.get(keys[0])?.map((row)=>row.quarter)??[])].filter((quarter)=>
    keys.every((key)=>maps.get(key)?.has(quarter))).sort((left,right)=>left-right);
  let selected=[];
  for(let end=common.length-1;end>=limit-1;end-=1) {
    const candidate=common.slice(end-limit+1,end+1);
    if(candidate.every((quarter,index)=>index===0||quarter===candidate[index-1]+1)){selected=candidate;break;}
  }
  if(selected.length!==limit)return null;
  return Object.freeze({quarters:selected,byKey:Object.freeze(Object.fromEntries(keys.map((key)=>[key,
    selected.map((quarter)=>maps.get(key).get(quarter))])))});
}

function validOfficialFactRow(row, cutoff) {
  const quarterly=[...VALUATION_FLOW_KEYS,...OPTIONAL_VALUATION_FLOW_KEYS].includes(row?.[1]);
  const monthly=row?.[1]==='monthly_revenue';
  const periodStartValid=quarterly||monthly
    ? /^\d{4}-\d{2}-\d{2}$/u.test(String(row?.[2]))&&Date.parse(row[2])<=Date.parse(row[3])
    : row?.[2]===null;
  if(!Array.isArray(row)||!FACT_UNIT_KIND[row[1]]||!Number.isFinite(row[5])||!factUnitAllowed(FACT_UNIT_KIND[row[1]],row[6])
    ||row[7]!=='official_filing'||!periodStartValid
    ||!/^\d{4}-\d{2}-\d{2}$/u.test(String(row[3]))
    ||(quarterly?row[4]!=='quarterly':monthly?row[4]!=='monthly':row[4]!=='instant'))return false;
  const published=Date.parse(row[8]);const source=Date.parse(row[9]);const collected=Date.parse(row[10]);
  const taipeiDate=(instant)=>new Date(instant+8*60*60*1000).toISOString().slice(0,10);
  const periodEnd=String(row[3]);
  const cutoffMs=cutoff?Date.parse(cutoff):null;
  return Number.isFinite(published)&&Number.isFinite(source)&&Number.isFinite(collected)
    &&periodEnd<=taipeiDate(published)&&periodEnd<=taipeiDate(source)
    &&(!cutoff||periodEnd<=taipeiDate(Date.parse(cutoff)))
    // sourceCutoff is the point-in-time information boundary, not the wall-clock
    // acquisition finish.  A live run necessarily collects the response after its
    // scheduled cutoff.  Guard look-ahead with the filing/source timestamps while
    // retaining source <= collected provenance ordering.
    &&published<=source&&source<=collected&&(!cutoff||source<=cutoffMs)
    &&typeof row[12]==='string'&&row[12].length>0;
}

function valuationFactInput(rows, sourceCutoff = null) {
  const cutoffDate=sourceCutoff&&Number.isFinite(Date.parse(sourceCutoff))
    ?new Date(Date.parse(sourceCutoff)+8*60*60*1000).toISOString().slice(0,10):null;
  if(cutoffDate&&(rows??[]).some((row)=>Array.isArray(row)&&VALUATION_FLOW_KEYS.includes(row[1])
    &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row[3]))&&String(row[3])>cutoffDate)) {
    return {missingFacts:[...VALUATION_FLOW_KEYS],periodReadiness:'future_reported_period_rejected',sourceRefs:[]};
  }
  const resolved=selectOfficialFactHeads(rows,sourceCutoff);
  if(resolved.conflicts.length)return {authorityConflict:'authority_conflict',conflictingFacts:resolved.conflicts,
    missingFacts:[],periodReadiness:'conflicting_point_in_time_fact',sourceRefs:[]};
  const accepted=resolved.rows;
  const commonBridge=alignedQuarterSeries(accepted,VALUATION_BRIDGE_KEYS,4);
  const ttm=commonBridge?Object.fromEntries(VALUATION_BRIDGE_KEYS.map((key)=>{
    const selected=commonBridge.byKey[key];
    const value=key==='diluted_weighted_average_shares'
      ?selected.reduce((sum,row)=>sum+row.value*row.days,0)/selected.reduce((sum,row)=>sum+row.days,0)
      :selected.reduce((sum,row)=>sum+row.value,0);
    return [key,{value,rows:selected.map((row)=>row.row),quarters:commonBridge.quarters,discrete:selected}];
  })):Object.fromEntries(VALUATION_BRIDGE_KEYS.map((key)=>[key,null]));
  const reportedEpsByPeriod=new Map(accepted.filter((row)=>row[1]==='quarterly_diluted_eps')
    .map((row)=>[row[3],row]));
  const reportedShares=fourQuarterFlow(accepted,'diluted_weighted_average_shares');
  const attributableByPeriod=new Map(accepted.filter((row)=>row[1]==='quarterly_net_income_attributable_to_common')
    .map((row)=>[row[3],row]));
  const impliedShareRows=[...reportedEpsByPeriod].flatMap(([period,reported])=>{
    const attributable=attributableByPeriod.get(period);
    const income=Number(attributable?.[5]);const eps=Number(reported?.[5]);
    if(!reported||!Number.isFinite(income)||!Number.isFinite(eps)||Math.abs(eps)<.005
      ||Math.sign(income)!==Math.sign(eps))return [];
    const shares=income/eps;if(!Number.isFinite(shares)||shares<=0)return [];
    const sourceRef=`${reported[12]}#implied-diluted-shares:${sha256(canonicalJson([
      attributable[12],reported[12],period,income,eps]))}`;
    return [[reported[0],'diluted_weighted_average_shares',reported[2],reported[3],'quarterly',shares,'share',
      'official_filing',reported[8],reported[9],reported[10],reported[11],sourceRef,null,'reported','reported_period']];
  });
  const impliedShares=reportedShares??fourQuarterFlow(impliedShareRows,'diluted_weighted_average_shares');
  ttm.diluted_weighted_average_shares=impliedShares;
  const epsBridge=commonBridge?commonBridge.quarters.map((period,index)=>{
    const reported=reportedEpsByPeriod.get(commonBridge.byKey.quarterly_revenue[index].row[3]);
    const attributable=commonBridge.byKey.quarterly_net_income_attributable_to_common[index];
    const shareSeries=reportedShares?.discrete??impliedShares?.discrete??[];
    const shares=shareSeries.find((row)=>row.quarter===period);
    return reported&&shares?.value>0?{reported,sharesValue:shares.value,
      reportedExpected:Number(attributable.row[5])/Number(shares.row[5]),
      derived:Number(attributable.value)/Number(shares.value),period}:null;
  }):[];
  ttm.quarterly_diluted_eps=epsBridge.length===4&&epsBridge.every(Boolean)
    ?{value:ttm.quarterly_net_income_attributable_to_common.value/ttm.diluted_weighted_average_shares.value,
      rows:epsBridge.map((row)=>row.reported),quarters:commonBridge.quarters,discrete:epsBridge}:null;
  const attributable=ttm.quarterly_net_income_attributable_to_common;
  const dilutedSharesAuthority=ttm.diluted_weighted_average_shares;
  const latest=legacyFactInput([...accepted].sort((left,right)=>String(right[3]).localeCompare(String(left[3]))
    ||String(right[9]).localeCompare(String(left[9]))||String(left[12]).localeCompare(String(right[12]))));
  const ebitda=fourQuarterFlow(accepted,'quarterly_ebitda');
  const depreciationAmortization=fourQuarterFlow(accepted,'depreciation_amortization');
  const cycleRows=discreteQuarterSeries(accepted,'quarterly_net_income_attributable_to_common',12);
  const roeHistory=accepted.filter((row)=>row[1]==='roe'&&Number.isFinite(row[5]))
    .sort((left,right)=>String(left[3]).localeCompare(String(right[3]))).slice(-8).map((row)=>Number(row[5]));
  const monthlyRevenueHistory=accepted.filter((row)=>row[1]==='monthly_revenue'&&Number.isFinite(row[5]))
    .sort((left,right)=>String(left[3]).localeCompare(String(right[3]))).slice(-18).map((row)=>Number(row[5]));
  const netHistory=alignedQuarterSeries(accepted,['quarterly_revenue','quarterly_net_income_attributable_to_common'],8);
  const ebitdaHistory=alignedQuarterSeries(accepted,['quarterly_revenue','quarterly_ebitda'],8);
  const quarterlyRevenueHistory=(netHistory?.byKey.quarterly_revenue??[]).map((row)=>row.value);
  const quarterlyNetIncomeRevenueHistory=(netHistory?.byKey.quarterly_revenue??[]).map((row)=>row.value);
  const quarterlyNetIncomeHistory=(netHistory?.byKey.quarterly_net_income_attributable_to_common??[]).map((row)=>row.value);
  const quarterlyEbitdaRevenueHistory=(ebitdaHistory?.byKey.quarterly_revenue??[]).map((row)=>row.value);
  const quarterlyEbitdaHistory=(ebitdaHistory?.byKey.quarterly_ebitda??[]).map((row)=>row.value);
  const bookValueHistory=accepted.filter((row)=>row[1]==='book_value_per_share'&&Number.isFinite(row[5]))
    .sort((left,right)=>String(left[3]).localeCompare(String(right[3]))).slice(-9).map((row)=>Number(row[5]));
  const currentAnchorSourceTimestamps=Object.fromEntries([...Map.groupBy(accepted,(row)=>row[1])]
    .map(([key,members])=>[key,[...members].sort((left,right)=>String(right[3]).localeCompare(String(left[3]))
      ||String(right[9]).localeCompare(String(left[9])))[0]?.[9]??null]));
  if(!currentAnchorSourceTimestamps.roe) {
    const derived=[currentAnchorSourceTimestamps.quarterly_net_income_attributable_to_common,
      currentAnchorSourceTimestamps.total_equity].filter((value)=>Number.isFinite(Date.parse(value)));
    if(derived.length===2)currentAnchorSourceTimestamps.roe=derived.sort()[0];
  }
  if(!currentAnchorSourceTimestamps.diluted_weighted_average_shares&&impliedShares) {
    const derived=[currentAnchorSourceTimestamps.quarterly_net_income_attributable_to_common,
      currentAnchorSourceTimestamps.quarterly_diluted_eps].filter((value)=>Number.isFinite(Date.parse(value)));
    if(derived.length===2)currentAnchorSourceTimestamps.diluted_weighted_average_shares=derived.sort()[0];
  }
  const balances=Object.fromEntries(VALUATION_BALANCE_KEYS.map((key)=>[key,accepted.filter((row)=>row[1]===key)
    .sort((left,right)=>String(left[3]).localeCompare(String(right[3]))).at(-1)]));
  const missingFlows=VALUATION_FLOW_KEYS.filter((key)=>!ttm[key]);
  const missingBalances=VALUATION_BALANCE_KEYS.filter((key)=>!balances[key]);
  if(missingFlows.length||!commonBridge||!dilutedSharesAuthority
    ||!Number.isFinite(dilutedSharesAuthority.value)||dilutedSharesAuthority.value<=0) {
    const dilutedShares=Number.isFinite(dilutedSharesAuthority?.value)?dilutedSharesAuthority.value:null;
    const equity=balances.total_equity?.[5];
    return { bookValue:latest.bookValue,nav:latest.nav,ebitda:ebitda?.value,depreciationAmortization:depreciationAmortization?.value,
      cash:latest.cash,totalDebt:latest.totalDebt,netDebt:latest.netDebt,roe:latest.roe,
      revenue:ttm.quarterly_revenue?.value,grossProfit:ttm.quarterly_gross_profit?.value,
      netIncome:attributable?.value,dilutedShares,
      roe:Number.isFinite(latest.roe)?latest.roe:Number.isFinite(attributable?.value)&&equity>0?attributable.value/equity*100:null,
      roeHistory,monthlyRevenueHistory,quarterlyRevenueHistory,quarterlyNetIncomeRevenueHistory,
      quarterlyNetIncomeHistory,quarterlyEbitdaRevenueHistory,quarterlyEbitdaHistory,
      bookValueHistory,currentAnchorSourceTimestamps,
      cycleHistory:cycleRows.map((row)=>Number.isFinite(dilutedShares)&&dilutedShares>0?row.value/dilutedShares*4:null),
      missingFacts:[...missingFlows,...missingBalances],periodReadiness:'missing_complete_official_bridge',sourceRows:accepted };
  }
  const dilutedShares=dilutedSharesAuthority.value;
  const presentBalances=Object.values(balances).filter(Boolean);
  const balancePeriod=new Set(presentBalances.map((row)=>row[3]));
  const reconciliationFailures=commonBridge.quarters.flatMap((quarter,index)=>{
    const at=(key)=>commonBridge.byKey[key][index].value;
    // Published IFRS statements can include issuer-specific "other operating"
    // rows that are not present in the closed common-key schema.  Preserve the
    // direct official operating-income fact and allow only a bounded 2% revenue
    // residual; larger gaps still fail as an accounting conflict.
    const tolerance=Math.max(1,Math.abs(at('quarterly_revenue'))*.02);
    const eps=epsBridge[index];
    const epsTolerance=Math.max(.01,Math.abs(eps?.reported?.[5]??0)*1e-4);
    return [
      ['gross_profit_bridge',Math.abs(at('quarterly_gross_profit')-at('quarterly_operating_expense')
        -at('quarterly_operating_income'))>tolerance],
      ['operating_to_pretax_bridge',Math.abs(at('quarterly_operating_income')
        +at('quarterly_non_operating_income')-at('quarterly_pretax_income'))>tolerance],
      ['tax_bridge',Math.abs(at('quarterly_pretax_income')-at('quarterly_income_tax_expense')
        -at('quarterly_net_income'))>tolerance],
      ['attribution_bridge',Math.abs(at('quarterly_net_income')-at('quarterly_noncontrolling_interest')
        -at('quarterly_net_income_attributable_to_common'))>tolerance],
      ['diluted_share_bridge',!(eps?.sharesValue>0)],
      ['reported_eps_bridge',!eps||Math.abs(eps.reportedExpected-Number(eps.reported[5]))>epsTolerance],
      ['derived_eps_bridge',!eps||Math.abs(eps.derived-at('quarterly_net_income_attributable_to_common')
        /eps.sharesValue)>Math.max(Number.EPSILON,Math.abs(eps.derived)*1e-10)],
    ].filter(([,failed])=>failed).map(([code])=>`${quarter}:${code}`);
  });
  const latestBridgePeriod=commonBridge.byKey.quarterly_revenue.at(-1).row[3];
  const balanceTolerance=Math.max(1,Math.abs(ttm.quarterly_revenue.value)*1e-8);
  const completeBalances=missingBalances.length===0;
  if(!Number.isFinite(dilutedShares)||dilutedShares<=0||reconciliationFailures.length>0
    ||completeBalances&&(balancePeriod.size!==1||[...balancePeriod][0]!==latestBridgePeriod
      ||balances.total_assets[5]+balanceTolerance<balances.total_equity[5]
      ||balances.total_assets[5]+balanceTolerance<balances.cash_and_equivalents[5])) {
    return { missingFacts:[],periodReadiness:'official_bridge_reconciliation_conflict',
      reconciliationFailures:reconciliationFailures.slice(0,12) };
  }
  const resolvedDepreciation=depreciationAmortization?.value??(Number.isFinite(ebitda?.value)
    ?ebitda.value-ttm.quarterly_operating_income.value:null);
  return { revenue:ttm.quarterly_revenue.value,grossProfit:ttm.quarterly_gross_profit.value,
    operatingIncome:ttm.quarterly_operating_income.value,pretaxIncome:ttm.quarterly_pretax_income.value,
    nonOperatingIncome:ttm.quarterly_non_operating_income.value,incomeTaxExpense:ttm.quarterly_income_tax_expense.value,
    totalNetIncome:ttm.quarterly_net_income.value,netIncome:attributable.value,dilutedShares,
    bookValue:balances.book_value_per_share?.[5]??latest.bookValue,nav:latest.nav,ebitda:ebitda?.value,
    depreciationAmortization:resolvedDepreciation,cash:balances.cash_and_equivalents?.[5]??null,
    totalAssets:balances.total_assets?.[5]??null,totalEquity:balances.total_equity?.[5]??null,
    totalDebt:balances.total_debt?.[5]??null,
    netDebt:Number.isFinite(balances.total_debt?.[5])&&Number.isFinite(balances.cash_and_equivalents?.[5])
      ?balances.total_debt[5]-balances.cash_and_equivalents[5]:null,
    roe:Number.isFinite(balances.total_equity?.[5])&&balances.total_equity[5]>0
      ?attributable.value/balances.total_equity[5]*100:latest.roe,
    roeHistory,monthlyRevenueHistory,
    quarterlyRevenueHistory,quarterlyNetIncomeRevenueHistory,quarterlyNetIncomeHistory,
    quarterlyEbitdaRevenueHistory,quarterlyEbitdaHistory,bookValueHistory,
    currentAnchorSourceTimestamps,missingFacts:missingBalances,
    dilutedSharesAuthority:reportedShares?'reported_official_fact':'implied_from_official_eps',
    bridgeQuarterPeriods:commonBridge.byKey.quarterly_revenue.map((row)=>row.row[3]),
    cycleHistory:cycleRows.map((row)=>row.value/dilutedShares*4),periodReadiness:'ttm_from_four_official_quarters',sourceRows:accepted,
    sourceRefs:[...new Set(accepted.map((row)=>row[12]).filter(Boolean))],
  };
}

function persistedOfficialSnapshot(bundle, acquisition, candidateIdentities = []) {
  const hasFinite=(value)=>value!==null&&value!==''&&Number.isFinite(Number(value));
  const persistedReportedRows = (bundle.reportedPeRows ?? []).filter((row)=>Array.isArray(row) && row.length>=12
    && /^\d{4}$/u.test(String(row[0])) && (hasFinite(row[5])
      || row.length>=13&&hasFinite(row[6]) || row[18]==='authority_conflict'));
  const normalized = persistedReportedRows.map((row)=>{const v313=row.length>=13;const conflict=v313&&row[18]==='authority_conflict';
    const nullable=(value)=>value===null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
    const nullableText=(value)=>value===null||value===undefined||value===''?null:String(value);
    return { symbol:String(row[0]),sector:String(row[1] ?? 'unknown'),
    exchange:String(row[2]),canonicalSector:String(row[1]??'unknown'),session:String(row[3]),close:Number(row[4]),peRatio:nullable(row[5]),pbRatio:v313?nullable(row[6]):null,
    publishedAt:conflict?null:nullableText(row[v313?7:6]),sourceTimestamp:conflict?null:nullableText(row[v313?8:7]),
    collectedAt:conflict?null:nullableText(row[v313?9:8]),sourceRef:conflict?null:nullableText(row[v313?10:9]),
    stockId:String(row[v313?11:10] ?? ''),
    tradingSessionAuthorityHash:String(row[v313?12:11] ?? ''),
    evSalesRatio:v313?nullable(row[13]):null,evEbitdaRatio:v313?nullable(row[14]):null,
    navMultiple:v313?nullable(row[15]):null,sharesOutstanding:v313?nullable(row[17]):null,
    authorityConflict:conflict?'authority_conflict':null,
    metricSources:v313&&Array.isArray(row[16])?Object.fromEntries(row[16]
      .filter((entry)=>Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string')
      .map((entry)=>[String(entry[0]),{sourceRef:String(entry[1]),asOf:entry[2]?String(entry[2]):null}])):{},
    metricSourceRefs:v313&&Array.isArray(row[16])?row[16]
      .filter((entry)=>Array.isArray(entry)&&typeof entry[1]==='string').map((entry)=>String(entry[1])):[],
    sourceUrl:String(row[2])==='TWSE'?SOURCE_URL:TPEX_SOURCE_URL,
    authority:'exchange_reported_history' };});
  const identityBySymbol=new Map((candidateIdentities??[]).filter((row)=>row&&typeof row.symbol==='string')
    .map((row)=>[row.symbol,row]));
  const calendarIdentity=new Map((acquisition?.calendarSessions??[]).filter((row)=>row&&typeof row.session==='string')
    .map((row)=>[`${row.market}:${row.session}`,row]));
  const acquiredValuationRows=(acquisition?.valuations??[]).filter((row)=>row&&typeof row==='object'
    &&/^\d{4}$/u.test(String(row.symbol))&&['TWSE','TPEX'].includes(String(row.exchange))
    &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session))).map((row)=>{
      const identity=identityBySymbol.get(String(row.symbol));
      const calendar=calendarIdentity.get(`${row.exchange}:${row.session}`);
      return {...row,stockId:String(identity?.stockId??''),sector:String(identity?.canonicalSector??row.canonicalSector??'unknown'),
        canonicalSector:String(identity?.canonicalSector??row.canonicalSector??'unknown'),
        tradingSessionAuthorityHash:calendar?sha256(canonicalJson([calendar.market,calendar.session,calendar.sourceRef,calendar.sourceSha256])):'',
        // `collectedAt` documents when this worker observed the response; it is
        // never substituted for the exchange's point-in-time source clock.
        publishedAt:row.sourceTimestamp??null,sourceTimestamp:row.sourceTimestamp??null,
        metricSources:{},metricSourceRefs:[],authority:'exchange_reported',inlineAcquisition:true};
    });
  const reportedRows=[...normalized,...acquiredValuationRows];
  const latestSessionByExchange=new Map();
  for(const row of reportedRows) if(!latestSessionByExchange.has(row.exchange)
    ||row.session>latestSessionByExchange.get(row.exchange))latestSessionByExchange.set(row.exchange,row.session);
  const valuations = reportedRows.filter((row)=>row.session===latestSessionByExchange.get(row.exchange))
    .map((row)=>({ ...row,authority:'exchange_reported' }));
  const valuationHistory = reportedRows.filter((row)=>row.session!==latestSessionByExchange.get(row.exchange));
  const persistedRevenues = (bundle.legacyRevenueRows ?? []).filter((row)=>Array.isArray(row) && row.length>=8)
    .map((row)=>({ symbol:String(row[0]),asOf:String(row[1]),monthlyRevenue:Number(row[2]),
      yoyGrowth:Number(row[3]),momGrowth:Number(row[4]),sourceUrl:String(row[5]),collectedAt:String(row[6]),
      sourceRef:String(row[7]),authority:'exchange_reported' }))
    .filter((row)=>Number.isFinite(row.monthlyRevenue)
      && Date.parse(row.filingPublishedAt??row.asOf)<=Date.parse(bundle.sourceCutoff)
      && Date.parse(row.sourceTimestamp??row.asOf)<=Date.parse(bundle.sourceCutoff));
  const acquiredRevenues=(acquisition?.revenues??[]).filter((row)=>row&&typeof row==='object'
    &&/^\d{4}$/u.test(String(row.symbol))&&Number.isFinite(Number(row.monthlyRevenue)));
  const revenues=[...persistedRevenues,...acquiredRevenues];
  const persistedTwseIndex = (bundle.benchmarkRows ?? []).filter(Array.isArray)
    .map((row)=>({ session:String(row[0]),close:Number(row[1]) })).filter((row)=>Number.isFinite(row.close));
  const twseIndex=(acquisition?.twseIndex?.length??0)>=122?acquisition.twseIndex:persistedTwseIndex;
  const persistedFinancialFacts=(bundle.financialRows??[]).filter((row)=>Array.isArray(row)&&row.length>=13)
    .map((row)=>({symbol:String(row[0]),factKey:String(row[1]),periodStart:row[2]===null?null:String(row[2]),
      periodEnd:String(row[3]),durationKind:String(row[4]),value:Number(row[5]),unit:String(row[6]),
      authorityTier:String(row[7]),filingPublishedAt:String(row[8]),sourceTimestamp:String(row[9]),
      collectedAt:String(row[10]),sourceRef:String(row[12])})).filter((row)=>Number.isFinite(row.value));
  const financialFacts=[...persistedFinancialFacts,...(acquisition?.financialFacts??[]).filter((row)=>row&&typeof row==='object'
    &&/^\d{4}$/u.test(String(row.symbol))&&Number.isFinite(Number(row.value)))];
  const persistedPriceObservations=(bundle.priceRows??[]).filter((row)=>Array.isArray(row)&&row.length>=9&&Array.isArray(row[8]))
    .map((row)=>({symbol:String(row[0]),session:String(row[1]),open:Number(row[2]),high:Number(row[3]),
      low:Number(row[4]),close:Number(row[5]),volume:Number(row[6]),adjustmentEvidenceRef:String(row[7]),
      adjustmentEvidence:row[8],turnoverTwd:Number.isFinite(Number(row[9]))?Number(row[9]):null,
      exchange:String(row[8]?.[3]??'').startsWith('twse-')?'TWSE'
        :String(row[8]?.[3]??'').startsWith('tpex-')?'TPEX':'',rawSourceRef:String(row[8]?.[3]??''),
      rawSourceUrl:String(row[8]?.[3]??'').startsWith('twse-')?TWSE_PRICE_HISTORY_URL:TPEX_PRICE_HISTORY_URL}))
    .filter((row)=>['TWSE','TPEX'].includes(row.exchange)&&Number.isFinite(row.close));
  const priceObservations=[...persistedPriceObservations,...(acquisition?.priceObservations??[]).filter((row)=>row&&typeof row==='object'
    &&/^\d{4}$/u.test(String(row.symbol))&&['TWSE','TPEX'].includes(String(row.exchange))&&Number.isFinite(Number(row.close)))];
  return { schema:'official-tw-market-decision-snapshot-v1',cutoff:bundle.sourceCutoff,
    valuations,valuationHistory,reportedRows,revenues,financialFacts,priceObservations,
    twseIndex,tpexIndex:acquisition?.tpexIndex??[],foreignFlow:acquisition?.foreignFlow??null,
    sourceFailures:acquisition?.sourceFailures ?? [] };
}

function valuationAuthorityInput(candidate, factRows, officialSnapshot, sourceCutoff) {
  if(!candidate?.canonicalSector||candidate.canonicalSector==='unknown')return {};
  const cutoffMs=Date.parse(sourceCutoff);
  const authoritativeRows=(officialSnapshot?.reportedRows??[]).filter((row)=>row.stockId
    &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session))&&Date.parse(row.session)<=cutoffMs
    &&/^[0-9a-f]{64}$/u.test(row.tradingSessionAuthorityHash??'')
    &&(row.authorityConflict==='authority_conflict'||(
      Number.isFinite(Date.parse(row.publishedAt))&&Date.parse(row.publishedAt)<=cutoffMs
      &&Number.isFinite(Date.parse(row.sourceTimestamp))&&Date.parse(row.sourceTimestamp)<=cutoffMs
      &&Number.isFinite(Date.parse(row.collectedAt))&&Date.parse(row.sourceTimestamp)<=Date.parse(row.collectedAt)
      &&typeof row.sourceRef==='string'&&row.sourceRef.length>0)));
  const collapseRows=(rows,keyOf)=>[...Map.groupBy(rows,keyOf)].map(([,members])=>{
    const ordered=[...members].sort((left,right)=>String(right.sourceTimestamp??'').localeCompare(String(left.sourceTimestamp??''))
      ||String(left.sourceRef??'').localeCompare(String(right.sourceRef??'')));
    const valueFields=['close','peRatio','pbRatio','evSalesRatio','evEbitdaRatio','navMultiple','sharesOutstanding'];
    const conflicting=members.some((row)=>row.authorityConflict==='authority_conflict')||valueFields.some((field)=>
      new Set(members.map((row)=>row[field]).filter((value)=>value!==null&&value!==undefined&&Number.isFinite(Number(value)))
        .map(Number)).size>1);
    if(conflicting)return { ...ordered[0],close:null,peRatio:null,pbRatio:null,evSalesRatio:null,
      evEbitdaRatio:null,navMultiple:null,sharesOutstanding:null,publishedAt:null,sourceTimestamp:null,
      collectedAt:null,sourceRef:null,metricSourceRefs:[],authorityConflict:'authority_conflict' };
    const merged={ ...ordered[0] };
    for(const field of valueFields) {
      const present=members.map((row)=>row[field]).find((value)=>value!==null&&value!==undefined);
      if(present!==undefined)merged[field]=present;
    }
    merged.metricSourceRefs=[...new Set(members.flatMap((row)=>row.metricSourceRefs??[]))].sort();
    return merged;
  });
  const own=collapseRows(authoritativeRows.filter((row)=>row.stockId===candidate.stockId),
    (row)=>`${row.exchange}|${row.session}`)
    .sort((left,right)=>left.session.localeCompare(right.session));
  if(own.some((row)=>row.authorityConflict==='authority_conflict'))return {
    authorityConflict:'authority_conflict',requireCompleteOfficialBridge:true,
  };
  const current=own.at(-1);
  const authoritySector=current?.sector;
  const ownExchanges=new Set(own.map((row)=>row.exchange));
  if(!current||ownExchanges.size!==1||!authoritySector||authoritySector==='unknown'
    ||authoritySector!==candidate.canonicalSector)return {};
  const peers=collapseRows(authoritativeRows.filter((row)=>row.stockId!==candidate.stockId
    &&row.exchange===current.exchange&&row.sector===authoritySector&&row.session===current.session),
  (row)=>`${row.exchange}|${row.stockId}`);
  if(peers.some((row)=>row.authorityConflict==='authority_conflict'))return {
    authorityConflict:'authority_conflict',requireCompleteOfficialBridge:true,
  };
  const facts=valuationFactInput(factRows,sourceCutoff);
  if(facts.authorityConflict==='authority_conflict')return {authorityConflict:'authority_conflict',requireCompleteOfficialBridge:true};
  const selectedMethod=selectSectorValuationMethod({...facts,sector:authoritySector});
  const method=selectedMethod.availability==='available'?selectedMethod.method:null;
  const metric=(row,selectedMethod=method)=>['pb_roe','residual_income'].includes(selectedMethod)?row.pbRatio:selectedMethod==='nav'?row.navMultiple:
    selectedMethod==='ev_sales'?row.evSalesRatio:selectedMethod==='ev_ebitda'?row.evEbitdaRatio:row.peRatio;
  const metricFactKey=(selectedMethod)=>({ev_sales:'ev_sales_multiple',ev_ebitda:'ev_ebitda_multiple',nav:'net_asset_value'}[selectedMethod]??null);
  const metricSource=(row,selectedMethod=method)=>{
    const factKey=metricFactKey(selectedMethod);
    return factKey?row.metricSources?.[factKey]?.sourceRef??null:row.sourceRef;
  };
  const currentMethodRows=own.filter((row)=>Number.isFinite(metric(row))&&metric(row)>0&&metricSource(row));
  const peerMethodRows=peers.filter((row)=>Number.isFinite(metric(row))&&metric(row)>0&&metricSource(row));
  const rows=[...currentMethodRows,...peerMethodRows]
    .map((row)=>({ stockId:row.stockId,sector:row.sector,authority:'official',
      value:metric(row),method,asOf:row.session,close:row.close,sharesOutstanding:row.sharesOutstanding,
      exchange:row.exchange,publishedAt:row.publishedAt,sourceTimestamp:row.sourceTimestamp,collectedAt:row.collectedAt,
      tradingSessionAuthorityHash:row.tradingSessionAuthorityHash,
      sourceRef:metricSource(row) }));
  const roster=[...new Map([current,...peers].map((row)=>[row.stockId,
    { stockId:row.stockId,sector:row.sector,active:true }])).values()];
  const multiples=peerMethodRows
    .map((row)=>({ stockId:row.stockId,sector:row.sector,method,value:metric(row),
    asOf:row.session,sourceRef:metricSource(row) }));
  // Do not pass `metric` directly to Array#map: the callback index would be
  // interpreted as the optional method override and silently select PE.
  const orderedOwn=currentMethodRows.map((row)=>metric(row)).sort((a,b)=>a-b);
  const orderedPeers=peerMethodRows.map((row)=>metric(row)).sort((a,b)=>a-b);
  const scenarioSource=`${metricSource(current)??current.sourceRef}#history:${candidate.symbol}:${orderedOwn.length}`;
  const formulaOnly=['nav','residual_income'].includes(method);
  const blendedScenarios=(history,population,sourceRef)=>{
    if(history.length<252||population.length<8)return null;
    const winsor=(values)=>{const ordered=[...values].sort((a,b)=>a-b);const low=percentile(ordered,.1),high=percentile(ordered,.9);
      return ordered.map((value)=>Math.max(low,Math.min(high,value)));};
    const historyValues=winsor(history);const peerValues=winsor(population);
    return Object.freeze(Object.fromEntries([['bear',.1],['base',.5],['bull',.9]].map(([name,quantile])=>{
      const ownValue=historyValues?percentile(historyValues,quantile):null;
      const peerValue=peerValues?percentile(peerValues,quantile):null;
      const multiple=0.6*ownValue+0.4*peerValue;
      return [name,{multiple,asOf:current.session,sourceRef}];
    })));
  };
  const scenarios=formulaOnly?null:blendedScenarios(orderedOwn,orderedPeers,scenarioSource);
  const mandatoryCrossMethod=method==='normalized_pe'?'ev_ebitda':method==='residual_income'?'pb_roe':null;
  const crossMetric=(row)=>metric(row,mandatoryCrossMethod);
  const crossOwn=mandatoryCrossMethod?own.filter((row)=>Number.isFinite(crossMetric(row))&&crossMetric(row)>0
    &&metricSource(row,mandatoryCrossMethod)).map(crossMetric).sort((a,b)=>a-b):[];
  const crossPeers=mandatoryCrossMethod?peers.filter((row)=>Number.isFinite(crossMetric(row))&&crossMetric(row)>0
    &&metricSource(row,mandatoryCrossMethod)).map(crossMetric).sort((a,b)=>a-b):[];
  const crossScenarios=mandatoryCrossMethod?blendedScenarios(crossOwn,crossPeers,
    `${metricSource(current,mandatoryCrossMethod)??current.sourceRef}#cross-check:${mandatoryCrossMethod}:${candidate.symbol}`):null;
  const crossCheck=mandatoryCrossMethod&&crossScenarios?Object.freeze({method:mandatoryCrossMethod,scenarios:crossScenarios}):null;
  const primaryFactKey={nav:'net_asset_value',residual_income:'book_value_per_share',pb_roe:'book_value_per_share',
    normalized_pe:'quarterly_net_income_attributable_to_common',pe:'quarterly_diluted_eps',
    ev_ebitda:'quarterly_ebitda',ev_sales:'quarterly_revenue'}[method];
  const evidence=(facts.sourceRows??[]).filter((row)=>Array.isArray(row)&&typeof row[12]==='string'&&row[12].length>0
    && Number.isFinite(Date.parse(row[8]))&&Date.parse(row[8])<=Date.parse(sourceCutoff))
    .map((row)=>({ stockId:candidate.stockId,companySpecific:true,publishedAt:String(row[8]),sourceRef:String(row[12]),
      factKey:String(row[1]),periodEnd:String(row[3]) }))
    .sort((left,right)=>Number(right.factKey===primaryFactKey)-Number(left.factKey===primaryFactKey)
      ||right.periodEnd.localeCompare(left.periodEnd)||left.sourceRef.localeCompare(right.sourceRef));
  const sectorMedian=orderedPeers.length>=8?median(orderedPeers):null;
  const subjectReference=Number.isFinite(metric(current))?metric(current):orderedOwn.length?median(orderedOwn):null;
  const crossCheckScore=Number.isFinite(sectorMedian)&&Number.isFinite(subjectReference)
    ?Math.max(0,100-100*Math.abs(sectorMedian-subjectReference)/Math.max(Math.abs(sectorMedian),Math.abs(subjectReference),1)):null;
  const primaryAuthorityReady=orderedOwn.length>=252&&orderedPeers.length>=8&&currentMethodRows.at(-1)?.session===current.session;
  const crossAuthorityReady=!mandatoryCrossMethod||(crossOwn.length>=252&&crossPeers.length>=8);
  return { rows,roster,multiples,scenarios,evidence,minimumPeers:8,requireCompleteOfficialBridge:true,
    cycleHistory:facts.cycleHistory??[],crossCheck,
    methodAuthority:Object.freeze({availability:primaryAuthorityReady&&crossAuthorityReady?'available':'missing',method,
      ownSessionCount:orderedOwn.length,peerCount:orderedPeers.length,crossOwnSessionCount:crossOwn.length,
      crossPeerCount:crossPeers.length,asOf:current.session,exchange:current.exchange,sector:authoritySector,
      primarySourceRef:metricSource(current),crossSourceRef:mandatoryCrossMethod?metricSource(current,mandatoryCrossMethod):null}),
    tradingSessionAuthorityHash:current.tradingSessionAuthorityHash,
    valuationScores:{ scenarioBridgeScore:method&&facts.periodReadiness==='ttm_from_four_official_quarters'?100:null,
      capitalStructureScore:method==='nav'?Number.isFinite(facts.nav)&&facts.dilutedShares>0?100:null
        :method==='residual_income'?facts.bookValue>0&&facts.roeHistory?.length>=8?100:null
          :Number.isFinite(facts.cash)&&Number.isFinite(facts.totalDebt)?100:null,crossCheckScore },
  };
}

function researchHistory(rows, symbol) {
  return (rows ?? []).filter((row) => Array.isArray(row) && row[0] === symbol && Number.isFinite(Number(row[5])))
    .map((row) => ({ session: String(row[1]),open:Number(row[2]),high:Number(row[3]),low:Number(row[4]),
      close:Number(row[5]),volume:Number(row[6]),sourceRef:typeof row[7]==='string'?row[7]:null }))
    .filter((row) => Number.isFinite(Date.parse(row.session)) && row.close > 0)
    .sort((left, right) => left.session.localeCompare(right.session))
    .filter((row, index, all) => index === 0 || row.session !== all[index - 1].session)
    .slice(-130);
}

function officialPriceRowsForResearch(snapshot) {
  return (snapshot?.priceObservations ?? []).filter((row)=>row&&typeof row==='object'
    &&/^\d{4}$/u.test(String(row.symbol))&&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session))
    &&[row.open,row.high,row.low,row.close,row.volume].every((value)=>Number.isFinite(Number(value))))
    .map((row)=>[String(row.symbol),String(row.session),Number(row.open),Number(row.high),Number(row.low),
      Number(row.close),Number(row.volume),typeof row.rawSourceRef==='string'?row.rawSourceRef:row.sourceRef??null]);
}

// The frozen official envelope is authoritative for this run before it is
// persisted. Convert its immutable fact records to the same closed row shape
// used by the valuation and quality bridges, preserving the provider's actual
// published/source/collection timestamps. This lets a first run evaluate its
// own frozen input without pretending a later retry knew it at the cutoff.
function officialFactRowsForDecision(snapshot, symbol) {
  return (snapshot?.financialFacts ?? []).filter((row)=>row&&typeof row==='object'
    &&String(row.symbol)===String(symbol)&&typeof row.sourceRef==='string'&&row.sourceRef.length>0)
    .map((row)=>[String(row.symbol),String(row.factKey),row.periodStart===null||row.periodStart===undefined?null:String(row.periodStart),
      String(row.periodEnd),String(row.durationKind),Number(row.value),String(row.unit),String(row.authorityTier),
      String(row.filingPublishedAt),String(row.sourceTimestamp),String(row.collectedAt),
      row.filingRestatementId??null,String(row.sourceRef),row.filingRestatementId??null,
      row.estimateKind??'reported',row.estimateHorizon??'reported_period'])
    .filter((row)=>Number.isFinite(row[5])&&row[7]==='official_filing');
}

function officialLiquidityScore(candidate, snapshot) {
  const rows=(snapshot?.priceObservations ?? []).filter((row)=>row?.symbol===candidate?.symbol
    &&Number.isFinite(Number(row.close))&&Number.isFinite(Number(row.volume))&&Number(row.volume)>=0)
    .sort((left,right)=>String(left.session).localeCompare(String(right.session))).slice(-20);
  if(rows.length<20)return null;
  const validSessions=rows.filter((row)=>Number(row.volume)>0&&Number(row.close)>0);
  if(validSessions.length<18)return null;
  const turnovers=validSessions.map((row)=>Number.isFinite(Number(row.turnoverTwd))
    ?Number(row.turnoverTwd):Number(row.close)*Number(row.volume)).filter((value)=>Number.isFinite(value)&&value>0)
    .sort((left,right)=>left-right);
  if(turnovers.length<18)return null;
  const medianTurnover=turnovers[Math.floor(turnovers.length/2)];
  const score=medianTurnover>=1_000_000_000?100:medianTurnover>=500_000_000?90
    :medianTurnover>=200_000_000?78:medianTurnover>=80_000_000?65:medianTurnover>=20_000_000?50:30;
  return score;
}

const HEARTBEAT_ONLY_KEYS = new Set([
  'asOf','cutoff','sourceCutoff','evaluatedAt','lastEvaluatedAt','publishedAt','nextExpectedAt',
  'contentAsOf','noChangeMessage','analysisGeneratedAt',
]);

function materialDecisionValue(value) {
  if (Array.isArray(value)) return value.map(materialDecisionValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key])=>!HEARTBEAT_ONLY_KEYS.has(key)&&key!=='decisionRevisionId')
    .map(([key,nested])=>[key,materialDecisionValue(nested)]));
}

function clampDecile(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(9, Math.floor(value))) : null;
}

function materialFactRows(facts) {
  return (facts ?? []).filter((row) => Array.isArray(row) && typeof row[1] === 'string'
      && Number.isFinite(row[5]) && typeof row[6] === 'string' && typeof row[9] === 'string')
    .map((row) => [typeof row[12] === 'string' ? row[12] : sha256(canonicalJson(row)), row[1], row[5], row[6],
      canonicalUtc(row[9], 'material fact timestamp')])
    .sort((left, right) => left[1].localeCompare(right[1]) || right[4].localeCompare(left[4])
      || String(left[0]).localeCompare(String(right[0])))
    .filter((row, index, all) => index === 0 || canonicalJson(row) !== canonicalJson(all[index - 1]))
    .slice(0, 128);
}

function materialSourceEvidence(candidate, fundamental, facts) {
  const timestampByRef = new Map((facts ?? []).filter((row) => Array.isArray(row) && typeof row[12] === 'string')
    .map((row) => [row[12], typeof row[9] === 'string' ? row[9] : '']));
  if (typeof candidate?.materialEvidenceHash === 'string') timestampByRef.set(candidate.materialEvidenceHash,
    typeof candidate.claimAsOf === 'string' ? candidate.claimAsOf : '');
  return [...new Set([candidate?.materialEvidenceHash, ...(fundamental?.evidenceRefs ?? [])].filter((value) =>
    typeof value === 'string' && value.length > 0))]
    .sort((left, right) => String(timestampByRef.get(right) ?? '').localeCompare(String(timestampByRef.get(left) ?? ''))
      || left.localeCompare(right)).slice(0, 40);
}

function materialRiskState(candidate, valuation, technical) {
  const reason = String(valuation?.reason ?? '');
  if (candidate?.sourceContradiction === true) return ['risk', 'source_contradiction'];
  if (/bridge_reconciliation_conflict|financial_conflict/u.test(reason)) return ['risk', 'financial_conflict'];
  if (technical?.technicalState === 'invalidated') return ['risk', 'technical_invalidated'];
  if (/conflict|divergence|scenario_order/u.test(reason)) return ['risk', 'valuation_conflict'];
  return ['risk', 'none'];
}

function reportedPeSectorBand(reportedPe) {
  if (reportedPe?.availability !== 'available' || reportedPe.sectorReference?.availability !== 'available'
      || !Number.isFinite(reportedPe.currentValue)) return null;
  if (reportedPe.currentValue <= reportedPe.sectorReference.p25) return 'low';
  if (reportedPe.currentValue >= reportedPe.sectorReference.p75) return 'high';
  return 'normal';
}

function timingRiskStatus(technical, reason) {
  if (!technical?.technicalState) return 'unavailable';
  if (['below_support', 'reclaim_required', 'invalidated'].includes(technical.technicalState)) return 'blocked';
  if (reason === 'bias_observe_only') return 'observe_only';
  return 'eligible';
}

function buildDecisionMaterial({ candidate, facts, fundamental, quality, biasHistory, valuation, valuationInput,
  technical, actionDecision }) {
  const valuationInputHash = sha256(canonicalJson(materialDecisionValue({
    sector: candidate.canonicalSector, facts: valuationFactInput(facts), authority: valuationInput,
    method: valuation?.method ?? null, bridge: valuation?.bridge ?? null, comparable: valuation?.comparable ?? null,
    reportedPe: valuation?.reportedPe ?? null, scenarios: valuation?.scenarios ?? null,
  })));
  const state = technical?.technicalState ?? null;
  const availability = technical?.availability === 'unavailable' || !state ? 'unavailable' : 'available';
  const reportedPercentile = valuation?.reportedPe?.ownReference?.percentile;
  return hashMaterialAnalysisChange({ symbol: candidate.symbol,
    sourceEvidence: materialSourceEvidence(candidate, fundamental, facts),
    facts: materialFactRows(facts),
    priceTrigger: ['price_trigger', availability, state, technical?.trigger?.kind ?? null],
    technical: ['technical', state ?? 'unavailable', Number.isFinite(technical?.plane?.support) ? technical.plane.support : null,
      Number.isFinite(technical?.plane?.resistance) ? technical.plane.resistance : null],
    valuation: ['valuation', valuationInputHash],
    risk: materialRiskState(candidate, valuation, technical),
    factor: ['factor', quality.availability, quality.availableWeight,
      Number.isFinite(quality.score) ? clampDecile(quality.score / 10) : null,
      biasHistory.availability, biasHistory.availability === 'available' ? biasHistory.current.label : null,
      ['decision',actionDecision.action,actionDecision.reason,
        materialDecisionValue(actionDecision.decisionEnvelope)],
      timingRiskStatus(technical, actionDecision.reason), clampDecile(reportedPercentile * 10),
      reportedPeSectorBand(valuation?.reportedPe)],
  });
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
  const breakoutConfirmed = Number.isFinite(high20) && high20 > 0 && current >= high20 * 0.995
    && Number.isFinite(volumeRatio20) && volumeRatio20 >= 1.2
    && Number.isFinite(relativeStrength20Pct) && relativeStrength20Pct > 0;
  const technicalState = bias20Pct <= -3 ? 'reclaim_required'
    : bias20Pct >= 8 || rsi >= 70 ? 'extended'
      : breakoutConfirmed ? 'breakout_confirmed'
        : bias20Pct <= 1.5 ? 'at_support' : 'breakout_pending';
  const timingScore = technicalState === 'reclaim_required' ? 38 : technicalState === 'extended' ? 18
    : technicalState === 'breakout_confirmed' ? 84 : technicalState === 'at_support' ? 76 : 58;
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

function orderedPercentile(values, fraction) {
  const selected = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!selected.length) return null;
  const rank = (selected.length - 1) * fraction;
  const lower = Math.floor(rank); const upper = Math.ceil(rank);
  return lower === upper ? selected[lower] : selected[lower] + (selected[upper] - selected[lower]) * (rank - lower);
}

function validEmbeddedOfficialValuationRef(sourceRef,session,maximumSession){
  const embedded=String(sourceRef??'').match(/:(\d{4}-\d{2}-\d{2}):\d{4}$/u)?.[1];
  if(!embedded||embedded!==session||embedded>maximumSession)return false;
  const parsed=new Date(`${embedded}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===embedded;
}

function valuationResearchAxis(row, sectorReference, historyRows = []) {
  const verified = validateReportedValuation(row);
  if (verified.availability !== 'available') return { score: null, trustworthy: false, reason: verified.reason };
  if(!validEmbeddedOfficialValuationRef(row.sourceRef,row.session,row.session))
    return {score:null,trustworthy:false,reason:'official_valuation_source_ref_date_invalid'};
  if (!Number.isFinite(row.peRatio)) {
    return { score: null, trustworthy: false, reason: 'sector_pe_reference_unavailable', currentPe: row.peRatio,
      currentPb: row.pbRatio, sourceRef: row.sourceRef, asOf: row.session };
  }
  const officialHistory = [...historyRows,row].filter((item) => item?.stockId === row.stockId&&item.exchange===row.exchange
      &&['exchange_reported_history','exchange_reported'].includes(item.authority)
      && item.session <= row.session && Number.isFinite(item.peRatio) && item.peRatio > 0 && item.peRatio <= 200
      && /^[0-9a-f]{64}$/u.test(item.tradingSessionAuthorityHash??'')
      && validOfficialReportedValuationSourceRef(item.exchange,item.sourceRef)
      && validEmbeddedOfficialValuationRef(item.sourceRef,item.session,row.session))
    .sort((left,right)=>left.session.localeCompare(right.session))
    .filter((item,index,all)=>index===0||item.session!==all[index-1].session)
    .slice(-252);
  const historyPes = officialHistory.map((item)=>item.peRatio); const historyPeMedian = median(historyPes);
  const hasHistoryReference = historyPes.length >= 252 && Number.isFinite(historyPeMedian);
  const hasSectorReference = sectorReference?.count >= 8 && Number.isFinite(sectorReference.medianPe);
  if (!hasSectorReference && !hasHistoryReference) return { score: null, trustworthy: false,
    reason: 'pe_reference_unavailable', currentPe: row.peRatio,currentPb:row.pbRatio,historySampleCount:historyPes.length,
    sourceRef:row.sourceRef,asOf:row.session };
  const sectorRelativePe = hasSectorReference ? row.peRatio / sectorReference.medianPe : null;
  const historyRelativePe = hasHistoryReference ? row.peRatio / historyPeMedian : null;
  const referenceScores = [sectorRelativePe,historyRelativePe].filter(Number.isFinite).map(relativePeScore);
  const score = referenceScores.reduce((sum,value)=>sum+value,0)/referenceScores.length;
  const reason = hasSectorReference && hasHistoryReference ? 'pe_compared_with_sector_and_own_history'
    : hasHistoryReference ? 'pe_compared_with_own_history' : 'pe_compared_with_sector_reference';
  const memberIdentity=(item)=>[item.stockId,item.exchange,item.session,item.peRatio,
    item.tradingSessionAuthorityHash,item.sourceRef];
  const historyMembers=officialHistory.map(memberIdentity);
  const sectorMembers=hasSectorReference&&Array.isArray(sectorReference.members)
    ?sectorReference.members.map(memberIdentity):[];
  const currentMember=memberIdentity(row);
  const valuationEvidence=hasHistoryReference&&hasSectorReference
    &&sectorMembers.length===sectorReference.count?Object.freeze({
    algorithm:'official-relative-pe-evidence-v1',
    currentObservationRoot:sha256(canonicalJson(currentMember)),
    historyMembershipRoot:sha256(canonicalJson(historyMembers)),
    sectorMembershipRoot:sha256(canonicalJson(sectorMembers)),
    evidenceRoot:sha256(canonicalJson(['official-relative-pe-evidence-v1',currentMember,
      historyMembers,sectorMembers])),
    historySessions:historyMembers.length,sectorPeers:sectorMembers.length,
  }):null;
  const provisionalRelativeValue=historyPes.length>=60&&historyPes.length<252?Object.freeze({
    kind:'provisional_relative_value',sampleCount:historyPes.length,asOf:row.session,
    referenceBand:Object.freeze({low:orderedPercentile(historyPes,.25),base:historyPeMedian,
      high:orderedPercentile(historyPes,.75)}),
    evidenceRoot:sha256(canonicalJson(['provisional-relative-value-v3.14',officialHistory.map((item)=>item.sourceRef)])),
    sourceRefs:Object.freeze(officialHistory.map((item)=>item.sourceRef).slice(-8)),
  }):null;
  return { score,trustworthy:true,reason,currentPe:row.peRatio,currentPb:row.pbRatio,
    sectorPe:hasSectorReference?sectorReference.medianPe:null,sectorCount:hasSectorReference?sectorReference.count:0,
    relativePe:sectorRelativePe,historyPeMedian,historyPeMin:historyPes.length?Math.min(...historyPes):null,
    historyPeMax:historyPes.length?Math.max(...historyPes):null,
    historyPeP25:orderedPercentile(historyPes,0.25),historyPeP75:orderedPercentile(historyPes,0.75),
    historySampleCount:historyPes.length,valuationEvidence,provisionalRelativeValue,
    historyRelativePe,historyAsOf:officialHistory.map((item)=>item.session),
    sourceRefs:[row.sourceRef,...officialHistory.map((item)=>item.sourceRef)],sourceRef:row.sourceRef,asOf:row.session };
}

function exactSectorPeReference(row,valuationRows=[]) {
  if(!row?.stockId||!row.exchange||!row.session||!row.sector||row.sector==='unknown')return null;
  const peers=valuationRows.filter((peer)=>peer.stockId&&peer.stockId!==row.stockId
    &&peer.exchange===row.exchange&&peer.session===row.session&&peer.sector===row.sector
    &&peer.authority==='exchange_reported'&&Number.isFinite(peer.peRatio)&&peer.peRatio>0&&peer.peRatio<=200
    &&/^[0-9a-f]{64}$/u.test(peer.tradingSessionAuthorityHash??'')
    &&validOfficialReportedValuationSourceRef(peer.exchange,peer.sourceRef,{current:true}));
  const orderedPeers=peers.sort((left,right)=>left.stockId.localeCompare(right.stockId)
    ||left.sourceRef.localeCompare(right.sourceRef));
  return orderedPeers.length>=8?Object.freeze({count:orderedPeers.length,
    medianPe:median(orderedPeers.map((peer)=>peer.peRatio)),members:Object.freeze(orderedPeers),
    exchange:row.exchange,session:row.session,sector:row.sector}):null;
}

function median(values) {
  const selected = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!selected.length) return null;
  const middle = Math.floor(selected.length / 2);
  return selected.length % 2 ? selected[middle] : (selected[middle - 1] + selected[middle]) / 2;
}

function buildResearchScore(candidate, { priceRows = [], officialSnapshot = null, stats = null, sourceCutoff }) {
  const price = priceResearchAxes(researchHistory(priceRows, candidate.symbol), stats, officialSnapshot?.twseIndex ?? []);
  const revenue = officialSnapshot?.revenues?.find((row) => row.symbol === candidate.symbol) ?? null;
  const valuation = officialSnapshot?.valuations?.find((row) => row.symbol === candidate.symbol) ?? null;
  const fundamental = revenueResearchAxis(revenue, sourceCutoff);
  const sectorReference=exactSectorPeReference(valuation,officialSnapshot?.valuations??[]);
  const valuationAxis = valuationResearchAxis(valuation, sectorReference,
    officialSnapshot?.valuationHistory ?? []);
  const score = computeUnderreactionResearchScore({ symbol: candidate.symbol,
    discovery: { score: Number.isFinite(candidate.sourcePriority) ? candidate.sourcePriority : stats ? 62 : 50,
      trustworthy: true, reason: stats ? 'price_dislocation_scan' : `${candidate.sourceClass ?? 'community'}_source_signal` },
    fundamental, priceDislocation: price.priceDislocation, valuation: valuationAxis, timing: price.timing });
  return Object.freeze({ ...score, axes: { discovery:score.reasons.find((row)=>row.axis==='discovery')
      ?{score:score.reasons.find((row)=>row.axis==='discovery').score,trustworthy:true,reason:'source_signal'}:null,
    fundamental, priceDislocation: price.priceDislocation,
    valuation: valuationAxis, timing: price.timing }, priceContext: price.context });
}

function researchRankingFromScore(candidate,researchScore,{softBlockers=[],conflict=false}={}){
  const axisValue=(axis)=>researchScore?.axes?.[axis]?.trustworthy===true
    &&Number.isFinite(researchScore.axes[axis].score)?researchScore.axes[axis].score:null;
  const timingParts=[axisValue('priceDislocation'),axisValue('timing')].filter(Number.isFinite);
  return computeResearchRankingV314({valuation:axisValue('valuation'),
    fundamentalQuality:axisValue('fundamental'),momentumTechnical:timingParts.length
      ?timingParts.reduce((sum,value)=>sum+value,0)/timingParts.length:null,
    sourceCatalyst:axisValue('discovery'),marketLiquidity:Number.isFinite(candidate.liquidityScore)
      ?candidate.liquidityScore:null,softBlockers,conflict});
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

function legacyQualityMaterial(facts,researchScore=null) {
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
  const dilutedRow=row('diluted_weighted_average_shares')??row('diluted_shares');const bookRow=row('book_value_per_share');
  const equityRow=row('total_equity');
  const periodMonth=Number(String(netIncomeRow?.[3]??'').slice(5,7));
  const derivedRoe=Number.isFinite(netIncome)&&Number.isFinite(value(equityRow))&&value(equityRow)>0
    &&[3,6,9,12].includes(periodMonth)?netIncome/value(equityRow)*(12/periodMonth)
    :Number.isFinite(netIncome)&&Number.isFinite(value(dilutedRow))&&Number.isFinite(value(bookRow))
      &&value(dilutedRow)>0&&value(bookRow)>0&&[3,6,9,12].includes(periodMonth)
      ?netIncome/(value(dilutedRow)*value(bookRow))*(12/periodMonth):null;
  const officialRevenueGrowth=Number(researchScore?.axes?.fundamental?.yoyGrowth);
  const usedRows = [roeRow,...(Number.isFinite(derivedRoe)
    ?[netIncomeRow,...(equityRow?[equityRow]:[dilutedRow,bookRow])]:[])];
  if (Number.isFinite(revenue) && revenue !== 0 && Number.isFinite(operating)) usedRows.push(revenueRow, operatingRow);
  if (Number.isFinite(netIncome) && netIncome !== 0 && Number.isFinite(ocf) && Number.isFinite(capex)) usedRows.push(netIncomeRow, ocfRow, capexRow);
  if (Number.isFinite(ebitda) && ebitda > 0 && Number.isFinite(debt)) usedRows.push(ebitdaRow, debtRow, ...(Number.isFinite(cash) ? [cashRow] : []));
  if (Number.isFinite(interest) && interest > 0 && Number.isFinite(operating)) usedRows.push(interestRow, operatingRow);
  return { input: { roe:Number.isFinite(value(roeRow))?value(roeRow):derivedRoe,
    revenueGrowth:Number.isFinite(officialRevenueGrowth)?officialRevenueGrowth/100:null,
    operatingMargin: Number.isFinite(revenue) && revenue !== 0 && Number.isFinite(operating) ? operating / revenue : null,
    freeCashFlowConversion: Number.isFinite(netIncome) && netIncome !== 0 && Number.isFinite(ocf) && Number.isFinite(capex) ? (ocf - Math.abs(capex)) / Math.abs(netIncome) : null,
    netDebtToEbitda: Number.isFinite(ebitda) && ebitda > 0 && Number.isFinite(debt) ? (debt - (Number.isFinite(cash) ? cash : 0)) / ebitda : null,
    interestCoverage: Number.isFinite(interest) && interest > 0 && Number.isFinite(operating) ? operating / interest : null },
  usedRows: [...new Set(usedRows.filter(Boolean))] };
}

function legacyQualityInput(facts) {
  return legacyQualityMaterial(facts).input;
}

function legacyFundamentalNarrative(candidate, usedRows, quality, sourceCutoff, additionalEvidenceRefs=[]) {
  const score = Number.isFinite(quality.score) ? Math.round(quality.score) : null;
  invariant(usedRows.every((row) => typeof row[12] === 'string' && row[12].length > 0), 'quality fact evidence unavailable');
  const directRefs = [...new Set([...usedRows.map((row) => row[12]),...additionalEvidenceRefs]
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

function officialCitation(ref, evaluatedAt, {publishedAt=null,collectedAt=null}={}) {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const twse=ref.startsWith('twse-')||ref.startsWith('twse:');const tpex=ref.startsWith('tpex-')||ref.startsWith('tpex:');
  const mops=ref.match(/^(?:twse|tpex)-mops-inline:(\d{4})-(\d{2})-\d{2}:(\d{4}):/u);
  const sourceUrl=mops?`${MOPS_INLINE_URL}?step=1&CO_ID=${mops[3]}&SYEAR=${Number(mops[1])-1911}&SSEASON=${Math.ceil(Number(mops[2])/3)}&REPORT_ID=C`
    :ref.includes('financial-statement')?(twse?'https://openapi.twse.com.tw/':tpex?'https://www.tpex.org.tw/openapi/':null)
    :ref.includes('monthly-revenue')?(twse?TWSE_REVENUE_URL:tpex?TPEX_REVENUE_URL:null)
      :ref.includes('STOCK_DAY')||ref.includes('tradingStock')?(twse?TWSE_PRICE_HISTORY_URL:tpex?TPEX_PRICE_HISTORY_URL:null)
        :twse?SOURCE_URL:tpex?TPEX_SOURCE_URL:null;
  const utc=(value)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
  return sourceUrl ? { ref, sourceKey: ref.startsWith('twse') ? 'twse' : 'tpex',
    sourceName: ref.startsWith('twse') ? '臺灣證券交易所' : '證券櫃檯買賣中心', sourceUrl,
    kolIdentity: null, publishedAt:utc(publishedAt), collectedAt:utc(collectedAt), evaluatedAt:utc(evaluatedAt) } : null;
}

function marketAllowsNewPosition(marketAnalysis) {
  return marketAnalysis?.status === 'risk_on';
}

function buildLegacyCandidateDecision({ candidate, facts, history, benchmark, sourceCutoff, valuationInput = {},
  researchScore = null, marketAnalysis = null }) {
  const qualityMaterial = legacyQualityMaterial(facts,researchScore);
  const quality = calculateFundamentalQualityAxes(qualityMaterial.input);
  const fundamental = legacyFundamentalNarrative(candidate, qualityMaterial.usedRows, quality, sourceCutoff,
    [researchScore?.axes?.fundamental?.sourceRef].filter(Boolean));
  const plane = calculateAdjustedTechnicalPlane({ rows: history, asOf: sourceCutoff, benchmark });
  const biasHistory = selectBiasTechnicalHistory({ rows: history, asOf: sourceCutoff });
  const valuation = evaluateCandidateValuation({ stockId: candidate.stockId, subjectStockId: candidate.stockId,
    cutoff: sourceCutoff, asOf: sourceCutoff, sector: candidate.canonicalSector, facts: valuationFactInput(facts), ...valuationInput });
  // A defensive/selective regime is deliberately research-visible but not action-authoritative.
  // V3.14 converts an otherwise eligible stock to wait_market instead of silently treating a
  // missing actionAuthority property as permission to buy.
  const marketAllowsAction = marketAllowsNewPosition(marketAnalysis);
  const qualityReadiness=quality.availableWeight>=0.65?'available':'missing';
  const marketReadiness=['risk_on','selective_or_defensive'].includes(marketAnalysis?.status)?'available':'missing';
  const actionDecision = deriveActionDecision({ plane, support: plane.support, resistance: plane.resistance,
    valuationStatus: valuation.status, valuation, researchScore, marketAllowsAction,
    qualityActionEligible: quality.qualityActionEligible,qualityReadiness,marketReadiness,
    marketRegime:marketAnalysis?.status,contractVersion:'v3.14',lastEvaluatedAt: sourceCutoff,
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
  const researchRanking=researchRankingFromScore(candidate,researchScore,{
    softBlockers:actionDecision.decisionEnvelope.blockers,
    conflict:actionDecision.decisionEnvelope.valuationReadiness==='conflict'});
  const technical = actionDecision.technical?.availability === 'unavailable'
    ? { technicalState: null, plane, availability: 'unavailable', reason: actionDecision.technical.reason }
    : { ...actionDecision.technical, plane: { ...plane, bias: plane.availability === 'available'
      ? { ...plane.bias, ownHistory: biasHistory.availability === 'available' ? { ...biasHistory.quantiles, label: biasHistory.current.label } : null }
      : null } };
  const material = buildDecisionMaterial({ candidate, facts, fundamental, quality, biasHistory, valuation,
    valuationInput, technical, actionDecision });
  const valuationRefs=Array.isArray(valuation?.evidence?.sourceRefs)?valuation.evidence.sourceRefs:[];
  const technicalRef=history.at(-1)?.sourceRef;
  const fundamentalRefs=qualityMaterial.usedRows.map((row)=>row[12]).filter((ref)=>typeof ref==='string');
  const citations=[...(candidate.sourceEvidence??[candidate]).map((row)=>({ref:row.claimId,sourceKey:row.sourceKey,
    sourceName:row.sourceName??row.sourceKey??null,sourceUrl:row.sourceUrl??null,kolIdentity:row.kolIdentity??null,
    publishedAt:row.sourcePublishedAt??row.claimAsOf??null,collectedAt:row.sourceCollectedAt??null,evaluatedAt:sourceCutoff})),
  ...qualityMaterial.usedRows.map((row)=>officialCitation(row[12],sourceCutoff,{publishedAt:row[8],collectedAt:row[10]})).filter(Boolean),
  ...valuationRefs.map((ref)=>officialCitation(ref,sourceCutoff,{publishedAt:valuation.asOf??sourceCutoff,collectedAt:sourceCutoff})).filter(Boolean),
  officialCitation(technicalRef,sourceCutoff,{publishedAt:history.at(-1)?.session??sourceCutoff,collectedAt:sourceCutoff})].filter(Boolean)
    .filter((row)=>typeof row.ref==='string'&&typeof row.sourceUrl==='string'&&/^https:\/\//u.test(row.sourceUrl))
    .filter((row,index,all)=>all.findIndex((candidateCitation)=>candidateCitation.ref===row.ref)===index);
  const citationRefs=new Set(citations.map((row)=>row.ref));
  const thesis=[];const risks=[];const briefEvidence=[];
  const citedFundamentalRefs=fundamentalRefs.filter((ref)=>citationRefs.has(ref));
  const citedValuationRefs=valuationRefs.filter((ref)=>citationRefs.has(ref));
  if(citedFundamentalRefs.length){thesis.push(fundamental.thesis);briefEvidence.push({point:'thesis:0',refs:citedFundamentalRefs});}
  if(citedValuationRefs.length){thesis.push(valuation.status==='normal'
    ?`估值方法 ${valuation.method?.method??'unknown'} 已形成可追溯情境區間。`
    :`估值尚未完成：${valuation.reason??'valuation_unavailable'}。`);briefEvidence.push({point:`thesis:${thesis.length-1}`,refs:citedValuationRefs});}
  if(technicalRef&&citationRefs.has(technicalRef)){thesis.push(`還原權息技術狀態為 ${technical.technicalState??'unavailable'}。`);
    briefEvidence.push({point:`thesis:${thesis.length-1}`,refs:[technicalRef]});}
  for(const risk of fundamental.risks){if(risks.length>=3||!citedFundamentalRefs.length)break;risks.push(risk);
    briefEvidence.push({point:`risk:${risks.length-1}`,refs:citedFundamentalRefs});}
  if(risks.length<3&&citedValuationRefs.length&&actionDecision.decisionEnvelope.blockers.length){
    risks.push(`決策阻擋條件：${actionDecision.decisionEnvelope.blockers.join('、')}。`);
    briefEvidence.push({point:`risk:${risks.length-1}`,refs:citedValuationRefs});
  }
  if(risks.length<3&&citedValuationRefs.length&&valuation.status==='normal'){
    risks.push(`估值區間會隨 ${valuation.method?.method??'selected'} 方法的基本面與倍數敏感度改變。`);
    briefEvidence.push({point:`risk:${risks.length-1}`,refs:citedValuationRefs});
  }
  if(risks.length<3&&technicalRef&&citationRefs.has(technicalRef)&&Number.isFinite(actionDecision.geometry?.invalidation)){
    risks.push(`多頭失效價為 ${actionDecision.geometry.invalidation}。`);
    briefEvidence.push({point:`risk:${risks.length-1}`,refs:[technicalRef]});
  }
  const decisionBrief=thesis.length===3&&risks.length===3
    ?{thesis,risks,evidence:briefEvidence}:null;
  return { ...candidate, researchMaturity: valuation.status === 'normal' && quality.qualityActionEligible ? 'decision_ready'
    : quality.availability === 'available' ? 'fundamental_review' : 'source_signal',
    action: actionDecision.action, fundamental, technical, geometry: actionDecision.geometry,
    decisionEnvelope: actionDecision.decisionEnvelope,
    valuation, factorAxes, researchScore,researchRanking,decisionBrief,citations, reason: actionDecision.reason, lastEvaluatedAt: sourceCutoff,
    materialChangeHash: material.materialChangeHash, materialIdentity: material.materialIdentity,
    materialChangedBecause: [] };
}

function financialSemanticIdentity(row){
  const normalized=Array.isArray(row)?{
    symbol:row[0],factKey:row[1],periodStart:row[2],periodEnd:row[3],durationKind:row[4],value:row[5],unit:row[6],
    authorityTier:row[7],filingPublishedAt:row[8],sourceTimestamp:row[9],sourceRef:row[12],
    filingRestatementId:row[13],estimateKind:row[14],estimateHorizon:row[15],
  }:row;
  return canonicalJson([normalized?.symbol,normalized?.factKey,normalized?.periodStart??null,normalized?.periodEnd,
    normalized?.durationKind,normalized?.value,normalized?.unit,normalized?.authorityTier,
    normalized?.filingPublishedAt,normalized?.sourceTimestamp,normalized?.sourceRef,
    normalized?.filingRestatementId??null,normalized?.estimateKind,normalized?.estimateHorizon]);
}

function newFinancialFactsV314(facts,priorRows=[]){
  const seen=new Set((Array.isArray(priorRows)?priorRows:[])
    .filter((row)=>(Array.isArray(row)&&row.length>=16)||(row&&typeof row==='object'&&!Array.isArray(row)))
    .map(financialSemanticIdentity));
  return (Array.isArray(facts)?facts:[]).filter((row)=>{
    const identity=financialSemanticIdentity(row);if(seen.has(identity))return false;seen.add(identity);return true;
  });
}

function resolveOfficialAuthorityCandidatesV314(candidates,candidateAuthorityRows=[],peerUniverseRows=[]){
  const normalize=(rows,limit)=>(Array.isArray(rows)?rows:[]).flatMap((row)=>{
    const value=Array.isArray(row)?{symbol:row[0],stockId:row[1],exchange:row[2],canonicalSector:row[3]}:row;
    return /^\d{4}$/u.test(String(value?.symbol??''))&&['TWSE','TPEX'].includes(String(value?.exchange??''))
      ?[{symbol:String(value.symbol),stockId:value.stockId?String(value.stockId):null,exchange:String(value.exchange),
        canonicalSector:String(value.canonicalSector??'unknown')}]:[];
  }).slice(0,limit);
  const candidateAuthority=normalize(candidateAuthorityRows,30);
  const peerUniverse=normalize(peerUniverseRows,240);
  const instrumentBySymbol=new Map([...peerUniverse,...candidateAuthority].map((row)=>[row.symbol,row]));
  const authorityCandidates=(Array.isArray(candidates)?candidates:[]).filter((candidate)=>candidate?.deepSelected===true)
    .slice(0,30).map((candidate)=>({...candidate,
      exchange:candidate.exchange??instrumentBySymbol.get(candidate.symbol)?.exchange??null,
      canonicalSector:candidate.canonicalSector&&candidate.canonicalSector!=='unknown'?candidate.canonicalSector
        :instrumentBySymbol.get(candidate.symbol)?.canonicalSector??'unknown'}));
  return Object.freeze({authorityCandidates:Object.freeze(authorityCandidates),peerUniverse:Object.freeze(peerUniverse)});
}

function compactAnalysisOfficialAuthority(authority){
  if(!authority||typeof authority!=='object')return null;
  return Object.freeze({
    calendar:Object.freeze({authorityHash:authority.calendar?.authorityHash??null}),
    coverage:Object.freeze({completedSessions:Number(authority.coverage?.completedSessions??0),
      ready:authority.coverage?.ready===true,
      blockers:Object.freeze((authority.coverage?.blockers??[]).slice(0,12))}),
  });
}

function projectionDecision(decision){
  const {facts:_immutableFacts,...analysisRevision}=decision.analysisRevision??{};
  return Object.freeze({...decision,analysisRevision:Object.freeze(analysisRevision)});
}

function decisionRevisionBundleKind(card){
  const version=card?.decisionEnvelope?.version;
  invariant(['decision-envelope-v3.13.0','decision-envelope-v3.14.0'].includes(version),
    'decision revision envelope version unavailable');
  return version==='decision-envelope-v3.14.0'
    ?'legacy_decision_revision_v3_14':'legacy_decision_revision_v3_13';
}

const ANALYSIS_PROVENANCE_KEYS=new Set(
  ['sourceKey','sourceUrl','sourcePublishedAt','sourceCollectedAt','sourceName','kolIdentity']);

function immutableAnalysisFacts(decision){
  const evidence=Array.isArray(decision?.evidence)?decision.evidence:null;
  const sourceEvidence=Array.isArray(decision?.sourceEvidence)?decision.sourceEvidence:null;
  const sourceEvidenceIsLossless=Boolean(evidence&&sourceEvidence&&evidence.length===sourceEvidence.length
    &&evidence.every((row,index)=>row&&typeof row==='object'&&!Array.isArray(row)
      &&sourceEvidence[index]&&typeof sourceEvidence[index]==='object'&&!Array.isArray(sourceEvidence[index])
      &&Object.entries(row).every(([key,value])=>Object.hasOwn(sourceEvidence[index],key)
        &&(ANALYSIS_PROVENANCE_KEYS.has(key)||canonicalJson(sourceEvidence[index][key])===canonicalJson(value)))));
  if(!sourceEvidenceIsLossless)return decision;
  const {evidence:_duplicateEvidence,...completeFacts}=decision;
  return Object.freeze(completeFacts);
}

async function streamOfficialIngestionV314({claim,snapshot,sourceCutoff,producerSha,persistChunk,priorFinancialRows=[],resume=null}){
  const resumeAllowed=resume&&['legacy-official-ingestion-resume-v3.15',
    'legacy-official-ingestion-partial-resume-v3.16'].includes(resume.schema)&&resume.sourceCutoff===sourceCutoff;
  const resumedFinancialFacts=resumeAllowed&&Array.isArray(resume.financialFacts)?resume.financialFacts:[];
  if(resumeAllowed)invariant(canonicalJson((snapshot?.financialFacts??[]).slice(0,resumedFinancialFacts.length)
    .map(financialSemanticIdentity))===canonicalJson(resumedFinancialFacts.map(financialSemanticIdentity)),
  'official ingestion resumed financial prefix conflict');
  const financialFacts=resumeAllowed
    ?[...resumedFinancialFacts,...newFinancialFactsV314(snapshot?.financialFacts??[],[...priorFinancialRows,...resumedFinancialFacts])]
    :newFinancialFactsV314(snapshot?.financialFacts??[],priorFinancialRows);
  const priceCloseByDependency=new Map((snapshot?.priceObservations??[]).flatMap((row)=>{
    const close=Number(row?.close);
    return row&&/^[0-9]{4}$/u.test(String(row.symbol??''))&&['TWSE','TPEX'].includes(String(row.exchange??''))
      &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session??''))&&Number.isFinite(close)&&close>0
      ?[[`${row.exchange}:${row.symbol}:${row.session}`,close]]:[];
  }));
  let reportedValuationPriceDependencyUnavailable=0;
  const reportedValuations=[...(snapshot?.valuations??[]),...(snapshot?.valuationHistory??[])].flatMap((row)=>{
    if(!row||typeof row!=='object')return [];
    // Older synthetic contract owners intentionally omit the metric fields. Keep
    // those fixtures transport-compatible, while production observations are
    // normalized to the same closed ranges enforced by the V3.13 append RPC.
    if(!Object.hasOwn(row,'peRatio')&&!Object.hasOwn(row,'pbRatio'))return [row];
    const exchange=['TWSE','TPEX'].includes(String(row.exchange??''))?String(row.exchange)
      :String(row.sourceRef??'').startsWith('twse-')?'TWSE'
      :String(row.sourceRef??'').startsWith('tpex-')?'TPEX':null;
    invariant(exchange&&/^[0-9]{4}$/u.test(String(row.symbol??''))
      &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session??''))
      &&validOfficialReportedValuationSourceRef(exchange,row.sourceRef),'official reported valuation provenance');
    const pe=Number(row.peRatio);const pb=Number(row.pbRatio);
    const peRatio=Number.isFinite(pe)&&pe>0&&pe<=200?pe:null;
    const pbRatio=Number.isFinite(pb)&&pb>0&&pb<=100?pb:null;
    if(peRatio===null&&pbRatio===null)return [];
    const expectedCloseSourceRef=`${exchange.toLowerCase()}-openapi:official-close:${row.session}:${row.symbol}`;
    const embeddedClose=Number(row.close);
    const close=Number.isFinite(embeddedClose)&&embeddedClose>0&&row.closeSourceRef===expectedCloseSourceRef
      ?embeddedClose:priceCloseByDependency.get(`${exchange}:${row.symbol}:${row.session}`);
    if(!(Number.isFinite(close)&&close>0)){reportedValuationPriceDependencyUnavailable+=1;return [];}
    return [{...row,exchange,close,peRatio,pbRatio}];
  });
  const datasets=[
    // Production evidence from run 54aa220b showed that a 50-row financial
    // apply can monopolize the managed pooler past the closed 120-second lease.
    // Keep every authoritative application transaction at the already-approved
    // <=20-row bound so the independently threaded heartbeat can always regain
    // a backend before the lease deadline.
    ['trading_sessions','calendarSessions',snapshot?.calendarSessions??[],20],
    ['financial_facts','financialFacts',financialFacts,20],
    ['price_observations','priceObservations',snapshot?.priceObservations??[],20],
    ['corporate_action_snapshots','corporateActionSnapshots',snapshot?.corporateActionSnapshots??[],20],
    ['reported_valuations','reportedValuations',reportedValuations,20],
  ];
  const chunks=[];const counts={};
  const resumeChunks=resumeAllowed&&Array.isArray(resume.chunks)?resume.chunks:[];
  for(const [kind,resumeKey,items,chunkSize] of datasets){
    counts[kind]=items.length;
    const existingItems=resumeAllowed&&Array.isArray(resume[resumeKey])?resume[resumeKey]:[];
    const existingChunks=resumeChunks.filter((row)=>row?.kind===kind);
    invariant(existingItems.length<=items.length&&canonicalJson(items.slice(0,existingItems.length))===canonicalJson(existingItems),
      'official ingestion resume prefix conflict');
    let existingOffset=0;
    for(let index=0;index<existingChunks.length;index+=1){
      const member=existingChunks[index];
      invariant(member.ordinal===index&&Number.isInteger(member.itemCount)&&member.itemCount>=0&&member.itemCount<=200
        &&/^[0-9a-f]{64}$/u.test(member.chunkHash),'official ingestion resume chunk graph conflict');
      const members=existingItems.slice(existingOffset,existingOffset+member.itemCount);
      invariant(members.length===member.itemCount&&sha256(canonicalJson(['official-ingestion-chunk-v3.14',kind,index,members]))===member.chunkHash,
        'official ingestion resume chunk hash conflict');
      chunks.push({kind,ordinal:index,itemCount:member.itemCount,chunkHash:member.chunkHash});
      existingOffset+=member.itemCount;
    }
    invariant(existingOffset===existingItems.length,'official ingestion resume item conservation conflict');
    for(let offset=existingOffset,ordinal=existingChunks.length;offset<items.length;offset+=chunkSize,ordinal+=1){
      const members=items.slice(offset,offset+chunkSize);
      const chunkHash=sha256(canonicalJson(['official-ingestion-chunk-v3.14',kind,ordinal,members]));
      if(persistChunk)await persistChunk({runId:claim.runId,jobId:claim.jobId,ownerToken:claim.ownerToken,kind,ordinal,items:members,
        chunkHash,producerSha,sourceCutoff});
      chunks.push({kind,ordinal,itemCount:members.length,chunkHash});
    }
  }
  const terminalRoot=sha256(canonicalJson(['official-ingestion-terminal-v3.14',sourceCutoff,counts,chunks]));
  if(persistChunk)await persistChunk({runId:claim.runId,jobId:claim.jobId,ownerToken:claim.ownerToken,kind:'terminal',ordinal:0,
    items:[{sourceCutoff,counts,chunks,terminalRoot}],chunkHash:terminalRoot,producerSha,sourceCutoff});
  return Object.freeze({schema:'legacy-official-ingestion-v3.14',sourceCutoff,counts:Object.freeze(counts),
    chunks:Object.freeze(chunks),terminalRoot,deferred:Object.freeze({reportedValuationPriceDependencyUnavailable})});
}

function providerAcquisitionLineageHealth(value, evaluationTimestamp) {
  const evaluatedAt=Date.parse(evaluationTimestamp??'');
  const rawRows=Array.isArray(value)?value:[];
  const rows=rawRows.filter((row)=>row&&typeof row==='object'&&!Array.isArray(row))
    .map((row)=>({provider:String(row.provider??''),requestKey:String(row.requestKey??''),
      evidenceRoot:String(row.evidenceRoot??''),fetchedAt:String(row.fetchedAt??''),
      terminalStatus:String(row.terminalStatus??''),actionEligible:row.actionEligible===true}))
    .filter((row)=>/^[a-z0-9_]{2,40}$/u.test(row.provider)&&/^[0-9a-f]{64}$/u.test(row.requestKey)
      &&/^[0-9a-f]{64}$/u.test(row.evidenceRoot)&&Number.isFinite(Date.parse(row.fetchedAt)))
    .sort((left,right)=>left.provider.localeCompare(right.provider)||left.requestKey.localeCompare(right.requestKey));
  const providers=new Set(rows.map((row)=>row.provider));
  const required=['approved_sources','legacy_radar','official_tw_market'];
  const actionRequired=['legacy_radar','official_coarse_market','official_tw_market'];
  const blockers=[];
  for(const provider of required)if(!providers.has(provider))blockers.push(`frozen_acquisition_missing_${provider}`);
  if(rows.length===0)blockers.push('frozen_acquisition_lineage_missing');
  if(rows.length!==rawRows.length)blockers.push('frozen_acquisition_lineage_invalid');
  if(rows.some((row)=>row.terminalStatus!=='complete'))blockers.push('frozen_acquisition_terminal_incomplete');
  if(rows.some((row)=>Date.parse(row.fetchedAt)>evaluatedAt))blockers.push('frozen_acquisition_future_evidence');
  if(rows.some((row)=>actionRequired.includes(row.provider)&&row.actionEligible!==true))
    blockers.push('frozen_acquisition_action_ineligible');
  // Per-symbol financial/price/peer coverage belongs to that symbol's Gate
  // waterfall.  A missing bridge for one research candidate must not revoke
  // the frozen lineage of every checksum-valid card.
  const uniqueBlockers=[...new Set(blockers)];
  return Object.freeze({authoritative:uniqueBlockers.length===0,
    evidenceRoot:rows.length?sha256(canonicalJson(['provider-acquisition-lineage-v3.16.21',rows])):null,
    fetchedAt:rows.length?rows.map((row)=>row.fetchedAt).sort().at(-1):null,
    terminalStatus:rows.length&&rows.every((row)=>row.terminalStatus==='complete')?'complete':'unavailable',
    blockers:uniqueBlockers});
}

function buildStageHandlers(validated, sourceCommitSha, workerSha256, {
  legacyRadarBaseUrl = validated.config.legacyRadarBaseUrl,
  fetchImpl = globalThis.fetch,
  internalApiKey = process.env.INTERNAL_API_KEY,
  sourceCredentials = {},
  persistOfficialIngestionChunk = null,
  readProviderAcquisition = null,
  persistProviderAcquisition = null,
  acquisitionClock = () => new Date(),
} = {}) {
  const authorityPagesByHash = new Map();
  const localProviderAcquisitions = new Map();
  const localAcquisitionKey=(input)=>`${input.provider}:${input.requestKey}:${input.sourceCutoff}`;
  const readFrozen=readProviderAcquisition??(async(input)=>localProviderAcquisitions.get(localAcquisitionKey(input))??null);
  const freezeFrozen=persistProviderAcquisition??(async(input)=>{
    const key=localAcquisitionKey(input);const prior=localProviderAcquisitions.get(key);
    if(prior&&prior.evidenceRoot!==input.evidenceRoot)return {disposition:'conflict',envelope:null};
    const envelope={schema:input.schema,provider:input.provider,requestKey:input.requestKey,runId:input.runId,
      stage:input.stage,sourceCutoff:input.sourceCutoff,fetchedAt:input.fetchedAt,responseSha256:input.responseSha256,
      responseBytes:input.responseBytes,normalizedPayloadSha256:input.normalizedPayloadSha256,
      normalizedPayload:input.normalizedPayload,terminalStatus:input.terminalStatus,evidenceRoot:input.evidenceRoot,
      actionEligible:input.actionEligible};
    localProviderAcquisitions.set(key,envelope);return {disposition:prior?'reused':'appended',envelope};
  });
  const acquireFrozen=(input)=>acquireFrozenProviderEnvelope({...input,readFrozen,freeze:freezeFrozen,
    fetchImpl,now:acquisitionClock});
  const requiredPayload=(result,label)=>{
    invariant(result?.envelope?.terminalStatus==='complete'&&result.envelope.normalizedPayload,
      `${label} frozen acquisition unavailable`);
    return result.envelope.normalizedPayload;
  };
  return {
    source_sync: async (claim) => {
      const sourceCutoff=claim.payloadJson?.[3]??null;
      const [legacyAcquisition,approvedAcquisition] = await Promise.all([
        acquireFrozen({provider:'legacy_radar',stage:'source_sync',sourceCutoff,
          requestMaterial:{baseUrl:legacyRadarBaseUrl,windows:Object.keys(LEGACY_RADAR_PATHS).sort()},claim,
          acquire:({fetchImpl:capturedFetch})=>loadLegacyRadarPayloads(legacyRadarBaseUrl,capturedFetch,internalApiKey)}),
        acquireFrozen({provider:'approved_sources',stage:'source_sync',sourceCutoff,
          requestMaterial:{rosterSchema:approvedSourceRoster.schema,profiles:approvedSourceRoster.profiles.map((row)=>row.id).sort(),
            credentialAvailability:{threads:Boolean(sourceCredentials.threadsAccessToken),
              youtubeApiKey:Boolean(sourceCredentials.youtubeApiKey),youtubeOauth:Boolean(sourceCredentials.youtubeOauthToken)}},claim,
          actionEligible:false,
          acquire:({fetchImpl:capturedFetch,collectionStartedAt})=>acquireApprovedSources({roster:approvedSourceRoster,
            credentials:sourceCredentials,fetchImpl:capturedFetch,now:new Date(collectionStartedAt)})}),
      ]);
      const legacyPayloads=requiredPayload(legacyAcquisition,'legacy radar');
      const sourceAcquisition=requiredPayload(approvedAcquisition,'approved source');
      return immutableBundle('legacy_source_sync_result_v3_11', {
        schema: 'legacy-source-sync-result-v3.11', authorityHash: claim.authorityHash,
        sourceCutoff, legacyPayloads,sourceAcquisition,
        providerAcquisitions:[legacyAcquisition.envelope,approvedAcquisition.envelope].map(({normalizedPayload,...row})=>row),
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
      invariant(Array.isArray(bundle.candidates) && bundle.candidates.length <= 4000,
        'mention barrier candidate transport unavailable');
      const candidates = bundle.candidates;
      return immutableBundle('legacy_mention_barrier_result_v3_11', { schema: 'legacy-mention-barrier-result-v3.11', candidates });
    },
    candidate_funnel: async (claim) => {
      const bundle = readBundle(claim, 'candidate_funnel_input');
      const sourceOutcomes = (bundle.mentionResult?.candidates ?? []).map((candidate) => ({
        ...candidate, raw: candidate.raw, claimId: candidate.claimId, mentionId: candidate.mentionId,
        claimEligible: true, link: { disposition: 'linked', stockId: candidate.stockId, symbol: candidate.symbol },
      }));
      const coarseUniverseRows=Array.isArray(bundle.coarseUniverseRows)?bundle.coarseUniverseRows.slice(0,3000):[];
      const coarseAcquisition=coarseUniverseRows.length?await acquireFrozen({provider:'official_coarse_market',
          stage:'candidate_funnel',sourceCutoff:bundle.sourceCutoff,
          requestMaterial:{universe:coarseUniverseRows},claim,
          acquire:({fetchImpl:capturedFetch,collectionStartedAt})=>loadOfficialCoarseMarketSnapshot({cutoff:bundle.sourceCutoff,
            universe:coarseUniverseRows,fetchImpl:capturedFetch,collectedAt:collectionStartedAt})}):null;
      const coarseSnapshot=coarseAcquisition?.envelope?.terminalStatus==='complete'
        ?coarseAcquisition.envelope.normalizedPayload
        :{schema:'official-coarse-market-snapshot-v3.15',cutoff:bundle.sourceCutoff,collectedAt:null,
          universe:coarseUniverseRows,valuations:[],revenues:[],sourceFailures:[{reason:'frozen_provider_acquisition_unavailable'}]};
      const factorDiscovery=buildOfficialFactorCandidatesV315({snapshot:coarseSnapshot,cutoff:bundle.sourceCutoff,limit:40});
      // Official market data verifies a source-led candidate and supplies peers;
      // it is never allowed to nominate or displace a source candidate.  This
      // preserves the bounded 60→30→20 funnel without quietly turning it back
      // into an all-market factor screener.
      const funnel = buildCandidateFunnel({ outcomes: sourceOutcomes,
        seedSymbols: bundle.seedSymbols ?? [], priorLedger: bundle.priorLedger ?? [] });
      return immutableBundle('legacy_candidate_funnel_result_v3_11', { schema: 'legacy-candidate-funnel-result-v3.11',
        candidates: funnel.candidateLedger, discoverySummary: funnel.discoverySummary,
        discoveryDelta: funnel.discoveryDelta,factorDiscovery:factorDiscovery.waterfall,
        coarseProviderAcquisition:coarseAcquisition?(({normalizedPayload,...row})=>row)(coarseAcquisition.envelope):null });
    },
    facts_refresh: async (claim) => {
      const bundle = readBundle(claim, 'candidate_fact_plane');
      const sourceProvenanceByRevision=new Map((bundle.sourceProvenanceRows??[]).filter((row)=>Array.isArray(row)&&row.length>=7)
        .map((row)=>[String(row[0]),{sourceKey:String(row[1]),sourceUrl:row[2]?String(row[2]):null,
          sourcePublishedAt:row[3]?String(row[3]):null,sourceCollectedAt:String(row[4]),sourceName:String(row[5]),
          kolIdentity:String(row[6])}]));
      const candidates = (bundle.candidateResult?.candidates ?? []).map((candidate)=>{
        const sourceEvidence=(Array.isArray(candidate.evidence)&&candidate.evidence.length?candidate.evidence:[candidate])
          .map((evidence)=>({ ...evidence,
            ...(sourceProvenanceByRevision.get(String(evidence.revisionId))??{}) }));
        return { ...candidate, ...(sourceProvenanceByRevision.get(String(candidate.revisionId))??{}), sourceEvidence };
      });
      const {authorityCandidates,peerUniverse}=resolveOfficialAuthorityCandidatesV314(candidates,
        bundle.candidateAuthorityRows,bundle.peerUniverseRows);
      const authoritySymbols=new Set(authorityCandidates.map((row)=>row.symbol));
      const authorityPeers=peerUniverse.filter((row)=>!authoritySymbols.has(row.symbol)).slice(0,240);
      const bridgeAvailable = ['legacy-product-value-bridge-v3.12','legacy-product-value-bridge-v3.13',
        'legacy-product-value-bridge-v3.14'].includes(bundle.bridgeSchema);
      const ingestionResume=bundle.officialIngestionResume;
      let officialAcquisition=null;
      if (bridgeAvailable) {
        const priceBackfillSymbols=[...(bundle.officialPriceBackfillSymbols??[]),...authorityCandidates.map((row)=>[row.symbol,row.exchange])]
            .filter((row)=>Array.isArray(row)&&['TWSE','TPEX'].includes(String(row[1])))
            .filter((row,index,all)=>all.findIndex((item)=>item[0]===row[0]&&item[1]===row[1])===index).slice(0,20);
        officialAcquisition=await acquireFrozen({provider:'official_tw_market',
          stage:'facts_refresh',sourceCutoff:bundle.sourceCutoff,claim,
          // Resume reads evolve as chunks land.  They must not alter the
          // acquisition identity or cause a same-cutoff retry to hit live APIs.
          requestMaterial:{contract:'official-tw-market-acquisition-v3.16.21',authorityCandidates,authorityPeers},
          acquire:({fetchImpl:capturedFetch,collectionStartedAt})=>loadOfficialTwMarketSnapshot({cutoff:bundle.sourceCutoff,
            candidates:authorityCandidates,peerCandidates:authorityPeers,
            valuationBackfillSessions:bundle.reportedPeBackfillSessions??[],priceBackfillSymbols,
            corporateActionBackfillSessions:bundle.corporateActionBackfillSessions??[],
            fetchImpl:capturedFetch,collectedAt:collectionStartedAt})});
      }
      const acquisitionSnapshot = officialAcquisition?.envelope?.terminalStatus==='complete'
        ?officialAcquisition.envelope.normalizedPayload
        :bridgeAvailable?{availability:'unavailable',reason:'frozen_provider_acquisition_unavailable',
          valuations:[],valuationHistory:[],revenues:[],twseIndex:[],financialFacts:[],priceObservations:[],
          corporateActionSnapshots:[],tpexIndex:[],foreignFlow:null,sourceFailures:[]}:null;
      const officialSnapshot = bridgeAvailable ? persistedOfficialSnapshot(bundle,acquisitionSnapshot,candidates) : null;
      const enrichedCandidates=candidates.map((candidate)=>({ ...candidate,
        liquidityScore: officialLiquidityScore(candidate,officialSnapshot) }));
      const officialCalendar=bridgeAvailable&&(acquisitionSnapshot?.calendarSessions?.length??0)>0
        ?buildOfficialTradingScheduleV314({calendarSessions:acquisitionSnapshot.calendarSessions,
          evaluatedAt:bundle.sourceCutoff}):null;
      const officialCoverage=officialCalendar?coverageReportV314({calendar:officialCalendar,candidates:authorityCandidates,
        officialSnapshot:{financialFacts:officialSnapshot?.financialFacts??[],
          priceObservations:officialSnapshot?.priceObservations??[],valuations:officialSnapshot?.valuations??[],
          valuationHistory:officialSnapshot?.valuationHistory??[]}}):null;
      const projectionFreshnessSchedule=officialCalendar?officialCalendar.sessions
        .filter((row)=>row.session>=new Date(Date.parse(bundle.sourceCutoff)-35*86_400_000).toISOString().slice(0,10)
          &&row.session<=new Date(Date.parse(bundle.sourceCutoff)+14*86_400_000).toISOString().slice(0,10))
        .map((row)=>({session_id:row.session,close_at:row.closeAt,status:row.status})):[];
      const dislocationInputs = Array.isArray(bundle.dislocationCandidates) ? bundle.dislocationCandidates : [];
      // The frozen response leads this union. `researchHistory` then resolves a
      // same-session duplicate deterministically without a retry reaching back
      // to a live provider or allowing stale persisted rows to mask this run.
      const researchPriceRows = [...officialPriceRowsForResearch(officialSnapshot), ...(bundle.priceRows ?? []),
        ...(bundle.legacyPriceRows ?? [])];
      const marketAnalysis = buildMarketAnalysis({ asOf: bundle.sourceCutoff,
        taiex: indexComponent(officialSnapshot?.twseIndex), otc: indexComponent(officialSnapshot?.tpexIndex),
        breadth: bundle.marketBreadth && Number(bundle.marketBreadth.trackedCount) >= 20
          ? { aboveMa20Pct: Number(bundle.marketBreadth.aboveMa20Pct), trackedCount: Number(bundle.marketBreadth.trackedCount),
            scope: bundle.marketBreadth.scope,asOf:bundle.marketBreadth.asOf } : null,
        foreignFlow: officialSnapshot?.foreignFlow ?? null });
      invariant(bundle.valuationInputs===undefined || bundle.valuationInputs===null
        || Object.keys(bundle.valuationInputs).length===0,'compatibility valuationInputs forbidden');
      const decisions = enrichedCandidates.filter((candidate) => candidate.deepSelected === true).map((candidate) => {
        const facts = [...officialFactRowsForDecision(officialSnapshot,candidate.symbol),
          ...(bundle.financialRows ?? []).filter((row) => Array.isArray(row) && row[0] === candidate.symbol)];
        const history = researchHistory(researchPriceRows, candidate.symbol);
        const legacyBenchmark = (bundle.benchmarkRows ?? []).filter(Array.isArray)
          .map((row) => ({ session: row[0], close: row[1] }))
          .sort((left, right) => String(left.session).localeCompare(String(right.session)));
        const benchmark = (officialSnapshot?.twseIndex?.length ? officialSnapshot.twseIndex : legacyBenchmark)
          .map((row) => ({ session: row.session, close: row.close }));
        const researchScore = buildResearchScore(candidate, { priceRows: researchPriceRows,
          officialSnapshot, sourceCutoff: bundle.sourceCutoff });
        const persistedValuationInput=valuationAuthorityInput(candidate,facts,officialSnapshot,bundle.sourceCutoff);
        return buildLegacyCandidateDecision({ candidate, facts, history, benchmark, sourceCutoff: bundle.sourceCutoff,
          valuationInput:persistedValuationInput,researchScore,marketAnalysis });
      });
      const shallowObservations = enrichedCandidates.filter((candidate) => candidate.shallowSelected === true && candidate.deepSelected !== true)
        .map((candidate) => {
          const latest = researchPriceRows.filter((row) => Array.isArray(row) && row[0] === candidate.symbol)
            .sort((left, right) => String(right[1]).localeCompare(String(left[1])))[0];
          const researchScore=buildResearchScore(candidate,{priceRows:researchPriceRows,
            officialSnapshot,sourceCutoff:bundle.sourceCutoff});
          return { ...candidate, researchMaturity: 'source_signal', newPositionAction: 'valuation_review',
            shallowStatus: 'enriched_observation', currentPrice: Array.isArray(latest) && Number.isFinite(latest[5]) ? latest[5] : null,
            lastEvaluatedAt: bundle.sourceCutoff,researchScore,
            researchRanking:researchRankingFromScore(candidate,researchScore,{softBlockers:['deep_research_not_selected']}) };
        });
      const deferredSignals = enrichedCandidates.filter((candidate) => candidate.shallowSelected !== true).map((candidate) => {
        const researchScore=buildResearchScore(candidate,{priceRows:researchPriceRows,
          officialSnapshot,sourceCutoff:bundle.sourceCutoff});
        return {...candidate,lastEvaluatedAt:bundle.sourceCutoff,researchScore,
          researchRanking:researchRankingFromScore(candidate,researchScore,
            {softBlockers:['shallow_research_not_selected','deep_research_not_selected']})};
      });
      const dislocationCandidates = dislocationInputs.map((row) => {
        const candidate = { stockId: row.stockId, symbol: row.symbol, name: row.name ?? null,
          canonicalSector: row.canonicalSector ?? 'unknown', sourceClass: 'price_dislocation', sourcePriority: 62,
          claimId: row.sourceRef, sourceKey:'official',sourceName:'TWSE／TPEx 官方行情',
          sourceUrl:'https://openapi.twse.com.tw/',claimAsOf:bundle.sourceCutoff,
          sourcePublishedAt:bundle.sourceCutoff,sourceCollectedAt:bundle.sourceCutoff,
          disposition: 'promoted', reason: 'price_dislocation',
          sourceSummary: `${row.symbol} 近 60 個交易日自高點回落 ${Math.abs(Number(row.drawdown60Pct)).toFixed(1)}%，納入基本面未惡化檢查。`,
          lastEvaluatedAt: bundle.sourceCutoff };
        const researchScore=buildResearchScore(candidate,{priceRows:researchPriceRows,officialSnapshot,
          stats:row,sourceCutoff:bundle.sourceCutoff});
        return { ...candidate, researchMaturity: 'fundamental_review', newPositionAction: 'valuation_review',researchScore,
          researchRanking:researchRankingFromScore(candidate,researchScore,{softBlockers:['deep_research_not_selected']}) };
      });
      const decisionSymbols = new Set(decisions.map((row) => row.symbol));
      const sourceCandidates = [...shallowObservations, ...deferredSignals]
        .filter((row) => !decisionSymbols.has(row.symbol))
        .sort((left, right) => (right.researchScore?.underreactionScore ?? -1) - (left.researchScore?.underreactionScore ?? -1)
          || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0) || left.symbol.localeCompare(right.symbol))
        .filter((row, index, all) => all.findIndex((candidate) => candidate.symbol === row.symbol) === index)
        .slice(0, Math.max(0, 60 - decisions.length));
      const candidateSymbols = new Set([...decisionSymbols, ...sourceCandidates.map((row) => row.symbol)]);
      const boundedDislocationCandidates = dislocationCandidates
        .filter((row) => !candidateSymbols.has(row.symbol))
        .sort((left, right) => (right.researchScore?.underreactionScore ?? -1) - (left.researchScore?.underreactionScore ?? -1)
          || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0) || left.symbol.localeCompare(right.symbol))
        .filter((row, index, all) => all.findIndex((candidate) => candidate.symbol === row.symbol) === index)
        .slice(0, 30);
      const officialIngestion=bridgeAvailable?await streamOfficialIngestionV314({claim,snapshot:acquisitionSnapshot,
        sourceCutoff:bundle.sourceCutoff,producerSha:sourceCommitSha,persistChunk:persistOfficialIngestionChunk,
        priorFinancialRows:bundle.financialRows??[],resume:ingestionResume}):null;
      return immutableBundle('legacy_facts_refresh_result_v3_11', { schema: 'legacy-facts-refresh-result-v3.11', decisions,
        shallowObservations, sourceCandidates, dislocationCandidates: boundedDislocationCandidates, marketAnalysis,
        officialAuthority:officialCalendar?{calendar:officialCalendar,coverage:officialCoverage}:null,
        projectionFreshnessSchedule:projectionFreshnessSchedule.length?projectionFreshnessSchedule
          :(bundle.projectionFreshnessSchedule??[]).slice(0,80),
        officialIngestion,
        providerAcquisition:officialAcquisition?(({normalizedPayload,...row})=>row)(officialAcquisition.envelope):null,
        officialSnapshotStatus: acquisitionSnapshot?.availability === 'unavailable'
          ? { availability:'unavailable',reason:acquisitionSnapshot.reason }
          : { availability:bridgeAvailable ? acquisitionSnapshot?.sourceFailures?.length ? 'partial' : 'available' : 'not_requested',
            sourceFailures:acquisitionSnapshot?.sourceFailures ?? [] },
        discoveryDelta: bundle.candidateResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] } });
    },
    analysis_revision: async (claim) => {
      const bundle = readBundle(claim, 'analysis_revision_input');
      const evaluationTimestamp = bundle.evaluationTimestamp ?? bundle.sourceCutoff;
      invariant(typeof evaluationTimestamp === 'string' && Number.isFinite(Date.parse(evaluationTimestamp))
        && Date.parse(evaluationTimestamp) >= Date.parse(bundle.sourceCutoff), 'analysis evaluation timestamp unavailable');
      const priorBySymbol = new Map((bundle.priorRevisions ?? []).map((revision) => [revision.symbol, revision]));
      const decisions = (bundle.factsResult?.decisions ?? []).map((decision) => {
        const priorRevision=priorBySymbol.get(decision.symbol) ?? null;
        const reasons = priorRevision?.facts?.materialIdentity
          ? materialChangedReasons(priorRevision.facts.materialIdentity, decision.materialIdentity)
          : ['source_evidence_changed','financial_fact_changed','price_trigger_changed','technical_state_changed',
            'valuation_changed','risk_changed','factor_correctness_changed'];
        const revision = appendAnalysisRevision({ priorRevision,
          input: { materialChangeHash: decision.materialChangeHash, facts: decision, lockedNarrativeClaims: [decision.claimId] },
          changedBecause: reasons, now: bundle.sourceCutoff });
        const priorFacts=revision.revision?.facts;
        const revisionDecision=revision.disposition==='unchanged'&&priorFacts
          ?{...priorFacts,...decision,
            decisionBrief:priorFacts.decisionBrief??decision.decisionBrief,
            citations:priorFacts.citations??decision.citations,
            sourceProvenance:priorFacts.sourceProvenance??decision.sourceProvenance}
          :decision;
        return { ...revisionDecision, analysisRevision: revision.revision,
          materialChangedBecause: revision.disposition === 'unchanged' ? [] : reasons,
          evaluationDisposition: revision.disposition === 'unchanged' ? 'unchanged' : 'appended',
          lastEvaluatedAt:evaluationTimestamp,
          analysisGeneratedAt: revision.revision.analysisGeneratedAt,
          noChangeMessage: revision.disposition === 'unchanged' ? `已於 ${evaluationTimestamp} 檢查，無重大變化` : null };
      });
      const immutableFactsByDecision=decisions.map((decision)=>immutableAnalysisFacts(decision.analysisRevision?.facts??decision));
      const decisionPayloads=immutableFactsByDecision.map((immutableFacts,index)=>{
        const decision=decisions[index];
        invariant(immutableFacts && immutableFacts.symbol===decision.symbol
          && immutableFacts.materialChangeHash===decision.materialChangeHash,
        'immutable analysis fact payload required');
        return { symbol:decision.symbol,materialChangeHash:decision.materialChangeHash,
          bundle:immutableBundle('legacy_analysis_fact_payload_v3_13',immutableFacts) };
      });
      // decisionPayloads already carries the complete immutable fact plane for
      // persistence. Avoid serializing that same plane a second time under each
      // projection decision's revision metadata. The next stage also consumes only
      // the official calendar/coverage summary; complete authority rows remain in
      // the succeeded facts result. This is a transport projection, not data loss.
      const projectionDecisions=decisions.map((decision)=>projectionDecision(immutableAnalysisFacts(decision)));
      return immutableBundle('legacy_analysis_revision_result_v3_11', { schema: 'legacy-analysis-revision-result-v3.11', decisions:projectionDecisions,
        decisionPayloads,
        sourceCandidates: bundle.factsResult?.sourceCandidates ?? [],
        dislocationCandidates: bundle.factsResult?.dislocationCandidates ?? [],
        marketAnalysis: bundle.factsResult?.marketAnalysis ?? null,
        officialAuthority:compactAnalysisOfficialAuthority(bundle.factsResult?.officialAuthority),
        providerAcquisition:bundle.factsResult?.providerAcquisition??null,
        projectionFreshnessSchedule:bundle.factsResult?.projectionFreshnessSchedule??[],
        discoveryDelta: bundle.factsResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] } });
    },
    compact_radar_projection: async (claim) => {
      const bundle = readBundle(claim, 'compact_projection_input');
      const evaluationTimestamp = bundle.evaluationTimestamp ?? bundle.sourceCutoff;
      invariant(typeof evaluationTimestamp === 'string' && Number.isFinite(Date.parse(evaluationTimestamp))
        && Date.parse(evaluationTimestamp) >= Date.parse(bundle.sourceCutoff), 'projection evaluation timestamp unavailable');
      const decisions = bundle.analysisResult?.decisions ?? [];
      const sourceCandidates = bundle.analysisResult?.sourceCandidates ?? [];
      const projectionSignals = [...sourceCandidates]
        .sort((left, right) => (right.researchRanking?.rankingScore??right.researchScore?.underreactionScore??-1)
          -(left.researchRanking?.rankingScore??left.researchScore?.underreactionScore??-1)
          || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0) || String(left.symbol ?? '').localeCompare(String(right.symbol ?? '')))
        .filter((row, index, all) => typeof row?.symbol === 'string'
          && all.findIndex((candidate) => candidate?.symbol === row.symbol) === index)
        .slice(0, Math.max(0, 60 - decisions.length));
      const runtimeHealthObservation = readRuntimeHealthObservation(sourceCommitSha, workerSha256, validated.sha256);
      const producerIdentity = { commitSha: sourceCommitSha, workerSha256, configSha256: validated.sha256,
        runtimeManifestSha256:readRuntimeManifestSha256(sourceCommitSha,workerSha256,validated.sha256)
          ??runtimeHealthObservation?.runtimeManifestSha256??runtimeHealthObservation?.manifestSha256??null,
        ...(runtimeHealthObservation ? { runtimeHealthObservation } : {}) };
      const legacyPayloads = bundle.legacyPayloads;
      invariant(legacyPayloads && ['daily', 'hot', 'weekly', 'home'].every((window) =>
        legacyPayloads[window] && typeof legacyPayloads[window] === 'object'), 'legacy radar capture unavailable');
      const priorProjections=bundle.priorProjections&&typeof bundle.priorProjections==='object'
        ?bundle.priorProjections:{};
      const acquisitionLineageHealth=providerAcquisitionLineageHealth(bundle.providerAcquisitions,
        evaluationTimestamp);
      const projections = ['daily', 'hot', 'weekly', 'home'].map((window) => publishCompactRadarProjection({ decisions,
        sourceCandidates: projectionSignals,
        marketAnalysis: bundle.analysisResult?.marketAnalysis ?? null,
        sourceAcquisitionHealth:bundle.analysisResult?.officialAuthority?{
          schema:'source-acquisition-health-v3.14',
          calendarAuthorityHash:bundle.analysisResult.officialAuthority.calendar?.authorityHash??null,
          completedSessions:bundle.analysisResult.officialAuthority.coverage?.completedSessions??0,
          officialCoverageReady:bundle.analysisResult.officialAuthority.coverage?.ready===true,
          acquisitionAuthority:acquisitionLineageHealth.authoritative?'authoritative':'unavailable',
          acquisitionEvidenceRoot:acquisitionLineageHealth.evidenceRoot,
          fetchedAt:acquisitionLineageHealth.fetchedAt,
          terminalStatus:acquisitionLineageHealth.terminalStatus,
          blockers:[...(bundle.analysisResult.officialAuthority.coverage?.blockers??[]),
            ...acquisitionLineageHealth.blockers].slice(0,12),
        }:null,
        discoveryDelta: bundle.analysisResult?.discoveryDelta ?? { added: [], exited: [], continued: [], unchangedReasons: [] },
        freshnessSchedule:bundle.analysisResult?.projectionFreshnessSchedule??[],
        schemaVersion:'legacy-radar-v3.17.0',
        window, asOf: bundle.sourceCutoff, contentAsOf:bundle.sourceCutoff,
        evaluatedAt:evaluationTimestamp,publishedAt:evaluationTimestamp,
        priorProjection:priorProjections[window==='hot'?'three_day':window]??null,
        producerIdentity, legacyPayload: legacyPayloads[window] }));
      const home=projections.find((projection)=>projection.storageWindow==='home');
      invariant(home?.payload?.sourceLedCorrectness?.window==='home','home projection authority unavailable');
      const decisionRevisions=collectDecisionRevisionCards(projections).map((revisionCard)=>{
        // Keep the landing projection compact. The full dossier is persisted
        // only in the immutable revision object addressed by this card's
        // decisionRevisionId, so a detail request cannot accidentally read a
        // different revision or cause the radar API to exceed its payload cap.
        return {
        symbol:revisionCard.symbol,decisionRevisionId:revisionCard.decisionRevisionId,
        bundle:immutableBundle(decisionRevisionBundleKind(revisionCard),immutableDecisionRevisionCard(revisionCard)),
        identityBundle:decisionRevisionIdentityBundle(revisionCard),
        sourceLedCorrectness:home.payload.sourceLedCorrectness,
      };});
      return immutableBundle('legacy_compact_projection_result_v3_11', {
        schema: 'legacy-compact-projection-result-v3.11', projections,decisionRevisions,
      });
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
  // Durable production stages can materialize bounded fact-plane reads that
  // exceed PostgREST's statement timeout.  Use the reviewed direct PostgreSQL
  // adapter with the same Keychain-only credential boundary; HTTP remains for
  // the read-only Web capture and external source APIs.
  const { resolvePostgresConnectionReference } = require('./credential-resolver');
  const { createPostgresLegacyProducerAdapter } = require('./postgres-legacy-producer-adapter');
  const adapter = createPostgresLegacyProducerAdapter({ connectionString:
    resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url') });
  const workerBytes = runtimeBundleBytes(path.resolve(__dirname, '..', '..'));
  const optionalCredential = (reference) => {
    try { return resolveCredentialReference(reference); } catch { return null; }
  };
  const stageHandlers = buildStageHandlers(validated, runtimeEnvironment.STOCKINSIDER_REVIEWED_COMMIT_SHA, sha256(workerBytes), {
    internalApiKey: runtimeEnvironment.INTERNAL_API_KEY,
    readProviderAcquisition:(input)=>adapter.readLegacyProviderAcquisition(input),
    persistProviderAcquisition:async(input)=>{
      const result=await adapter.freezeLegacyProviderAcquisition(input);
      if(!result||!['appended','reused','conflict'].includes(result.disposition))
        throw new Error('provider_acquisition_persistence_rejected');
      return result;
    },
    persistOfficialIngestionChunk:async(input)=>{
      const accepted=await adapter.appendLegacyOfficialIngestionChunk(input);
      if(accepted!==true)throw new Error('official_ingestion_chunk_rejected');
      // Renew synchronously on the same reviewed connection boundary after each
      // bounded apply.  This prevents a busy single-backend transaction pooler
      // from starving the background pulse between consecutive chunks.
      const alive=await adapter.heartbeatLegacyProducerJob({runId:input.runId,jobId:input.jobId,
        ownerToken:input.ownerToken,leaseSeconds:validated.config.leaseSeconds});
      if(alive!==true){const error=new Error('producer_lease_lost');error.code='producer_lease_lost';throw error;}
      return true;
    },
    sourceCredentials: {
      threadsAccessToken:optionalCredential('keychain:stockinsider-runtime:threads-access-token'),
      youtubeApiKey:optionalCredential('keychain:stockinsider-runtime:youtube-api-key'),
      youtubeOauthToken:optionalCredential('keychain:stockinsider-runtime:youtube-oauth-token'),
    },
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
  process.stderr.write(`${canonicalJson(safeFailureDiagnostic(error,{stage:'worker_terminal',origin:'auth_source_worker'}))}\n`);
  process.exitCode = 1;
});

module.exports = { args, buildLegacyCandidateDecision, buildStageHandlers, extractRevisionCandidates,
  compactAnalysisOfficialAuthority,immutableAnalysisFacts,projectionDecision,
  valuationAuthorityInput,materialDecisionValue,exactSectorPeReference,financialSemanticIdentity,newFinancialFactsV314,
  resolveOfficialAuthorityCandidatesV314,streamOfficialIngestionV314,
  providerAcquisitionLineageHealth,researchRankingFromScore,validOfficialFactRow,
  validEmbeddedOfficialValuationRef,marketAllowsNewPosition,
  extractMatchedEvidenceSnippet, LEGACY_RADAR_FETCH_TIMEOUT_MS, legacyFactInput, legacyQualityInput, loadLegacyRadarPayloads,
  main,officialCitation,readBundle,readRuntimeHealthObservation,readRuntimeManifestSha256,
  priceResearchAxes, tickerHasStockContext, uuidFromHash, valuationFactInput,valuationResearchAxis,
  persistedOfficialSnapshot,officialPriceRowsForResearch,officialFactRowsForDecision,officialLiquidityScore };
