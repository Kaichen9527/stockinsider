#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const blocked = new Set(['資料不足不買', '資料不足暫緩', '籌碼偏亂先不買', '過熱不追', '趨勢轉弱', '等回測']);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = [...(radar.opportunities || []), ...(radar.scenarioUpsideCandidates || []), ...(radar.earlyWatchlist || [])].slice(0, 18);
  const labels = cards.map((card) => card.entryReadinessLabel || 'missing');
  const actionable = labels.filter((label) => ['可小量分批', '突破後小量追蹤', '突破確認再追'].includes(label)).length;
  const issues = [];
  if (cards.length >= 6 && actionable === 0) {
    issues.push(`no_actionable_entry_labels:${labels.join('|')}`);
  }
  const blockedRatio = cards.length ? labels.filter((label) => blocked.has(label)).length / cards.length : 0;
  if (cards.length >= 8 && blockedRatio > 0.9) issues.push(`entry_labels_too_conservative:${Math.round(blockedRatio * 100)}%`);

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `entry-actionability-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, issues, labels, actionable, checkedAt: new Date().toISOString() }, null, 2),
  );
  if (issues.length) {
    console.error(`Entry actionability audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Entry actionability audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`entry actionability audit failed: ${err.message}`);
  process.exit(1);
});
