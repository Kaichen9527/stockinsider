#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const symbols = (argValue('--symbols', '3008,2337,2408,3231,3711,2327,2492,3026,2356') || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const issues = [];
  for (const symbol of symbols) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const band = detail.valuationPanel?.mlForecastBand;
    if (!band) continue;
    if (band.boundary !== 'assistive_only' || band.formalPromotionAllowed !== false) {
      issues.push(`${symbol}:ml_not_assistive_only`);
    }
    if (detail.recommendation?.recommendationGateStatus === 'formal_pass' && /ML|模型/.test(String(detail.recommendation?.whyChanged || ''))) {
      issues.push(`${symbol}:formal_promotion_appears_model_driven`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `v5-26-ml-boundary-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: symbols, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`v5.26 ML boundary audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('v5.26 ML boundary audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`v5.26 ML boundary audit failed: ${err.message}`);
  process.exit(1);
});
