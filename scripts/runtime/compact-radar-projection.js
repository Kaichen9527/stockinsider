'use strict';

const { bounded, canonicalJson, immutableBundle, invariant, sha256 } = require('./codec');
const { serializeCorrectnessPublicUnion } = require('./public-projection');
const { compatibilityAction, unavailableDecisionEnvelope, overrideDecisionEnvelopeAction, validateDecisionEnvelopeV313,
  } = require('./decision-envelope');
const { validateDecisionEnvelopeV314 } = require('./decision-envelope-v314');
const { assessProjectionFreshness } = require('./projection-freshness');
const { deriveResearchNextStep } = require('./research-next-step-v317');
const { buildResearchSnapshotV317 } = require('./research-snapshot-v317');
const { buildResearchDossierV318 } = require('./research-dossier-v318');
const { deriveResearchReadinessV319 } = require('./research-readiness-v319');

const CARD_BUCKETS = Object.freeze([
  'opportunities', 'scenarioUpsideCandidates', 'earlyWatchlist',
  'recentFormal7d', 'fallbackOpportunities90d', 'hotTracking',
]);
const DECISION_BRIEF_UNAVAILABLE_REASON = 'insufficient_cited_decision_brief';
const LANDING_LANE_LIMITS = Object.freeze({ actionable: 6, waiting: 12, research: 12 });
const RADAR_PAYLOAD_MAXIMUM_BYTES = 150000;

function omitProjectionHeartbeat(value) {
  if (Array.isArray(value)) return value.map(omitProjectionHeartbeat);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['evaluatedAt', 'lastEvaluatedAt', 'noChangeMessage'].includes(key))
    .map(([key, nested]) => [key, omitProjectionHeartbeat(nested)]));
}

function immutableDecisionRevisionCard(card) {
  invariant(card && typeof card === 'object' && !Array.isArray(card), 'decision revision card required');
  const material = { ...card };
  delete material.lastEvaluatedAt;
  delete material.noChangeMessage;
  if (material.decisionEnvelope && typeof material.decisionEnvelope === 'object'
      && !Array.isArray(material.decisionEnvelope)) {
    const envelope = { ...material.decisionEnvelope };
    delete envelope.evaluatedAt;
    material.decisionEnvelope = envelope;
  }
  return material;
}

function decisionRevisionIdentityBundle(card) {
  const identityMaterial = immutableDecisionRevisionCard(card);
  delete identityMaterial.decisionRevisionId;
  if (identityMaterial.decisionEnvelope && typeof identityMaterial.decisionEnvelope === 'object'
      && !Array.isArray(identityMaterial.decisionEnvelope)) {
    const envelope = { ...identityMaterial.decisionEnvelope };
    delete envelope.decisionRevisionId;
    identityMaterial.decisionEnvelope = envelope;
  }
  // A V3.18 dossier is part of the immutable decision revision.  Its two
  // identifiers are derived from this same identity, so strip only those
  // cyclic fields before hashing; all display facts, evidence and blockers
  // remain identity-bearing material.
  if (identityMaterial.researchDossier && typeof identityMaterial.researchDossier === 'object'
      && !Array.isArray(identityMaterial.researchDossier)) {
    const dossier = { ...identityMaterial.researchDossier };
    delete dossier.dossierId;
    delete dossier.decisionRevisionId;
    identityMaterial.researchDossier = dossier;
  }
  return immutableBundle('legacy_decision_revision_identity_v3_13',
    ['decision-revision-v3.13.2', identityMaterial]);
}

function compactPositiveReason(row) {
  const key=`${row?.axis}:${row?.reason}`;
  return ({
    'discovery:price_dislocation_scan':'d:dislocation','fundamental:official_revenue_not_deteriorating':'f:revenue_ok',
    'fundamental:official_revenue_deteriorating':'f:revenue_down','priceDislocation:large_drawdown':'p:drawdown',
    'priceDislocation:moderate_dislocation':'p:moderate','priceDislocation:extended':'p:extended',
    'valuation:pe_compared_with_sector_and_own_history':'v:sector_history','valuation:pe_compared_with_own_history':'v:history',
    'valuation:pe_compared_with_sector_reference':'v:sector','timing:below_ma20_reclaim_required':'t:reclaim',
    'timing:breakout_pending':'t:breakout_pending','timing:breakout_confirmed':'t:breakout_confirmed',
    'timing:at_support':'t:at_support','timing:extended':'t:extended',
  })[key] ?? `${String(row?.axis ?? 'e').slice(0,1)}:${String(row?.reason ?? 'available').slice(0,40)}`;
}

function compactRisk(reason) {
  if (String(reason).startsWith('missing:')) return reason;
  return ({ price_must_reclaim_support_before_entry:'reclaim_first',research_coverage_below_70_percent:'coverage_lt_70',
    formal_valuation_target_unavailable:'valuation_target_missing' })[reason] ?? String(reason).slice(0,48);
}

function finiteAxisScore(score, axis) {
  const value = score?.axes?.[axis];
  return value?.trustworthy === true && Number.isFinite(value.score) ? value.score : null;
}

