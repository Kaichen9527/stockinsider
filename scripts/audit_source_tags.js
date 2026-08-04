#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const [html, radar] = await Promise.all([fetchText(`${baseUrl}/`), fetchJson(`${baseUrl}/api/radar/daily`)]);
  const issues = [];
  if (html.includes('社群優先')) issues.push('homepage_renders_raw_source_priority_label');
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ];
  for (const card of cards) {
    const stats = card.socialMentionStats || {};
    const totalMentions =
      Number(stats.kolMentions || 0) +
      Number(stats.podcastMentions || 0) +
      Number(stats.youtubeMentions || 0) +
      Number(stats.threadsMentions || 0) +
      Number(stats.instagramMentions || 0) +
      Number(stats.telegramMentions || 0) +
      Number(stats.investanchorsMentions || 0);
    if (Number(card.sourcePriorityScore || 0) === 0 && Array.isArray(card.sourceSignalBadges) && card.sourceSignalBadges.length > 0) {
      issues.push(`${card.symbol}:zero_source_priority_with_badges`);
    }
    if (totalMentions === 0 && Array.isArray(card.sourceSignalBadges) && card.sourceSignalBadges.some((badge) => /社群|影音|定錨|KOL/.test(badge))) {
      issues.push(`${card.symbol}:social_badge_without_mentions`);
    }
  }
  const report = { generatedAt: new Date().toISOString(), baseUrl, ok: issues.length === 0, issues };
  const reportPath = path.join(reportsDir, `source-tags-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error(`Source tags audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Source tags audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Source tags audit failed: ${error.message}`);
  process.exit(1);
});
