#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function hasFormalOpportunity(detail) {
  return (detail.opportunities || []).some(
    (card) =>
      card?.displayBucket === 'formal' ||
      card?.recommendationBucket === 'high_conviction' ||
      card?.recommendationBucket === 'early_formal' ||
      card?.isActionableRecommendation === true,
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const hotThemes = Array.isArray(radar.hotThemes) ? radar.hotThemes : [];
  const issues = [];
  const checkedThemes = [];

  for (const theme of hotThemes) {
    const themeKey = String(theme.themeKey || '');
    if (!themeKey) continue;
    const detail = await fetchJson(`${baseUrl}/api/themes/${encodeURIComponent(themeKey)}`);
    const opportunities = Array.isArray(detail.opportunities) ? detail.opportunities.length : 0;
    const supportingStories = Array.isArray(detail.supportingStories) ? detail.supportingStories.length : 0;
    const reports = Array.isArray(detail.reports) ? detail.reports.length : 0;
    const trackedSymbols = Array.isArray(detail.trackedSymbols) ? detail.trackedSymbols.length : 0;
    const evidenceMatrix = Array.isArray(detail.evidenceMatrix) ? detail.evidenceMatrix.length : 0;
    const contentStatus = detail.contentStatus || null;
    const formal = hasFormalOpportunity(detail);

    checkedThemes.push({
      themeKey,
      opportunities,
      supportingStories,
      reports,
      trackedSymbols,
      evidenceMatrix,
      contentStatus,
      formal,
    });

    if (opportunities === 0 && supportingStories === 0 && reports === 0) {
      issues.push(`${themeKey}:empty_detail_core_sections`);
    }
    if (!formal && trackedSymbols === 0) {
      issues.push(`${themeKey}:non_formal_missing_tracked_symbols`);
    }
    if (!contentStatus) {
      issues.push(`${themeKey}:missing_content_status`);
    }
    if (evidenceMatrix === 0) {
      issues.push(`${themeKey}:missing_evidence_matrix`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `theme-detail-coverage-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedThemes, checkedAt: new Date().toISOString() }, null, 2),
  );

  if (issues.length) {
    console.error(`Theme detail coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Theme detail coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`theme detail coverage audit failed: ${err.message}`);
  process.exit(1);
});
