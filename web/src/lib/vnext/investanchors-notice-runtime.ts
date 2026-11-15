import type { VnextIdentity } from './auth.ts';
import { openInvestAnchorsGmail } from './investanchors-gmail.ts';
import { planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';
import { runInvestAnchorsNoticeWorker } from './investanchors-notice-progress.ts';

export function completedInvestAnchorsDay(now: Date) {
  const local = new Date(now.getTime() + 8 * 3_600_000 - 86_400_000);
  return local.toISOString().slice(0, 10);
}

export async function runConfiguredInvestAnchorsNotices(identity: VnextIdentity, requestedDay?: string) {
  if (identity.role !== 'operator') throw Error('vnext_operator_required');
  if (process.env.STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED !== 'true') {
    return { scanStatus: 'disabled' as const, articleAuthority: false as const };
  }

  if (requestedDay !== undefined) {
    const latest = planInvestAnchorsMailboxDay(completedInvestAnchorsDay(new Date()));
    const selected = planInvestAnchorsMailboxDay(requestedDay);
    if (selected.startMs > latest.startMs || latest.startMs - selected.startMs > 29 * 86_400_000) {
      throw Error('investanchors_notice_day_invalid');
    }
  }

  const clientId = process.env.STOCKINSIDER_INVESTANCHORS_GMAIL_CLIENT_ID;
  const clientSecret = process.env.STOCKINSIDER_INVESTANCHORS_GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.STOCKINSIDER_INVESTANCHORS_GMAIL_REFRESH_TOKEN;
  const mailboxSha256 = process.env.STOCKINSIDER_INVESTANCHORS_GMAIL_MAILBOX_SHA256;
  const privateKey = process.env.STOCKINSIDER_INVESTANCHORS_NOTICE_HMAC_HEX;
  if (!clientId || !clientSecret || !refreshToken || !mailboxSha256 || !privateKey || !/^[a-f0-9]{64}$/u.test(privateKey)) {
    return { scanStatus: 'blocked' as const, reason: 'background_gmail_credentials_missing', articleAuthority: false as const };
  }

  const key = Buffer.from(privateKey, 'hex');
  try {
    return await runInvestAnchorsNoticeWorker(identity, requestedDay, key,
      day => openInvestAnchorsGmail({ clientId, clientSecret, refreshToken, mailboxSha256 }, day));
  } finally {
    key.fill(0);
  }
}