function derivePublicOpportunityView(decision, marketAnalysis = null) {
  const score = decision?.researchScore;
  const rawTechnicalState = score?.priceContext?.technicalState ?? score?.axes?.timing?.technicalState ?? 'unavailable';
  const bias20Pct = score?.priceContext?.bias20Pct;
  const technicalState = rawTechnicalState === 'breakout_pending' && Number.isFinite(bias20Pct)
    && bias20Pct > -3 && bias20Pct <= 1.5 ? 'at_support' : rawTechnicalState;
  const axisScores = {
    fundamental: finiteAxisScore(score, 'fundamental'),
    dislocation: finiteAxisScore(score, 'priceDislocation'),
    valuation: finiteAxisScore(score, 'valuation'),
    timing: finiteAxisScore(score, 'timing'),
  };
  const compactAxes = Object.fromEntries(Object.entries(axisScores).filter(([, value]) => Number.isFinite(value)));
  let envelope;
  if (decision?.decisionEnvelope === undefined || decision?.decisionEnvelope === null) {
    envelope = unavailableDecisionEnvelope({ reason: 'authoritative_decision_envelope_missing',
      evaluatedAt: decision?.lastEvaluatedAt ?? null, symbol: decision?.symbol ?? null });
  } else {
    invariant(validateDecisionEnvelopeV313(decision.decisionEnvelope)
      ||validateDecisionEnvelopeV314(decision.decisionEnvelope), 'present decision envelope invalid');
    envelope = decision.decisionEnvelope;
  }
  const opportunityAction = ['buy', 'accumulate', 'research_starter'].includes(envelope.userAction) ? 'setup_ready'
    : envelope.userAction === 'wait_reclaim' ? 'wait_reclaim'
      : envelope.userAction === 'wait_breakout' ? 'wait_breakout'
        : envelope.userAction === 'avoid_chase' ? 'avoid_chase'
          : envelope.userAction === 'avoid' ? 'avoid' : 'evidence_watch';
  return Object.freeze({ opportunityAction, actionReason: envelope.reason ?? 'relative_evidence_incomplete',
    technicalState, axisScores: compactAxes, decisionEnvelope: envelope,
    decisionRevisionId: envelope.decisionRevisionId });
}

function bindDecisionRevisionCard(card) {
  const identity = decisionRevisionIdentityBundle(card);
  const v314=card.decisionEnvelope?.version==='decision-envelope-v3.14.0';
  const decisionRevisionId=`decision-v3.${v314?'14':'13'}:${identity.hash}`;
  invariant(card.decisionEnvelope && typeof card.decisionEnvelope === 'object', 'decision envelope required');
  const boundEnvelope=Object.freeze({ ...card.decisionEnvelope, decisionRevisionId });
  invariant(v314?validateDecisionEnvelopeV314(boundEnvelope):validateDecisionEnvelopeV313(boundEnvelope,decisionRevisionId),
    'decision envelope invalid');
  return Object.freeze({ ...card, decisionRevisionId,decisionEnvelope:boundEnvelope });
}

function normalizedMarketAnalysis(marketAnalysis) {
  if (!marketAnalysis) return null;
  const components = marketAnalysis.components ?? {};
  const indexSummary = (label, row) => row ? `${label}${row.state === 'uptrend' ? '多頭' : row.state === 'drawdown' ? '跌深' : '拉回'}${Number.isFinite(row.drawdownPct) ? `、距區間高點 ${row.drawdownPct.toFixed(1)}%` : ''}` : `${label}資料待補`;
  const breadthSummary = components.breadth && Number.isFinite(components.breadth.aboveMa20Pct)
    ? `市場廣度 ${components.breadth.aboveMa20Pct.toFixed(1)}% 站上 MA20` : '市場廣度待補';
  const foreignNet = components.foreignFlow?.net5d ?? components.foreignFlow?.net1d;
  const foreignSummary = Number.isFinite(foreignNet)
    ? `外資${Number.isFinite(components.foreignFlow?.net5d) ? '五日' : '單日'}淨${foreignNet >= 0 ? '買' : '賣'}超 ${Math.abs(foreignNet / 1e8).toFixed(1)} 億元`
    : '外資動向待補';
  const summary = [indexSummary('加權', components.taiex), indexSummary('櫃買', components.otc), breadthSummary, foreignSummary].join('；');
  const riskBudget = marketAnalysis.status === 'risk_on'
    ? '大盤允許積極選股；仍需個股相對估值與技術條件同時通過。'
    : marketAnalysis.status === 'selective_or_defensive'
      ? '只保留高信念選股候選；不追高，跌破支撐先等收復。'
      : '市場證據未完整，不形成進場候選。';
  return Object.freeze({ ...marketAnalysis, summary, riskBudget });
}

