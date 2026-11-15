import type { VnextIdentity } from './auth.ts';
import { analysisWriter } from './analysis-runtime.ts';
import { collectInvestAnchorsNotices } from './investanchors-notice-receiver.ts';
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
  return { scanStatus: scan.scanStatus, checkpointDay: scan.checkpointDay, checked: scan.checkedKeys.length,
    awaiting: scan.notices.length, deferred: scan.deferred, rejected: scan.rejected, articleAuthority: false as const };
}

/** The caller supplies the already-authorized, read-only Gmail transport.
 * No public route, secret source, schedule or article writer is installed. */
export async function runInvestAnchorsNoticeWorker(identity: VnextIdentity, day: string, key: Uint8Array, mailbox: Mailbox) {
  if (identity.role !== 'operator' || !vnextEnabled()) throw Error('investanchors_notice_operator_required');
  return analysisWriter(async leaseOwner => {
    const { getSupabaseServerClient } = await import('../supabase-server.ts');
    const client = getSupabaseServerClient();
    return continueInvestAnchorsNoticeScan(day, key, mailbox, async payload => {
      const result = await client.rpc('vnext_investanchors_notice_progress_v1', {
        p_principal: identity.principal, p_lease_owner: leaseOwner, p_day: day, p_progress: payload ?? null,
      });
      if (result.error) throw Error(payload ? 'investanchors_progress_write_uncertain' : 'investanchors_progress_unavailable');
      return result.data;
    });
  });
}
