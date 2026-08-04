#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '10'));
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
  const cards = cardsFromRadar(radar).slice(0, limit);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    const symbol = card.symbol;
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const band = detail.valuationPanel?.mlForecastBand;
    checked.push(symbol);
    if (!band) {
      issues.push(`${symbol}:missing_ml_forecast_band`);
      continue;
    }
    if (!band.modelVersion) issues.push(`${symbol}:missing_model_version`);
    if (!band.trainingWindow) issues.push(`${symbol}:missing_training_window`);
    if (!Array.isArray(band.featureSet) || band.featureSet.length === 0) issues.push(`${symbol}:missing_feature_set`);
    if (band.confidence == null) issues.push(`${symbol}:missing_confidence`);
    if (band.boundary !== 'assistive_only') issues.push(`${symbol}:model_boundary_not_assistive_only`);
    if (band.formalPromotionAllowed !== false) issues.push(`${symbol}:model_can_promote_formally`);
    if (/正式\s*(Base|情境)|正式目標價由模型|模型產生正式/i.test(String(band.summary || ''))) {
      issues.push(`${symbol}:ml_summary_implies_formal_target`);
    }
    if (card.recommendationGateStatus === 'formal_pass') {
      const reasonText = `${card.whyChanged || ''} ${card.whyBaseIsFormal || ''}`;
      if (/ML|模型|Hugging\s*Face/i.test(reasonText) && !/公式估值|官方|券商|財務|籌碼|技術/.test(reasonText)) {
        issues.push(`${symbol}:formal_gate_appears_model_only`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `hf-model-runtime-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`HF model runtime audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('HF model runtime audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`hf model runtime audit failed: ${err.message}`);
  process.exit(1);
});
