'use strict';

const { unavailable } = require('./codec');
const { calculateAdjustedTechnicalPlane } = require('./technical-plane');

function taiwanTick(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1;
  return 5;
}

function roundToTick(price, tick, direction) {
  const quotient = price / tick;
  const integral = Math.abs(quotient - Math.round(quotient)) <= 1e-9 ? Math.round(quotient)
    : direction === 'up' ? Math.ceil(quotient) : Math.floor(quotient);
  return Number((integral * tick).toFixed(8));
}

function roundDownToTick(price) { return roundToTick(price, taiwanTick(price), 'down'); }
function roundUpToTick(price) { return roundToTick(price, taiwanTick(price), 'up'); }

function stateResult(technicalState, plane, trigger = null, entryZone = null, invalidation = null, entryZoneKind = null) {
  return Object.freeze({ availability: 'available', technicalState, plane, trigger, resistance: plane.resistance,
    entryZone, invalidation, entryZoneKind, thesisLevel: Number.isFinite(invalidation) ? plane.support : null, reason: null });
}

function invalidPlane(plane) { return unavailable('technical_unavailable', { technicalState: null, plane }); }

function deriveTechnicalEntryState(input) {
  const plane = input?.plane?.availability === 'available' ? input.plane : calculateAdjustedTechnicalPlane(input || {});
  if (plane.availability !== 'available') return invalidPlane(plane);
  const support = Number.isFinite(input?.support) ? input.support : plane.support;
  const resistance = Number.isFinite(input?.resistance) ? input.resistance : plane.resistance;
  const values = [plane.current, plane.previousClose, support, resistance, plane.atr14, plane.ma20, plane.rsi14,
    plane.volumeRatio20 ?? plane.volumeRatio, plane.macdHistogram, plane.relativeStrengthTaiex20 ?? plane.relativeStrength];
  if (!values.every(Number.isFinite) || support <= 0 || resistance <= support || plane.atr14 <= 0) return invalidPlane(plane);
  const current = plane.current; const atr = plane.atr14; const volumeRatio = plane.volumeRatio20 ?? plane.volumeRatio;
  const tick = taiwanTick(resistance);

  let state;
  if (current < support - atr) state = 'invalidated';
  else if (plane.previousClose >= support && current < support) state = 'below_support';
  else if (plane.brokeSupportPrior20 === true && (current < support + 0.25 * atr || volumeRatio < 1.2)) state = 'reclaim_required';
  else if (current / plane.ma20 - 1 > 0.12 || plane.rsi14 >= 75) state = 'extended';
  else if (current >= resistance + tick && volumeRatio >= 1.2 && plane.macdHistogram > 0
    && (plane.relativeStrengthTaiex20 ?? plane.relativeStrength) > 0) state = 'breakout_confirmed';
  else if (current >= support && current <= support + 0.5 * atr) state = 'at_support';
  else state = 'breakout_pending';

  if (state === 'invalidated') return stateResult(state, plane);
  if (state === 'below_support' || state === 'reclaim_required') {
    return stateResult(state, plane, { kind: 'reclaim', threshold: roundUpToTick(support + 0.25 * atr), volumeRatioMinimum: 1.2 });
  }
  if (state === 'extended') return stateResult(state, plane,
    { kind: 'pullback', threshold: roundDownToTick(plane.ma20 * 1.08), volumeRatioMinimum: null });

  let trigger = null; let entryZone; let entryZoneKind;
  if (state === 'breakout_pending') {
    const threshold = roundUpToTick(resistance + tick);
    trigger = { kind: 'breakout', threshold, volumeRatioMinimum: 1.2 };
    entryZone = [threshold, roundUpToTick(resistance + 0.5 * atr)]; entryZoneKind = 'trigger_zone';
  } else if (state === 'at_support') {
    entryZone = [roundDownToTick(support), roundUpToTick(Math.max(current, support + 0.25 * atr))]; entryZoneKind = 'market_zone';
  } else {
    entryZone = [current, roundUpToTick(current + 0.25 * atr)]; entryZoneKind = 'market_zone';
  }
  const stop = roundDownToTick(Math.min(support - 0.5 * atr, entryZone[0] - taiwanTick(entryZone[0])));
  if (!(entryZone[0] > 0 && entryZone[0] <= entryZone[1] && stop < entryZone[0]
    && (entryZoneKind === 'market_zone' ? entryZone[0] <= current && current <= entryZone[1] : current < entryZone[0]))) return invalidPlane(unavailable('invalid_entry_geometry'));
  return stateResult(state, plane, trigger, entryZone, stop, entryZoneKind);
}

module.exports = { deriveTechnicalEntryState, roundDownToTick, roundUpToTick, taiwanTick };
