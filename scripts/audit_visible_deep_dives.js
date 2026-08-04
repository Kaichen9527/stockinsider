#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT_DIR, '.agent', 'cache');
const REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');
const CACHE_FILE = path.join(CACHE_DIR, 'visible-deep-dive-audit-cache.json');

function loadDotEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] != null) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT_DIR, '.env'));
loadDotEnv(path.join(ROOT_DIR, '.env.local'));

function parseArgs(argv) {
  const parsed = {
    baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3010',
    concurrency: 2,
    timeoutMs: 30000,
    cacheTtlMs: 15 * 60 * 1000,
    delayMs: 250,
    force: false,
    json: false,
    symbols: null,
    scope: 'visible',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') parsed.force = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--all-database') parsed.scope = 'all-database';
    else if (arg === '--scope' && argv[index + 1]) parsed.scope = argv[++index];
    else if (arg === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index];
    else if (arg === '--concurrency' && argv[index + 1]) parsed.concurrency = Math.max(1, Number(argv[++index]) || 2);
    else if (arg === '--timeout-ms' && argv[index + 1]) parsed.timeoutMs = Math.max(1000, Number(argv[++index]) || 30000);
    else if (arg === '--cache-ttl-ms' && argv[index + 1]) parsed.cacheTtlMs = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--delay-ms' && argv[index + 1]) parsed.delayMs = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--symbols' && argv[index + 1]) {
      parsed.symbols = argv[++index]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return parsed;
}

