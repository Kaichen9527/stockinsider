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
    limit: 200,
    timeoutMs: 30000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index];
    else if (arg === '--limit' && argv[index + 1]) parsed.limit = Math.max(1, Number(argv[++index]) || 200);
    else if (arg === '--timeout-ms' && argv[index + 1]) parsed.timeoutMs = Math.max(1000, Number(argv[++index]) || 30000);
  }
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

async function fetchJson(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${response.status} ${text}`);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRest(pathname, timeoutMs) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
  }
  const base = supabaseUrl.replace(/\/+$/, '');
  return fetchJson(`${base}/rest/v1/${pathname}`, timeoutMs, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: 'application/json',
    },
  });
}

function normalizeRadarPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (Array.isArray(payload.opportunities) || Array.isArray(payload.discoveredStocks) || Array.isArray(payload.scenarioUpsideCandidates)) {
    return payload;
  }
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return {};
}

function buildVisibleSymbols(radar) {
  const normalized = normalizeRadarPayload(radar);
  return new Set(
    [
      ...(normalized.opportunities || []).map((item) => item.symbol),
      ...(normalized.scenarioUpsideCandidates || []).map((item) => item.symbol),
      ...(normalized.discoveredStocks || []).map((item) => item.symbol),
    ].filter(Boolean),
  );
}

function extractSymbolsFromDoc(doc, stockBySymbol) {
  const explicit = Array.isArray(doc.symbols) ? doc.symbols.map(String) : [];
  const text = `${doc.title || ''}\n${doc.summary || ''}\n${doc.content_text || ''}`;
  const textSymbols = Array.from(String(text).matchAll(/[【\[(（]\s*(\d{4})\s*[】\])）]/g)).map((match) => match[1]);
  return unique([...explicit, ...textSymbols])
    .map((symbol) => symbol.trim())
    .filter((symbol) => {
      if (!/^\d{4}$/.test(symbol)) return false;
      const stock = stockBySymbol.get(symbol);
      if (!stock) return false;
      const stockName = compactText(stock.name || '');
      return textSymbols.includes(symbol) || (stockName.length >= 2 && stockName !== symbol && !/^\d+$/.test(stockName) && String(text).includes(stockName));
    });
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const options = parseArgs(process.argv.slice(2));

  const [docs, stocks, storyCandidates] = await Promise.all([
    supabaseRest(
      `source_raw_documents?select=id,platform,title,summary,content_text,document_url,symbols,collected_at&platform=eq.investanchors&order=collected_at.desc&limit=${options.limit}`,
      options.timeoutMs,
    ),
    supabaseRest('stocks?select=id,symbol,name,market&market=eq.TW&limit=3000', options.timeoutMs),
    supabaseRest(
      'story_candidates?select=stock_id,story_type,title,source_mix,as_of_date,thesis_state,verification_status,updated_at&order=updated_at.desc&limit=1500',
      options.timeoutMs,
    ),
  ]);

  let radar = {};
  try {
    radar = await fetchJson(`${options.baseUrl.replace(/\/+$/, '')}/api/radar/daily`, options.timeoutMs);
  } catch (error) {
    radar = { auditWarning: `radar_fetch_failed:${String(error.message || error)}` };
  }

  const stockBySymbol = new Map(stocks.map((stock) => [String(stock.symbol || ''), stock]).filter(([symbol]) => Boolean(symbol)));
  const symbolByStockId = new Map(stocks.map((stock) => [String(stock.id || ''), String(stock.symbol || '')]));
  const visibleSymbols = buildVisibleSymbols(radar);
  const mentioned = new Map();

  for (const doc of docs) {
    for (const symbol of extractSymbolsFromDoc(doc, stockBySymbol)) {
      const current = mentioned.get(symbol) || [];
      current.push({
        title: compactText(doc.title).slice(0, 180),
        documentUrl: doc.document_url || null,
        collectedAt: doc.collected_at || null,
      });
      mentioned.set(symbol, current);
    }
  }

  const candidateSymbols = new Set(
    storyCandidates
      .filter((row) => {
        const sourceMix = Array.isArray(row.source_mix) ? row.source_mix : [];
        return (
          compactText(row.title).includes('定錨') ||
          sourceMix.some((item) => /investanchors|定錨/i.test(`${item?.source || ''} ${item?.sourceType || ''}`))
        );
      })
      .map((row) => symbolByStockId.get(String(row.stock_id || '')))
      .filter(Boolean),
  );

  const results = Array.from(mentioned.entries())
    .map(([symbol, mentions]) => {
      const inCandidatePool = candidateSymbols.has(symbol);
      const visible = visibleSymbols.has(symbol);
      return {
        symbol,
        mentionCount: mentions.length,
        inCandidatePool,
        visible,
        reason: inCandidatePool
          ? visible
            ? 'visible_or_promoted'
            : 'verification_pending_or_bridge_not_promoted'
          : 'missing_from_candidate_pool',
        latestMention: mentions[0] || null,
      };
    })
    .sort((left, right) => {
      if (left.inCandidatePool !== right.inCandidatePool) return left.inCandidatePool ? 1 : -1;
      return left.symbol.localeCompare(right.symbol);
    });

  const missing = results.filter((item) => !item.inCandidatePool);
  const report = {
    generatedAt: nowIso(),
    baseUrl: options.baseUrl,
    docsScanned: docs.length,
    mentionedSymbols: results.length,
    candidatePoolCovered: results.length - missing.length,
    missingCount: missing.length,
    missing,
    results,
  };

  const stamp = nowIso().replace(/[:.]/g, '-');
  const reportFile = path.join(REPORTS_DIR, `investanchors-candidate-audit-${stamp}.json`);
  report.reportFile = reportFile;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`InvestAnchors mentioned symbols: ${report.mentionedSymbols}`);
    console.log(`Candidate pool covered: ${report.candidatePoolCovered}`);
    console.log(`Missing: ${report.missingCount}`);
    console.log(`Report: ${report.reportFile}`);
    if (missing.length > 0) {
      console.log('');
      console.log('Missing symbols:');
      for (const item of missing) console.log(`- ${item.symbol}: ${item.reason}`);
    }
  }

  if (missing.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`investanchors candidate audit failed: ${error.message}`);
  process.exit(1);
});
