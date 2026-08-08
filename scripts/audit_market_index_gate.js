#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const buyActions = new Set(['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤']);

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
  const issues = [];
  const market = radar.marketIndexSignal || null;
  if (!market?.status) issues.push('missing_market_index_signal');
  if (!radar.marketBreadthSummary) issues.push('missing_market_breadth_summary');

  const cards = visibleCards(radar);
  const checkedCards = cards.map((card) => ({
    symbol: card.symbol,
    bucket: card.displayBucket || card.recommendationBucket || null,
    marketGateStatus: card.marketGateStatus || null,
    action: card.tradeDecision?.action || card.entryActionLabel || null,
    positionSize: card.tradeDecision?.positionSize || null,
  }));

  for (const card of cards) {
    if (!card.marketGateStatus) issues.push(`${card.symbol}:missing_card_market_gate_status`);
    if (!card.tradeDecision?.action) issues.push(`${card.symbol}:missing_trade_decision`);
    if (!card.tradeDecision?.positionSize) issues.push(`${card.symbol}:missing_trade_position_size`);
    if (!card.tradeDecision?.marketGateReason) issues.push(`${card.symbol}:missing_trade_market_gate_reason`);
    if (market?.status && card.marketGateStatus && card.marketGateStatus !== market.status) {
      issues.push(`${card.symbol}:market_gate_mismatch:${card.marketGateStatus}_vs_${market.status}`);
    }
    const action = card.tradeDecision?.action;
    if ((market?.status === 'risk_off_reduce' || market?.status === 'market_breakdown_no_chase') && buyActions.has(action)) {
      issues.push(`${card.symbol}:buy_action_during_${market.status}`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `market-index-gate-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        marketIndexSignal: market,
        checkedCards,
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Market index gate audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Market index gate audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`market index gate audit failed: ${err.message}`);
  process.exit(1);
});
