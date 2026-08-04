#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
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
      'user-agent': 'stockinsider-payload-size-audit/1.0',
    },
  });
  const text = await res.text();
  return {
    url,
    status: res.status,
    ok: res.ok,
    bytes: Buffer.byteLength(text, 'utf8'),
    contentLength: res.headers.get('content-length'),
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
    radar?.recentFormal7d,
    radar?.fallbackOpportunities90d,
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

function thresholdArgs() {
  return {
    radarMaxBytes: Number(argValue('--radar-max-bytes', 500_000)),
    statusMaxBytes: Number(argValue('--status-max-bytes', 25_000)),
    lightMaxBytes: Number(argValue('--light-max-bytes', 250_000)),
    fullMaxBytes: Number(argValue('--full-max-bytes', 3_000_000)),
    sourcesMaxBytes: Number(argValue('--sources-max-bytes', 100_000)),
    maxSymbols: Number(argValue('--max-symbols', 3)),
  };
}

async function main() {
  const baseUrl = String(argValue('--base-url', 'http://127.0.0.1:3012')).replace(/\/$/, '');
  const includeFull = hasFlag('--include-full');
  const reportsDir = path.join(process.cwd(), '.agent', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const thresholds = thresholdArgs();
  const issues = [];
  const responses = [];

  const radar = await fetchText(`${baseUrl}/api/radar/daily`);
  responses.push({
    label: 'radar_daily',
    url: radar.url,
    status: radar.status,
    bytes: radar.bytes,
    cacheControl: radar.cacheControl,
    payloadMode: radar.payloadMode,
    elapsedMs: radar.elapsedMs,
  });
  if (!radar.ok) issues.push(`radar_daily_http_${radar.status}`);
  if (radar.bytes > thresholds.radarMaxBytes) {
    issues.push(`radar_daily_payload_too_large:${radar.bytes}>${thresholds.radarMaxBytes}`);
  }

  let radarJson = null;
  try {
    radarJson = JSON.parse(radar.text);
  } catch {
    issues.push('radar_daily_invalid_json');
  }

  const symbols =
    parseSymbols(argValue('--symbols', '')) ||
    [];
  const auditSymbols =
    symbols.length > 0
      ? symbols.slice(0, thresholds.maxSymbols)
      : visibleSymbolsFromRadar(radarJson || {}, thresholds.maxSymbols);

  for (const symbol of auditSymbols) {
    const status = await fetchText(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/deep-dive?view=status`);
    responses.push({
      label: `${symbol}_deep_dive_status`,
      url: status.url,
      status: status.status,
      bytes: status.bytes,
      cacheControl: status.cacheControl,
      payloadMode: status.payloadMode,
      elapsedMs: status.elapsedMs,
    });
    if (!status.ok && status.status !== 202) issues.push(`${symbol}_status_http_${status.status}`);
    if (status.bytes > thresholds.statusMaxBytes) {
      issues.push(`${symbol}_status_payload_too_large:${status.bytes}>${thresholds.statusMaxBytes}`);
    }

    const light = await fetchText(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/deep-dive?view=light`);
    responses.push({
      label: `${symbol}_deep_dive_light`,
      url: light.url,
      status: light.status,
      bytes: light.bytes,
      cacheControl: light.cacheControl,
      payloadMode: light.payloadMode,
      elapsedMs: light.elapsedMs,
    });
    if (!light.ok && light.status !== 202) issues.push(`${symbol}_light_http_${light.status}`);
    if (light.bytes > thresholds.lightMaxBytes) {
      issues.push(`${symbol}_light_payload_too_large:${light.bytes}>${thresholds.lightMaxBytes}`);
    }

    if (includeFull) {
      const full = await fetchText(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/deep-dive`);
      responses.push({
        label: `${symbol}_deep_dive_full`,
        url: full.url,
        status: full.status,
        bytes: full.bytes,
        cacheControl: full.cacheControl,
        payloadMode: full.payloadMode,
        elapsedMs: full.elapsedMs,
      });
      if (!full.ok && full.status !== 202) issues.push(`${symbol}_full_http_${full.status}`);
      if (full.bytes > thresholds.fullMaxBytes) {
        issues.push(`${symbol}_full_payload_too_large:${full.bytes}>${thresholds.fullMaxBytes}`);
      }
    }
  }

  const sources = await fetchText(`${baseUrl}/api/sources/search?pageSize=10`);
  responses.push({
    label: 'sources_search_page_10',
    url: sources.url,
    status: sources.status,
    bytes: sources.bytes,
    cacheControl: sources.cacheControl,
    payloadMode: sources.payloadMode,
    elapsedMs: sources.elapsedMs,
  });
  if (!sources.ok) issues.push(`sources_search_http_${sources.status}`);
  if (sources.bytes > thresholds.sourcesMaxBytes) {
    issues.push(`sources_search_payload_too_large:${sources.bytes}>${thresholds.sourcesMaxBytes}`);
  }

  const report = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    thresholds,
    includeFull,
    symbols: auditSymbols,
    passed: issues.length === 0,
    issues,
    responses,
    totalBytes: responses.reduce((sum, item) => sum + item.bytes, 0),
  };
  const reportPath = path.join(reportsDir, `api-payload-size-audit-${report.checkedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (issues.length > 0) {
    console.error(`API payload size audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('API payload size audit: pass');
  for (const item of responses) {
    console.log(`- ${item.label}: ${item.bytes} bytes (${item.status}, ${item.payloadMode || 'n/a'})`);
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`API payload size audit failed: ${error.message}`);
  process.exit(1);
});
