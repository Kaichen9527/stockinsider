import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

export const MONITOR_RECEIPT_BYTES = 16_000_000;
export const MONITOR_JOURNAL_BYTES = 8_000_000;
const fail = () => { throw new Error('monitor_controller_previous_progress_invalid'); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value)
  && Number.isFinite(Date.parse(value));
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
export const monitorCycleDate = now => {
  if (!instant(now)) fail();
  return new Date(Date.parse(now) + 8 * 3600_000).toISOString().slice(0, 10);
};

async function readPrivate(file, limit) {
  const before = await lstat(file);
  if (!before.isFile() || before.uid !== process.getuid() || before.mode & 0o077
    || before.size < 1 || before.size > limit) fail();
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const current = await fd.stat();
    if (!current.isFile() || current.uid !== before.uid || current.mode & 0o077
      || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) fail();
    const bytes = Buffer.alloc(current.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await fd.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await fd.stat();
    if (length !== current.size || after.size !== current.size || after.mtimeMs !== current.mtimeMs
      || after.ctimeMs !== current.ctimeMs || after.mode !== current.mode || after.uid !== current.uid) fail();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await fd.close(); }
}

// Compact tuples: symbol, held, qualified, status, snapshotId/httpStatus,
// actual response observation time, hash of its original bounded result.
export function disposition(item, result, observedAt) {
  return [item.symbol, item.existingPaperPosition, item.newEntryQualified,
    result.status, result.status === 'snapshot_saved' ? result.snapshotId : result.httpStatus,
    observedAt, researchCanonicalHash(result)];
}

function validateProgress(rows, observedAt) {
  if (!Array.isArray(rows) || rows.length > 20_000) fail();
  const seen = new Set();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 7 || typeof row[0] !== 'string' || !/^\d{4}$/u.test(row[0])
      || seen.has(row[0]) || typeof row[1] !== 'boolean' || typeof row[2] !== 'boolean' || (!row[1] && !row[2])
      || !['snapshot_saved', 'server_rejected'].includes(row[3]) || !instant(row[5])
      || Date.parse(row[5]) > Date.parse(observedAt) || !hash(row[6])) fail();
    if (row[3] === 'snapshot_saved' ? typeof row[4] !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row[4])
      : !Number.isInteger(row[4]) || row[4] < 400 || row[4] > 599) fail();
    seen.add(row[0]);
  }
}

