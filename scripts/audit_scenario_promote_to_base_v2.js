#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '12'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function scenarioRelevantCards(radar) {
  return [
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = scenarioRelevantCards(radar).slice(0, limit);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    if ((card.scenarioChecklistProgress ?? 0) < 80 && card.targetCoverageStatus !== 'scenario_only' && !card.staleReason) continue;
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    const gate = detail?.valuationPanel?.scenarioCaseDetail?.promotionGate || card.scenarioPromotionGate || null;
    const target = detail?.targetSnapshot || {};
    checked.push({
      symbol: card.symbol,
      progress: card.scenarioChecklistProgress ?? null,
      gateStatus: gate?.status || target.scenarioPromotionStatus || null,
      revaluationStatus: target.revaluationJobStatus?.status || card.revaluationJobSummary?.status || null,
    });
    if (!gate && !target.scenarioPromotionStatus) issues.push(`${card.symbol}:missing_scenario_promotion_gate`);
    const hasOutcome = Boolean(
      gate?.status ||
        target.scenarioPromotionStatus ||
        target.revaluationJobStatus?.status ||
        card.revaluationJobSummary?.status ||
        target.unchangedReason ||
        target.repricingReason
    );
    if (!hasOutcome) issues.push(`${card.symbol}:missing_promotion_or_revaluation_outcome`);
    if (gate?.canPromoteToBase && target.revaluationJobStatus?.status !== 'promoted_scenario_to_base' && !target.repricingReason) {
      issues.push(`${card.symbol}:promotable_without_repricing_path`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `scenario-promote-to-base-v2-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Scenario promote-to-base v2 audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Scenario promote-to-base v2 audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`scenario promote-to-base v2 audit failed: ${err.message}`);
  process.exit(1);
});
