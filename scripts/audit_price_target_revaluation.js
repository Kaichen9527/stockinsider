#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function needsRevaluation(card) {
  return (
    card.staleReason === 'target_stale_due_price_crossed_base' ||
    card.staleReason === 'target_stale_due_price_crossed_scenario' ||
    card.targetStaleKind === 'crossed_base' ||
    card.targetStaleKind === 'crossed_scenario' ||
    card.revaluationStatus === 'pending' ||
    card.displayBucket === 'hot_tracking' ||
    card.displayBucket === 'archived_over_target' ||
    card.displayBucket === 'valuation_reflected_archive'
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  const buckets = {
    opportunities: radar.opportunities || [],
    scenarioUpsideCandidates: radar.scenarioUpsideCandidates || [],
    earlyWatchlist: radar.earlyWatchlist || [],
    hotTracking: radar.hotTracking || [],
  };
  for (const [bucket, cards] of Object.entries(buckets)) {
    for (const card of cards) {
      if (!card.symbol || !finite(card.currentPrice)) continue;
      if (finite(card.baseTarget) && card.currentPrice >= card.baseTarget && bucket === 'opportunities') {
        issues.push(`${card.symbol}:${bucket}:crossed_base_still_formal`);
      }
      if (finite(card.scenarioTarget || card.upsideTarget) && card.currentPrice >= (card.scenarioTarget || card.upsideTarget) && !needsRevaluation(card)) {
        issues.push(`${card.symbol}:${bucket}:crossed_scenario_without_revaluation_state`);
      }
      if (bucket === 'scenarioUpsideCandidates' && finite(card.upsideTarget) && card.currentPrice < card.upsideTarget && card.displayTargetMode === 'needs_revaluation') {
        issues.push(`${card.symbol}:${bucket}:scenario_candidate_hidden_as_waiting_revaluation`);
      }
      if (finite(card.baseTarget) && card.currentPrice >= card.baseTarget && bucket !== 'opportunities' && !needsRevaluation(card)) {
        issues.push(`${card.symbol}:${bucket}:crossed_base_without_stale_reason`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `price-target-revaluation-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Price target revaluation audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Price target revaluation audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`price target revaluation audit failed: ${err.message}`);
  process.exit(1);
});