function alignLegacyMarketView(legacy, marketAnalysis) {
  if (!marketAnalysis) return legacy;
  const status = marketAnalysis.status === 'risk_on' ? 'risk_on_can_attack'
    : marketAnalysis.status === 'selective_or_defensive' ? 'selective_only' : 'market_data_missing';
  const label = marketAnalysis.status === 'risk_on' ? '趨勢與廣度支持'
    : marketAnalysis.status === 'selective_or_defensive' ? '選股／防守優先' : '大盤證據未完整';
  const existingIndex = legacy.marketIndexSignal && typeof legacy.marketIndexSignal === 'object'
    ? legacy.marketIndexSignal : {};
  const existingHighlight = legacy.marketHighlightSummary && typeof legacy.marketHighlightSummary === 'object'
    ? legacy.marketHighlightSummary : {};
  return {
    ...legacy,
    marketRegime: marketAnalysis.status === 'risk_on' ? 'risk-on' : marketAnalysis.status === 'selective_or_defensive'
      ? 'selective-risk-on' : 'live-unavailable',
    marketBreadthSummary: marketAnalysis.summary,
    marketIndexSignal: { ...existingIndex, status, label, summary: marketAnalysis.summary,
      asOf: marketAnalysis.asOf, trendScore: status === 'risk_on_can_attack' ? 80 : status === 'selective_only' ? 50 : null,
      taiexState: marketAnalysis.components?.taiex?.state ?? null,
      otcState: marketAnalysis.components?.otc?.state ?? null,
      breadthState: Number.isFinite(marketAnalysis.components?.breadth?.aboveMa20Pct)
        ? marketAnalysis.components.breadth.aboveMa20Pct >= 50 ? 'healthy' : 'weak' : null,
      foreignFlowState: Number.isFinite(marketAnalysis.components?.foreignFlow?.net5d ?? marketAnalysis.components?.foreignFlow?.net1d)
        ? (marketAnalysis.components.foreignFlow.net5d ?? marketAnalysis.components.foreignFlow.net1d) >= 0 ? 'net_buy' : 'net_sell' : null,
      riskBudget: marketAnalysis.riskBudget,
      entryBias: status === 'risk_on_can_attack' ? '優先等待個股確認' : '只做高信念確認型候選',
      exitBias: status === 'risk_on_can_attack' ? '個股失效即退出' : '支撐失效優先防守',
      reasons: marketAnalysis.missingComponents?.length ? ['market_evidence_incomplete'] : [marketAnalysis.status] },
    marketHighlightSummary: { ...existingHighlight, regimeLabel: label,
      regimeExplanation: marketAnalysis.summary, riskNote: marketAnalysis.riskBudget },
  };
}

function stripCorrectnessAdditions(payload) {
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'legacy radar payload required');
  const clean = Object.fromEntries(Object.entries(payload).filter(([key]) => ![
    'sourceLedCorrectness', 'sourceSignals', 'discoveryDelta', 'underreactionMarket', 'boundedLegacyPadding',
  ].includes(key)));
  for (const bucket of CARD_BUCKETS) {
    if (!Array.isArray(clean[bucket])) continue;
    clean[bucket] = clean[bucket].map((card) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
      const { researchDecision: _removed, ...legacyCard } = card;
      return legacyCard;
    });
  }
  return clean;
}

function unavailableResearchDecision(lastEvaluatedAt) {
  return Object.freeze({
    version: 'legacy-research-decision-v3.11.0', availability: 'unavailable',
    reason: 'projection_missing', researchMaturity: 'source_signal',
    newPositionAction: 'valuation_review', lastEvaluatedAt,
    analysisGeneratedAt: null, materialChangeHash: null,
    materialChangedBecause: [], noChangeMessage: null,
  });
}

function availableResearchDecision(decision) {
  return Object.freeze({
    version: 'legacy-research-decision-v3.11.0', availability: 'available',
    ...serializeCorrectnessPublicUnion(decision),
  });
}

function mergedSourceSignals(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    if (typeof row?.symbol !== 'string') continue;
    const selected = bySymbol.get(row.symbol) ?? [];
    selected.push(row);
    bySymbol.set(row.symbol, selected);
  }
  return [...bySymbol.values()].map((selected) => {
    const representative = selected[0];
    const evidence = selected.flatMap((row) => Array.isArray(row.sourceEvidence) && row.sourceEvidence.length
      ? row.sourceEvidence : [row]).filter((row, index, all) => {
        const identity = `${row.claimId ?? ''}:${row.revisionId ?? ''}:${row.sourceUrl ?? ''}`;
        return all.findIndex((candidate) => `${candidate.claimId ?? ''}:${candidate.revisionId ?? ''}:${candidate.sourceUrl ?? ''}`
          === identity) === index;
      });
    return { ...representative, sourceEvidence: evidence, evidenceCount: evidence.length };
  });
}

function validHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
      && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

function validInstant(value) {
  if(typeof value!=='string')return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.](\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if(!match)return false;
  const year=Number(match[1]);const month=Number(match[2]);const day=Number(match[3]);
  const hour=Number(match[4]);const minute=Number(match[5]);const second=Number(match[6]);
  const maximumDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(month<1||month>12||day<1||day>maximumDay||hour>23||minute>59||second>59)return false;
  if(match[8]!=='Z'){
    const offsetHour=Number(match[10]);const offsetMinute=Number(match[11]);
    if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return false;
  }
  return Number.isFinite(Date.parse(value));
}

function validCitation(row) {
  return row && typeof row === 'object' && typeof row.ref === 'string' && row.ref.length > 0 && row.ref === row.ref.trim()
    && typeof row.sourceKey === 'string' && row.sourceKey.length > 0 && row.sourceKey === row.sourceKey.trim()
    && typeof row.sourceName === 'string' && row.sourceName.length > 0 && row.sourceName === row.sourceName.trim()
    && validHttpsUrl(row.sourceUrl)
    && [row.publishedAt, row.collectedAt, row.evaluatedAt].every(validInstant)
    && Date.parse(row.publishedAt) <= Date.parse(row.collectedAt)
    && Date.parse(row.collectedAt) <= Date.parse(row.evaluatedAt);
}

