/** Produces a quarantine plan only. It never deletes or moves a backup. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const weekKey = timestamp => {
  const date = new Date(timestamp); date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil((((date - yearStart) / DAY) + 1) / 7)).padStart(2, '0')}`;
};

export function planBackupRotation(receipts, now = Date.now()) {
  const complete = receipts.map(receipt => ({ receipt, timestamp: Date.parse(receipt?.manifest?.createdAt) }))
    .filter(item => item.receipt?.manifest?.schema === 'stockinsider-local-backup-set-v2'
      && item.receipt.manifest.completeSystemBackup === true && item.receipt.manifest.restoreVerified === true
      && Number.isFinite(item.timestamp) && item.timestamp <= now)
    .sort((a, b) => b.timestamp - a.timestamp);
  const keep = new Set(complete.slice(0, 2).map(item => item.receipt.manifest.id));
  const weekly = new Set();
  for (const item of complete) {
    const age = now - item.timestamp;
    if (age <= 14 * DAY) keep.add(item.receipt.manifest.id);
    else if (age <= 42 * DAY && weekly.size < 4 && !weekly.has(weekKey(item.timestamp))) {
      weekly.add(weekKey(item.timestamp)); keep.add(item.receipt.manifest.id);
    }
    if (item.receipt.manifest.retentionClass === 'cold-unique') keep.add(item.receipt.manifest.id);
  }
  const retainedMembers = new Set(complete.filter(item => keep.has(item.receipt.manifest.id))
    .flatMap(item => (item.receipt.manifest.members || []).map(member => member.filename)));
  const quarantineCandidates = complete.filter(item => !keep.has(item.receipt.manifest.id))
    .map(item => ({ id: item.receipt.manifest.id, createdAt: item.receipt.manifest.createdAt,
      members: (item.receipt.manifest.members || []).filter(member => !retainedMembers.has(member.filename)) }));
  const manualReview = receipts.filter(receipt => receipt?.manifest?.schema !== 'stockinsider-local-backup-set-v2'
    || receipt.manifest.completeSystemBackup !== true || receipt.manifest.restoreVerified !== true)
    .map(receipt => receipt?.manifest?.id || 'invalid_or_unverified_receipt');
  const plan = { schema: 'stockinsider-local-backup-rotation-plan-v1', createdAt: new Date(now).toISOString(),
    retainedSetIds: [...keep].sort(), quarantineCandidates, manualReview,
    destructiveActionPerformed: false, policy: '14_days_plus_4_weekly_latest_two_cold_unique_forever' };
  return { ...plan, planSha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [receiptListPath, ...extra] = process.argv.slice(2);
    if (extra.length || !path.isAbsolute(receiptListPath || '')) throw new Error('absolute_receipt_list_required');
    console.log(JSON.stringify(planBackupRotation(JSON.parse(await readFile(receiptListPath, 'utf8')))));
  } catch (error) {
    console.error(JSON.stringify({ error: 'backup_rotation_plan_failed', reason: error.message,
      destructiveActionPerformed: false })); process.exitCode = 1;
  }
}
