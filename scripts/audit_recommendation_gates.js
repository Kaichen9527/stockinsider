#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function isFreshRevaluation(status) {
  return status === 'rebuilt' || status === 'repriced';
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function checkFormal(card, issues) {
  const label = `${card.symbol || 'unknown'}:formal`;
  if (!finite(card.currentPrice)) issues.push(`${label}:missing_current_price`);
  if (!finite(card.baseTarget)) issues.push(`${label}:missing_base_target`);
  if (finite(card.currentPrice) && finite(card.baseTarget) && card.currentPrice >= card.baseTarget) {
    issues.push(`${label}:current_price_not_below_base_target`);
  }
  if (!isFreshRevaluation(card.revaluationStatus)) issues.push(`${label}:revaluation_not_rebuilt_or_repriced`);
  if (card.recommendationGateStatus && card.recommendationGateStatus !== 'formal_pass') {
    issues.push(`${label}:gate_${card.recommendationGateStatus}`);
  }
  if (card.isActionableRecommendation === false) issues.push(`${label}:not_actionable`);
  if (card.isFallbackValuation) issues.push(`${label}:fallback_valuation`);
  if (card.valuationQuality === 'fallback_proxy') issues.push(`${label}:fallback_proxy_quality`);
  if (card.valuationSanityStatus && card.valuationSanityStatus !== 'normal') {
    issues.push(`${label}:valuation_sanity_${card.valuationSanityStatus}`);
  }
  if (!finite(card.recommendationIndex)) issues.push(`${label}:missing_recommendation_index`);
  if (card.recommendationBucket === 'high_conviction' && finite(card.recommendationIndex) && card.recommendationIndex < 80) {
    issues.push(`${label}:high_conviction_index_below_80`);
  }
  if (card.recommendationBucket === 'early_formal' && finite(card.recommendationIndex) && card.recommendationIndex >= 80) {
    issues.push(`${label}:standard_formal_index_should_be_high_conviction`);
  }
  if (card.baseTargetVerificationStatus && card.baseTargetVerificationStatus !== 'verified') {
    issues.push(`${label}:base_target_not_verified_${card.baseTargetVerificationStatus}`);
  }
  if (!card.whyBaseIsFormal) issues.push(`${label}:missing_why_base_is_formal`);
}

function checkScenario(card, issues) {
  const label = `${card.symbol || 'unknown'}:scenario`;
  const crossedBase = card.staleReason === 'target_stale_due_price_crossed_base' || card.targetStaleKind === 'crossed_base';
  if (!finite(card.currentPrice)) issues.push(`${label}:missing_current_price`);
  if (!finite(card.baseTarget)) issues.push(`${label}:missing_base_target`);
  if (!finite(card.upsideTarget)) issues.push(`${label}:missing_scenario_target`);
  if (finite(card.currentPrice) && finite(card.baseTarget) && card.currentPrice < card.baseTarget) {
    issues.push(`${label}:base_still_has_upside_should_not_be_scenario_only`);
  }
  if (finite(card.currentPrice) && finite(card.upsideTarget) && card.currentPrice >= card.upsideTarget) {
    issues.push(`${label}:current_price_not_below_scenario_target`);
  }
  if (!isFreshRevaluation(card.revaluationStatus) && !crossedBase) issues.push(`${label}:revaluation_not_rebuilt_or_repriced`);
  if (
    card.recommendationGateStatus &&
    card.recommendationGateStatus !== 'scenario_only'
  ) {
    issues.push(`${label}:gate_${card.recommendationGateStatus}`);
  }
  if (card.displayTargetMode === 'needs_revaluation') {
    issues.push(`${label}:scenario_hidden_as_needs_revaluation`);
  }
  if (!finite(card.cardPrimaryUpsidePct) && !finite(card.displayScenarioUpsidePct)) {
    issues.push(`${label}:missing_scenario_upside_display`);
  }
  if (card.isActionableRecommendation === true) issues.push(`${label}:scenario_marked_actionable`);
}