function validPrimaryProvenance(provenance, citations) {
  if (!provenance || typeof provenance !== 'object'
      || typeof provenance.sourceKey !== 'string' || provenance.sourceKey.length === 0
      || provenance.sourceKey !== provenance.sourceKey.trim()
      || typeof provenance.sourceName !== 'string' || provenance.sourceName.length === 0
      || provenance.sourceName !== provenance.sourceName.trim()
      || !validHttpsUrl(provenance.sourceUrl)
      || ![provenance.publishedAt, provenance.collectedAt, provenance.evaluatedAt].every(validInstant)
      || Date.parse(provenance.publishedAt) > Date.parse(provenance.collectedAt)
      || Date.parse(provenance.collectedAt) > Date.parse(provenance.evaluatedAt)) return false;
  return citations.some((citation) => ['sourceKey', 'sourceName', 'sourceUrl',
    'publishedAt', 'collectedAt', 'evaluatedAt'].every((key) => citation[key] === provenance[key]));
}

function navigableCitations(decision) {
  const rows = [
    decision,
    ...(Array.isArray(decision.citations) ? decision.citations : []),
    ...(Array.isArray(decision.sourceEvidence) ? decision.sourceEvidence : [decision]),
  ];
  const normalized=rows.map((row) => ({
    ref: row.ref ?? row.claimId ?? null,
    sourceKey: row.sourceKey ?? null,
    sourceName: row.sourceName ?? row.sourceKey ?? null,
    sourceUrl: row.sourceUrl ?? null,
    kolIdentity: row.kolIdentity ?? null,
    publishedAt: row.publishedAt ?? row.sourcePublishedAt ?? row.claimAsOf ?? null,
    collectedAt: row.collectedAt ?? row.sourceCollectedAt ?? null,
    evaluatedAt: row.evaluatedAt ?? decision.analysisGeneratedAt ?? decision.analysisRevision?.analysisGeneratedAt
      ?? decision.sourceCollectedAt ?? decision.claimAsOf ?? null,
  })).filter(validCitation);
  const byRef=new Map();
  for(const citation of normalized){
    const prior=byRef.get(citation.ref);
    if(prior&&canonicalJson(prior)!==canonicalJson(citation))return [];
    byRef.set(citation.ref,citation);
  }
  return [...byRef.values()];
}

function citedDecisionBrief(brief, citations, provenance) {
  if (!brief || !Array.isArray(brief.thesis) || brief.thesis.length !== 3
      || !brief.thesis.every((value) => typeof value === 'string' && value.length > 0
        && value.length <= 240 && value === value.trim())
      || !Array.isArray(brief.risks) || brief.risks.length !== 3
      || !brief.risks.every((value) => typeof value === 'string' && value.length > 0
        && value.length <= 240 && value === value.trim())
      || !Array.isArray(brief.evidence) || !validPrimaryProvenance(provenance, citations)) return null;
  const citationRefs = new Set(citations.map((row) => row.ref));
  const expected = ['thesis:0', 'thesis:1', 'thesis:2', 'risk:0', 'risk:1', 'risk:2'];
  const points = brief.evidence.map((row) => row?.point);
  if (brief.evidence.length !== expected.length || new Set(points).size !== expected.length
      || !expected.every((point) => points.includes(point))
      || brief.evidence.some((row) => !Array.isArray(row?.refs) || row.refs.length === 0
        || new Set(row.refs).size !== row.refs.length
        || row.refs.some((ref) => typeof ref !== 'string' || ref.length === 0
          || ref !== ref.trim() || !citationRefs.has(ref)))) return null;
  return brief;
}

function landingLane(card) {
  const readiness = card?.researchReadiness?.status;
  if (readiness === 'actionable') return 'actionable';
  if (readiness === 'near_action' || readiness === 'wait_condition') return 'waiting';
  if (readiness === 'data_needed') return 'research';
  const envelopeAction=card?.decisionEnvelope?.userAction;
  // The formal envelope alone controls executable action.  ResearchNextStep is
  // deliberately a separate, non-executable routing hint for an incomplete or
  // globally read-only decision.  It keeps a support/reclaim/breakout setup
  // visible without relabelling it as a buy.
  const nextAction=card?.researchNextStep?.kind;
  const action=card?.projectionReadOnly===true
    ?(nextAction==='ready'?'wait_refresh':nextAction??'unavailable')
    :(envelopeAction==='unavailable'?(nextAction==='ready'?'wait_refresh':nextAction??envelopeAction):envelopeAction);
  if(['buy','accumulate','research_starter'].includes(action))return 'actionable';
  if(card?.proximityToAction===true||['wait_value','wait_market','wait_breakout','wait_reclaim','wait_refresh','avoid_chase','avoid'].includes(action)){
    return 'waiting';
  }
  return 'research';
}

function selectLandingSourceSignals(cards) {
  const selected=[];
  const counts={actionable:0,waiting:0,research:0};
  for(const card of cards){
    const lane=landingLane(card);
    if(counts[lane]>=LANDING_LANE_LIMITS[lane])continue;
    counts[lane]+=1;
    selected.push(card);
  }
  return selected;
}

