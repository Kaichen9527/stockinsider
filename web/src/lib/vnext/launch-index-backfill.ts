/** Resource planning is not trading-session or source completeness authority. */
import { types } from 'node:util';
import { evidenceInstant } from './evidence-clock.ts';

export const LAUNCH_INDEX_MONTHS = 36;
type Row = Record<string, unknown>;
function closed(value: unknown, keys: string): value is Row {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.split(' ').length && keys.split(' ').every(key =>
    Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
}
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const at = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
/** Thirty-six MONTHLY RESOURCES including the through month. Never estimate
 * trading sessions, holidays, a 52-week high, or 520/1320-session coverage. */
export function launchIndexMonthResources(throughSession: string) {
  if (!day(throughSession)) throw Error('launch_index_backfill_invalid');
  const year = Number(throughSession.slice(0, 4)), month = Number(throughSession.slice(5, 7));
  return Object.freeze(Array.from({ length: LAUNCH_INDEX_MONTHS }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    return date.toISOString().slice(0, 7);
  }));
}
export type LaunchIndexBackfillPlan = {
  schemaVersion: 'licensed-launch-csv-plan-v3';
  status: 'planned' | 'already_acquired' | 'deferred' | 'no_active_pool';
  reason: null | 'completed_session_unavailable'; jobs: number; session: string | null; plannedAt: string;
  scope: 'current_and_history' | 'history_only' | null;
  currentPlanStatus: 'planned' | 'deferred' | 'no_active_pool';
  currentReason: null | 'awaiting_current_completed_session';
  indexResources: number; skippedIndexResources: number; sourceAuthority: false; calendarAuthority: false;
};
export function parseLaunchIndexBackfillPlan(value: unknown): LaunchIndexBackfillPlan {
  function fail(): never { throw Error('launch_index_backfill_plan_unavailable'); }
  if (!closed(value, 'schemaVersion status reason jobs session plannedAt scope currentPlanStatus currentReason indexResources skippedIndexResources sourceAuthority calendarAuthority')
    || value.schemaVersion !== 'licensed-launch-csv-plan-v3' || value.sourceAuthority !== false || value.calendarAuthority !== false
    || typeof value.plannedAt !== 'string' || evidenceInstant(value.plannedAt) === null
    || !Number.isSafeInteger(value.jobs) || Number(value.jobs) < 0 || Number(value.jobs) > 200
    || !Number.isSafeInteger(value.indexResources) || Number(value.indexResources) < 0 || Number(value.indexResources) > 200
    || !Number.isSafeInteger(value.skippedIndexResources) || Number(value.skippedIndexResources) < 0
    || Number(value.skippedIndexResources) > Number(value.indexResources)) return fail();
  if (value.status === 'no_active_pool' || value.status === 'deferred') {
    if (value.jobs !== 0 || value.indexResources !== 0 || value.skippedIndexResources !== 0 || value.session !== null || value.scope !== null) return fail();
    if (value.status === 'no_active_pool') {
      if (value.currentPlanStatus !== 'no_active_pool' || value.reason !== null || value.currentReason !== null) return fail();
    } else if (value.currentPlanStatus !== 'deferred' || value.reason !== 'completed_session_unavailable'
      || value.currentReason !== 'awaiting_current_completed_session') return fail();
  } else {
    if (!day(value.session) || value.session > new Date(Number(evidenceInstant(value.plannedAt)! / BigInt(1000)) + 28800000).toISOString().slice(0, 10)
      || value.reason !== null || Number(value.indexResources) < 72
      || Number(value.jobs)+Number(value.skippedIndexResources)<Number(value.indexResources)) return fail();
    if (value.scope === 'current_and_history') {
      if (value.currentPlanStatus !== 'planned' || value.currentReason !== null
        || Number(value.jobs)+Number(value.skippedIndexResources)-Number(value.indexResources)>99) return fail();
    } else if (value.scope !== 'history_only' || value.currentPlanStatus !== 'deferred'
      || value.currentReason !== 'awaiting_current_completed_session'
      || Number(value.jobs)+Number(value.skippedIndexResources)!==Number(value.indexResources)) return fail();
    if (value.status === 'already_acquired') {
      if (value.jobs !== 0 || value.scope !== 'history_only' || value.skippedIndexResources !== value.indexResources) return fail();
    } else if (value.status !== 'planned' || Number(value.jobs) < 1) return fail();
  }
  return Object.freeze({ ...value }) as LaunchIndexBackfillPlan;
}
