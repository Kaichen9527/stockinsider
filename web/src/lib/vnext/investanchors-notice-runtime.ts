import type { VnextIdentity } from './auth.ts';
import { openInvestAnchorsGmail } from './investanchors-gmail.ts';
import { loadInvestAnchorsNoticeCredentials } from './investanchors-notice-credential.ts';
import { planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';
import { runInvestAnchorsNoticeWorker } from './investanchors-notice-progress.ts';
import { taipeiDate } from './policy.ts';

export function completedInvestAnchorsDay(now: Date) {
  const local = new Date(now.getTime() + 8 * 3_600_000 - 86_400_000);
  return local.toISOString().slice(0, 10);
}

export function resolveInvestAnchorsNoticeDay(now: Date, requestedDay?: string, scope?: 'current') {
  if (scope === 'current') {
    if (requestedDay !== undefined) throw Error('investanchors_notice_day_invalid');
    return taipeiDate(now.toISOString());
  }
  if (requestedDay !== undefined) {
    const latest = planInvestAnchorsMailboxDay(completedInvestAnchorsDay(now));
    const selected = planInvestAnchorsMailboxDay(requestedDay);
    if (selected.startMs > latest.startMs || latest.startMs - selected.startMs > 29 * 86_400_000) {
      throw Error('investanchors_notice_day_invalid');
    }
  }
  return requestedDay;
}

export async function runConfiguredInvestAnchorsNotices(identity: VnextIdentity, requestedDay?: string, scope?: 'current') {
  if (identity.role !== 'operator') throw Error('vnext_operator_required');
  if (process.env.STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED !== 'true') {
    return { scanStatus: 'disabled' as const, articleAuthority: false as const };
  }

  const day = resolveInvestAnchorsNoticeDay(new Date(), requestedDay, scope);
  let credentials;
  try {
    credentials = loadInvestAnchorsNoticeCredentials();
  } catch {
    return { scanStatus: 'blocked' as const, reason: 'background_gmail_credentials_invalid', articleAuthority: false as const };
  }
  if (credentials === null) {
    return { scanStatus: 'blocked' as const, reason: 'background_gmail_credentials_missing', articleAuthority: false as const };
  }

  const { gmail, noticeHmacHex } = credentials;
  const key = Buffer.from(noticeHmacHex, 'hex');
  try {
    return await runInvestAnchorsNoticeWorker(identity, day, key,
      mailboxDay => openInvestAnchorsGmail(gmail, mailboxDay));
  } finally {
    key.fill(0);
  }
}