function removeLowestPrioritySignal(cards) {
  for(const lane of ['research','waiting','actionable']){
    for(let index=cards.length-1;index>=0;index-=1){
      if(landingLane(cards[index])===lane)return [...cards.slice(0,index),...cards.slice(index+1)];
    }
  }
  return cards;
}

function addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates = [], marketAnalysis = null,
  { researchSnapshotEnabled = false, researchDossierEnabled = false, researchReadinessEnabled = false } = {}) {
  const clean = stripCorrectnessAdditions(legacyPayload);
  invariant(Array.isArray(clean.opportunities), 'legacy opportunities required');
  const bySymbol = new Map(decisions.filter((decision) => typeof decision?.symbol === 'string')
    .map((decision) => [decision.symbol, decision]));
  for (const bucket of CARD_BUCKETS) {
    if (!Array.isArray(clean[bucket])) continue;
    clean[bucket] = clean[bucket].map((card) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
      const decision = bySymbol.get(card.symbol);
      return { ...card, researchDecision: decision ? availableResearchDecision(decision) : unavailableResearchDecision(asOf) };
    });
  }
  const signalReasons = new Set(['new_in_seed_symbol', 'new_out_of_seed_symbol', 'new_source_evidence', 'material_source_change', 'price_dislocation']);
  const signalPool = mergedSourceSignals([...decisions, ...sourceCandidates]);
  const sourceSignals = signalPool.sort((left, right) => (right.researchRanking?.rankingScore
      ??right.researchScore?.underreactionScore??-1)-(left.researchRanking?.rankingScore
        ??left.researchScore?.underreactionScore??-1) || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0)
      || String(left.symbol ?? '').localeCompare(String(right.symbol ?? '')))
    .filter((decision) => typeof decision?.symbol === 'string')
    .slice(0, 30).map((decision) => {
      const citations = navigableCitations(decision);
      const sourceProvenance = citations[0] ?? { sourceKey: decision.sourceKey ?? null,
        sourceName: decision.sourceName ?? decision.sourceKey ?? null, sourceUrl: decision.sourceUrl ?? null,
        kolIdentity: decision.kolIdentity ?? null, publishedAt: decision.claimAsOf ?? decision.sourcePublishedAt ?? null,
        collectedAt: decision.sourceCollectedAt ?? null, evaluatedAt: decision.analysisGeneratedAt
          ?? decision.analysisRevision?.analysisGeneratedAt ?? decision.sourceCollectedAt ?? decision.claimAsOf ?? null };
      const availableBrief=citedDecisionBrief(decision.decisionBrief,citations,sourceProvenance);
      const authorityDecision=decision.decisionEnvelope===undefined
        ?{...decision,decisionEnvelope:unavailableDecisionEnvelope({evaluatedAt:decision.lastEvaluatedAt??asOf,
          symbol:decision.symbol})}:decision;
      // V3.17 gives a missing cited brief a research-only detail view. Earlier
      // compatibility schemas retain their original unavailable envelope.
      const effectiveDecision=!researchSnapshotEnabled&&!availableBrief
        &&authorityDecision.decisionEnvelope?.userAction!=='unavailable'
        ?{...authorityDecision,decisionEnvelope:overrideDecisionEnvelopeAction(authorityDecision.decisionEnvelope,'unavailable',
          DECISION_BRIEF_UNAVAILABLE_REASON)}:authorityDecision;
      const unboundView=derivePublicOpportunityView(effectiveDecision,marketAnalysis);
      const publicView={...unboundView,
        opportunityAction:['buy','accumulate','research_starter'].includes(unboundView.decisionEnvelope.userAction)?'setup_ready'
          :unboundView.opportunityAction};
      const decisionBrief=availableBrief??Object.freeze({availability:'unavailable',
        reason:DECISION_BRIEF_UNAVAILABLE_REASON});
      // The compact projection is a landing-page index, not the immutable detail
      // record. Keep one canonical citation copy here. Complete evidence remains
      // in the decision revision payload addressed by decisionRevisionId.
      const publicCitations=citations;
      const researchNextStep=researchSnapshotEnabled?deriveResearchNextStep({
        decisionEnvelope: publicView.decisionEnvelope,
        technicalState: decision.technical?.technicalState ?? decision.researchScore?.priceContext?.technicalState ?? null,
        trigger: decision.technical?.trigger ?? null,
        invalidation: decision.technical?.invalidation ?? null,
        nextUnlock: publicView.decisionEnvelope.nextUnlock ?? null,
        missingAxes: decision.researchRanking?.missingAxes ?? [],
        blockers: decision.researchRanking?.softBlockers ?? [],
      }):null;
      const researchSnapshot=researchSnapshotEnabled?buildResearchSnapshotV317({candidate:{...decision,sourceProvenance},
        decision:{...decision,decisionBrief},researchScore:decision.researchScore,
        // An evaluation heartbeat is not new research. Bind the snapshot to
        // the immutable analysis input so an unchanged rerun keeps the same
        // decision revision and detail URL.
        sourceCutoff:decision.analysisGeneratedAt??decision.analysisRevision?.analysisGeneratedAt
          ??decision.sourceCutoff??asOf,researchNextStep}):null;
      const researchReadiness=researchReadinessEnabled?deriveResearchReadinessV319({decisionEnvelope:publicView.decisionEnvelope,
        researchRanking:decision.researchRanking,technicalState:decision.technical?.technicalState
          ??decision.researchScore?.priceContext?.technicalState??null,researchNextStep}):null;
      const card = {
      symbol: decision.symbol, chineseName: typeof decision.name === 'string'
        ? [...decision.name.normalize('NFC')].slice(0,20).join('') : null, researchMaturity: 'source_signal',
      newPositionAction: compatibilityAction(publicView.decisionEnvelope),
      decisionEnvelope:publicView.decisionEnvelope,decisionRevisionId:publicView.decisionRevisionId,
      discoveredAt: decision.claimAsOf ?? decision.sourceEffectiveAt ?? null,
      sourceClass: decision.sourceClass ?? 'community', sourceSummary: [...String(decision.sourceSummary ?? decision.raw ?? '來源訊號待研究').normalize('NFC').replace(/[\r\n]+/gu, ' ')].slice(0, 40).join(''),
      evidenceRefs: publicCitations.map((row) => row.ref),
      valuationStatus: publicView.decisionEnvelope.valuationReadiness, technicalState: decision.technical?.technicalState
        ?? decision.researchScore?.priceContext?.technicalState ?? 'unavailable',
      changedBecause: signalReasons.has(decision.reason) ? decision.reason : 'new_source_evidence',
      sourceProvenance, citations:publicCitations,
      decisionBrief,
      ...(researchNextStep?{researchNextStep}:{}),
      ...(researchSnapshot?{researchSnapshot}:{}),
      researchRanking:decision.researchRanking??null,
      ...(researchReadiness?{researchReadiness,proximityToAction:researchReadiness.status==='near_action'}:{}),
      ...(researchSnapshot?.gateWaterfall?{gateWaterfall:researchSnapshot.gateWaterfall}:{}),
      nextUnlock:publicView.decisionEnvelope.nextUnlock??null,
      ...publicView,
      ...(Number.isFinite(decision.researchScore?.underreactionScore) ? {
        underreactionScore: decision.researchScore.underreactionScore,
        scoreCoverage: decision.researchScore.coverage,
        scoreConfidence: decision.researchScore.confidence,
        researchDisposition: decision.researchScore.researchDisposition,
        positiveReasons: (decision.researchScore.reasons ?? []).slice(0, 2).map(compactPositiveReason),
        riskReasons: (decision.researchScore.risks ?? []).slice(0, 2).map(compactRisk),
        currentPrice: decision.researchScore.priceContext?.currentPrice ?? decision.currentPrice ?? null,
        drawdown60Pct: decision.researchScore.priceContext?.drawdown60Pct ?? null,
        drawdown120Pct: decision.researchScore.priceContext?.drawdown120Pct ?? null,
        bias20Pct: decision.researchScore.priceContext?.bias20Pct ?? null,
        bias60Pct: decision.researchScore.priceContext?.bias60Pct ?? null,
        bias120Pct: decision.researchScore.priceContext?.bias120Pct ?? null,
        rsi14: decision.researchScore.priceContext?.rsi14 ?? null,
        volumeRatio20: decision.researchScore.priceContext?.volumeRatio20 ?? null,
        relativeStrength20Pct: decision.researchScore.priceContext?.relativeStrength20Pct ?? null,
        revenueYoy: decision.researchScore.axes?.fundamental?.yoyGrowth ?? null,
        currentPe: decision.researchScore.axes?.valuation?.currentPe ?? null,
        sectorPe: decision.researchScore.axes?.valuation?.sectorPe ?? null,
        historyPeMedian: decision.researchScore.axes?.valuation?.historyPeMedian ?? null,
        provisionalRelativeValue:decision.researchScore.axes?.valuation?.provisionalRelativeValue??null,
        valuationAsOf: decision.researchScore.axes?.valuation?.asOf ?? null,
        valuationAuthority: decision.researchScore.axes?.valuation?.sourceRef ? 'exchange_reported' : null,
        valuationExchange: String(decision.researchScore.axes?.valuation?.sourceRef ?? '').startsWith('twse-')
          ? 'TWSE' : String(decision.researchScore.axes?.valuation?.sourceRef ?? '').startsWith('tpex-') ? 'TPEx' : null,
        historyPeSessions: (decision.researchScore.axes?.valuation?.historyAsOf ?? []).slice(0,4),
        ...(Number.isFinite(decision.researchScore.axes?.valuation?.historyRelativePe) ? {
          ownPeDiscountPct: Math.round((decision.researchScore.axes.valuation.historyRelativePe - 1) * 1000) / 10,
        } : {}),
        ...(Number.isFinite(decision.researchScore.axes?.valuation?.relativePe) ? {
          sectorPeDiscountPct: Math.round((decision.researchScore.axes.valuation.relativePe - 1) * 1000) / 10,
        } : {}),
      } : {}),
    };
      if (!researchDossierEnabled) return bindDecisionRevisionCard(card);
      // The dossier is first included without its derived IDs so its factual
      // content participates in the decision revision hash.  Rebuild it after
      // binding to attach the exact same revision ID shown by the detail URL.
      const draftDossier = buildResearchDossierV318({ candidate: decision,
        decision: { ...decision, decisionEnvelope: publicView.decisionEnvelope, decisionBrief },
        sourceCutoff: decision.analysisGeneratedAt ?? decision.analysisRevision?.analysisGeneratedAt
          ?? decision.sourceCutoff ?? asOf, researchReadiness });
      const bound = bindDecisionRevisionCard({ ...card, researchDossier: draftDossier });
      return Object.freeze({ ...bound, researchDossier: buildResearchDossierV318({ candidate: decision,
        decision: { ...decision, decisionEnvelope: bound.decisionEnvelope, decisionBrief },
        sourceCutoff: decision.analysisGeneratedAt ?? decision.analysisRevision?.analysisGeneratedAt
          ?? decision.sourceCutoff ?? asOf, researchReadiness }) });
    });
  return { legacy: alignLegacyMarketView(clean, marketAnalysis), sourceSignals };
}

