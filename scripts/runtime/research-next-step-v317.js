'use strict';

// Research visibility and action authority are deliberately separate.  This
// module turns already-computed, point-in-time research into a bounded next
// research step; it never authorizes an order or changes DecisionEnvelope.
const STEP_KINDS = Object.freeze([
  'ready', 'wait_reclaim', 'wait_breakout', 'wait_value', 'wait_market',
  'wait_refresh', 'avoid_chase', 'avoid', 'data_needed',
]);

function finite(value) { return Number.isFinite(value) ? value : null; }
function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.length > 0))].slice(0, 8);
}

function actionToStep(action) {
  if (action === 'buy' || action === 'accumulate' || action === 'research_starter') return 'ready';
  if (['wait_reclaim', 'wait_breakout', 'wait_value', 'wait_market', 'avoid_chase', 'avoid'].includes(action)) return action;
  return null;
}

function deriveResearchNextStep({ decisionEnvelope = null, technicalState = null, trigger = null,
  invalidation = null, nextUnlock = null, missingAxes = [], projectionReadOnly = false,
  actionAuthorityEnabled = true, blockers = [] } = {}) {
  const action = decisionEnvelope && typeof decisionEnvelope === 'object' ? decisionEnvelope.userAction : null;
  const envelopeBlockers = decisionEnvelope && typeof decisionEnvelope === 'object' && Array.isArray(decisionEnvelope.blockers)
    ? decisionEnvelope.blockers : [];
  const resolvedBlockers = uniqueStrings([...blockers, ...envelopeBlockers, ...missingAxes]);
  const technical = typeof technicalState === 'string' ? technicalState : null;
  const threshold = finite(trigger?.threshold);
  const stop = finite(invalidation?.stop ?? invalidation);
  const unlock = finite(nextUnlock?.price);
  let kind = actionToStep(action);

  // A typed technical state remains useful even when valuation/action authority
  // is incomplete.  It explains what to wait for without manufacturing a buy.
  if (!kind && ['below_support', 'reclaim_required'].includes(technical)) kind = 'wait_reclaim';
  if (!kind && technical === 'breakout_pending') kind = 'wait_breakout';
  // A support test is useful research even before the formal bridge is ready.
  // Keep it in the waiting lane with an explicit refresh requirement instead
  // of burying it in an undifferentiated "data needed" bucket.
  if (!kind && technical === 'at_support') kind = 'wait_refresh';
  if (!kind && technical === 'extended') kind = 'avoid_chase';
  if (!kind && technical === 'invalidated') kind = 'avoid';
  if (!kind) kind = resolvedBlockers.length > 0 ? 'data_needed' : 'data_needed';

  const actionDisabled = projectionReadOnly || actionAuthorityEnabled !== true;
  if (actionDisabled && kind === 'ready') kind = 'wait_refresh';
  if (actionDisabled && !['avoid', 'avoid_chase', 'data_needed', 'wait_reclaim', 'wait_breakout', 'wait_value', 'wait_market'].includes(kind)) {
    kind = 'wait_refresh';
  }
  const derivedBlockers = actionDisabled
    ? uniqueStrings([...resolvedBlockers, 'action_authority_disabled']) : resolvedBlockers;
  const reason = kind === 'wait_reclaim' ? 'support_must_be_reclaimed'
    : kind === 'wait_breakout' ? 'breakout_not_confirmed'
      : kind === 'wait_value' ? 'entry_price_above_required_value_gate'
        : kind === 'wait_market' ? 'market_regime_gate'
          : kind === 'wait_refresh' ? (actionDisabled ? 'action_authority_disabled' : 'formal_data_refresh_required')
            : kind === 'avoid_chase' ? 'price_extended_wait_for_reset'
              : kind === 'avoid' ? 'affirmative_risk_or_valuation_blocker'
                : 'data_required_for_formal_decision';
  return Object.freeze({
    version: 'research-next-step-v3.17.0',
    kind,
    actionAuthority: actionDisabled ? 'disabled' : 'enabled',
    reason,
    trigger: threshold === null ? null : Object.freeze({ kind: kind === 'wait_reclaim' ? 'reclaim' : 'breakout', threshold }),
    invalidation: stop,
    unlockPrice: unlock,
    blockers: Object.freeze(derivedBlockers),
  });
}

module.exports = { STEP_KINDS, deriveResearchNextStep };
