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

function hasConcretePlan(card, detail) {
  const text = [
    card.tradeDecision?.entryZone,
    card.tradeDecision?.addCondition,
    card.tradeDecision?.stopLoss,
    card.entryDecision?.buyZone,
    card.entryDecision?.addCondition,
    card.entryDecision?.stopLoss,
    detail?.tradeDecision?.entryZone,
    detail?.tradeDecision?.addCondition,
    detail?.tradeDecision?.stopLoss,
    detail?.chipEntryAssessment?.entryDecision?.buyZone,
    detail?.chipEntryAssessment?.entryDecision?.addCondition,
    detail?.chipEntryAssessment?.entryDecision?.stopLoss,
  ].filter(Boolean).join(' ');
  return /買|分批|回測|突破|停損|失效|支撐|壓力|NT\$|[0-9]/.test(text);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const scenarioCards = (radar.scenarioUpsideCandidates || []).filter((card) => card.displayScenarioUpsidePct > 0 || card.cardPrimaryUpsidePct > 0);
  const issues = [];
  for (const card of scenarioCards.slice(0, 12)) {
    if (!card.scenarioActionabilityStatus) issues.push(`${card.symbol}:missing_scenario_actionability_status`);
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    if (!hasConcretePlan(card, detail)) issues.push(`${card.symbol}:missing_concrete_entry_or_pullback_plan`);
    const action = String(card.tradeDecision?.action || detail.tradeDecision?.action || detail.chipEntryAssessment?.entryDecision?.action || '');
    if (/過熱不追|不追價|等回測/.test(action) && !hasConcretePlan(card, detail)) {
      issues.push(`${card.symbol}:conservative_action_without_trigger_plan`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `scenario-actionability-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: scenarioCards.map((card) => card.symbol), issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Scenario actionability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Scenario actionability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`scenario actionability audit failed: ${err.message}`);
  process.exit(1);
});
