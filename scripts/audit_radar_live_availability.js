#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  if (radar.marketRegime === 'live-unavailable') issues.push('market_regime_live_unavailable');
  if (radar.loadStatus === 'unavailable') issues.push(`load_status_unavailable:${(radar.loadWarnings || []).join('|')}`);
  if (!radar.sourceHealthSummary) issues.push('missing_source_health_summary');
  if (!Array.isArray(radar.opportunities) || !Array.isArray(radar.scenarioUpsideCandidates) || !Array.isArray(radar.earlyWatchlist)) {
    issues.push('missing_recommendation_arrays');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `radar-live-availability-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        issues,
        loadStatus: radar.loadStatus || null,
        loadWarnings: radar.loadWarnings || [],
        degradedSources: radar.degradedSources || [],
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Radar live availability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Radar live availability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`radar live availability audit failed: ${err.message}`);
  process.exit(1);
});
