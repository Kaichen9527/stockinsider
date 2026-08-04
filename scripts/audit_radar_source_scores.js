#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3010',
    timeoutMs: 30000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--base-url' && argv[index + 1]) options.baseUrl = argv[++index];
    else if (arg === '--timeout-ms' && argv[index + 1]) options.timeoutMs = Math.max(1000, Number(argv[++index]) || options.timeoutMs);
  }
  return options;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function histogram(values) {
  const map = new Map();
  for (const value of values) map.set(String(value), (map.get(String(value)) || 0) + 1);
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function scoreSignature(card) {
  return JSON.stringify(
    (card.scenarioChecklistScoreDetails || []).map((item) => ({
      label: item.label,
      score: item.score,
      status: item.status,
    })),
  );
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`, options.timeoutMs);
  const issues = [];
  const rawPayload = JSON.stringify(radar);
  const rawPatterns = ['browserType.launch', 'chrome-headless-shell', 'chromium_headless_shell', 'npx playwright install'];
  for (const pattern of rawPatterns) {
    if (rawPayload.includes(pattern)) issues.push(`raw_runtime_error_exposed:${pattern}`);
  }

  const socialConnectors = new Set(['threads', 'investanchors', 'instagram', 'telegram']);
  const sourceDetails = (radar.sourceHealthSummary?.connectorDetails || []).filter((item) => socialConnectors.has(item.connector));
  for (const item of sourceDetails) {
    if ((item.failureReason || item.degradedReason || item.displayFailureReason || '').match(/browserType\.launch|chrome-headless-shell|npx playwright install/i)) {
      issues.push(`${item.connector}_raw_failure_reason`);
    }
    if ((item.normalizedFailureCode === 'auth_degraded' || /auth|session|cookie|instagram_bridge/i.test(item.displayFailureReason || '')) && item.recordsWritten24h > 0) {
      if (!item.displayFailureReason) issues.push(`${item.connector}_auth_degraded_without_display_reason`);
    }
    if (item.recordsWritten24h > 0 && item.normalizedFailureCode && !item.displayFailureReason) {
      issues.push(`${item.connector}_partial_write_without_degraded_reason`);
    }
  }

  const cards = [...(radar.opportunities || []), ...(radar.scenarioUpsideCandidates || [])].slice(0, 12);
  const progressValues = cards.map((card) => card.scenarioChecklistProgress).filter((value) => value != null);
  const progressHistogram = histogram(progressValues);
  const mostCommonProgress = progressHistogram[0] || null;
  if (mostCommonProgress && mostCommonProgress[1] >= Math.min(8, Math.max(5, cards.length - 2))) {
    const repeatedCards = cards.filter((card) => String(card.scenarioChecklistProgress) === mostCommonProgress[0]);
    const signatures = new Set(repeatedCards.map(scoreSignature));
    if ([...signatures].some((signature) => !signature || signature === '[]')) {
      issues.push(`scenario_progress_duplicate_without_score_details:${mostCommonProgress[0]}x${mostCommonProgress[1]}`);
    }
  }

  const entryLabels = cards.map((card) => card.entryReadinessLabel || '').filter(Boolean);
  const entryHistogram = histogram(entryLabels);
  const mostCommonEntry = entryHistogram[0] || null;
  if (mostCommonEntry && mostCommonEntry[1] >= Math.min(10, Math.max(6, cards.length - 1))) {
    const repeatedCards = cards.filter((card) => card.entryReadinessLabel === mostCommonEntry[0]);
    const reasonSignatures = new Set(repeatedCards.map((card) => JSON.stringify(card.entryReadinessReasons || [])));
    if (reasonSignatures.size <= 1) issues.push(`entry_readiness_mass_duplicate:${mostCommonEntry[0]}x${mostCommonEntry[1]}`);
  }

  const report = {
    generatedAt: nowIso(),
    baseUrl,
    ok: issues.length === 0,
    issues,
    sourceDetails,
    progressHistogram,
    entryHistogram,
    cards: cards.map((card) => ({
      symbol: card.symbol,
      confidence: card.recommendationConfidenceScore,
      scenarioProgress: card.scenarioChecklistProgress,
      scoreDetails: card.scenarioChecklistScoreDetails || [],
      entryReadinessLabel: card.entryReadinessLabel,
      entryReadinessReasons: card.entryReadinessReasons || [],
    })),
  };
  const reportPath = path.join(REPORTS_DIR, `radar-source-score-audit-${nowIso().replace(/[:.]/g, '-')}.json`);
  report.reportPath = reportPath;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Radar source/score audit: ${report.ok ? 'pass' : 'fail'}`);
    if (issues.length) console.log(`Issues: ${issues.join(', ')}`);
    console.log(`Report: ${reportPath}`);
  }
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`radar source/score audit failed: ${error.message}`);
  process.exit(1);
});
