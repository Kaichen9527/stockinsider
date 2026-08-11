'use strict';

const { unavailable } = require('./codec');

function validateLongEntryGeometry({ technicalState, currentPrice, entryZone, invalidation, trigger }) {
  const validTrigger=trigger&&typeof trigger==='object'&&Number.isFinite(trigger.threshold)&&trigger.threshold>0;
  if (technicalState === 'invalidated') return Object.freeze({ availability:'invalidated',trigger:null,
    entryZone:null,invalidation:null });
  if (['below_support','reclaim_required','extended'].includes(technicalState)) return validTrigger
    ?Object.freeze({availability:'conditional',trigger,entryZone:null,invalidation:null})
    :unavailable('invalid_entry_geometry',{trigger:null,entryZone:null,invalidation:null});
  if (!['at_support', 'breakout_confirmed','breakout_pending'].includes(technicalState))
    return unavailable('entry_state_blocked', { trigger: trigger ?? null, entryZone: null, invalidation: null });
  if (!Number.isFinite(currentPrice) || !Array.isArray(entryZone) || entryZone.length !== 2
    || !entryZone.every(Number.isFinite) || !Number.isFinite(invalidation)) return unavailable('invalid_entry_geometry', { trigger: null, entryZone: null, invalidation: null });
  const [low, high] = entryZone;
  const pricePlacement=technicalState==='breakout_pending'?currentPrice<low
    :currentPrice>=low*.95&&currentPrice<=high*1.05;
  if (low <= 0 || low > high || !pricePlacement || invalidation >= low || invalidation >= currentPrice
    ||(technicalState==='breakout_pending'&&!validTrigger)) {
    return unavailable('invalid_entry_geometry', { trigger: null, entryZone: null, invalidation: null });
  }
  return Object.freeze({ availability: 'available', trigger: trigger ?? null, entryZone: [low, high], invalidation });
}

module.exports = { validateLongEntryGeometry };
