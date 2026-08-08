#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '24'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const buyActions = new Set(['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤']);
const nonBuyOverTargetActions = new Set(['停利', '減碼', '出場', '不買', '不追價']);

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

function textFrom(...values) {
  return values
    .flat()
    .filter(Boolean)
    .map(String)
    .join(' ');
}

function hasActionableTrigger(decision) {
  const text = textFrom(
    decision?.entryZone,
    decision?.addCondition,
    decision?.stopLoss,
    decision?.marketGateReason,
    decision?.entryTriggers?.map((item) => `${item.condition || ''} ${item.positionSize || ''} ${item.invalidation || ''}`),
  );
  return /買|分批|回測|突破|支撐|停損|失效|NT\$|[0-9]/.test(text);
}

function hasRepricingEvidence(card) {
  const text = textFrom(
    card.repricingRequiredEvidence,
    card.missingRepricingEvidence,
    card.nextEvidenceSearchPlan,
    card.revaluationJobSummary?.missingEvidence,
    card.revaluationJobSummary?.lastResult,
    card.brokerEvidenceSearchStatus?.summary,
  );
  return /EPS|Forward|PE|月營收|毛利|券商|broker|FactSet|目標價|證據|重估|上修/.test(text);
}

function brokerClassified(card) {
  const broker = card.brokerEvidenceSearchStatus || card.revaluationJobSummary?.brokerEvidenceSearchStatus || null;
  if (!broker) return true;
  const text = textFrom(broker.status, broker.summary);
  return /consensus|verified|social_broker_leak|leak|news|public|import|匯入|新聞|社群|券商|外資|未命中|待補|not_attempted|pending|hit|miss/i.test(text);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  const checkedCards = [];

  const market = radar.marketIndexSignal || null;
  if (!market?.riskBudget) issues.push('market:missing_risk_budget');
  if (!market?.entryBias) issues.push('market:missing_entry_bias');
  if (!market?.exitBias) issues.push('market:missing_exit_bias');
  if (!radar.marketBreadthSummary && !market?.summary) issues.push('market:missing_breadth_or_summary');

  const cards = visibleCards(radar).slice(0, limit);
  for (const card of cards) {
    const decision = card.tradeDecision || null;
    const action = decision?.action || card.entryActionLabel || null;
    const coverage = card.targetCoverageStatus || null;
    const checked = {
      symbol: card.symbol,
      bucket: card.displayBucket || card.recommendationBucket || null,
      coverage,
      action,
      hasTradeDecision: Boolean(decision),
      positionSize: decision?.positionSize || null,
    };
    checkedCards.push(checked);

    if (!decision) {
      if (!card.tradeDecisionUnavailableReason) issues.push(`${card.symbol}:missing_trade_decision`);
      continue;
    }
    if (!decision.action) issues.push(`${card.symbol}:missing_trade_action`);
    if (!decision.positionSize) issues.push(`${card.symbol}:missing_trade_position_size`);
    if (!decision.stopLoss) issues.push(`${card.symbol}:missing_trade_stop_loss`);
    if (!decision.marketGateReason) issues.push(`${card.symbol}:missing_market_gate_reason`);
    if (!hasActionableTrigger(decision)) issues.push(`${card.symbol}:missing_actionable_trigger`);

    if (coverage === 'scenario_only') {
      if (!hasRepricingEvidence(card)) issues.push(`${card.symbol}:scenario_only_missing_repricing_evidence`);
      if (!hasActionableTrigger(decision)) issues.push(`${card.symbol}:scenario_only_without_buy_hold_trigger`);
    }

    if (coverage === 'over_base_and_scenario') {
      if (!nonBuyOverTargetActions.has(action)) issues.push(`${card.symbol}:over_scenario_buy_action:${action || 'missing'}`);
      if (!card.hotTrackingReason && !card.archiveReason && !card.overTargetReason) issues.push(`${card.symbol}:over_scenario_missing_hot_tracking_reason`);
      if (!hasRepricingEvidence(card)) issues.push(`${card.symbol}:over_scenario_missing_raise_target_evidence`);
    }

    if (!brokerClassified(card)) issues.push(`${card.symbol}:broker_evidence_unclassified`);
  }

  const actionableCount = checkedCards.filter((card) => buyActions.has(card.action)).length;
  const conservativeCount = checkedCards.filter((card) => /不買|等回測|不追價|過熱/.test(String(card.action || ''))).length;
  if (checkedCards.length >= 8 && actionableCount === 0 && conservativeCount === checkedCards.length) {
    issues.push(`all_visible_cards_conservative:${checkedCards.map((card) => `${card.symbol}:${card.action || 'missing'}`).join('|')}`);
  }

  const unchangedReason = String(radar.discoveryFreshnessSummary?.unchangedReason || '');
  if (
    radar.discoveryFreshnessSummary &&
    !/Gate|stale|逾時|已反映|bridge|broker|券商|重估|queued|source|來源|候選|過價|資料/.test(unchangedReason)
  ) {
    issues.push('discovery_freshness_unchanged_reason_too_generic');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `market-aware-entry-v3-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
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
    console.error(`Market-aware entry v3 audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Market-aware entry v3 audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`market-aware entry v3 audit failed: ${err.message}`);
  process.exit(1);
});
