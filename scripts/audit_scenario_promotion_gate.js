#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const sampleSymbols = (argValue('--symbols', '3008,2337,2408,3231,3711,2327,2492,3026,2356') || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const issues = [];
  const checked = [];
  for (const symbol of sampleSymbols) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const scenario = detail.valuationPanel?.scenarioCaseDetail;
    if (!scenario?.hasIndependentDelta) continue;
    checked.push(symbol);
    const gate = scenario.promotionGate;
    if (!gate) {
      issues.push(`${symbol}:missing_promotion_gate`);
      continue;
    }
    if (scenario.achievementChecklist?.length && scenario.achievementChecklist.some((item) => item.score == null)) {
      issues.push(`${symbol}:checklist_missing_scores`);
    }
    if ((detail.targetSnapshot?.scenarioPromotionStatus || gate.status) === 'eligible' && !scenario.canPromoteToBase) {
      issues.push(`${symbol}:eligible_but_not_promotable`);
    }
    if ((detail.targetSnapshot?.displayScenarioUpsidePct ?? 0) > 0 && gate.score != null && gate.score >= 85 && gate.achievedEvidenceCount < gate.requiredEvidenceCount) {
      if (gate.status !== 'insufficient_evidence' && gate.status !== 'price_led_fundamentals_pending') {
        issues.push(`${symbol}:high_score_without_evidence_reason`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `scenario-promotion-gate-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Scenario promotion gate audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Scenario promotion gate audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`scenario promotion gate audit failed: ${err.message}`);
  process.exit(1);
});
