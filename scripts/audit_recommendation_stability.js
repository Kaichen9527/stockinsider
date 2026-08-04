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
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ];
  const issues = [];
  for (const card of cards) {
    const label = card.symbol || card.recommendationId || 'unknown';
    if (!card.recommendationLifecycleStage) issues.push(`${label}:missing_lifecycle_stage`);
    if (typeof card.thesisMomentumScore !== 'number') issues.push(`${label}:missing_thesis_momentum`);
    if (typeof card.recommendationStabilityScore !== 'number') issues.push(`${label}:missing_stability_score`);
    if (!card.whyChanged && (card.revaluationStatus === 'rebuilt' || card.revaluationStatus === 'repriced')) {
      issues.push(`${label}:rebuilt_without_why_changed`);
    }
    if (card.recommendationLifecycleStage === 'formal_recommendation' && card.recommendationGateStatus !== 'formal_pass') {
      issues.push(`${label}:formal_lifecycle_without_formal_gate`);
    }
  }
  for (const card of radar.opportunities || []) {
    const socialOnly = (card.sourceSignalBadges || []).some((badge) => /社群|KOL|影音|定錨/.test(badge)) && !card.baseVerificationLabel;
    if (socialOnly) issues.push(`${card.symbol}:formal_appears_social_only`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `recommendation-stability-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, counts: { cards: cards.length }, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Recommendation stability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Recommendation stability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`recommendation stability audit failed: ${err.message}`);
  process.exit(1);
});
