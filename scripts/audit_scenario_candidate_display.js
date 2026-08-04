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

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const scenarioCards = radar.scenarioUpsideCandidates || [];
  const issues = [];
  const checked = [];

  for (const card of scenarioCards) {
    const symbol = card.symbol || 'unknown';
    const currentPrice = card.currentPrice;
    const baseTarget = card.baseTarget || card.targetPrice;
    const scenarioTarget = card.upsideTarget || card.scenarioTarget;
    const scenarioUpside = card.displayScenarioUpsidePct ?? card.cardPrimaryUpsidePct;
    checked.push({
      symbol,
      currentPrice,
      baseTarget,
      scenarioTarget,
      scenarioUpside,
      displayTargetMode: card.displayTargetMode || null,
      targetCoverageStatus: card.targetCoverageStatus || null,
      staleReason: card.staleReason || null,
      targetStaleKind: card.targetStaleKind || null,
    });

    if (!finite(currentPrice)) issues.push(`${symbol}:missing_current_price`);
    if (!finite(baseTarget)) issues.push(`${symbol}:missing_base_target`);
    if (!finite(scenarioTarget)) issues.push(`${symbol}:missing_scenario_target`);
    if (finite(currentPrice) && finite(baseTarget) && currentPrice < baseTarget) {
      issues.push(`${symbol}:base_not_yet_reflected_should_not_be_scenario_only`);
    }
    if (finite(currentPrice) && finite(scenarioTarget) && currentPrice >= scenarioTarget) {
      issues.push(`${symbol}:scenario_already_reflected_should_be_hot_tracking`);
    }
    if (card.displayTargetMode === 'needs_revaluation') {
      issues.push(`${symbol}:scenario_hidden_as_waiting_revaluation`);
    }
    if (card.cardPrimaryUpsideLabel && card.cardPrimaryUpsideLabel !== '情境空間') {
      issues.push(`${symbol}:primary_label_not_scenario_space`);
    }
    if (!finite(scenarioUpside) || scenarioUpside <= 0) {
      issues.push(`${symbol}:missing_positive_scenario_upside`);
    }
    if (card.targetCoverageStatus !== 'scenario_only') {
      issues.push(`${symbol}:target_coverage_${card.targetCoverageStatus || 'missing'}`);
    }
    if (card.staleReason !== 'target_stale_due_price_crossed_base' && card.targetStaleKind !== 'crossed_base') {
      issues.push(`${symbol}:missing_crossed_base_stale_reason`);
    }
    if (card.isActionableRecommendation === true) {
      issues.push(`${symbol}:scenario_candidate_marked_actionable`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `scenario-candidate-display-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        counts: { scenarioUpsideCandidates: scenarioCards.length },
        checked,
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  if (issues.length) {
    console.error(`Scenario candidate display audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Scenario candidate display audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`scenario candidate display audit failed: ${err.message}`);
  process.exit(1);
});
