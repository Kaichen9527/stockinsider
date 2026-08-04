#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const ambiguousTokens = new Set(['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '1000', '1200', '1500', '1600', '1700', '1800', '2000', '3000', '5000']);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const connector = (radar.sourceHealthSummary?.connectorDetails || []).find((item) => item.connector === 'ptt' || item.id === 'ptt');
  const issues = [];
  const meta = connector?.metadata || connector?.lastRunMetadata || {};
  const falsePositives = [
    ...(Array.isArray(meta.excluded_false_positives) ? meta.excluded_false_positives : []),
    ...(Array.isArray(meta.excludedFalsePositives) ? meta.excludedFalsePositives : []),
  ];
  const matchedSymbols = Array.isArray(meta.matched_symbols) ? meta.matched_symbols.map(String) : [];
  for (const token of matchedSymbols) {
    if (ambiguousTokens.has(token)) issues.push(`ambiguous_token_matched_as_symbol:${token}`);
  }
  if ((connector?.recordsWritten24h || connector?.recordsWrittenThisRun || 0) > 0 && falsePositives.length === 0 && matchedSymbols.some((token) => ambiguousTokens.has(token))) {
    issues.push('missing_false_positive_exclusion_metadata');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `ptt-symbol-matcher-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, matchedSymbols, falsePositiveCount: falsePositives.length, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`PTT symbol matcher audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('PTT symbol matcher audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`ptt symbol matcher audit failed: ${err.message}`);
  process.exit(1);
});