function checkObservation(bucket, card, issues) {
  const label = `${card.symbol || 'unknown'}:${bucket}`;
  if (card.recommendationBucket === 'high_conviction' || card.recommendationBucket === 'early_formal') {
    issues.push(`${label}:observation_bucket_marked_formal`);
  }
  if (card.isActionableRecommendation === true) issues.push(`${label}:observation_marked_actionable`);
  if (card.displayBucket && card.displayBucket !== 'historical_observation') {
    issues.push(`${label}:display_bucket_${card.displayBucket}`);
  }
  if (card.displayTargetMode && card.displayTargetMode !== 'needs_revaluation') {
    issues.push(`${label}:display_target_mode_${card.displayTargetMode}`);
  }
  if (finite(card.cardPrimaryUpsidePct) || finite(card.displayBaseUpsidePct) || finite(card.displayScenarioUpsidePct)) {
    issues.push(`${label}:historical_shows_actionable_upside`);
  }
  if (finite(card.currentPrice) && finite(card.upsideTarget) && card.currentPrice >= card.upsideTarget) {
    issues.push(`${label}:over_scenario_target_should_be_archived`);
  }
}

function checkEarly(card, issues) {
  const label = `${card.symbol || 'unknown'}:early`;
  if (card.isActionableRecommendation === true) issues.push(`${label}:early_marked_actionable`);
  if (card.recommendationBucket === 'high_conviction' || card.recommendationBucket === 'early_formal') {
    issues.push(`${label}:early_marked_formal_bucket`);
  }
  if (finite(card.currentPrice) && finite(card.upsideTarget) && card.currentPrice >= card.upsideTarget) {
    issues.push(`${label}:over_scenario_target_visible`);
  }
  if (
    card.recommendationGateStatus === 'over_target' ||
    card.displayTargetMode === 'hidden_over_target' ||
    card.displayBucket === 'archived_over_target' ||
    card.displayBucket === 'valuation_reflected_archive'
  ) {
    issues.push(`${label}:over_target_visible`);
  }
  const hasPotentialPct =
    finite(card.displayBaseUpsidePct) ||
    finite(card.displayScenarioUpsidePct) ||
    finite(card.cardPrimaryUpsidePct);
  const hasPotentialTarget =
    card.targetCoverageStatus === 'base_upside' ||
    card.targetCoverageStatus === 'scenario_only';
  const hasFreshRevaluation = card.revaluationStatus === 'rebuilt' || card.revaluationStatus === 'repriced';
  if (hasPotentialPct && hasPotentialTarget && hasFreshRevaluation && card.displayTargetMode !== 'early_potential') {
    issues.push(`${label}:early_potential_hidden`);
  }
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  for (const card of radar.opportunities || []) checkFormal(card, issues);
  for (let idx = 1; idx < (radar.opportunities || []).length; idx += 1) {
    const previous = radar.opportunities[idx - 1];
    const current = radar.opportunities[idx];
    if (finite(previous.recommendationIndex) && finite(current.recommendationIndex) && previous.recommendationIndex < current.recommendationIndex) {
      issues.push(`opportunities:not_sorted_by_recommendation_index_at_${idx}`);
    }
  }
  for (const card of radar.scenarioUpsideCandidates || []) checkScenario(card, issues);
  for (const card of radar.earlyWatchlist || []) checkEarly(card, issues);
  if ((radar.recentFormal7d || []).length > 0) issues.push('recentFormal7d_should_not_return_visible_cards');
  if ((radar.fallbackOpportunities90d || []).length > 0) issues.push('fallbackOpportunities90d_should_not_return_visible_cards');
  if ((radar.historicalObservationSummary?.total || 0) > 0 && !radar.historicalObservationSummary.examples) {
    issues.push('historical_observation_summary_missing_examples');
  }
  for (const card of radar.recentFormal7d || []) checkObservation('recentFormal7d', card, issues);
  for (const card of radar.fallbackOpportunities90d || []) checkObservation('fallbackOpportunities90d', card, issues);

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `recommendation-gates-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        counts: {
          opportunities: (radar.opportunities || []).length,
          scenarioUpsideCandidates: (radar.scenarioUpsideCandidates || []).length,
          earlyWatchlist: (radar.earlyWatchlist || []).length,
          recentFormal7d: (radar.recentFormal7d || []).length,
          fallbackOpportunities90d: (radar.fallbackOpportunities90d || []).length,
        },
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Recommendation gates audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Recommendation gates audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`recommendation gates audit failed: ${err.message}`);
  process.exit(1);
});