function compactLandingSignal(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
  const compact = { ...card };
  // Full facts, citations and decision are available only through the
  // immutable revision.  Never make the Radar request path carry a second
  // mutable-looking copy of the dossier.
  delete compact.researchDossier;
  return compact;
}

// Each Radar window has its own byte budget.  A card that survives in daily,
// hot or weekly but is compacted out of home must still resolve its immutable
// detail URL, so persist the union rather than treating home as a hidden
// authority.  Equal revision IDs are required to have identical immutable
// material; disagreement is a producer defect, not a tie to pick arbitrarily.
function collectDecisionRevisionCards(projections) {
  const byIdentity = new Map();
  for (const projection of Array.isArray(projections) ? projections : []) {
    for (const card of Array.isArray(projection?.decisionRevisionCards) ? projection.decisionRevisionCards : []) {
      invariant(card && typeof card === 'object' && !Array.isArray(card)
        && /^\d{4}$/u.test(String(card.symbol ?? ''))
        && typeof card.decisionRevisionId === 'string', 'decision revision card identity required');
      const key = `${card.symbol}:${card.decisionRevisionId}`;
      const prior = byIdentity.get(key);
      if (prior) {
        invariant(canonicalJson(immutableDecisionRevisionCard(prior))
          === canonicalJson(immutableDecisionRevisionCard(card)), 'decision revision window conflict');
      } else byIdentity.set(key, card);
    }
  }
  return Object.freeze([...byIdentity.values()].sort((left, right) => String(left.symbol).localeCompare(String(right.symbol))
    || String(left.decisionRevisionId).localeCompare(String(right.decisionRevisionId))));
}

