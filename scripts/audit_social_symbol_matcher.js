#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const knownFalsePositiveTokens = new Set(['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '1000', '1200', '1500', '1600', '1700', '1800', '2000', '3000', '5000']);

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const telegram = (radar.sourceHealthSummary?.connectorDetails || []).find((entry) => entry.connector === 'telegram');
  const issues = [];
  const channelSummary = [];

  if (!telegram) {
    issues.push('telegram:missing_source_health');
  } else {
    for (const channel of telegram.channelBreakdown || []) {
      const falseMatches = (channel.matchedSymbols || []).filter((symbol) => knownFalsePositiveTokens.has(String(symbol)));
      if (falseMatches.length > 0) issues.push(`telegram:${channel.channel}:false_positive_symbols_${falseMatches.join('_')}`);
      if ((channel.excludedFalsePositives || 0) === 0 && (channel.fetchedPosts || 0) > 0 && (channel.recordsWritten || 0) === 0) {
        issues.push(`telegram:${channel.channel}:no_false_positive_exclusion_stats`);
      }
      channelSummary.push({
        channel: channel.channel,
        fetchedPosts: channel.fetchedPosts || 0,
        matchedSymbols: channel.matchedSymbols || [],
        excludedFalsePositives: channel.excludedFalsePositives || 0,
        excludedExamples: channel.excludedExamples || [],
      });
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `social-symbol-matcher-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, channelSummary, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Social symbol matcher audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Social symbol matcher audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`social symbol matcher audit failed: ${err.message}`);
  process.exit(1);
});
