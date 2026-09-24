/** Shared data-only contract. No client-side strategy calculation is authorized. */
export const TW_ENTRY_PLAN_RULESET = 'tw-entry-plan-v0.1' as const;
export const TW_ENTRY_PLAN_SCHEMA = 'tw-entry-plan-bundle-v0.1' as const;

export type TwEntryBar = {
  session: string; open: number; high: number; low: number; close: number; volume: number;
  availableAt: string; sourceRef: string;
};
export type TwEntryChartBar = Pick<TwEntryBar, 'session' | 'open' | 'high' | 'low' | 'close' | 'volume'>
  & { ma20: number | null; ma60: number | null };
export type TwEntryEligibility = {
  state: 'eligible' | 'blocked' | 'unavailable'; reasonCodes: string[]; policyVersion: string;
};
export type TwEntryCalendar = {
  version: string; knownAt: string; completedSessions: string[];
  signalSession: string; signalCloseAt: string;
  nextSession: string; nextOpenAt: string; nextCloseAt: string;
};
export type TwEntryPriceBasis = {
  kind: 'adjusted_to_signal_session'; anchorSession: string;
  adjustmentVersion: string; adjustmentEvidenceHash: string;
  status: 'verified' | 'missing' | 'conflict';
};
export type TwEntryPlanInput = {
  symbol: string; candidateRevisionId: string; computedAt: string; availableAt: string; dataAsOf: string;
  sourceDatasetRevision: string; bars: TwEntryBar[]; calendar: TwEntryCalendar | null;
  priceBasis: TwEntryPriceBasis | null; formalEligibility: TwEntryEligibility;
  liquidityVerified: boolean; supportingEvidenceIds?: string[]; conflictingEvidenceIds?: string[];
  /** Typed acquisition/authority failures; never replace them with silent fallback. */
  missingData?: string[];
};
export type TwEntryStructure = {
  structureId: string; kind: 'prior20_resistance' | 'prior20_support';
  anchorSession: string; anchorValue: number; confirmedAt: string; knownAt: string;
  startSession: string; endSession: string; rulesetVersion: typeof TW_ENTRY_PLAN_RULESET;
};
export type TwEntryPlan = {
  planId: string; candidateRevisionId: string; symbol: string;
  strategyId: 'breakout' | 'pullback'; rulesetVersion: typeof TW_ENTRY_PLAN_RULESET;
  policyVersion: string; inputHash: string; signalSession: string | null;
  computedAt: string; availableAt: string; dataAsOf: string;
  validFromSession: string | null; expiresAfterSession: string | null; expiresAt: string | null;
  sourceDatasetRevision: string; priceBasis: TwEntryPriceBasis | null; calendarVersion: string | null;
  rawSignalState: 'waiting' | 'confirmed' | 'invalidated' | 'data_insufficient';
  eligibility: TwEntryEligibility;
  planState: 'waiting_confirmation' | 'conditional' | 'blocked' | 'avoid_chase' | 'invalidated' | 'expired' | 'data_insufficient';
  reasonCodes: string[]; missingData: string[];
  entryLower: number | null; entryUpper: number | null; noChaseAbove: number | null;
  invalidationPrice: number | null; technicalTarget: null;
  exitPolicy: {
    initialRiskLine: number | null; closeBelowMa20: true; maximumHoldingSessions: 20;
    closeOrTimeExitExecution: 'next_tradable_time'; context: 'if_entered_under_this_strategy';
  };
  horizon: 'daily_swing'; validationStatus: 'research_only';
  supportingEvidenceIds: string[]; conflictingEvidenceIds: string[]; structureIds: string[];
};
export type TwEntryPlanBundle = {
  schemaVersion: typeof TW_ENTRY_PLAN_SCHEMA; symbol: string; candidateRevisionId: string; inputHash: string;
  plans: TwEntryPlan[]; structures: TwEntryStructure[]; ohlcv: TwEntryChartBar[];
  missingData: string[];
};
export type TwEntryPlanSummary = {
  schemaVersion: typeof TW_ENTRY_PLAN_SCHEMA; candidateRevisionId: string; inputHash: string;
  signalSession: string | null; validFromSession: string | null; expiresAt: string | null;
  validationStatus: 'research_only';
  plans: Array<Pick<TwEntryPlan, 'strategyId' | 'rawSignalState' | 'planState' | 'eligibility' | 'reasonCodes'>>;
};
