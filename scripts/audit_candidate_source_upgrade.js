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

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  for (const card of radar.opportunities || []) {
    const stats = card.socialMentionStats || {};
    const hasOnlyWeakAvSignal =
      Number(stats.weakSignals || 0) > 0 &&
      Number(stats.transcriptSignals || 0) === 0 &&
      Number(stats.investanchorsMentions || 0) === 0 &&
      Number(stats.threadsMentions || 0) === 0 &&
      Number(stats.telegramMentions || 0) === 0 &&
      Number(stats.instagramMentions || 0) === 0;
    const baseLabel = String(card.baseVerificationLabel || card.verificationStatus || '');
    if (hasOnlyWeakAvSignal && /買|已證實|正式|高/.test(baseLabel)) {
      issues.push(`${card.symbol}:weak_av_signal_appears_to_support_formal_recommendation`);
    }
  }
  const report = { generatedAt: new Date().toISOString(), baseUrl, ok: issues.length === 0, issues };
  const reportPath = path.join(reportsDir, `candidate-source-upgrade-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error(`Candidate source upgrade audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Candidate source upgrade audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Candidate source upgrade audit failed: ${error.message}`);
  process.exit(1);
});
