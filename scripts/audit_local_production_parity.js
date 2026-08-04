#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const localUrl = (argValue('--local-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const productionUrl = (argValue('--production-url', 'https://stockinsider-three.vercel.app') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function counts(radar) {
  return {
    opportunities: (radar.opportunities || []).length,
    scenario: (radar.scenarioUpsideCandidates || []).length,
    early: (radar.earlyWatchlist || []).length,
    hotTracking: (radar.hotTracking || []).length,
  };
}

async function main() {
  const [localRadar, prodRadar] = await Promise.all([
    fetchJson(`${localUrl}/api/radar/daily`),
    fetchJson(`${productionUrl}/api/radar/daily`),
  ]);
  const issues = [];
  if (localRadar.marketRegime === 'live-unavailable' || localRadar.loadStatus === 'unavailable') issues.push('local_live_unavailable');
  if (prodRadar.marketRegime === 'live-unavailable' || prodRadar.loadStatus === 'unavailable') issues.push('production_live_unavailable');
  const localCounts = counts(localRadar);
  const productionCounts = counts(prodRadar);
  const countDiffs = Object.fromEntries(
    Object.keys(localCounts).map((key) => [key, Math.abs((localCounts[key] || 0) - (productionCounts[key] || 0))]),
  );
  for (const [key, diff] of Object.entries(countDiffs)) {
    if (diff > 12) issues.push(`large_count_delta_${key}:${diff}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `local-production-parity-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        localUrl,
        productionUrl,
        passed: issues.length === 0,
        issues,
        local: { asOf: localRadar.asOf, loadStatus: localRadar.loadStatus || null, counts: localCounts },
        production: { asOf: prodRadar.asOf, loadStatus: prodRadar.loadStatus || null, counts: productionCounts },
        countDiffs,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Local/production parity audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Local/production parity audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`local production parity audit failed: ${err.message}`);
  process.exit(1);
});
