#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const limit = Number(argValue('--limit', '12'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const buyActions = new Set(['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤']);
const hardBlockActions = new Set(['不買', '減碼', '出場']);

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

function hasHardBlockReason(detail) {
  const text = [
    detail?.targetSnapshot?.staleReason,
    detail?.targetSnapshot?.archiveReason,
    detail?.targetSnapshot?.valuationSanityReason,
    detail?.targetSnapshot?.lastRevaluationResult,
    detail?.tradeDecision?.marketGateReason,
    detail?.tradeDecision?.exitCondition,
    detail?.chipEntryAssessment?.summary,
    detail?.chipEntryAssessment?.chipRead,
    detail?.chipEntryAssessment?.technicalRead,
    detail?.technicalEntrySignal?.summary,
    detail?.technicalEntrySignal?.staleTechnicalReason,
    ...(detail?.tradeDecision?.reasons || []),
    ...(detail?.chipEntryAssessment?.actionabilityReasons || []),
    ...(detail?.chipEntryAssessment?.missingReasons || []),
  ].filter(Boolean).join(' ');
  return /高於情境|資料不足|資料待補|缺法人|缺融資|缺融券|缺借券|跌破|趨勢轉弱|RSI\s*8\d|融資.*暴增|法人.*連賣|估值已反映|Base.*未具名|bridge.*不足|大盤.*轉弱|risk_off|market_breakdown/.test(text);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar).slice(0, limit);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    const detail = await fetchJson(`${baseUrl}/api/stocks/${card.symbol}/deep-dive`);
    const decision = detail?.chipEntryAssessment?.entryDecision || detail?.technicalEntrySignal?.entryDecision || card.entryDecision || null;
    const buyPlan = decision?.buyPlan || null;
    const indicatorStack = decision?.indicatorStack || detail?.technicalEntrySignal?.indicatorStack || null;
    checked.push({
      symbol: card.symbol,
      action: decision?.action || null,
      score: decision?.actionabilityScore ?? detail?.technicalEntrySignal?.actionabilityScore ?? null,
      buyNowAllowed: decision?.buyNowAllowed ?? null,
      entryStyle: decision?.entryStyle ?? null,
    });
    if (!decision) {
      issues.push(`${card.symbol}:missing_entry_decision`);
      continue;
    }
    if (decision.actionabilityScore == null && detail?.technicalEntrySignal?.actionabilityScore == null) {
      issues.push(`${card.symbol}:missing_actionability_score`);
    }
    if (!decision.entryStyle) issues.push(`${card.symbol}:missing_entry_style`);
    if (!buyPlan) issues.push(`${card.symbol}:missing_buy_plan`);
    if (buyPlan && ['initialSizePct', 'addSizePct', 'maxSizePct', 'buyZone', 'stopLoss', 'invalidation'].some((key) => buyPlan[key] == null || buyPlan[key] === '')) {
      issues.push(`${card.symbol}:incomplete_buy_plan`);
    }
    if (!indicatorStack) issues.push(`${card.symbol}:missing_indicator_stack`);
    if (buyActions.has(decision.action) && !decision.buyNowAllowed) issues.push(`${card.symbol}:buy_action_without_buy_now_allowed`);
    if (hardBlockActions.has(decision.action) && !hasHardBlockReason(detail)) issues.push(`${card.symbol}:hard_block_without_clear_reason`);
  }

  const actionableCount = checked.filter((item) => buyActions.has(item.action)).length;
  const hardBlockedCount = checked.filter((item) => hardBlockActions.has(item.action)).length;
  if (checked.length >= 6 && actionableCount === 0 && hardBlockedCount < checked.length) {
    issues.push(`no_actionable_buy_plans:${checked.map((item) => `${item.symbol}:${item.action || 'missing'}`).join('|')}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `entry-buy-actionability-v2-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Entry buy actionability v2 audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Entry buy actionability v2 audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`entry buy actionability v2 audit failed: ${err.message}`);
  process.exit(1);
});
