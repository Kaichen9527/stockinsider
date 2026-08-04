#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const issues = [];
  for (const card of radar.opportunities || []) {
    const label = card.symbol || 'unknown';
    const signal = card.peValuationSignal;
    if (!signal) {
      issues.push(`${label}:missing_pe_signal`);
      continue;
    }
    if (!signal.peerPeRange) issues.push(`${label}:missing_peer_pe_range`);
    if (!signal.reratingReason) issues.push(`${label}:missing_pe_rerating_reason`);
    if (typeof card.recommendationIndexBreakdown?.peValuationGap !== 'number') issues.push(`${label}:missing_pe_gap_score`);
    if ((signal.peDiscountPct || 0) > 10 && !signal.earningsInflection) {
      issues.push(`${label}:pe_discount_without_earnings_inflection`);
    }
    if (/TTM PE|本益比/.test(signal.reratingReason) && /週期|記憶體|航運|成熟製程/.test(card.thesisTitle || '') && !/normalized|常態|cycle|景氣/.test(signal.reratingReason)) {
      issues.push(`${label}:cyclical_pe_not_normalized`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `pe-valuation-signal-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`PE valuation signal audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('PE valuation signal audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`PE valuation signal audit failed: ${err.message}`);
  process.exit(1);
});
