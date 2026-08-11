'use strict';

const { deriveTechnicalEntryState } = require('./technical-state');
const { validateLongEntryGeometry } = require('./technical-entry-geometry');
const { applyBiasActionCap } = require('./bias-action-cap');
const { compatibilityAction, deriveDecisionEnvelope, overrideDecisionEnvelopeAction } = require('./decision-envelope');
const { deriveDecisionEnvelopeV314 } = require('./decision-envelope-v314');

function deriveActionDecision(input) {
  const technical = deriveTechnicalEntryState(input);
  const geometry = technical.availability === 'available'
    ? validateLongEntryGeometry({ ...technical, currentPrice: technical.plane.current }) : null;
  const baseEnvelope = input.contractVersion === 'v3.14'
    ? deriveDecisionEnvelopeV314({ ...input, technical, geometry })
    : deriveDecisionEnvelope({ ...input, technical, geometry });
  const baseAction = compatibilityAction(baseEnvelope);
  const capped = applyBiasActionCap({ action: baseAction, bias: input.bias, bias20Atr: technical.plane?.bias?.bias20Atr,
    atrDistance: input.atrDistance, technicalState: technical.technicalState });
  const envelope = capped.action === baseAction ? baseEnvelope
    : overrideDecisionEnvelopeAction(baseEnvelope, capped.action === 'avoid' ? 'avoid' : 'unavailable', capped.reason);
  const action = compatibilityAction(envelope);
  const buyLike = action === 'starter_now' || action === 'event_starter';
  return Object.freeze({ action, technical, geometry, decisionEnvelope: envelope,
    publicStop: buyLike && geometry?.availability === 'available' ? geometry.invalidation : null,
    reason: capped.reason || envelope.reason || geometry?.reason || null, biasAdjustment: capped.biasAdjustment });
}

module.exports = { deriveActionDecision };
