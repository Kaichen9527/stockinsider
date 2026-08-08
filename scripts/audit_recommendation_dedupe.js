#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function collect(bucket, rows) {
  return (rows || []).filter((item) => item?.symbol).map((item) => ({ bucket, symbol: item.symbol, id: item.recommendationId || item.symbol }));
}

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const all = [
    ...collect('opportunities', radar.opportunities),
    ...collect('scenarioUpsideCandidates', radar.scenarioUpsideCandidates),
    ...collect('recentFormal7d', radar.recentFormal7d),
    ...collect('earlyWatchlist', radar.earlyWatchlist),
    ...collect('fallbackOpportunities90d', radar.fallbackOpportunities90d),
  ];
  const seen = new Map();
  const duplicates = [];
  for (const item of all) {
    const previous = seen.get(item.symbol);
    if (previous) duplicates.push({ symbol: item.symbol, firstBucket: previous.bucket, duplicateBucket: item.bucket });
    else seen.set(item.symbol, item);
  }
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `recommendation-dedupe-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: duplicates.length === 0, duplicates, checkedAt: new Date().toISOString() }, null, 2));
  if (duplicates.length) {
    console.error(`Recommendation dedupe audit failed: ${duplicates.map((item) => `${item.symbol}:${item.firstBucket}->${item.duplicateBucket}`).join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Recommendation dedupe audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`recommendation dedupe audit failed: ${err.message}`);
  process.exit(1);
});
