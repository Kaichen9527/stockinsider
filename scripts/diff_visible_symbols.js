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
    if (process.env[match[1]] != null) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadDotEnv(path.join(ROOT_DIR, '.env'));
loadDotEnv(path.join(ROOT_DIR, '.env.local'));

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3010',
    beforeFile: null,
    beforeSymbols: null,
    timeoutMs: 30000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--base-url' && argv[index + 1]) options.baseUrl = argv[++index];
    else if (arg === '--before-file' && argv[index + 1]) options.beforeFile = argv[++index];
    else if (arg === '--before-symbols' && argv[index + 1]) {
      options.beforeSymbols = argv[++index].split(',').map((item) => item.trim()).filter(Boolean);
    } else if (arg === '--timeout-ms' && argv[index + 1]) {
      options.timeoutMs = Math.max(1000, Number(argv[++index]) || 30000);
    }
  }
  return options;
}

function ensureDirs() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJson(filepath, value) {
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2));
}

function normalizeRadarPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (Array.isArray(payload.opportunities) || Array.isArray(payload.discoveredStocks) || Array.isArray(payload.scenarioUpsideCandidates)) {
    return payload;
  }
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return {};
}

function collectEntries(radar) {
  const normalized = normalizeRadarPayload(radar);
  const buckets = [
    ['opportunities', normalized.opportunities || []],
    ['scenarioUpsideCandidates', normalized.scenarioUpsideCandidates || []],
    ['discoveredStocks', normalized.discoveredStocks || []],
  ];
  const bySymbol = new Map();
  for (const [bucket, entries] of buckets) {
    for (const entry of entries) {
      if (!entry?.symbol) continue;
      const existing = bySymbol.get(entry.symbol) || {
        symbol: entry.symbol,
        chineseName: entry.chineseName || entry.name || null,
        buckets: [],
        recommendationState: entry.recommendationState || null,
        score: entry.score ?? entry.confidence ?? entry.expectationScore ?? null,
        primaryUpsidePct: entry.cardPrimaryUpsidePct ?? entry.upsidePct ?? null,
      };
      existing.buckets.push(bucket);
      bySymbol.set(entry.symbol, existing);
    }
  }
  return Array.from(bySymbol.values());
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return {
      status: response.status,
      json: text ? JSON.parse(text) : null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function latestAuditReport() {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR)
    .filter((file) => /^visible-deep-dive-audit-.*\.json$/.test(file))
    .map((file) => path.join(REPORTS_DIR, file))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return files[0] || null;
}

function beforeSymbolsFromFile(filepath) {
  const report = readJson(filepath);
  if (Array.isArray(report.visibleSymbols)) return report.visibleSymbols;
  if (Array.isArray(report.results)) return report.results.map((item) => item.symbol).filter(Boolean);
  if (Array.isArray(report.symbols)) return report.symbols;
  return [];
}

function render(report) {
  const lines = [
    `Before: ${report.beforeSymbols.length}`,
    `After: ${report.afterSymbols.length}`,
    `Added: ${report.addedSymbols.length}`,
    `Removed: ${report.removedSymbols.length}`,
    `Retained: ${report.retainedSymbols.length}`,
    `Report: ${report.reportFile}`,
  ];
  if (report.addedSymbols.length) lines.push(`Added symbols: ${report.addedSymbols.map((item) => item.symbol).join(', ')}`);
  if (report.removedSymbols.length) lines.push(`Removed symbols: ${report.removedSymbols.map((item) => item.symbol).join(', ')}`);
  return lines.join('\n');
}

async function main() {
  ensureDirs();
  const options = parseArgs(process.argv.slice(2));
  const beforeFile = options.beforeFile || latestAuditReport();
  const beforeSymbols = Array.from(new Set(options.beforeSymbols || (beforeFile ? beforeSymbolsFromFile(beforeFile) : [])));

  const radarRes = await fetchJson(`${options.baseUrl}/api/radar/daily`, options.timeoutMs);
  if (radarRes.status !== 200) throw new Error(`Radar daily request failed with status ${radarRes.status}`);
  const afterEntries = collectEntries(radarRes.json);
  const afterSymbols = afterEntries.map((item) => item.symbol);
  const afterBySymbol = new Map(afterEntries.map((item) => [item.symbol, item]));
  const beforeSet = new Set(beforeSymbols);
  const afterSet = new Set(afterSymbols);

  const addedSymbols = afterSymbols
    .filter((symbol) => !beforeSet.has(symbol))
    .map((symbol) => ({
      ...afterBySymbol.get(symbol),
      reason: 'new_in_visible_radar_after_refresh_or_re-rank',
    }));
  const removedSymbols = beforeSymbols
    .filter((symbol) => !afterSet.has(symbol))
    .map((symbol) => ({
      symbol,
      reason: 'no_longer_in_visible_radar_after_refresh_or_re-rank',
    }));
  const retainedSymbols = afterSymbols
    .filter((symbol) => beforeSet.has(symbol))
    .map((symbol) => ({
      ...afterBySymbol.get(symbol),
      reason: 'retained_in_visible_radar',
    }));

  const report = {
    generatedAt: nowIso(),
    baseUrl: options.baseUrl,
    beforeSource: options.beforeSymbols ? 'cli_before_symbols' : beforeFile,
    beforeSymbols,
    afterSymbols,
    addedSymbols,
    removedSymbols,
    retainedSymbols,
  };
  const reportFile = path.join(REPORTS_DIR, `visible-symbol-diff-${nowIso().replace(/[:.]/g, '-')}.json`);
  report.reportFile = reportFile;
  writeJson(reportFile, report);
  console.log(options.json ? JSON.stringify(report, null, 2) : render(report));
}

main().catch((error) => {
  console.error(`visible symbol diff failed: ${error.message}`);
  process.exit(1);
});
