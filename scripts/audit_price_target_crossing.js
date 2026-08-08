#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function checkNoCrossing(bucket, card, issues) {
  const label = `${card.symbol || 'unknown'}:${bucket}`;
  if (bucket === 'opportunities' && finite(card.currentPrice) && finite(card.baseTarget) && card.currentPrice >= card.baseTarget) {
    issues.push(`${label}:current_price_crossed_base`);
  }
  if ((bucket === 'opportunities' || bucket === 'scenarioUpsideCandidates' || bucket === 'earlyWatchlist') && finite(card.currentPrice) && finite(card.upsideTarget) && card.currentPrice >= card.upsideTarget) {
    issues.push(`${label}:current_price_crossed_scenario`);
  }
  if (card.targetCoverageStatus === 'over_base_and_scenario' || card.displayBucket === 'valuation_reflected_archive' || card.displayBucket === 'archived_over_target') {
    issues.push(`${label}:over_target_visible`);
  }
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  for (const card of radar.opportunities || []) checkNoCrossing('opportunities', card, issues);
  for (const card of radar.scenarioUpsideCandidates || []) checkNoCrossing('scenarioUpsideCandidates', card, issues);
  for (const card of radar.earlyWatchlist || []) checkNoCrossing('earlyWatchlist', card, issues);
  for (const card of [...(radar.recentFormal7d || []), ...(radar.fallbackOpportunities90d || [])]) {
    issues.push(`${card.symbol || 'unknown'}:historical_card_should_not_be_visible`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `price-target-crossing-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Price target crossing audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Price target crossing audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`price target crossing audit failed: ${err.message}`);
  process.exit(1);
});
