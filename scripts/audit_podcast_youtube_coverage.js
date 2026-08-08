#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const requiredKols = ['股癌', '投資癮', '定錨投筆', '游庭皓的財經皓角', 'M觀點', '財經M平方', '股市隱者', '財報狗', 'John 林睿閔'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function detailIssues(connector, detail) {
  const issues = [];
  if (!detail) return [`${connector}:missing_source_health_detail`];
  const breakdown = detail.kolBreakdown || [];
  if (!Array.isArray(breakdown) || breakdown.length === 0) issues.push(`${connector}:missing_kol_breakdown`);
  const byKol = new Map(breakdown.map((item) => [item.kol, item]));
  for (const kol of requiredKols) {
    const item = byKol.get(kol);
    if (!item) {
      issues.push(`${connector}:${kol}:missing_attempt`);
      continue;
    }
    if (!Array.isArray(item.searchedUrls) || item.searchedUrls.length === 0) issues.push(`${connector}:${kol}:missing_searched_urls`);
    const hasUsefulOutcome = Number(item.episodesFound || 0) > 0 || Number(item.weakSignalsWritten || 0) > 0 || item.failureReason;
    if (!hasUsefulOutcome) issues.push(`${connector}:${kol}:missing_written_or_failure_reason`);
  }
  if (!detail.lastSuccessAt && !detail.displayFailureReason && !detail.failureReason && !detail.degradedReason) {
    issues.push(`${connector}:missing_success_or_failure_reason`);
  }
  return issues;
}

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const podcast = details.find((item) => item.connector === 'podcast');
  const youtube = details.find((item) => item.connector === 'youtube');
  const issues = [...detailIssues('podcast', podcast), ...detailIssues('youtube', youtube)];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    ok: issues.length === 0,
    issues,
    podcast,
    youtube,
  };
  const reportPath = path.join(reportsDir, `podcast-youtube-coverage-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error(`Podcast/YouTube coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Podcast/YouTube coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Podcast/YouTube coverage audit failed: ${error.message}`);
  process.exit(1);
});