export async function readMonitorPredecessor({ outputPath, journalPath, sourceCommit, origin, now }) {
  try {
    const receiptText = await readPrivate(outputPath, MONITOR_RECEIPT_BYTES);
    const journalText = await readPrivate(journalPath, MONITOR_JOURNAL_BYTES);
    if (!receiptText.endsWith('\n') || !journalText.endsWith('\n')) fail();
    const receipt = JSON.parse(receiptText);
    if (receiptText !== JSON.stringify(receipt, null, 2) + '\n') fail();
    const fields = ['schemaVersion', 'sourceCommit', 'origin', 'cycleDate', 'cycleStartedAt',
      'predecessorReceiptHash', 'worklistHash', 'worklistAsOf', 'observedAt', 'totalSymbols',
      'outcomes', 'deferred', 'monthlyReviewsDue', 'allTechnicalSnapshotsSaved', 'allCurrentSymbolsAccounted',
      'progress', 'independentRenewalsPerformed', 'paperRiskProcessed', 'actualOrders', 'modelCalls',
      'automaticRetry', 'fairResumeImplemented', 'receiptHash'];
    if (!keys(receipt, fields) || receipt.schemaVersion !== 'research-monitor-batch-v2'
      || receipt.sourceCommit !== sourceCommit || receipt.origin !== origin
      || receipt.cycleDate !== monitorCycleDate(now) || !instant(receipt.cycleStartedAt)
      || !instant(receipt.worklistAsOf) || !instant(receipt.observedAt)
      || Date.parse(receipt.cycleStartedAt) > Date.parse(receipt.worklistAsOf)
      || Date.parse(receipt.worklistAsOf) > Date.parse(receipt.observedAt)
      || Date.parse(receipt.observedAt) > Date.parse(now)
      || monitorCycleDate(receipt.cycleStartedAt) !== receipt.cycleDate
      || monitorCycleDate(receipt.observedAt) !== receipt.cycleDate
      || !hash(receipt.worklistHash) || !hash(receipt.receiptHash)
      || receipt.predecessorReceiptHash !== null && !hash(receipt.predecessorReceiptHash)
      || !Array.isArray(receipt.outcomes) || receipt.outcomes.length > 32
      || !Array.isArray(receipt.deferred) || !Array.isArray(receipt.monthlyReviewsDue)
      || !Number.isInteger(receipt.totalSymbols) || receipt.totalSymbols < 0 || receipt.totalSymbols > 20_000
      || receipt.independentRenewalsPerformed !== false || receipt.paperRiskProcessed !== false
      || receipt.actualOrders !== false || receipt.automaticRetry !== false || receipt.modelCalls !== 0
      || receipt.fairResumeImplemented !== true) fail();
    const { receiptHash, ...material } = receipt;
    if (researchCanonicalHash(material) !== receiptHash) fail();
    validateProgress(receipt.progress, receipt.observedAt);
    const lines = journalText.slice(0, -1).split('\n').map(line => {
      const parsed = JSON.parse(line); if (line !== JSON.stringify(parsed)) fail(); return parsed;
    });
    if (lines.length < 4 || lines.length > 105) fail();
    // Closed phase grammar; every sent request has one verified response. The
    // final receipt is bound by hash instead of duplicated in the bounded log.
    let index = 0;
    const first = lines[index++];
    if (!keys(first, ['phase', 'operation', 'sourceCommit', 'observedAt']) || first.phase !== 'request_pending'
      || first.operation !== 'worklist' || first.sourceCommit !== sourceCommit) fail();
    const loaded = lines[index++];
    if (!keys(loaded, ['phase', 'worklist', 'worklistHash', 'sourceCommit', 'observedAt'])
      || loaded.phase !== 'worklist_verified' || loaded.sourceCommit !== sourceCommit
      || loaded.worklistHash !== receipt.worklistHash
      || researchCanonicalHash(loaded.worklist) !== receipt.worklistHash
      || loaded.worklist.asOf !== receipt.worklistAsOf) fail();
    let lastClock = Date.parse(receipt.cycleStartedAt);
    for (const line of lines) {
      if (!instant(line.observedAt) || Date.parse(line.observedAt) < lastClock
        || Date.parse(line.observedAt) > Date.parse(now)) fail();
      lastClock = Date.parse(line.observedAt);
    }
    for (const result of receipt.outcomes) {
      const request = lines[index++]; const response = lines[index++];
      if (!keys(request, ['phase', 'operation', 'symbol', 'worklistHash', 'observedAt'])
        || request.phase !== 'request_pending' || request.operation !== 'technical_snapshot'
        || request.symbol !== result.symbol || request.worklistHash !== receipt.worklistHash
        || !keys(response, ['phase', 'result', 'worklistHash', 'observedAt'])
        || response.phase !== 'response_verified' || response.worklistHash !== receipt.worklistHash
        || researchCanonicalHash(response.result) !== researchCanonicalHash(result)) fail();
    }
    // A timer may expire after request_pending was durably saved but before send.
    if (lines[index]?.phase === 'request_pending') {
      const request = lines[index++]; const notSent = lines[index++];
      if (!keys(request, ['phase', 'operation', 'symbol', 'worklistHash', 'observedAt'])
        || request.operation !== 'technical_snapshot' || request.worklistHash !== receipt.worklistHash
        || !keys(notSent, ['phase', 'operation', 'symbol', 'worklistHash', 'reason', 'observedAt'])
        || notSent.phase !== 'request_not_sent' || notSent.operation !== request.operation
        || notSent.symbol !== request.symbol || notSent.worklistHash !== receipt.worklistHash
        || notSent.reason !== 'batch_deadline') fail();
    }
    const verified = lines[index++]; const saved = lines[index++];
    if (!keys(verified, ['phase', 'receiptHash', 'observedAt']) || verified.phase !== 'batch_verified'
      || verified.receiptHash !== receiptHash || !keys(saved, ['phase', 'receiptHash', 'observedAt'])
      || saved.phase !== 'response_saved' || saved.receiptHash !== receiptHash || index !== lines.length) fail();
    const members = new Map(loaded.worklist.technicalSymbols.map(item => [item.symbol, item]));
    const progress = new Map(receipt.progress.map(row => [row[0], row]));
    const outcomes = new Set();
    for (const result of receipt.outcomes) {
      const member = members.get(result.symbol); const row = progress.get(result.symbol);
      if (!member || !row || outcomes.has(result.symbol)
        || researchCanonicalHash(disposition(member, result, row[5])) !== researchCanonicalHash(row)) fail();
      outcomes.add(result.symbol);
    }
    for (const row of receipt.progress) {
      const member = members.get(row[0]);
      if (!member || member.existingPaperPosition !== row[1] || member.newEntryQualified !== row[2]
        || monitorCycleDate(row[5]) !== receipt.cycleDate) fail();
    }
    const deferred = loaded.worklist.technicalSymbols.filter(item => !progress.has(item.symbol));
    if (receipt.totalSymbols !== members.size || receipt.deferred.length !== deferred.length
      || receipt.allCurrentSymbolsAccounted !== (deferred.length === 0)
      || receipt.allTechnicalSnapshotsSaved !== (deferred.length === 0 && receipt.progress.every(row => row[3] === 'snapshot_saved'))
      || researchCanonicalHash(receipt.monthlyReviewsDue) !== researchCanonicalHash(loaded.worklist.monthlyReviewsDue)) fail();
    for (let index = 0; index < deferred.length; index++) {
      const row = receipt.deferred[index]; const expected = deferred[index];
      if (!keys(row, ['symbol', 'existingPaperPosition', 'reason']) || row.symbol !== expected.symbol
        || row.existingPaperPosition !== expected.existingPaperPosition
        || !['batch_task_bound', 'batch_deadline'].includes(row.reason)) fail();
    }
    return { receipt, worklist: loaded.worklist };
  } catch { fail(); }
}

export function carryMonitorProgress(previous, worklist) {
  if (!previous) return [];
  const prior = new Map(previous.receipt.progress.map(row => [row[0], row]));
  return worklist.technicalSymbols.flatMap(item => {
    const row = prior.get(item.symbol);
    return row && row[1] === item.existingPaperPosition && row[2] === item.newEntryQualified ? [row] : [];
  });
}
