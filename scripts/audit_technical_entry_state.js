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

function collectVisibleSymbols(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.recentFormal7d || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.fallbackOpportunities90d || []),
  ]
    .map((item) => item && item.symbol)
    .filter(Boolean)
    .filter((symbol, index, arr) => arr.indexOf(symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const symbols = collectVisibleSymbols(radar);
  const issues = [];
  const results = [];

  for (const symbol of symbols) {
    const payload = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const target = payload.targetSnapshot || {};
    const signal = payload.technicalEntrySignal || {};
    const plan = signal.entryPlan || {};
    const currentPrice = Number(target.currentPrice || payload.price || payload.currentPrice || 0);
    const resistance = Number(signal.resistanceLevel || 0);
    const support = Number(signal.supportLevel || 0);
    const breakoutText = String(plan.breakoutTrigger || '');
    const entryText = [plan.strategy, plan.entryZone, plan.breakoutTrigger, plan.pullbackSupport, plan.invalidationLevel].filter(Boolean).join(' ');

    const row = {
      symbol,
      currentPrice,
      support,
      resistance,
      pricePositionState: signal.pricePositionState || null,
      breakoutAchieved: Boolean(signal.breakoutAchieved),
    };
    results.push(row);

    if (currentPrice > 0 && resistance > 0 && currentPrice > resistance) {
      if (!signal.breakoutAchieved) issues.push(`${symbol}:price_above_resistance_but_breakout_false`);
      if (/若帶量站上|若.*站上/.test(breakoutText)) issues.push(`${symbol}:breakout_text_still_conditional_after_breakout`);
      if (!/已站上|突破後|回測支撐|轉為/.test(entryText)) issues.push(`${symbol}:missing_breakout_achieved_language`);
    }
    if (currentPrice > 0 && support > 0 && currentPrice < support && signal.verdict === '適合分批') {
      issues.push(`${symbol}:below_support_but_scale_in`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `technical-entry-state-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, results, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Technical entry state audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log(`Technical entry state audit: pass (${symbols.length} symbols)`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`technical entry state audit failed: ${err.message}`);
  process.exit(1);
});
