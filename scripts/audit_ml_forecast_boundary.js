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

function cardsFromRadar(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = cardsFromRadar(radar).slice(0, Number(argValue('--limit', '12')));
  const issues = [];

  for (const card of cards) {
    const label = card.symbol || card.recommendationId || 'unknown';
    if (card.mlUpsideProbability != null || card.mlForecastSummary) {
      if (!card.whyModelDidNotPromote) issues.push(`${label}:missing_why_model_did_not_promote`);
      if (card.recommendationGateStatus === 'formal_pass' && /模型|ML/.test(String(card.whyChanged || ''))) {
        issues.push(`${label}:formal_reason_appears_model_driven`);
      }
    }
    const detail = await fetchJson(`${baseUrl}/api/stocks/${label}/deep-dive`);
    const band = detail.valuationPanel?.mlForecastBand;
    if (!band) {
      issues.push(`${label}:missing_ml_forecast_band`);
      continue;
    }
    if (band.boundary !== 'assistive_only' || band.formalPromotionAllowed !== false) {
      issues.push(`${label}:ml_boundary_not_assistive`);
    }
    if (!band.modelVersion || !band.trainingWindow || band.confidence == null) {
      issues.push(`${label}:missing_model_metadata`);
    }
    if (!Array.isArray(band.horizons) || band.horizons.length < 3) {
      issues.push(`${label}:missing_20_60_120_horizons`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `ml-forecast-boundary-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`ML forecast boundary audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('ML forecast boundary audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`ml forecast boundary audit failed: ${err.message}`);
  process.exit(1);
});
