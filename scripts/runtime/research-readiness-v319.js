'use strict';

// Research visibility is not trade authority.  This closed classifier gives
// every source-led candidate exactly one stable lane so a shared infrastructure
// fault cannot make the entire opportunity set disappear from the UI.
const RESEARCH_READINESS_V319 = Object.freeze([
  'actionable', 'near_action', 'wait_condition', 'data_needed',
]);

function finite(value) { return Number.isFinite(value) ? value : null; }
function unique(values, maximum = 12) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.length > 0 && value.length <= 160))].slice(0, maximum));
}

function deriveResearchReadinessV319({ decisionEnvelope = null, researchRanking = null, technicalState = null,
  researchNextStep = null } = {}) {
  const action = typeof decisionEnvelope?.userAction === 'string' ? decisionEnvelope.userAction : 'unavailable';
  const rankingScore = finite(researchRanking?.rankingScore);
  const coverage = finite(researchRanking?.coverage);
  const missingAxes = unique(researchRanking?.missingAxes, 8);
  const blockers = unique([...(decisionEnvelope?.blockers ?? []), ...(researchRanking?.softBlockers ?? []),
    ...(researchNextStep?.blockers ?? []), ...missingAxes]);
  const valuation = decisionEnvelope?.valuationReadiness;
  const technical = typeof technicalState === 'string' ? technicalState : null;
  const actionable = ['buy', 'accumulate', 'research_starter'].includes(action);
  const completeCore = missingAxes.length === 0 && !['missing', 'stale', 'conflict'].includes(valuation)
    && rankingScore !== null && coverage !== null;
  const technicalEligible = technical !== null && !['below_support', 'invalidated'].includes(technical);
  const typedWait = ['wait_value', 'wait_market', 'wait_breakout', 'wait_reclaim', 'avoid_chase'].includes(action)
    || ['at_support', 'breakout_pending', 'reclaim_required', 'extended'].includes(technical);
  const nearAction = !actionable && !typedWait && completeCore && technicalEligible && rankingScore >= 70 && coverage >= 0.75
    && blockers.length <= 1;
  const waitCondition = !actionable && !nearAction && completeCore && technical !== null
    && typedWait;
  const status = actionable ? 'actionable' : nearAction ? 'near_action' : waitCondition ? 'wait_condition' : 'data_needed';
  const reason = status === 'actionable' ? 'decision_envelope_actionable'
    : status === 'near_action' ? 'one_soft_gate_remaining'
      : status === 'wait_condition' ? (researchNextStep?.reason ?? 'typed_market_or_technical_condition')
        : missingAxes.length > 0 ? 'research_axes_incomplete'
          : ['missing', 'stale', 'conflict'].includes(valuation) ? 'valuation_authority_incomplete'
            : 'research_authority_incomplete';
  return Object.freeze({ version: 'research-readiness-v3.19.0', status, reason, blockers,
    rankingScore, coverage });
}

module.exports = { RESEARCH_READINESS_V319, deriveResearchReadinessV319 };
