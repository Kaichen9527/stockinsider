#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '14'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const buyActions = new Set(['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤']);
const passiveActions = new Set(['等回測', '不追價']);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function uniqueCards(radar) {
  const cards = [...(radar.opportunities || []), ...(radar.scenarioUpsideCandidates || []), ...(radar.earlyWatchlist || [])];
  return cards.filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

function hasScenarioRoom(card) {
  const price = Number(card.currentPrice || 0);
  const scenario = Number(card.upsideTarget || card.scenarioTarget || 0);
  const scenarioPct = Number(card.displayScenarioUpsidePct ?? 0);
  return price > 0 && scenario > price && scenarioPct > 0;
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = uniqueCards(radar).slice(0, limit);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    const decision = detail.chipEntryAssessment?.entryDecision || detail.technicalEntrySignal?.entryDecision || null;
    const triggers = decision?.entryTriggers || [];
    const activeOrWaitingTriggers = triggers.filter((trigger) => trigger.status === 'active' || trigger.status === 'waiting');
    checked.push({
      symbol: card.symbol,
      action: decision?.action || null,
      triggerCount: triggers.length,
      scenarioRoom: hasScenarioRoom(card),
    });
    if (!decision) {
      issues.push(`${card.symbol}:missing_entry_decision`);
      continue;
    }
    if (!triggers.length) issues.push(`${card.symbol}:missing_entry_triggers`);
    if (buyActions.has(decision.action) && !triggers.some((trigger) => trigger.status === 'active')) {
      issues.push(`${card.symbol}:buy_action_without_active_trigger`);
    }
    if (hasScenarioRoom(card) && passiveActions.has(decision.action) && activeOrWaitingTriggers.length === 0) {
      issues.push(`${card.symbol}:scenario_room_passive_without_trigger`);
    }
    if (hasScenarioRoom(card) && /過熱不追|等回測/.test(detail.chipEntryAssessment?.summary || '') && activeOrWaitingTriggers.length === 0) {
      issues.push(`${card.symbol}:conservative_summary_without_actionable_condition`);
    }
  }

  const buyableCount = checked.filter((item) => buyActions.has(item.action)).length;
  if (checked.length >= 6 && buyableCount === 0) issues.push(`no_buyable_actions:${checked.map((item) => item.action || 'missing').join('|')}`);

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `entry-trigger-actionability-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Entry trigger actionability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Entry trigger actionability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`entry trigger actionability audit failed: ${err.message}`);
  process.exit(1);
});
