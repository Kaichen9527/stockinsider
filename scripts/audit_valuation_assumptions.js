#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/u, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function sourceCards(radar) {
  return (Array.isArray(radar.sourceSignals) ? radar.sourceSignals : []).filter((card,index,cards)=>
    /^[0-9]{4}$/u.test(String(card.symbol??'')) && /^decision-v3[.](?:13|14):[0-9a-f]{64}$/u.test(String(card.decisionRevisionId??''))
      && cards.findIndex((probe)=>probe.symbol===card.symbol)===index);
}

function inspectEnvelope(card,issues,label) {
  const envelope=card.decisionEnvelope;const valuation=envelope?.valuationSummary;
  const expectedVersion=String(card.decisionRevisionId??'').startsWith('decision-v3.14:')
    ?'decision-envelope-v3.14.0':'decision-envelope-v3.13.0';
  if(envelope?.version!==expectedVersion||envelope?.decisionRevisionId!==card.decisionRevisionId)
    issues.push(`${label}:revision_envelope_mismatch`);
  if(!['complete','relative_only','missing','stale','conflict'].includes(envelope?.valuationReadiness))
    issues.push(`${label}:valuation_readiness_invalid`);
  if(envelope?.recommendationAuthority==='formal'){
    const range=valuation?.formalRange;
    if(!(range&&range.bear>0&&range.bear<range.base&&range.base<range.bull))issues.push(`${label}:formal_range_invalid`);
    if(!Array.isArray(valuation?.sourceRefs)||valuation.sourceRefs.length===0)issues.push(`${label}:formal_sources_missing`);
    if(!valuation?.asOf)issues.push(`${label}:formal_as_of_missing`);
  }
  if(envelope?.recommendationAuthority==='conditional_research'){
    const band=valuation?.relativeBand;
    if(!(band&&band.low>0&&band.low<band.base&&band.base<band.high))issues.push(`${label}:relative_band_invalid`);
  }
  if(envelope?.valuationReadiness==='missing'&&['buy','accumulate','research_starter'].includes(envelope?.userAction))
    issues.push(`${label}:actionable_with_missing_valuation`);
}

async function main() {
  const radar=await fetchJson(`${baseUrl}/api/radar/daily`);const cards=sourceCards(radar);const issues=[];
  if(cards.length===0)issues.push('radar:no_revision_bound_supported_source_cards');
  for(const card of cards){
    const revision=encodeURIComponent(card.decisionRevisionId);const symbol=encodeURIComponent(card.symbol);
    const detail=await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive?decisionRevisionId=${revision}`);
    const label=`${card.symbol}:${card.decisionRevisionId}`;
    if(detail.decisionRevisionId!==card.decisionRevisionId)issues.push(`${label}:detail_revision_mismatch`);
    if(JSON.stringify(detail.decisionEnvelope)!==JSON.stringify(card.decisionEnvelope))issues.push(`${label}:detail_envelope_mismatch`);
    inspectEnvelope(card,issues,label);
  }
  fs.mkdirSync(reportsDir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/gu,'-');
  const reportPath=path.join(reportsDir,`valuation-assumptions-audit-${stamp}.json`);
  fs.writeFileSync(reportPath,JSON.stringify({schema:'valuation-assumptions-audit-v3.14',baseUrl,
    passed:issues.length===0,checkedRevisions:cards.map((card)=>card.decisionRevisionId),issues,
    checkedAt:new Date().toISOString()},null,2));
  if(issues.length){console.error(`Valuation assumptions audit failed: ${issues.join(', ')}`);process.exit(1);}
  console.log(`Valuation assumptions audit: pass (${cards.length} revision-bound cards)`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error)=>{console.error(`valuation assumptions audit failed: ${error.message}`);process.exit(1);});
