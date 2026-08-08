#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchText(url) {
  const startedAt = Date.now();
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'stockinsider-egress-risk-audit/1.0',
    },
  });
  const text = await res.text();
  return {
    url,
    status: res.status,
    ok: res.ok,
    bytes: Buffer.byteLength(text, 'utf8'),
    cacheControl: res.headers.get('cache-control'),
    payloadMode: res.headers.get('x-stockinsider-payload-mode'),
    elapsedMs: Date.now() - startedAt,
    text,
  };
}

function visibleSymbolsFromRadar(radar, maxSymbols) {
  const buckets = [
    radar?.opportunities,
    radar?.scenarioUpsideCandidates,
    radar?.earlyWatchlist,
    radar?.hotTracking,
  ];
  const symbols = [];
  const seen = new Set();
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      const symbol = String(item?.symbol || '').trim();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      symbols.push(symbol);
      if (symbols.length >= maxSymbols) return symbols;
    }
  }
  return symbols;
}

async function main() {
  const baseUrl = String(argValue('--base-url', 'http://127.0.0.1:3012')).replace(/\/$/, '');
  const maxInteractiveBytes = Number(argValue('--max-interactive-bytes', 900_000));
  const radarMaxBytes = Number(argValue('--radar-max-bytes', 500_000));
  const lightMaxBytes = Number(argValue('--light-max-bytes', 250_000));
  const statusMaxBytes = Number(argValue('--status-max-bytes', 25_000));
  const sourcesMaxBytes = Number(argValue('--sources-max-bytes', 100_000));
  const maxSymbols = Number(argValue('--max-symbols', 4));
  const reportsDir = path.join(process.cwd(), '.agent', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const responses = [];
  const issues = [];

  const radar = await fetchText(`${baseUrl}/api/radar/daily`);
  responses.push({ label: 'radar_daily', ...radar, text: undefined });
  if (!radar.ok) issues.push(`radar_daily_http_${radar.status}`);
  if (radar.bytes > radarMaxBytes) issues.push(`radar_daily_endpoint_bytes:${radar.bytes}>${radarMaxBytes}`);

  let radarJson = null;
  try {
    radarJson = JSON.parse(radar.text);
  } catch {
    issues.push('radar_daily_invalid_json');
  }

  const explicitSymbols = parseSymbols(argValue('--symbols', ''));
  const symbols = explicitSymbols.length > 0 ? explicitSymbols.slice(0, maxSymbols) : visibleSymbolsFromRadar(radarJson || {}, maxSymbols);
  for (const symbol of symbols) {
    const status = await fetchText(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/deep-dive?view=status`);
    responses.push({ label: `${symbol}_status`, ...status, text: undefined });
    if (!status.ok && status.status !== 202) issues.push(`${symbol}_status_http_${status.status}`);
    if (status.bytes > statusMaxBytes) issues.push(`${symbol}_status_unexpectedly_large:${status.bytes}>${statusMaxBytes}`);

    const light = await fetchText(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/deep-dive?view=light`);
    responses.push({ label: `${symbol}_light`, ...light, text: undefined });
    if (!light.ok && light.status !== 202) issues.push(`${symbol}_light_http_${light.status}`);
    if (light.bytes > lightMaxBytes) issues.push(`${symbol}_light_endpoint_bytes:${light.bytes}>${lightMaxBytes}`);
  }

  const sources = await fetchText(`${baseUrl}/api/sources/search?pageSize=10`);
  responses.push({ label: 'sources_search_page_10', ...sources, text: undefined });
  if (!sources.ok) issues.push(`sources_search_http_${sources.status}`);
  if (sources.bytes > sourcesMaxBytes) issues.push(`sources_search_page_10_too_large:${sources.bytes}>${sourcesMaxBytes}`);

  const totalInteractiveBytes = responses.reduce((sum, item) => sum + item.bytes, 0);
  if (totalInteractiveBytes > maxInteractiveBytes) {
    issues.push(`interactive_sample_too_large:${totalInteractiveBytes}>${maxInteractiveBytes}`);
  }

  const report = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    passed: issues.length === 0,
    issues,
    maxInteractiveBytes,
    radarMaxBytes,
    lightMaxBytes,
    statusMaxBytes,
    sourcesMaxBytes,
    symbols,
    totalInteractiveBytes,
    responses: responses.map((item) => ({
      label: item.label,
      url: item.url,
      status: item.status,
      bytes: item.bytes,
      cacheControl: item.cacheControl,
      payloadMode: item.payloadMode,
      elapsedMs: item.elapsedMs,
    })),
  };
  const reportPath = path.join(reportsDir, `supabase-egress-risk-audit-${report.checkedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (issues.length > 0) {
    console.error(`Supabase egress risk audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log(`Supabase egress risk audit: pass (${totalInteractiveBytes} bytes sampled)`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Supabase egress risk audit failed: ${error.message}`);
  process.exit(1);
});
