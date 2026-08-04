'use strict';

const { unavailable } = require('./codec');

function validateLongEntryGeometry({ technicalState, currentPrice, entryZone, invalidation, trigger }) {
  if (!['at_support', 'breakout_confirmed'].includes(technicalState)) return unavailable('entry_state_blocked', { trigger: trigger ?? null, entryZone: null, invalidation: null });
  if (!Number.isFinite(currentPrice) || !Array.isArray(entryZone) || entryZone.length !== 2
    || !entryZone.every(Number.isFinite) || !Number.isFinite(invalidation)) return unavailable('invalid_entry_geometry', { trigger: null, entryZone: null, invalidation: null });
  const [low, high] = entryZone;
  if (low <= 0 || low > high || currentPrice < low * 0.95 || currentPrice > high * 1.05 || invalidation >= low || invalidation >= currentPrice) {
    return unavailable('invalid_entry_geometry', { trigger: null, entryZone: null, invalidation: null });
  }
  return Object.freeze({ availability: 'available', trigger: trigger ?? null, entryZone: [low, high], invalidation });
}

module.exports = { validateLongEntryGeometry };
