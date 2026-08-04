#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  if ((radar.recentFormal7d || []).length > 0) issues.push('recentFormal7d_visible_cards_not_allowed');
  if ((radar.fallbackOpportunities90d || []).length > 0) issues.push('fallbackOpportunities90d_visible_cards_not_allowed');

  const summary = radar.historicalObservationSummary || null;
  if (!summary) {
    issues.push('missing_historical_observation_summary');
  } else {
    const counted =
      Number(summary.revaluationQueue || 0) +
      Number(summary.scenarioOnlyNeedsRevaluation || 0) +
      Number(summary.valuationReflectedArchive || 0) +
      Number(summary.missingNewEvidence || 0) +
      Number(summary.repricedButNotFormal || 0);
    if (counted !== Number(summary.total || 0)) issues.push(`historical_summary_count_mismatch:${counted}:${summary.total}`);
    for (const item of summary.examples || []) {
      if (!item.symbol || !item.disposition || !item.reason) issues.push(`historical_example_incomplete:${item.symbol || 'unknown'}`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `historical-revaluation-sla-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, summary, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Historical revaluation SLA audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Historical revaluation SLA audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`historical revaluation SLA audit failed: ${err.message}`);
  process.exit(1);
});