function publishCompactRadarProjection({ decisions, sourceCandidates = [], discoveryDelta, marketAnalysis = null,
  sourceAcquisitionHealth = null,
  freshnessSchedule = [],window, asOf, evaluatedAt = asOf, publishedAt = asOf, contentAsOf = asOf,
  materialChanged = null, priorProjection = null, producerIdentity, legacyPayload,
  schemaVersion = 'legacy-radar-v3.14.0' }) {
  invariant(['daily', 'hot', 'weekly', 'home'].includes(window), 'radar window');
  invariant(decisions.length <= 60, 'radar card bound');
  invariant(legacyPayload && typeof legacyPayload === 'object' && !Array.isArray(legacyPayload), 'legacy radar payload required');
  invariant(decisions.length + sourceCandidates.length <= 60, 'radar discovery bound');
  const publicMarketAnalysis = normalizedMarketAnalysis(marketAnalysis);
  // The captured legacy payload is research input, never current release
  // authority. Only the tracked run's frozen lineage may enable actions.
  const publicAcquisitionHealth=sourceAcquisitionHealth??null;
  const researchSnapshotEnabled=['legacy-radar-v3.17.0','legacy-radar-v3.18.0','legacy-radar-v3.19.0','legacy-radar-v3.20.0'].includes(schemaVersion);
  const researchDossierEnabled=['legacy-radar-v3.18.0','legacy-radar-v3.19.0','legacy-radar-v3.20.0'].includes(schemaVersion);
  const researchReadinessEnabled=['legacy-radar-v3.19.0','legacy-radar-v3.20.0'].includes(schemaVersion);
  const layered = addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates, publicMarketAnalysis,
    {researchSnapshotEnabled,researchDossierEnabled,researchReadinessEnabled});
  const publishableSourceSignals=selectLandingSourceSignals(layered.sourceSignals.filter((card)=>{
    const validBrief=card.decisionBrief&&card.citations?.length>0
      &&((researchSnapshotEnabled&&card.decisionBrief.availability==='unavailable'
          &&card.decisionBrief.reason===DECISION_BRIEF_UNAVAILABLE_REASON
          &&card.researchSnapshot?.version==='research-snapshot-v3.17.0')
        ||(!researchSnapshotEnabled&&card.decisionBrief.availability==='unavailable'
          &&card.decisionBrief.reason===DECISION_BRIEF_UNAVAILABLE_REASON
          &&card.decisionEnvelope?.userAction==='unavailable')
        ||citedDecisionBrief(card.decisionBrief,card.citations,card.sourceProvenance));
    const validProvenance=validPrimaryProvenance(card.sourceProvenance,card.citations??[]);
    return Boolean(validBrief&&validProvenance);
  }));
  invariant(new Set(publishableSourceSignals.map((card)=>card.symbol)).size===publishableSourceSignals.length,
    'one current decision card per symbol required');
  const priorCorrectness = priorProjection?.sourceLedCorrectness;
  const buildPayload=(selectedSignals)=>{
    const publishableSymbols=new Set(selectedSignals.map((card)=>card.symbol));
    const publicDiscoveryDelta={...discoveryDelta,
      added:(discoveryDelta?.added??[]).filter((symbol)=>publishableSymbols.has(symbol)),
      continued:(discoveryDelta?.continued??[]).filter((symbol)=>publishableSymbols.has(symbol)),
      unchangedReasons:(discoveryDelta?.unchangedReasons??[]).filter((row)=>publishableSymbols.has(row?.symbol))};
    const compactSignals=selectedSignals.map(compactLandingSignal);
    const materialContentHash = sha256(canonicalJson(omitProjectionHeartbeat({ legacy:layered.legacy,
      sourceSignals:compactSignals,discoveryDelta:publicDiscoveryDelta,underreactionMarket:publicMarketAnalysis })));
    const resolvedMaterialChanged = materialChanged ?? priorCorrectness?.contentHash !== materialContentHash;
    const resolvedContentAsOf = resolvedMaterialChanged ? contentAsOf
      : priorCorrectness?.contentAsOf ?? priorCorrectness?.asOf ?? contentAsOf;
    const freshness = assessProjectionFreshness({ contentAsOf:resolvedContentAsOf,evaluatedAt,publishedAt,
      now:new Date(publishedAt),tradingSessions:freshnessSchedule });
    return {
      ...layered.legacy,sourceSignals:compactSignals,discoveryDelta:publicDiscoveryDelta,
      underreactionMarket:publicMarketAnalysis,
      sourceAcquisitionHealth:publicAcquisitionHealth,
      sourceWatermark:{sourceCutoff:contentAsOf,
        acquisitionAuthority:publicAcquisitionHealth?.acquisitionAuthority??'unavailable',
        evidenceRoot:publicAcquisitionHealth?.acquisitionEvidenceRoot??null,
        fetchedAt:publicAcquisitionHealth?.fetchedAt??null,
        terminalStatus:publicAcquisitionHealth?.terminalStatus??null},
      authorizationStatus:schemaVersion==='legacy-radar-v3.20.0'
        ?{telegram:'public_channel_cursor_required',investanchors:'structured_claim_authorization_required',
          sourceClaims:'authorized_terminal_outcomes_required'}
        :{telegram:'structured_claim_authorization_required',investanchors:'structured_claim_authorization_required',
          sourceClaims:'authorized_terminal_outcomes_required'},
      releaseIdentity:{schema:schemaVersion,producerCommitSha:producerIdentity?.commitSha??null,
        runtimeManifestSha256:producerIdentity?.runtimeManifestSha256??null,
        migrationLevel:schemaVersion==='legacy-radar-v3.20.0'
          ?'kol-first-runtime-recovery-v3.20':schemaVersion==='legacy-radar-v3.19.0'
            ?'release-reconciliation-v3.19':schemaVersion==='legacy-radar-v3.18.0'
            ?'candidate-ledger-retention-v3.18':'provider-acquisition-v3.16.21'},
      sourceLedCorrectness:{schema:schemaVersion,window,asOf,contentAsOf:resolvedContentAsOf,evaluatedAt,publishedAt,
        nextExpectedAt:freshness.nextExpectedAt,freshnessSchedule:freshnessSchedule.slice(0,80),
        contentHash:materialContentHash,producerIdentity,
        acquisitionAuthority:publicAcquisitionHealth?{
          status:publicAcquisitionHealth.acquisitionAuthority??'unavailable',
          evidenceRoot:publicAcquisitionHealth.acquisitionEvidenceRoot??null,
          fetchedAt:publicAcquisitionHealth.fetchedAt??null,
          terminalStatus:publicAcquisitionHealth.terminalStatus??null,
        }:null},
    };
  };
  let selectedSignals=publishableSourceSignals;
  let payload=buildPayload(selectedSignals);
  while(Buffer.byteLength(canonicalJson(payload))>RADAR_PAYLOAD_MAXIMUM_BYTES&&selectedSignals.length>0){
    const reduced=removeLowestPrioritySignal(selectedSignals);
    invariant(reduced.length<selectedSignals.length,'radar source signal compaction stalled');
    selectedSignals=reduced;
    payload=buildPayload(selectedSignals);
  }
  bounded(payload, RADAR_PAYLOAD_MAXIMUM_BYTES, 'radar payload');
  const canonical = canonicalJson(payload);
  const payloadChecksum = sha256(canonical);
  const storageWindow = window === 'hot' ? 'three_day' : window;
  return Object.freeze({
    projectionKey: `legacy-radar-v3.11:${storageWindow}:${asOf}:${payloadChecksum}`,
    storageWindow,
    payload,
    payloadChecksum,
    etag: `\"sha256:${payloadChecksum}\"`,
    producerIdentity,
    decisionRevisionCards: Object.freeze(selectedSignals),
    bundle: immutableBundle('legacy_radar_projection_v3_11', payload),
  });
}

module.exports = { CARD_BUCKETS, DECISION_BRIEF_UNAVAILABLE_REASON, addResearchDecisions, decisionRevisionIdentityBundle,
  citedDecisionBrief, derivePublicOpportunityView, immutableDecisionRevisionCard, navigableCitations,
  landingLane, publishCompactRadarProjection, selectLandingSourceSignals, stripCorrectnessAdditions,
  compactLandingSignal, collectDecisionRevisionCards,
  validCitation, validHttpsUrl, validInstant,
  validPrimaryProvenance };
