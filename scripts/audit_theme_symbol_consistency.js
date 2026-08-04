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

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const hotThemes = Array.isArray(radar.hotThemes) ? radar.hotThemes : [];
  const issues = [];
  const checkedThemes = [];

  for (const theme of hotThemes) {
    const themeKey = String(theme.themeKey || '');
    if (!themeKey) continue;
    const radarSymbols = new Set((theme.relatedSymbols || theme.symbols || []).map(String).filter(Boolean));
    const detail = await fetchJson(`${baseUrl}/api/themes/${encodeURIComponent(themeKey)}`);
    const detailSymbols = new Set((detail.theme?.relatedSymbols || []).map(String).filter(Boolean));
    const trackedSymbols = new Set((detail.trackedSymbols || []).map((item) => String(item.symbol || '')).filter(Boolean));
    const missingInDetail = [...radarSymbols].filter((symbol) => !detailSymbols.has(symbol));
    const missingInTracked = [...radarSymbols].filter((symbol) => !trackedSymbols.has(symbol));

    checkedThemes.push({
      themeKey,
      radarSymbols: [...radarSymbols],
      detailSymbols: [...detailSymbols],
      trackedSymbols: [...trackedSymbols],
      missingInDetail,
      missingInTracked,
    });

    if (missingInDetail.length) issues.push(`${themeKey}:missing_detail_symbols:${missingInDetail.join(',')}`);
    if (missingInTracked.length) issues.push(`${themeKey}:missing_tracked_symbols:${missingInTracked.join(',')}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `theme-symbol-consistency-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedThemes, checkedAt: new Date().toISOString() }, null, 2),
  );

  if (issues.length) {
    console.error(`Theme symbol consistency audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Theme symbol consistency audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`theme symbol consistency audit failed: ${err.message}`);
  process.exit(1);
});
