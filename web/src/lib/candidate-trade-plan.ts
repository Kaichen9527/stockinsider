import { createHash } from 'node:crypto';
import { TW_ENTRY_PLAN_RULESET, TW_ENTRY_PLAN_SCHEMA,
  type TwEntryPlan, type TwEntryPlanBundle, type TwEntryPlanSummary } from './tw-entry-plan-contract.ts';

type Row = Record<string, unknown>;
export type CandidateTradePlanEnvelope = { bundle: TwEntryPlanBundle; bundleHash: string };
type ReadContext = { revisionId: string; symbol: string; sessionDate: string; availableAt: string };

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('trade_plan_non_finite');
    if (value === undefined) throw new TypeError('trade_plan_undefined');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(',')}}`;
}
function digest(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
const object = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 256 && value.every(text);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nullablePrice = (value: unknown) => value === null || positive(value);
function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function time(value: unknown): number {
  return typeof value === 'string' && date(value.slice(0, 10))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ? Date.parse(value) : NaN;
}
function onlyKeys(value: Row, keys: string[]) { return Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function eligible(value: unknown): boolean {
  return object(value) && onlyKeys(value, ['state', 'reasonCodes', 'policyVersion'])
    && ['eligible', 'blocked', 'unavailable'].includes(String(value.state)) && strings(value.reasonCodes)
    && text(value.policyVersion) && (value.state !== 'eligible' || value.reasonCodes.length === 0);
}
const RAW_STATES = ['waiting', 'confirmed', 'invalidated', 'data_insufficient'];
const PLAN_STATES = ['waiting_confirmation', 'conditional', 'blocked', 'avoid_chase', 'invalidated', 'expired', 'data_insufficient'];
const compactReasons = (values: string[]) => values.filter((value) => value.length <= 96).slice(0, 2);
function summaryBytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch { return Infinity; }
}

export function candidateTradePlanSummary(bundle: TwEntryPlanBundle): TwEntryPlanSummary {
  const summary: TwEntryPlanSummary = { schemaVersion: TW_ENTRY_PLAN_SCHEMA, candidateRevisionId: bundle.candidateRevisionId, inputHash: bundle.inputHash,
    signalSession: bundle.plans[0].signalSession, validFromSession: bundle.plans[0].validFromSession,
    expiresAt: bundle.plans[0].expiresAt, validationStatus: 'research_only',
    plans: bundle.plans.map((plan) => ({ strategyId: plan.strategyId, rawSignalState: plan.rawSignalState,
      planState: plan.planState, eligibility: { ...plan.eligibility, reasonCodes: compactReasons(plan.eligibility.reasonCodes) },
      reasonCodes: compactReasons(plan.reasonCodes) })) };
  // Keep exact policy identities/states. Optional repeated explanations may be
  // omitted on a compact card; the full detail retains every original reason.
  while (summaryBytes(summary) > 1800 && summary.plans.some((plan) => plan.reasonCodes.length || plan.eligibility.reasonCodes.length)) {
    for (const plan of summary.plans) { plan.reasonCodes.pop(); plan.eligibility.reasonCodes.pop(); }
  }
  if (summaryBytes(summary) > 1800) throw new RangeError('candidate_trade_plan_summary_bound');
  return summary;
}

/** The summary is a bounded projection, never a second strategy computation. */
export function readCandidateTradePlanSummary(raw: unknown, context: { revisionId: string }): TwEntryPlanSummary | null {
  if (!object(raw) || !onlyKeys(raw, ['schemaVersion', 'candidateRevisionId', 'inputHash', 'signalSession', 'validFromSession', 'expiresAt', 'validationStatus', 'plans'])
    || raw.schemaVersion !== TW_ENTRY_PLAN_SCHEMA || raw.candidateRevisionId !== context.revisionId || !sha(raw.inputHash)
    || raw.validationStatus !== 'research_only' || !(raw.signalSession === null || date(raw.signalSession))
    || !(raw.validFromSession === null || date(raw.validFromSession)) || !(raw.expiresAt === null || Number.isFinite(time(raw.expiresAt)))
    || !Array.isArray(raw.plans) || raw.plans.length !== 2 || summaryBytes(raw) > 1800) return null;
  if (date(raw.signalSession) && date(raw.validFromSession) && raw.validFromSession <= raw.signalSession) return null;
  for (const [index, value] of raw.plans.entries()) {
    if (!object(value) || !onlyKeys(value, ['strategyId', 'rawSignalState', 'planState', 'eligibility', 'reasonCodes'])
      || value.strategyId !== ['breakout', 'pullback'][index] || !RAW_STATES.includes(String(value.rawSignalState))
      || !PLAN_STATES.includes(String(value.planState)) || !eligible(value.eligibility) || !strings(value.reasonCodes)
      || value.reasonCodes.length > 2 || value.reasonCodes.some((reason) => reason.length > 96)
      || ((value.eligibility as Row).reasonCodes as string[]).length > 2
      || ((value.eligibility as Row).reasonCodes as string[]).some((reason) => reason.length > 96)
      || (value.planState === 'conditional' && (value.rawSignalState !== 'confirmed' || (value.eligibility as Row).state !== 'eligible'))) return null;
  }
  return structuredClone(raw) as TwEntryPlanSummary;
}

function validPlan(raw: unknown, context: ReadContext, bundle: Row, strategyId: string): raw is TwEntryPlan {
  if (!object(raw) || raw.strategyId !== strategyId || raw.candidateRevisionId !== context.revisionId
    || raw.symbol !== context.symbol || raw.inputHash !== bundle.inputHash || raw.rulesetVersion !== TW_ENTRY_PLAN_RULESET
    || raw.planId !== `tw-entry-plan:${digest([TW_ENTRY_PLAN_RULESET, bundle.inputHash, strategyId])}`
    || !text(raw.sourceDatasetRevision) || !text(raw.policyVersion) || !eligible(raw.eligibility)
    || (raw.eligibility as Row).policyVersion !== raw.policyVersion
    || !RAW_STATES.includes(String(raw.rawSignalState)) || !PLAN_STATES.includes(String(raw.planState))
    || raw.validationStatus !== 'research_only' || raw.horizon !== 'daily_swing' || raw.technicalTarget !== null
    || !strings(raw.reasonCodes) || !strings(raw.missingData) || !strings(raw.supportingEvidenceIds)
    || !strings(raw.conflictingEvidenceIds) || !strings(raw.structureIds)
    || ![raw.entryLower, raw.entryUpper, raw.noChaseAbove, raw.invalidationPrice].every(nullablePrice)) return false;
  const available = time(raw.availableAt); const computed = time(raw.computedAt); const asOf = time(raw.dataAsOf);
  if (![available, computed, asOf, time(context.availableAt)].every(Number.isFinite)
    || available !== time(context.availableAt) || computed < available || asOf > available) return false;
  if (raw.signalSession !== context.sessionDate && !(raw.signalSession === null && raw.rawSignalState === 'data_insufficient')) return false;
  const noCalendar = raw.validFromSession === null && raw.expiresAfterSession === null && raw.expiresAt === null;
  if (!noCalendar && (!date(raw.validFromSession) || raw.expiresAfterSession !== raw.validFromSession
    || raw.validFromSession <= context.sessionDate || !Number.isFinite(time(raw.expiresAt)))) return false;
  if (noCalendar && raw.rawSignalState !== 'data_insufficient') return false;
  if (raw.planState === 'expired' && !(time(raw.expiresAt) <= available)) return false;
  if (!object(raw.exitPolicy) || !onlyKeys(raw.exitPolicy, ['initialRiskLine', 'closeBelowMa20', 'maximumHoldingSessions', 'closeOrTimeExitExecution', 'context'])
    || raw.exitPolicy.initialRiskLine !== raw.invalidationPrice || raw.exitPolicy.closeBelowMa20 !== true
    || raw.exitPolicy.maximumHoldingSessions !== 20 || raw.exitPolicy.closeOrTimeExitExecution !== 'next_tradable_time'
    || raw.exitPolicy.context !== 'if_entered_under_this_strategy') return false;
  const hasZone = raw.entryLower !== null || raw.entryUpper !== null || raw.invalidationPrice !== null;
  if (hasZone && (!positive(raw.entryLower) || !positive(raw.entryUpper) || !positive(raw.invalidationPrice)
    || raw.invalidationPrice >= raw.entryLower || raw.entryLower > raw.entryUpper || raw.entryUpper !== raw.noChaseAbove
    || raw.rawSignalState !== 'confirmed')) return false;
  if (raw.planState === 'conditional' && (raw.rawSignalState !== 'confirmed' || (raw.eligibility as Row).state !== 'eligible' || !hasZone)) return false;
  if (raw.planState === 'blocked' && (raw.rawSignalState !== 'confirmed' || (raw.eligibility as Row).state === 'eligible' || !hasZone)) return false;
  if (['waiting_confirmation', 'avoid_chase', 'invalidated', 'data_insufficient'].includes(String(raw.planState)) && hasZone) return false;
  if (raw.planState === 'data_insufficient' && (raw.rawSignalState !== 'data_insufficient' || raw.missingData.length === 0)) return false;
  if (raw.rawSignalState !== 'data_insufficient') {
    const basis = raw.priceBasis;
    if (!object(basis) || !onlyKeys(basis, ['kind', 'anchorSession', 'adjustmentVersion', 'adjustmentEvidenceHash', 'status'])
      || basis.kind !== 'adjusted_to_signal_session' || basis.status !== 'verified' || basis.anchorSession !== context.sessionDate
      || !text(basis.adjustmentVersion) || !sha(basis.adjustmentEvidenceHash) || !text(raw.calendarVersion)) return false;
  }
  return true;
}

/** Fail closed for old, malformed, cross-revision or tampered stored data.
 * No latest-price reads, network calls or research writes occur here. */
export function readCandidateTradePlan(envelope: unknown, context: ReadContext): TwEntryPlanBundle | null {
  try {
    if (!text(context.revisionId) || !/^\d{4}$/u.test(context.symbol) || !date(context.sessionDate)
      || !object(envelope) || !onlyKeys(envelope, ['bundle', 'bundleHash']) || !sha(envelope.bundleHash) || !object(envelope.bundle)) return null;
    const bundle = envelope.bundle;
    if (!onlyKeys(bundle, ['schemaVersion', 'symbol', 'candidateRevisionId', 'inputHash', 'plans', 'structures', 'ohlcv', 'missingData'])
      || bundle.schemaVersion !== TW_ENTRY_PLAN_SCHEMA || bundle.candidateRevisionId !== context.revisionId || bundle.symbol !== context.symbol
      || !sha(bundle.inputHash) || !strings(bundle.missingData) || !Array.isArray(bundle.plans) || bundle.plans.length !== 2
      || !Array.isArray(bundle.structures) || bundle.structures.length > 2 || !Array.isArray(bundle.ohlcv)
      || ![0, 240].includes(bundle.ohlcv.length)) return null;
    if (!bundle.plans.every((plan, index) => validPlan(plan, context, bundle, ['breakout', 'pullback'][index]))) return null;
    const plans = bundle.plans as TwEntryPlan[];
    if (plans.some((plan) => canonical(plan.missingData) !== canonical(bundle.missingData))
      || plans.some((plan) => canonical(plan.priceBasis) !== canonical(plans[0].priceBasis)
        || plan.sourceDatasetRevision !== plans[0].sourceDatasetRevision || plan.calendarVersion !== plans[0].calendarVersion
        || plan.validFromSession !== plans[0].validFromSession || plan.expiresAt !== plans[0].expiresAt)) return null;
    if (bundle.missingData.length === 0 && (bundle.ohlcv.length !== 240 || bundle.structures.length !== 2)) return null;
    for (const [index, bar] of bundle.ohlcv.entries()) {
      if (!object(bar) || !onlyKeys(bar, ['session', 'open', 'high', 'low', 'close', 'volume', 'ma20', 'ma60'])
        || !date(bar.session) || bar.session > context.sessionDate || (index > 0 && bar.session <= (bundle.ohlcv[index - 1] as Row).session!)
        || ![bar.open, bar.high, bar.low, bar.close].every(positive)
        || (bar.high as number) < Math.max(bar.open as number, bar.close as number)
        || (bar.low as number) > Math.min(bar.open as number, bar.close as number)
        || typeof bar.volume !== 'number' || !Number.isFinite(bar.volume) || bar.volume < 0
        || !nullablePrice(bar.ma20) || !nullablePrice(bar.ma60)) return null;
    }
    if (bundle.ohlcv.length && (bundle.ohlcv.at(-1) as Row).session !== context.sessionDate) return null;
    const ids = new Set<string>();
    for (const structure of bundle.structures) {
      if (!object(structure) || !onlyKeys(structure, ['structureId', 'kind', 'anchorSession', 'anchorValue', 'confirmedAt', 'knownAt', 'startSession', 'endSession', 'rulesetVersion'])
        || !text(structure.structureId) || ids.has(structure.structureId) || !['prior20_support', 'prior20_resistance'].includes(String(structure.kind))
        || !date(structure.anchorSession) || !date(structure.startSession) || !date(structure.endSession)
        || structure.startSession > structure.anchorSession || structure.anchorSession > structure.endSession
        || structure.endSession >= context.sessionDate || !positive(structure.anchorValue)
        || structure.rulesetVersion !== TW_ENTRY_PLAN_RULESET || !Number.isFinite(time(structure.knownAt))
        || !Number.isFinite(time(structure.confirmedAt)) || time(structure.knownAt) > time(context.availableAt)
        || time(structure.confirmedAt) > time(structure.knownAt)) return null;
      const { structureId, ...material } = structure;
      if (structureId !== `tw-entry-structure:${digest([bundle.inputHash, material])}`) return null;
      ids.add(structure.structureId);
    }
    if (plans.some((plan) => plan.structureIds.length !== ids.size || new Set(plan.structureIds).size !== ids.size
      || plan.structureIds.some((id) => !ids.has(id)))) return null;
    if (digest(bundle) !== envelope.bundleHash) return null;
    return structuredClone(bundle) as TwEntryPlanBundle;
  } catch { return null; }
}

function uuidFromHash(value: string): string {
  const bytes = value.slice(0, 32).split('');
  bytes[12] = '8'; bytes[16] = ((parseInt(bytes[16], 16) & 3) | 8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Assigns an immutable detail revision before rebinding its plan attachment.
 * The ID includes base research metadata; it never overwrites an old revision. */
export function bindCandidateTradePlan(basePayload: Row, unbound: TwEntryPlanBundle): {
  id: string; provenance: Row; revision_hash: string;
} {
  const { id: _oldId, revision_hash: _oldHash, provenance: existingProvenance, ...base } = basePayload;
  void _oldId; void _oldHash;
  const { trade_plan: _oldPlan, trade_plan_summary: _oldSummary, ...provenance } = object(existingProvenance) ? existingProvenance : {};
  void _oldPlan; void _oldSummary;
  const unboundSemantic = { ...unbound, candidateRevisionId: null,
    plans: unbound.plans.map((plan) => ({ ...plan, candidateRevisionId: null })) };
  const id = uuidFromHash(digest(['candidate-detail-tw-entry-plan-v1', { ...base, provenance }, unboundSemantic]));
  const bundle = structuredClone(unbound);
  bundle.candidateRevisionId = id;
  for (const plan of bundle.plans) plan.candidateRevisionId = id;
  const envelope: CandidateTradePlanEnvelope = { bundle, bundleHash: digest(bundle) };
  const context = { revisionId: id, symbol: bundle.symbol, sessionDate: String(base.session_date ?? ''), availableAt: String(base.available_at ?? '') };
  if (!readCandidateTradePlan(envelope, context)) throw new TypeError('candidate_trade_plan_publication_invalid');
  const finalProvenance = { ...provenance, trade_plan: envelope, trade_plan_summary: candidateTradePlanSummary(bundle) };
  const finalPayload = { ...base, id, provenance: finalProvenance };
  return { id, provenance: finalProvenance, revision_hash: digest(finalPayload) };
}
