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
    ...(radar.hotTracking || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar).slice(0, Number(argValue('--limit', '16')));
  const issues = [];
  const divergence = [];

  for (const card of cards) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    const panel = detail.valuationPanel || {};
    const model = panel.valuationModelDivergence;
    if (!panel.mlForecastBand) issues.push(`${card.symbol}:missing_ml_forecast_band`);
    if (!model) continue;
    if (model.status === 'valuation_model_divergence_review') {
      divergence.push({ symbol: card.symbol, gapPct: model.gapPct, summary: model.summary });
      const flags = panel.valuationReviewFlags || [];
      if (!flags.some((flag) => flag.code === 'ml_formula_divergence')) {
        issues.push(`${card.symbol}:divergence_without_review_flag`);
      }
      if (card.recommendationGateStatus === 'formal_pass') {
        issues.push(`${card.symbol}:formal_pass_despite_ml_formula_divergence`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `valuation-model-divergence-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, divergence, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Valuation model divergence audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Valuation model divergence audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`valuation model divergence audit failed: ${err.message}`);
  process.exit(1);
});
