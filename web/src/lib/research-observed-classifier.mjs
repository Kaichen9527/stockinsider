import {assertSourcePacketBoundary,sourceControllerInstant} from './research-source-attempt-controller.ts';
import {researchCanonicalHash} from './research-agent-qualification.ts';
const SHA=/^[0-9a-f]{64}$/u;
function only(value, allowed) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))
    throw new Error('discovery_relay_unknown_field');
}
const project=(value, allowed)=>Object.fromEntries(allowed.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
function clockChain(values) {
  let clocks;try{clocks=values.map(sourceControllerInstant);}catch{throw new Error('discovery_relay_clock_invalid');}
  if(clocks.some((at,i)=>i>0&&at<clocks[i-1]))throw new Error('discovery_relay_clock_invalid');
}
export function reconcileObservedResearchCohort(legacy, scope, now) {
  if (!scope) return {members:legacy.members, evidence:null, excluded:null};
  assertSourcePacketBoundary(scope);
  only(scope,['schemaVersion','recordedAt','sources','companyMasterReferenceCommit','legacyClassificationReferenceCommit',
    'encoding','parseDiagnostic','counts','newlyClassifiedOrdinarySymbols','rows','trustedAuthorityActivated',
    'currentTradingEligibilityVerified','historicalPITEligible','limits']);
  if (scope.schemaVersion!=='stockinsider-observed-official-security-scope-reconciliation-v1'
    || scope.trustedAuthorityActivated!==false || scope.currentTradingEligibilityVerified!==false
    || scope.historicalPITEligible!==false || scope.encoding!=='cp950_strict'
    || !Array.isArray(scope.sources) || scope.sources.length!==1 || !Array.isArray(scope.rows) || scope.rows.length>5000
    || !Array.isArray(scope.limits) || !scope.limits.every(v=>typeof v==='string')
    || !Array.isArray(scope.newlyClassifiedOrdinarySymbols)
    || !/^[0-9a-f]{40}$/.test(scope.companyMasterReferenceCommit)
    || !/^[0-9a-f]{40}$/.test(scope.legacyClassificationReferenceCommit))throw new Error('discovery_relay_scope_invalid');
  clockChain([scope.recordedAt,now]);
  const source=scope.sources[0];
  only(source,['label','url','attemptedAt','observedAt','httpStatus','status','resolvedUrl','bytes','sha256']);
  if (source.url!=='https://isin.twse.com.tw/isin/C_public.jsp?strMode=2' || source.resolvedUrl!==source.url
    || source.status!=='read_success' || source.httpStatus!==200 || !SHA.test(source.sha256)
    || !Number.isInteger(source.bytes) || source.bytes<1 || source.bytes>12_000_000)throw new Error('discovery_relay_scope_receipt_invalid');
  clockChain([source.attemptedAt,source.observedAt,scope.recordedAt,now]);
  const seen=new Set(), legacyTwse=new Map(legacy.members.filter(r=>r.exchange==='TWSE').map(r=>[r.symbol,r]));
  const members=[],excluded=[],added=[];let innovation=0,restrictedCfi=0;
  for(const row of scope.rows) {
    only(row,['symbol','name','isin','listingDateText','marketText','sectorText','cfi','note','sourceSection','classification','legacyStrictCfiMatched']);
    if(!['symbol','name','isin','listingDateText','marketText','sectorText','cfi','note','sourceSection','classification'].every(k=>typeof row[k]==='string')
      || typeof row.legacyStrictCfiMatched!=='boolean' || !/^\d{4,6}$/.test(row.symbol) || seen.has(row.symbol))throw new Error('discovery_relay_scope_row_invalid');
    seen.add(row.symbol);
    const ordinary=/^ES[A-Z]{4}$/.test(row.cfi) && /^\d{4}$/.test(row.symbol) && ['股票','創新板'].includes(row.sourceSection);
    if(ordinary) {
      if(row.classification!=='ordinary_equity_research_candidate' || row.legacyStrictCfiMatched!==legacyTwse.has(row.symbol))throw new Error('discovery_relay_scope_classification_invalid');
      const old=legacyTwse.get(row.symbol);
      if(old && (old.cfi!==row.cfi || old.isin!==row.isin || old.name!==row.name))throw new Error('discovery_relay_scope_legacy_mismatch');
      if(!old)added.push(row.symbol);
      if(row.sourceSection==='創新板')innovation++;
      if(row.cfi!=='ESVUFR')restrictedCfi++;
      members.push({symbol:row.symbol,name:row.name,exchange:'TWSE',cfi:row.cfi,isin:row.isin,
        listingDate:row.listingDateText,sector:row.sectorText,observedAt:source.observedAt,sourceSection:row.sourceSection});
    } else {
      if(row.classification!=='non_ordinary_tdr' || row.sourceSection!=='臺灣存託憑證(TDR)' || !/^ED[A-Z]{4}$/.test(row.cfi)
        || row.legacyStrictCfiMatched!==false)throw new Error('discovery_relay_scope_classification_invalid');
      excluded.push({symbol:row.symbol,cfi:row.cfi,sourceSection:row.sourceSection,reason:'non_ordinary_tdr'});
    }
  }
  for(const symbol of legacyTwse.keys())if(!members.some(r=>r.symbol===symbol))throw new Error('discovery_relay_scope_legacy_missing');
  const tpex=legacy.members.filter(r=>r.exchange==='TPEX'), tpexSource=legacy.sources.find(r=>r.url==='https://isin.twse.com.tw/isin/C_public.jsp?strMode=4');
  if(!tpexSource)throw new Error('discovery_relay_scope_tpex_missing');
  for(const row of tpex){if(seen.has(row.symbol))throw new Error('discovery_relay_scope_duplicate_symbol');members.push({...row,observedAt:tpexSource.observedAt,sourceSection:'legacy TPEX stock observation'});}
  const counts={twseMasterMatched:scope.rows.length,twseOrdinaryResearchCandidates:members.length-tpex.length,
    twseInnovationBoard:innovation,twseOrdinaryAdditionalTransferRestrictionCfi:restrictedCfi,
    twseTdrExcludedFromOrdinaryScope:excluded.length,unchangedObservedTpexOrdinary:tpex.length,
    reconciledObservedOrdinaryResearchCohort:members.length,legacyStrictObservedCohort:legacy.members.length};
  only(scope.counts,Object.keys(counts));
  if(Object.keys(counts).some(k=>counts[k]!==scope.counts[k]) || added.length!==scope.newlyClassifiedOrdinarySymbols.length
    || added.some(v=>!scope.newlyClassifiedOrdinarySymbols.includes(v)))throw new Error('discovery_relay_scope_count_mismatch');
  return {members,excluded,evidence:{schemaVersion:scope.schemaVersion,recordedAt:scope.recordedAt,counts,
    sourceReferences:[{url:source.url,observedAt:source.observedAt,responseBytes:source.bytes,responseSha256:source.sha256},
      {...project(tpexSource,['url','observedAt','responseBytes','responseSha256'])}],
    rawSourceHashesVerifiedByVm:false,selectedPacketHash:researchCanonicalHash(scope),trustedAuthorityActivated:false,
    currentTradingEligibilityVerified:false,historicalPITEligible:false}};
}

