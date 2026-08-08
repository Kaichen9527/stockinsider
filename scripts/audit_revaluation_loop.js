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
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
  ].slice(0, 12);
  const issues = [];
  for (const card of cards) {
    if (!card.symbol) continue;
    if (!card.revaluationStatus) issues.push(`${card.symbol}:missing_card_revaluation_status`);
    if (!card.revaluationReason) issues.push(`${card.symbol}:missing_card_revaluation_reason`);
    const target = card.confidenceScoreBreakdown || {};
    if (typeof target.sectorRotationImpact !== 'number') issues.push(`${card.symbol}:missing_sector_rotation_impact`);
  }
  for (const symbol of [...new Set(cards.slice(0, 6).map((card) => card.symbol).filter(Boolean))]) {
    const deepDive = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const snapshot = deepDive.targetSnapshot || {};
    if (!snapshot.repricedAt) issues.push(`${symbol}:missing_target_repriced_at`);
    if (!snapshot.repricingReason && !snapshot.unchangedReason) issues.push(`${symbol}:missing_target_repricing_or_unchanged_reason`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `revaluation-loop-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Revaluation loop audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Revaluation loop audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`revaluation loop audit failed: ${err.message}`);
  process.exit(1);
});
