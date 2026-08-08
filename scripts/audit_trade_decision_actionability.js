#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '10'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const buyActions = new Set(['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤']);
const exitActions = new Set(['減碼', '停利', '出場']);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function visibleCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const symbols = visibleCards(radar).slice(0, limit).map((card) => card.symbol);
  const issues = [];
  const checked = [];

  for (const symbol of symbols) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const decision = detail.tradeDecision || null;
    checked.push({
      symbol,
      action: decision?.action || null,
      positionSize: decision?.positionSize || null,
      marketGate: detail.marketIndexSignal?.status || null,
      entryTriggers: decision?.entryTriggers?.length || 0,
      exitTriggers: decision?.exitTriggers?.length || 0,
    });
    if (!decision?.action) {
      issues.push(`${symbol}:missing_trade_decision`);
      continue;
    }
    if (!decision.marketGateReason) issues.push(`${symbol}:missing_market_gate_reason`);
    if (buyActions.has(decision.action)) {
      if (!decision.positionSize || !decision.entryZone || !decision.stopLoss) issues.push(`${symbol}:buy_action_missing_position_entry_or_stop`);
      if (!decision.entryTriggers?.length) issues.push(`${symbol}:buy_action_missing_entry_triggers`);
    }
    if (exitActions.has(decision.action)) {
      if (!decision.exitCondition) issues.push(`${symbol}:exit_action_missing_exit_condition`);
      if (!decision.exitTriggers?.length) issues.push(`${symbol}:exit_action_missing_exit_triggers`);
    }
  }

  const actionableCount = checked.filter((item) => buyActions.has(item.action) || exitActions.has(item.action)).length;
  if (checked.length >= 6 && actionableCount === 0) issues.push('no_actionable_buy_or_exit_decisions');

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `trade-decision-actionability-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Trade decision actionability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Trade decision actionability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`trade decision actionability audit failed: ${err.message}`);
  process.exit(1);
});
