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

function cardsFromRadar(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

function isBuyAction(action) {
  return ['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤'].includes(action);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = cardsFromRadar(radar).slice(0, Number(argValue('--limit', '12')));
  const issues = [];
  const actions = [];
  for (const card of cards) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    const decision = detail.chipEntryAssessment?.entryDecision || detail.technicalEntrySignal?.entryDecision || null;
    if (!decision) {
      issues.push(`${card.symbol}:missing_entry_decision`);
      continue;
    }
    actions.push(decision.action);
    if (isBuyAction(decision.action)) {
      if (!decision.positionSize || !decision.buyZone || !decision.stopLoss) issues.push(`${card.symbol}:buy_action_missing_size_zone_or_stop`);
    } else if (!decision.reasons?.length && !detail.chipEntryAssessment?.missingReasons?.length) {
      issues.push(`${card.symbol}:non_buy_without_reason`);
    }
  }
  const buyableCount = actions.filter(isBuyAction).length;
  if (cards.length >= 6 && buyableCount === 0) issues.push(`no_buyable_entry_decisions:${actions.join('|')}`);

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `entry-decision-actionability-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((card) => card.symbol), actions, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Entry decision actionability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Entry decision actionability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`entry decision actionability audit failed: ${err.message}`);
  process.exit(1);
});
