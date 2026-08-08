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

function visibleCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar);
  const issues = [];

  for (const card of cards) {
    const symbol = String(card.symbol || '');
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const bridge = detail.valuationPanel?.forwardPeBridge || null;
    const range = detail.valuationPanel?.peerValuationRange || null;
    const flags = detail.valuationPanel?.valuationReviewFlags || [];
    const label = `${symbol}:forward_pe_bridge`;
    if (!bridge) {
      issues.push(`${label}:missing_forward_pe_bridge`);
      continue;
    }
    if (detail.targetSnapshot?.verdict === 'formal' && bridge.status !== 'verified') {
      issues.push(`${label}:formal_without_verified_forward_pe`);
    }
    if (bridge.status !== 'non_pe_model' && !bridge.targetPriceFormula) {
      issues.push(`${label}:missing_target_price_formula`);
    }
    if (!range || !range.summary) issues.push(`${label}:missing_peer_range`);
    if (range?.inRange === false && !flags.some((flag) => flag.code === 'target_pe_above_peer')) {
      issues.push(`${label}:peer_out_of_range_without_review_flag`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `forward-pe-bridge-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Forward PE bridge audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Forward PE bridge audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`forward PE bridge audit failed: ${err.message}`);
  process.exit(1);
});
