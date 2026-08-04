#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const issues = [];
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ];
  for (const card of cards) {
    const signal = card.modelSignal;
    if (!signal) continue;
    const label = card.symbol || card.recommendationId || 'unknown';
    if (signal.boundary !== 'assistive_only') issues.push(`${label}:model_boundary_not_assistive`);
    if (signal.promotionImpact !== 'none') issues.push(`${label}:model_has_direct_promotion_impact`);
    if (!card.modelSignalSummary) issues.push(`${label}:missing_model_signal_summary`);
    if (card.recommendationGateStatus === 'formal_pass' && signal.promotionImpact !== 'none') {
      issues.push(`${label}:formal_promoted_by_model_signal`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `model-signal-boundary-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Model signal boundary audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Model signal boundary audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`model signal boundary audit failed: ${err.message}`);
  process.exit(1);
});
