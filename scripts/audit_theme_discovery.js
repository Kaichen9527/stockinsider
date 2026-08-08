#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

const themes = [
  { key: 'cpu-ai-pc', query: 'CPU AI PC 筆電 Intel AMD' },
  { key: 'passive-components-mlcc', query: 'MLCC 被動元件 TLVR 漲價' },
  { key: 'mature-node-recovery', query: '成熟製程 28nm 40nm Driver IC MCU PMIC' },
  { key: 'consumer-electronics-rebound', query: '消費性電子 手機 NB TV 補庫存' },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const allThemes = [...(radar.hotThemes || []), ...(radar.themeHypotheses || [])];
  const discoveredSymbols = new Set((radar.discoveredStocks || []).map((item) => String(item.symbol || '')).filter(Boolean));
  const earlySymbols = new Set((radar.earlyWatchlist || []).map((item) => String(item.symbol || '')).filter(Boolean));
  const issues = [];
  const results = [];

  for (const theme of themes) {
    let sourceHits = 0;
    try {
      const sources = await fetchJson(`${baseUrl}/api/sources/search?q=${encodeURIComponent(theme.query)}&limit=50`);
      sourceHits = Array.isArray(sources.items) ? sources.items.length : 0;
    } catch {
      sourceHits = 0;
    }
    const themeRows = allThemes.filter((item) => String(item.themeKey || '').includes(theme.key));
    const relatedSymbols = new Set(themeRows.flatMap((item) => (item.relatedSymbols || item.symbols || []).map(String)));
    const mappedSymbols = [...relatedSymbols].filter((symbol) => discoveredSymbols.has(symbol) || earlySymbols.has(symbol));
    results.push({ themeKey: theme.key, sourceHits, themeRows: themeRows.length, relatedSymbols: [...relatedSymbols], mappedSymbols });
    if (sourceHits > 0 && themeRows.length === 0) issues.push(`${theme.key}:source_hits_but_theme_missing`);
    if (sourceHits > 0 && relatedSymbols.size > 0 && mappedSymbols.length === 0) issues.push(`${theme.key}:source_hits_but_no_candidate_mapping`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `theme-discovery-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, results, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Theme discovery audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Theme discovery audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`theme discovery audit failed: ${err.message}`);
  process.exit(1);
});
