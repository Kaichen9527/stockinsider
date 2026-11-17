import type { VnextIdentity } from './auth.ts';
import { analysisWriter } from './analysis-runtime.ts';
import { collectInvestAnchorsNotices, planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';
import { vnextEnabled } from './policy.ts';

type Mailbox = Parameters<typeof collectInvestAnchorsNotices>[2];
type ProgressRpc = (progress?: Record<string, unknown>) => Promise<unknown>;
type Row = Record<string, unknown>;
const id = /^[1-9][0-9]{0,18}$/u;
const privateKey = /^[a-f0-9]{64}$/u;
const record = (value: unknown, keys: string): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).sort().join(' ') === keys;

/** Return only receiver status/counts. Notice matching keys stay in the
 * private writer path, independently from candidate or article authority. */
export async function continueInvestAnchorsNoticeScan(
  day: string, key: Uint8Array, mailbox: Mailbox, progress: ProgressRpc,
) {
  const before = await progress();
  if (!record(before, 'articleAuthority checkedKeys checkpointDay progressId readBudget')
    || before.articleAuthority !== false || (before.checkpointDay !== null && before.checkpointDay !== day)
    || (before.progressId !== null && (typeof before.progressId !== 'string' || !id.test(before.progressId)))
    || (before.progressId === null && (before.checkpointDay !== null || (Array.isArray(before.checkedKeys) && before.checkedKeys.length > 0)))
    || !Number.isSafeInteger(before.readBudget) || Number(before.readBudget) < 0 || Number(before.readBudget) > 50
    || !Array.isArray(before.checkedKeys) || before.checkedKeys.length > 500
    || before.checkedKeys.some(value => typeof value !== 'string' || !privateKey.test(value))
    || new Set(before.checkedKeys).size !== before.checkedKeys.length) throw Error('investanchors_progress_unavailable');

  const scan = await collectInvestAnchorsNotices(day, key, mailbox, {
    readBudget: Number(before.readBudget), checkedKeys: new Set(before.checkedKeys),
  });
  if (scan.scanStatus === 'retry_required') {
    return { scanStatus: scan.scanStatus, checkpointDay: null, checked: 0, awaiting: 0, rejected: 0,
      deferred: 0, articleAuthority: false as const };
  }
  const saved = await progress({
    baseProgressId: before.progressId, scanStatus: scan.scanStatus,
    checkedKeys: scan.checkedKeys, notices: scan.notices, deferred: scan.deferred, rejected: scan.rejected,
  });
  if (!record(saved, 'articleAuthority progressId replay') || saved.articleAuthority !== false
    || typeof saved.progressId !== 'string' || !id.test(saved.progressId) || typeof saved.replay !== 'boolean') {
    throw Error('investanchors_progress_write_uncertain');
  }
  // The ledger stores incomplete progress, while the worker still reports
  // an actionable provider failure and does not advance to another day.
  const scanStatus = scan.reason === 'provider_unavailable' ? 'retry_required' : scan.scanStatus;
  return { scanStatus, checkpointDay: scan.checkpointDay, checked: scan.checkedKeys.length,
    awaiting: scan.notices.length, deferred: scan.deferred, rejected: scan.rejected, articleAuthority: false as const };
}

type Scan = Awaited<ReturnType<typeof continueInvestAnchorsNoticeScan>>;

function scanPlan(value: unknown) {
  if (!record(value, 'articleAuthority closedThrough day kind') || value.articleAuthority !== false
    || typeof value.day !== 'string' || typeof value.closedThrough !== 'string'
    || value.kind !== 'pending' && value.kind !== 'recheck'
    || value.day > value.closedThrough || value.kind === 'recheck' && value.day !== value.closedThrough) {
    throw Error('investanchors_notice_plan_unavailable');
  }
  planInvestAnchorsMailboxDay(value.day);
  planInvestAnchorsMailboxDay(value.closedThrough);
  return { day: value.day, closedThrough: value.closedThrough, kind: value.kind };
}

/** Make room for recovery on the same timer without opening an unbounded
 * sequence of provider calls. A failed or budget-limited day stays pending. */
export async function continueInvestAnchorsNoticeDays(
  planNext: () => Promise<unknown>, scan: (day: string) => Promise<Scan>,
) {
  let plan = scanPlan(await planNext());
  let checkpointDay: string | null = null;
  const counts = { checked: 0, awaiting: 0, deferred: 0, rejected: 0 };
  const summary = (scanStatus: Scan['scanStatus'], pendingDay: string | null) => ({
    scanStatus, checkpointDay, pendingDay, ...counts, articleAuthority: false as const,
  });
  for (let index = 0; index < 2; index++) {
    const result = await scan(plan.day);
    counts.checked += result.checked;
    counts.awaiting += result.awaiting;
    counts.deferred += result.deferred;
    counts.rejected += result.rejected;
    if (result.scanStatus !== 'scanned') return summary(result.scanStatus, plan.day);
    if (result.checkpointDay !== plan.day) throw Error('investanchors_notice_checkpoint_mismatch');
    checkpointDay = plan.day;
    if (plan.kind === 'recheck') return summary('scanned', null);

    const next = scanPlan(await planNext());
    if (next.closedThrough !== plan.closedThrough) return summary('deferred', next.day);
    if (next.kind === 'recheck') return summary('scanned', null);
    if (next.day <= plan.day) throw Error('investanchors_notice_plan_not_advanced');
    plan = next;
  }
  return summary('deferred', plan.day);
}

/** The authorized caller provides a mailbox factory already restricted to the
 * receiver. Plan and checkpoint operations use the same owned writer lease. */
export async function runInvestAnchorsNoticeWorker(
  identity: VnextIdentity, requestedDay: string | undefined, key: Uint8Array, openMailbox: (day: string) => Promise<Mailbox>,
) {
  if (identity.role !== 'operator' || !vnextEnabled()) throw Error('investanchors_notice_operator_required');
  return analysisWriter(async leaseOwner => {
    const { getSupabaseServerClient } = await import('../supabase-server.ts');
    const client = getSupabaseServerClient();
    const binding = { p_principal: identity.principal, p_lease_owner: leaseOwner };
    const scan = async (day: string) => continueInvestAnchorsNoticeScan(day, key, await openMailbox(day), async payload => {
      const result = await client.rpc('vnext_investanchors_notice_progress_v1', {
        ...binding, p_day: day, p_progress: payload ?? null,
      });
      if (result.error) throw Error(payload ? 'investanchors_progress_write_uncertain' : 'investanchors_progress_unavailable');
      return result.data;
    });
    if (requestedDay !== undefined) return scan(requestedDay);
    return continueInvestAnchorsNoticeDays(async () => {
      const result = await client.rpc('vnext_investanchors_notice_plan_v1', binding);
      if (result.error) throw Error('investanchors_notice_plan_unavailable');
      return result.data;
    }, scan);
  });
}
