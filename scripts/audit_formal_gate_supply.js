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

function allVisibleCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = allVisibleCards(radar);
  const formalCount = (radar.opportunities || []).length;
  const reasonCounts = {};
  for (const card of cards) {
    const reason =
      card.recommendationGateStatus ||
      card.formalGateStatus ||
      card.targetCoverageStatus ||
      card.valuationSanityStatus ||
      'unknown';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const issues = [];
  if (formalCount === 0) {
    const explainedCards = cards.filter((card) =>
      card.whyNoFormalRecommendation ||
      card.whyNotFormal ||
      card.whyNotPromoted ||
      card.overTargetReason ||
      card.revaluationReason ||
      card.revaluationJobSummary?.lastResult
    );
    if (explainedCards.length === 0) {
      issues.push('formal_zero_without_reason_distribution');
    }
    if (Object.keys(reasonCounts).length === 0) {
      issues.push('formal_zero_without_gate_reason_counts');
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `formal-gate-supply-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, formalCount, reasonCounts, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Formal gate supply audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Formal gate supply audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`formal gate supply audit failed: ${err.message}`);
  process.exit(1);
});