async function fetchDatabaseSymbols(timeoutMs) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are required for --scope all-database');
  }
  const url = `${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/stocks?select=symbol&order=symbol.asc&limit=10000`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!response.ok) throw new Error(`Supabase stocks request failed with status ${response.status}`);
    const rows = await response.json();
    return Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.symbol || '').trim()).filter(Boolean)));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function readJson(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filepath, value) {
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLine(value) {
  return compactText(value)
    .replace(/[\u3000]/g, ' ')
    .replace(/[：:｜|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeRadarPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (Array.isArray(payload.opportunities) || Array.isArray(payload.discoveredStocks) || Array.isArray(payload.scenarioUpsideCandidates) || Array.isArray(payload.earlyWatchlist)) {
    return payload;
  }
  if (payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return {};
}

function buildVisibleSymbols(radar) {
  const normalized = normalizeRadarPayload(radar);
  return Array.from(
    new Set(
      [
        ...(normalized.opportunities || []).map((item) => item.symbol),
        ...(normalized.scenarioUpsideCandidates || []).map((item) => item.symbol),
        ...(normalized.earlyWatchlist || []).map((item) => item.symbol),
        ...(normalized.discoveredStocks || []).map((item) => item.symbol),
      ].filter(Boolean),
    ),
  );
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: response.status, json };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function loadCache() {
  return readJson(CACHE_FILE, {
    version: 1,
    radar: {},
    symbols: {},
  });
}

function cacheKey(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function isCacheFresh(entry, ttlMs, baseUrl) {
  if (!entry) return false;
  if (entry.baseUrl !== cacheKey(baseUrl)) return false;
  if (!entry.fetchedAt) return false;
  if (ttlMs <= 0) return false;
  return Date.now() - new Date(entry.fetchedAt).getTime() <= ttlMs;
}

function scenarioModeForPayload(payload) {
  const scenarioCaseDetail = payload?.valuationPanel?.scenarioCaseDetail || null;
  const reportSections = payload?.reportSnapshot?.sections || [];
  const hasScenarioSection = reportSections.some((section) => section.id === 'scenario_case');
  const hasIndependentDelta = Boolean(scenarioCaseDetail?.hasIndependentDelta);
  return {
    hasScenarioSection,
    hasIndependentDelta,
    deltaAssumptions: Array.isArray(scenarioCaseDetail?.deltaAssumptions) ? scenarioCaseDetail.deltaAssumptions : [],
    achievementChecklist: Array.isArray(scenarioCaseDetail?.achievementChecklist) ? scenarioCaseDetail.achievementChecklist : [],
    scenarioNote: payload?.valuationPanel?.scenarioNote || null,
  };
}

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progress(message, options) {
  if (options.json) return;
  console.log(`[audit] ${message}`);
}

function tokenSet(value) {
  return new Set(
    normalizeLine(value)
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .filter((token) => token.length >= 2),
  );
}

function jaccardSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function hasSourceRefs(value) {
  return Array.isArray(value?.sourceRefs) && value.sourceRefs.length > 0;
}

function hasExternalCitation(citationMap) {
  return Array.isArray(citationMap) && citationMap.some((ref) =>
    ref &&
    ref.sourceType !== 'system' &&
    ref.evidenceClass !== 'external_source_pending' &&
    (ref.sourceUrl || ['official', 'financial', 'investanchors', 'public_research', 'news'].includes(ref.sourceType))
  );
}

function chipMetricsWereAttempted(chipDataStatus) {
  if (!chipDataStatus) return false;
  if (chipDataStatus.status === 'available') return true;
  const reasons = (chipDataStatus.missingReasons || []).join(' ');
  return /node-twstock|TWSE|最近有效|market refresh|來源/.test(reasons);
}

function validatePayload(symbol, payload, options = {}) {
  const issues = [];
  const strictValuation = options.strictValuation !== false;
  const targetSnapshot = payload?.targetSnapshot || null;
  const valuationPanel = payload?.valuationPanel || {};
  const sharedVerifiedBasis = valuationPanel.sharedVerifiedBasis || null;
  const baseCaseDetail = valuationPanel.baseCaseDetail || null;
  const scenarioCaseDetail = valuationPanel.scenarioCaseDetail || null;
  const valuationConfidenceGate = valuationPanel.valuationConfidenceGate || targetSnapshot?.valuationConfidenceGate || null;
  const reportSections = payload?.reportSnapshot?.sections || [];
  const sectionIds = new Set(reportSections.map((section) => section.id));
  const scenarioMode = scenarioModeForPayload(payload);
  const dataHealth = payload?.dataHealth || null;
  const recommendationStance = payload?.recommendationStance || null;
  const chipDataStatus = payload?.chipSnapshot?.dataStatus || null;

  if (strictValuation && !targetSnapshot) issues.push('missing_target_snapshot');
  if (strictValuation && !dataHealth) issues.push('data_health_missing');
  if (strictValuation && dataHealth && dataHealth.freshnessStatus !== 'healthy' && (!Array.isArray(dataHealth.staleReasons) || dataHealth.staleReasons.length === 0)) {
    issues.push('data_health_stale_reason_missing');
  }
  if (strictValuation && !recommendationStance) issues.push('recommendation_stance_missing');
  if (
    strictValuation &&
    targetSnapshot?.verdict === 'formal' &&
    payload?.chipEntryAssessment?.verdict === '資料不足不買' &&
    !/進場暫緩|資料不足|不買/.test(String(recommendationStance?.displayLabel || ''))
  ) {
    issues.push('formal_buy_conflicts_with_chip_entry');
  }
  if (strictValuation && (!chipDataStatus || !Array.isArray(chipDataStatus.missingReasons))) {
    issues.push('chip_data_status_missing');
  }
  if (strictValuation && chipDataStatus?.status !== 'available' && (!chipDataStatus?.missingReasons || chipDataStatus.missingReasons.length === 0)) {
    issues.push('chip_data_missing_reason_missing');
  }
  if (strictValuation && chipDataStatus?.status !== 'available' && !chipMetricsWereAttempted(chipDataStatus)) {
    issues.push('chip_data_attempt_not_proven');
  }
  const sourceStatuses = dataHealth?.sourceStatuses || [];
  if (strictValuation && (!Array.isArray(sourceStatuses) || sourceStatuses.length === 0)) issues.push('source_statuses_missing');
  if (strictValuation && (!sharedVerifiedBasis || !(sharedVerifiedBasis.summary || sharedVerifiedBasis.customerExposure || sharedVerifiedBasis.transcriptEvidence))) {
    issues.push('missing_shared_verified_basis');
  }
  const baseMustBeComplete = targetSnapshot?.verdict === 'formal' || valuationConfidenceGate?.baseTargetFormal === true;
  const scenarioMustBeComplete = targetSnapshot?.verdict === 'scenario';
  if (strictValuation && baseMustBeComplete && baseCaseDetail?.bridgeCompleteness !== 'complete') issues.push('base_not_complete');
  if (strictValuation && scenarioMustBeComplete && scenarioCaseDetail?.bridgeCompleteness !== 'complete') issues.push('scenario_not_complete');
  if (strictValuation && (!Array.isArray(baseCaseDetail?.evidenceBasis) || baseCaseDetail.evidenceBasis.length === 0)) issues.push('base_evidence_basis_missing');
  if (strictValuation && (!Array.isArray(scenarioCaseDetail?.evidenceBasis) || scenarioCaseDetail.evidenceBasis.length === 0)) issues.push('scenario_evidence_basis_missing');
  if (strictValuation && (!Array.isArray(valuationPanel.sourceCitationMap) || valuationPanel.sourceCitationMap.length === 0)) issues.push('source_citation_map_missing');
  if (strictValuation && !hasExternalCitation(valuationPanel.sourceCitationMap)) issues.push('external_source_citation_missing');
  if (strictValuation && !hasSourceRefs(sharedVerifiedBasis)) issues.push('shared_source_refs_missing');
  if (strictValuation && !hasSourceRefs(baseCaseDetail)) issues.push('base_source_refs_missing');
  if (strictValuation && !hasSourceRefs(scenarioCaseDetail)) issues.push('scenario_source_refs_missing');
  if (strictValuation && (!payload?.technicalEntrySignal?.verdict || !payload?.technicalEntrySignal?.summary)) issues.push('technical_entry_signal_missing');
  if (strictValuation && (!payload?.technicalEntrySignal?.entryPlan?.entryZone || !payload?.technicalEntrySignal?.entryPlan?.invalidationLevel)) {
    issues.push('technical_entry_plan_missing');
  }
  if (!payload?.chipEntryAssessment?.verdict || !payload?.chipEntryAssessment?.summary) issues.push('chip_entry_assessment_missing');
  if (!Array.isArray(payload?.chipEntryAssessment?.watchNumbers) || payload.chipEntryAssessment.watchNumbers.length < 3) {
    issues.push('chip_entry_watch_numbers_missing');
  }
  if (!Array.isArray(payload?.chipEntryAssessment?.nextSessionPlaybook) || payload.chipEntryAssessment.nextSessionPlaybook.length < 3) {
    issues.push('chip_entry_playbook_missing');
  }
  const microstructureStatus = payload?.chipEntryAssessment?.microstructureStatus || [];
  if (!Array.isArray(microstructureStatus) || microstructureStatus.length < 3) {
    issues.push('microstructure_status_missing');
  } else if (microstructureStatus.some((item) => item.status === 'missing' && !item.missingReason)) {
    issues.push('microstructure_missing_reason_missing');
  }
  const chipEntryText = [
    payload?.chipEntryAssessment?.chipRead,
    payload?.chipEntryAssessment?.technicalRead,
    ...(payload?.chipEntryAssessment?.watchNumbers || []).map((item) => `${item.label} ${item.value} ${item.interpretation}`),
  ].join(' ');
  const chipSignalCategories = [
    /外資|投信|自營|法人/.test(chipEntryText),
    /融資|融券/.test(chipEntryText),
    /借券|SBL/.test(chipEntryText),
    /MA|RSI|MACD|Fibonacci|費波/.test(chipEntryText),
  ].filter(Boolean).length;
  if (chipSignalCategories < 3) issues.push('chip_entry_not_specific_enough');
  if (strictValuation && (!Array.isArray(payload?.appendix?.coverageStatus) || payload.appendix.coverageStatus.length === 0)) {
    issues.push('source_coverage_status_missing');
  }
  if (strictValuation && !sectionIds.has('analysis')) issues.push('analysis_section_missing');
  if (strictValuation && !sectionIds.has('base_case')) issues.push('base_section_missing');
  if (strictValuation && !sectionIds.has('latest_evidence')) issues.push('latest_evidence_section_missing');
  if (strictValuation && scenarioMode.hasIndependentDelta) {
    if (scenarioMode.deltaAssumptions.length === 0) issues.push('scenario_delta_missing');
    if (scenarioMode.achievementChecklist.length === 0) issues.push('scenario_achievement_checklist_missing');
    if (!scenarioMode.hasScenarioSection) issues.push('scenario_section_missing');
  } else if (strictValuation) {
    if (!scenarioMode.scenarioNote) issues.push('scenario_note_missing');
    if (scenarioMode.hasScenarioSection) issues.push('scenario_section_should_be_collapsed');
  }

  const baseParagraphs = (reportSections.find((section) => section.id === 'base_case')?.paragraphs || []).map(normalizeLine);
  const scenarioParagraphs = (reportSections.find((section) => section.id === 'scenario_case')?.paragraphs || []).map(normalizeLine);
  if (strictValuation && scenarioMode.hasIndependentDelta && scenarioParagraphs.length > 0) {
    const scenarioUnique = scenarioParagraphs.filter((line) => line && !baseParagraphs.includes(line));
    if (scenarioUnique.length === 0) issues.push('scenario_story_not_differentiated');
    const baseJoined = baseParagraphs.join(' ');
    const scenarioJoined = scenarioParagraphs.join(' ');
    if (jaccardSimilarity(baseJoined, scenarioJoined) >= 0.78) issues.push('scenario_story_too_similar_to_base');
  }
  for (const section of reportSections) {
    if (strictValuation && ['analysis', 'base_case', 'scenario_case', 'latest_evidence'].includes(section.id) && !Array.isArray(section.sourceRefs)) {
      issues.push(`${section.id}_source_refs_missing`);
    }
  }
  const investmentText = (reportSections.find((section) => section.id === 'investment')?.paragraphs || []).join(' ');
  if (strictValuation && !/技術|進場|MA|MACD|RSI|Fibonacci|費波/i.test(investmentText)) issues.push('investment_missing_technical_timing');
  if (strictValuation && !/現在策略|籌碼|買點|分批|回測|不追|進場/i.test(investmentText)) issues.push('investment_missing_chip_entry_timing');
  const subtitle = normalizeLine(payload?.reportSnapshot?.subtitle || '');
  const sharedSummary = normalizeLine(sharedVerifiedBasis?.summary || '');
  if (strictValuation && subtitle && sharedSummary && jaccardSimilarity(subtitle, sharedSummary) >= 0.62) {
    issues.push('subtitle_duplicates_shared_basis');
  }
  const analysisText = (reportSections.find((section) => section.id === 'analysis')?.paragraphs || []).join(' ');
  if (strictValuation && sharedSummary && analysisText && jaccardSimilarity(sharedSummary, analysisText) >= 0.72) {
    issues.push('analysis_duplicates_shared_basis');
  }

  return {
    symbol,
    ok: issues.length === 0,
    issues,
    verdict: targetSnapshot?.verdict || null,
    baseTarget: targetSnapshot?.baseTarget ?? null,
    scenarioTarget: targetSnapshot?.upsideTarget ?? null,
    sharedBasisPresent: Boolean(sharedVerifiedBasis),
    baseComplete: baseCaseDetail?.bridgeCompleteness === 'complete',
    scenarioComplete: scenarioCaseDetail?.bridgeCompleteness === 'complete',
    scenarioMode: scenarioMode.hasIndependentDelta ? 'delta' : 'collapsed',
    scenarioDeltaCount: scenarioMode.deltaAssumptions.length,
    dataHealthStatus: dataHealth?.freshnessStatus || null,
    recommendationLabel: recommendationStance?.displayLabel || null,
    chipDataStatus: chipDataStatus?.status || null,
    technicalEntrySignal: payload?.technicalEntrySignal?.verdict || null,
    chipEntryVerdict: payload?.chipEntryAssessment?.verdict || null,
    scenarioNote: scenarioMode.scenarioNote,
    reportUpdatedAt: targetSnapshot?.reportUpdatedAt || null,
  };
}

async function mapWithConcurrency(items, concurrency, iteratee) {
  const queue = [...items];
  const results = [];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item == null) return;
      results.push(await iteratee(item));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

function renderSummary(report) {
  const lines = [
    `Visible symbols: ${report.visibleSymbols.length}`,
    `Pass: ${report.passCount}`,
    `Fail: ${report.failCount}`,
    `Fetched: ${report.fetchCount}`,
    `Cache hits: ${report.cacheHitCount}`,
    `Scenario delta: ${report.deltaCount}`,
    `Scenario collapsed: ${report.collapsedCount}`,
    `Report: ${report.reportFile}`,
  ];
  if (report.failCount > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const issue of report.failures) {
      lines.push(`- ${issue.symbol}: ${issue.issues.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  ensureDirs();
  const options = parseArgs(process.argv.slice(2));
  const cache = loadCache();
  const base = cacheKey(options.baseUrl);
  const warnings = [];

  let radarEntry = cache.radar[base];
  let radar;
  let radarCacheHit = false;
  if (options.scope === 'all-database') {
    progress('resolving symbols from Supabase stocks table', options);
    const databaseSymbols = await fetchDatabaseSymbols(options.timeoutMs);
    radar = {
      opportunities: databaseSymbols.map((symbol) => ({ symbol })),
      scenarioUpsideCandidates: [],
      discoveredStocks: [],
    };
  } else if (!options.force && isCacheFresh(radarEntry, options.cacheTtlMs, options.baseUrl)) {
    radar = radarEntry.payload;
    radarCacheHit = true;
    progress(`using fresh radar cache for ${base}`, options);
  } else {
    progress(`fetching radar symbols from ${options.baseUrl}/api/radar/daily`, options);
    try {
      const radarRes = await fetchJson(`${options.baseUrl}/api/radar/daily`, options.timeoutMs);
      if (radarRes.status !== 200) {
        throw new Error(`Radar daily request failed with status ${radarRes.status}`);
      }
      radar = radarRes.json;
      radarEntry = {
        baseUrl: base,
        fetchedAt: nowIso(),
        payload: radar,
      };
      cache.radar[base] = radarEntry;
      writeJson(CACHE_FILE, cache);
    } catch (error) {
      if (radarEntry?.payload) {
        radar = radarEntry.payload;
        radarCacheHit = true;
        warnings.push(`radar_fetch_failed_using_stale_cache:${String(error.message || error)}`);
        progress(`radar fetch failed, falling back to stale cache (${String(error.message || error)})`, options);
      } else {
        throw error;
      }
    }
  }

  const visibleSymbols = buildVisibleSymbols(radar).filter((symbol) =>
    options.symbols ? options.symbols.includes(symbol) : true,
  );
  progress(`resolved ${visibleSymbols.length} ${options.scope === 'all-database' ? 'database' : 'visible'} symbols`, options);

  let completed = 0;

  const symbolResults = await mapWithConcurrency(visibleSymbols, options.concurrency, async (symbol) => {
    const cached = cache.symbols[`${base}::${symbol}`];
    if (!options.force && isCacheFresh(cached, options.cacheTtlMs, options.baseUrl)) {
      completed += 1;
      progress(`[${completed}/${visibleSymbols.length}] ${symbol} cache hit`, options);
      return {
        ...cached.result,
        fromCache: true,
      };
    }

    const startedAt = Date.now();
    progress(`[${completed + 1}/${visibleSymbols.length}] ${symbol} fetching`, options);
    try {
      const { status, json } = await fetchJson(`${options.baseUrl}/api/stocks/${symbol}/deep-dive`, options.timeoutMs);
      const validation =
        status === 200 || (status === 202 && options.scope === 'all-database')
          ? validatePayload(symbol, json, { strictValuation: options.scope !== 'all-database' })
          : {
              symbol,
              ok: false,
              issues: [`http_${status}`],
              verdict: null,
              baseTarget: null,
              scenarioTarget: null,
              sharedBasisPresent: false,
              baseComplete: false,
              scenarioComplete: false,
              scenarioMode: 'error',
              scenarioDeltaCount: 0,
              scenarioNote: null,
              reportUpdatedAt: null,
              chipEntryVerdict: null,
            };
      const result = {
        ...validation,
        status,
        durationMs: Date.now() - startedAt,
        fetchedAt: nowIso(),
      };
      cache.symbols[`${base}::${symbol}`] = {
        baseUrl: base,
        fetchedAt: result.fetchedAt,
        result,
      };
      writeJson(CACHE_FILE, cache);
      completed += 1;
      progress(
        `[${completed}/${visibleSymbols.length}] ${symbol} ${result.ok ? 'ok' : 'fail'} (${result.durationMs}ms${status ? `, http ${status}` : ''})`,
        options,
      );
      await delay(options.delayMs);
      return {
        ...result,
        fromCache: false,
      };
    } catch (error) {
      const result = {
        symbol,
        ok: false,
        issues: ['fetch_error', String(error)],
        status: null,
        durationMs: Date.now() - startedAt,
        fetchedAt: nowIso(),
        verdict: null,
        baseTarget: null,
        scenarioTarget: null,
        sharedBasisPresent: false,
        baseComplete: false,
        scenarioComplete: false,
        scenarioMode: 'error',
        scenarioDeltaCount: 0,
        scenarioNote: null,
        reportUpdatedAt: null,
        chipEntryVerdict: null,
      };
      cache.symbols[`${base}::${symbol}`] = {
        baseUrl: base,
        fetchedAt: result.fetchedAt,
        result,
      };
      writeJson(CACHE_FILE, cache);
      completed += 1;
      progress(`[${completed}/${visibleSymbols.length}] ${symbol} fail (${result.durationMs}ms, ${String(error.message || error)})`, options);
      await delay(options.delayMs);
      return {
        ...result,
        fromCache: false,
      };
    }
  });

  const failures = symbolResults.filter((result) => !result.ok);
  const report = {
    generatedAt: nowIso(),
    baseUrl: options.baseUrl,
    options,
    radarCacheHit,
    warnings,
    visibleSymbols,
    symbolScope: options.scope,
    passCount: symbolResults.filter((result) => result.ok).length,
    failCount: failures.length,
    fetchCount: symbolResults.filter((result) => !result.fromCache).length,
    cacheHitCount: symbolResults.filter((result) => result.fromCache).length,
    deltaCount: symbolResults.filter((result) => result.scenarioMode === 'delta').length,
    collapsedCount: symbolResults.filter((result) => result.scenarioMode === 'collapsed').length,
    failures,
    results: symbolResults.sort((left, right) => left.symbol.localeCompare(right.symbol)),
  };

  const stamp = nowIso().replace(/[:.]/g, '-');
  const reportFile = path.join(REPORTS_DIR, `visible-deep-dive-audit-${stamp}.json`);
  report.reportFile = reportFile;
  writeJson(reportFile, report);
  writeJson(CACHE_FILE, cache);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderSummary(report));
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`visible deep-dive audit failed: ${error.message}`);
  process.exit(1);
});
