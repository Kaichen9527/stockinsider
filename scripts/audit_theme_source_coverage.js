#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const REQUIRED_THEMES = [
  'quartz-frequency-components',
  'passive-components-mlcc',
  'memory-rerating',
  'ai-server-global-lead',
  'optical-cpo-global-lead',
  'advanced-packaging-asic-global-lead',
  'mature-node-consumer-global-lead',
];
const QUARTZ_SYMBOLS = ['3221', '3042', '2484', '8183'];

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const issues = [];
  const checkedThemes = [];

  for (const themeKey of REQUIRED_THEMES) {
    const detail = await fetchJson(`${baseUrl}/api/themes/${encodeURIComponent(themeKey)}`);
    const sourceCoverage = Array.isArray(detail.sourceCoverage) ? detail.sourceCoverage : [];
    const evidenceMatrix = Array.isArray(detail.evidenceMatrix) ? detail.evidenceMatrix : [];
    const missingSources = Array.isArray(detail.missingSources) ? detail.missingSources : [];
    const nextRefreshPlan = Array.isArray(detail.nextRefreshPlan) ? detail.nextRefreshPlan : [];
    const relatedSymbols = Array.isArray(detail.theme?.relatedSymbols) ? detail.theme.relatedSymbols.map(String) : [];
    const trackedSymbols = Array.isArray(detail.trackedSymbols) ? detail.trackedSymbols.map((item) => String(item.symbol || '')) : [];

    checkedThemes.push({
      themeKey,
      sourceCoverage: sourceCoverage.length,
      evidenceMatrix: evidenceMatrix.length,
      missingSources: missingSources.length,
      nextRefreshPlan: nextRefreshPlan.length,
      relatedSymbols,
      trackedSymbols,
      contentStatus: detail.contentStatus || null,
    });

    if (sourceCoverage.length === 0 && evidenceMatrix.length === 0) {
      issues.push(`${themeKey}:missing_source_coverage_and_evidence_matrix`);
    }
    if (sourceCoverage.length === 0 && missingSources.length === 0 && nextRefreshPlan.length === 0) {
      issues.push(`${themeKey}:missing_source_failure_or_refresh_plan`);
    }
    if (themeKey === 'quartz-frequency-components') {
      for (const symbol of QUARTZ_SYMBOLS) {
        if (!relatedSymbols.includes(symbol)) issues.push(`quartz-frequency-components:missing_related_symbol_${symbol}`);
        if (!trackedSymbols.includes(symbol)) issues.push(`quartz-frequency-components:missing_tracked_symbol_${symbol}`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `theme-source-coverage-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedThemes, checkedAt: new Date().toISOString() }, null, 2),
  );

  if (issues.length) {
    console.error(`Theme source coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Theme source coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`theme source coverage audit failed: ${err.message}`);
  process.exit(1);
});
