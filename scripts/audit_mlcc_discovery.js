#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const expectedSymbols = ['2327', '2492', '3026', '2472', '2375', '3357', '8042', '6207', '6224', '4760', '3624', '5328', '6127', '6432'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  let sources = { items: [] };
  let sourceSearchIssue = null;
  try {
    sources = await fetchJson(`${baseUrl}/api/sources/search?q=${encodeURIComponent('MLCC 被動元件 TLVR 漲價')}&limit=50`);
  } catch (err) {
    sourceSearchIssue = err instanceof Error ? err.message : String(err);
  }

  const themes = [
    ...(radar.hotThemes || []),
    ...(radar.themeHypotheses || []),
  ];
  const passiveTheme = themes.find((theme) => String(theme.themeKey || '').includes('passive-components-mlcc'));
  const sourceSymbols = new Set((sources.items || []).flatMap((item) => (item.symbols || []).map(String)));
  const relatedSymbols = new Set(((passiveTheme && passiveTheme.relatedSymbols) || []).map(String));
  const issues = [];

  if (!passiveTheme) issues.push('passive_components_mlcc_theme_missing');
  for (const symbol of expectedSymbols) {
    if (!relatedSymbols.has(symbol) && !sourceSymbols.has(symbol)) {
      issues.push(`mlcc_symbol_not_mapped_or_sourced:${symbol}`);
    }
  }
  const themeHasAllExpected = expectedSymbols.every((symbol) => relatedSymbols.has(symbol));
  if (!themeHasAllExpected && (!Array.isArray(sources.items) || sources.items.length === 0)) {
    issues.push('mlcc_source_search_no_results');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `mlcc-discovery-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        issues,
        passiveTheme: passiveTheme
          ? {
              themeKey: passiveTheme.themeKey,
              heatScore: passiveTheme.heatScore || null,
              relatedSymbols: passiveTheme.relatedSymbols || [],
            }
          : null,
        sourceResultCount: (sources.items || []).length,
        sourceSearchIssue,
        sourceSymbols: [...sourceSymbols],
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`MLCC discovery audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('MLCC discovery audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`MLCC discovery audit failed: ${err.message}`);
  process.exit(1);
});
