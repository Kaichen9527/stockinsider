'use strict';

const { deriveTechnicalEntryState } = require('./technical-state');
const { validateLongEntryGeometry } = require('./technical-entry-geometry');
const { applyBiasActionCap } = require('./bias-action-cap');

function deriveActionDecision(input) {
  const technical = deriveTechnicalEntryState(input);
  if (input.valuationStatus !== 'normal') return Object.freeze({ action: 'valuation_review', technical, geometry: null, publicStop: null, reason: 'valuation_review' });
  if (technical.availability === 'unavailable' || technical.technicalState === null) return Object.freeze({ action: 'avoid', technical, geometry: null, publicStop: null, reason: 'entry_data_unavailable' });
  if (technical.technicalState === 'invalidated') return Object.freeze({ action: 'avoid', technical, geometry: null, publicStop: null, reason: 'entry_invalidated' });
  const geometry = validateLongEntryGeometry({ ...technical, currentPrice: technical.plane.current });
  let action = geometry.availability === 'available' && input.qualityActionEligible === true ? 'starter_now' : 'wait_trigger';
  const capped = applyBiasActionCap({ action, bias: input.bias, bias20Atr: technical.plane.bias?.bias20Atr, atrDistance: input.atrDistance, technicalState: technical.technicalState });
  action = capped.action;
  return Object.freeze({ action, technical, geometry, publicStop: action === 'starter_now' ? geometry.invalidation : null, reason: capped.reason || (geometry.reason ?? null), biasAdjustment: capped.biasAdjustment });
}

module.exports = { deriveActionDecision };
