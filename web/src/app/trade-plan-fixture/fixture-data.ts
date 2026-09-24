import { TW_ENTRY_PLAN_RULESET, TW_ENTRY_PLAN_SCHEMA, type TwEntryPlan, type TwEntryPlanBundle } from '@/lib/tw-entry-plan-contract';

/** Synthetic rendering fixture only. This module is never a production data provider. */
export function tradePlanFixture(): TwEntryPlanBundle {
  const bars = Array.from({ length: 20 }, (_, index) => {
    const session = `2026-09-${String(index + 1).padStart(2, '0')}`;
    const close = 99 + index * 0.2;
    return { session, open: close - 0.1, high: close + 0.5, low: close - 0.5, close, volume: 100_000 + index * 1_000,
      availableAt: `${session}T07:05:00Z`, sourceRef: 'fixture://synthetic-ohlcv', ma20: 100, ma60: 98 };
  });
  const base: TwEntryPlan = {
    planId: 'fixture-breakout', candidateRevisionId: 'fixture-revision', symbol: 'FIXTURE', strategyId: 'breakout',
    rulesetVersion: TW_ENTRY_PLAN_RULESET, policyVersion: 'fixture-existing-policy', inputHash: 'fixture-input',
    signalSession: '2026-09-20', computedAt: '2026-09-20T07:05:00Z', availableAt: '2026-09-20T07:05:00Z',
    dataAsOf: '2026-09-20T07:05:00Z', validFromSession: '2026-09-21', expiresAfterSession: '2026-09-21', expiresAt: '2026-09-21T05:30:00Z',
    sourceDatasetRevision: 'fixture-synthetic', priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: '2026-09-20', adjustmentVersion: 'fixture', adjustmentEvidenceHash: 'fixture', status: 'verified' },
    calendarVersion: 'fixture-only', rawSignalState: 'confirmed', eligibility: { state: 'blocked', reasonCodes: ['market_risk_off_blocks_new_actionable'], policyVersion: 'fixture-existing-policy' },
    planState: 'blocked', reasonCodes: [], missingData: [], entryLower: 103, entryUpper: 104, noChaseAbove: 104, invalidationPrice: 101,
    technicalTarget: null, exitPolicy: { initialRiskLine: 101, closeBelowMa20: true, maximumHoldingSessions: 20, closeOrTimeExitExecution: 'next_tradable_time', context: 'if_entered_under_this_strategy' },
    horizon: 'daily_swing', validationStatus: 'research_only', supportingEvidenceIds: [], conflictingEvidenceIds: [], structureIds: ['fixture-resistance', 'fixture-support'],
  };
  return {
    schemaVersion: TW_ENTRY_PLAN_SCHEMA, symbol: 'FIXTURE', candidateRevisionId: 'fixture-revision', inputHash: 'fixture-input',
    plans: [base, { ...base, planId: 'fixture-pullback', strategyId: 'pullback', rawSignalState: 'waiting', planState: 'waiting_confirmation', entryLower: null, entryUpper: null, noChaseAbove: null, invalidationPrice: null }],
    structures: [
      { structureId: 'fixture-resistance', kind: 'prior20_resistance', anchorSession: '2026-09-18', anchorValue: 103, confirmedAt: '2026-09-20T07:05:00Z', knownAt: '2026-09-20T07:05:00Z', startSession: '2026-09-01', endSession: '2026-09-20', rulesetVersion: TW_ENTRY_PLAN_RULESET },
      { structureId: 'fixture-support', kind: 'prior20_support', anchorSession: '2026-09-01', anchorValue: 99, confirmedAt: '2026-09-20T07:05:00Z', knownAt: '2026-09-20T07:05:00Z', startSession: '2026-09-01', endSession: '2026-09-20', rulesetVersion: TW_ENTRY_PLAN_RULESET },
    ], ohlcv: bars, missingData: [],
  };
}
