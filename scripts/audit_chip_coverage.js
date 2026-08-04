#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');

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
    timeoutMs: 30000,
    concurrency: 2,
    symbols: null,
    scope: 'visible',
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--scope' && argv[index + 1]) parsed.scope = argv[++index];
    else if (arg === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index];
    else if (arg === '--timeout-ms' && argv[index + 1]) parsed.timeoutMs = Math.max(1000, Number(argv[++index]) || 30000);
    else if (arg === '--concurrency' && argv[index + 1]) parsed.concurrency = Math.max(1, Number(argv[++index]) || 2);
    else if (arg === '--symbols' && argv[index + 1]) {
      parsed.symbols = argv[++index].split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    return { status: response.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRest(pathname, timeoutMs) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env is required for all-database chip coverage audit');
  const base = supabaseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(`${base}/rest/v1/${pathname}`, {
      signal: controller.signal,
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Supabase request failed ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRadarPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (Array.isArray(payload.opportunities) || Array.isArray(payload.discoveredStocks) || Array.isArray(payload.scenarioUpsideCandidates)) return payload;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return {};
}

function visibleSymbolsFromRadar(payload) {
  const radar = normalizeRadarPayload(payload);
  return Array.from(new Set([
    ...(radar.opportunities || []).map((item) => item.symbol),
    ...(radar.scenarioUpsideCandidates || []).map((item) => item.symbol),
    ...(radar.discoveredStocks || []).map((item) => item.symbol),
  ].filter(Boolean)));
}

async function resolveSymbols(options) {
  if (options.symbols?.length) return options.symbols;
  if (options.scope === 'all-database') {
    const rows = await supabaseRest('stocks?select=symbol&market=eq.TW&order=symbol.asc&limit=10000', options.timeoutMs);
    return Array.from(new Set((rows || []).map((row) => String(row.symbol || '')).filter(Boolean)));
  }
  const radar = await fetchJson(`${options.baseUrl.replace(/\/+$/, '')}/api/radar/daily`, options.timeoutMs);
  if (radar.status !== 200) throw new Error(`radar request failed ${radar.status}`);
  return visibleSymbolsFromRadar(radar.json);
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function chipText(payload) {
  return [
    payload?.chipEntryAssessment?.chipRead,
    payload?.chipEntryAssessment?.technicalRead,
    ...(payload?.chipEntryAssessment?.watchNumbers || []).map((item) => `${item.label} ${item.value} ${item.interpretation}`),
  ].join(' ');
}

function validateChipPayload(symbol, payload, status) {
  const issues = [];
  const chipStatus = payload?.chipSnapshot?.dataStatus || null;
  const assessment = payload?.chipEntryAssessment || null;
  if (status !== 200) issues.push(`http_${status}`);
  if (!chipStatus) issues.push('chip_data_status_missing');
  if (chipStatus && chipStatus.status !== 'available' && (!Array.isArray(chipStatus.missingReasons) || chipStatus.missingReasons.length === 0)) {
    issues.push('chip_missing_reason_missing');
  }
  if (chipStatus && chipStatus.status !== 'available') {
    const reasons = (chipStatus.missingReasons || []).join(' ');
    if (!/node-twstock|TWSE|TPEx|FinMind|最近有效|market refresh|fallback/i.test(reasons)) {
      issues.push('chip_fallback_attempt_not_proven');
    }
  }
  if (!assessment?.verdict || !assessment?.summary) issues.push('chip_entry_assessment_missing');
  if (!Array.isArray(assessment?.watchNumbers) || assessment.watchNumbers.length < 3) issues.push('watch_numbers_missing');
  if (!Array.isArray(assessment?.nextSessionPlaybook) || assessment.nextSessionPlaybook.length < 3) issues.push('playbook_missing');
  if (assessment?.verdict === '資料不足不買' && chipStatus?.status !== 'missing') {
    issues.push('data_insufficient_verdict_but_chip_not_missing');
  }
  const categories = [
    /外資|投信|自營|法人/.test(chipText(payload)),
    /融資|融券/.test(chipText(payload)),
    /借券|SBL|short/i.test(chipText(payload)),
    /MA|RSI|MACD|Fibonacci|費波/.test(chipText(payload)),
  ].filter(Boolean).length;
  if (categories < 3) issues.push('chip_entry_not_specific_enough');
  return {
    symbol,
    ok: issues.length === 0,
    issues,
    chipStatus: chipStatus?.status || null,
    missingGroups: chipStatus?.missingGroups || [],
    source: chipStatus?.source || null,
    asOf: chipStatus?.asOf || null,
    verdict: assessment?.verdict || null,
  };
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const options = parseArgs(process.argv.slice(2));
  const symbols = await resolveSymbols(options);
  let completed = 0;
  const results = await mapWithConcurrency(symbols, options.concurrency, async (symbol) => {
    const { status, json } = await fetchJson(`${options.baseUrl.replace(/\/+$/, '')}/api/stocks/${symbol}/deep-dive`, options.timeoutMs);
    completed += 1;
    if (!options.json) console.log(`[chip-audit] ${completed}/${symbols.length} ${symbol} http=${status}`);
    return validateChipPayload(symbol, json, status);
  });
  const failures = results.filter((item) => !item.ok);
  const report = {
    generatedAt: nowIso(),
    baseUrl: options.baseUrl,
    scope: options.scope,
    symbolCount: symbols.length,
    passCount: results.length - failures.length,
    failCount: failures.length,
    failures,
    results: results.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
  const reportFile = path.join(REPORTS_DIR, `chip-coverage-audit-${nowIso().replace(/[:.]/g, '-')}.json`);
  report.reportFile = reportFile;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Chip coverage pass: ${report.passCount}/${report.symbolCount}`);
    if (failures.length) {
      console.log('Failures:');
      for (const item of failures) console.log(`- ${item.symbol}: ${item.issues.join(', ')}`);
    }
    console.log(`Report: ${reportFile}`);
  }
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`chip coverage audit failed: ${error.message}`);
  process.exit(1);
});
