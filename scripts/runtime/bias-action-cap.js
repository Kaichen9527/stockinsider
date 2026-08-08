'use strict';

const OWN = Object.freeze({ extreme_low: 1, low: 0.5, normal: 0, high: -0.5, extended: -1 });

function roundHalfAway(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.sign(value) * Math.round(Math.abs(value) * scale + Number.EPSILON) / scale;
}

function shadowBiasContribution({ ownLabel = null, sectorPercentile = null, maxPoints = 0 }) {
  const own = OWN[ownLabel] ?? 0;
  const sector = Number.isFinite(sectorPercentile) && sectorPercentile <= 0.1 ? 0.25
    : Number.isFinite(sectorPercentile) && sectorPercentile >= 0.9 ? -0.25 : 0;
  const normalized = Math.max(-1, Math.min(1, own + sector));
  return Object.freeze({ shadowBiasNormalized: normalized, shadowBiasPoints: roundHalfAway(maxPoints * normalized), promotedScoreInfluence: 0 });
}

function applyBiasActionCap({ action, bias = null, bias20Atr = null, atrDistance = null, technicalState }) {
  if (['reclaim_required', 'below_support'].includes(technicalState)) return Object.freeze({ action: 'wait_trigger', reason: technicalState, biasAdjustment: 0 });
  if (technicalState === 'invalidated') return Object.freeze({ action: 'avoid', reason: technicalState, biasAdjustment: 0 });
  const distance = Number.isFinite(bias20Atr) ? bias20Atr : atrDistance;
  if (Number.isFinite(distance) && distance <= -3) return Object.freeze({ action: 'avoid', reason: 'bias_observe_only', biasAdjustment: 0 });
  const adjustment = Number.isFinite(bias) ? Math.max(-1, Math.min(1, roundHalfAway(bias))) : 0;
  return Object.freeze({ action, reason: null, biasAdjustment: adjustment });
}

module.exports = { applyBiasActionCap, shadowBiasContribution };
