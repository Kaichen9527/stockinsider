'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RunnerError, assert } = require('./artifacts');
const { canonicalJson, sha256 } = require('./canonicalJson');
const { resourceAttemptKey } = require('./resourceJournal');

const IDENTITY = '89c5fd414840e577729d55933fd0eef4a4cf8fdaa494feb6895d67ce895331e7';

function atSecond() {
  return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const stat = fs.lstatSync(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid(), 11);
  return stat;
}

function writeExclusive(filename, value, mode = 0o600) {
  privateDirectory(path.dirname(filename));
  const bytes = Buffer.from(typeof value === 'string' ? value : canonicalJson(value) + '\n');
  const descriptor = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, mode);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(filename));
}

function atomicReplace(filename, value) {
  privateDirectory(path.dirname(filename));
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}`);
  writeExclusive(temporary, value);
  fs.renameSync(temporary, filename);
  fsyncDirectory(path.dirname(filename));
}

function readJournal(filename, identity) {
  if (!fs.existsSync(filename)) return [];
  const stat = fs.lstatSync(filename);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 11);
  const bytes = fs.readFileSync(filename, 'utf8');
  assert(bytes.endsWith('\n'), 11);
  const lines = bytes.slice(0, -1).split('\n').filter(Boolean);
  let prior = null;
  let priorState = null;
  return lines.map((line, sequence) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new RunnerError(11);
    }
    const operationJournal = record.protocol === 'model-runner-operation-journal-v3.5';
    const resourceJournal = record.protocol === 'model-runner-resource-journal-v3.5';
    const topKeys = operationJournal
      ? ['protocol', 'modelRunnerIdentitySha256', 'operationKeySha256', 'sequence', 'state', 'at',
        'priorRecordSha256', 'payload', 'failureCode', 'exit']
      : ['protocol', 'modelRunnerIdentitySha256', 'operationKeySha256', 'resourceAttemptKeySha256',
        'resourceAttemptOrdinal', 'sequence', 'state', 'at', 'priorRecordSha256', 'payload',
        'failureCode', 'exit'];
    assert(
      (operationJournal || resourceJournal) &&
      Object.keys(record).sort().join('\0') === topKeys.sort().join('\0') &&
      record.modelRunnerIdentitySha256 === IDENTITY &&
      record.sequence === sequence &&
      record.priorRecordSha256 === prior &&
      record[identity.name] === identity.value &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(record.at) &&
      validTransition(operationJournal ? 'operation' : 'resource', priorState, record.state) &&
      validPayload(operationJournal ? 'operation' : 'resource', record.state, record.payload) &&
      ((record.state === 'failed' && typeof record.failureCode === 'string' &&
        Number.isSafeInteger(record.exit) && record.exit > 0) ||
        (record.state !== 'failed' && record.failureCode === null && record.exit === null)),
      11,
    );
    const canonical = canonicalJson(record);
    assert(canonical === line, 11);
    prior = sha256(canonical);
    priorState = record.state;
    return record;
  });
}

function sameKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function validTransition(kind, prior, next) {
  const transitions = kind === 'resource' ? {
    null: ['allocated', 'preparation_failed'],
    allocated: ['view_ready', 'preparation_failed'],
    view_ready: ['transport_ready', 'preparation_failed'],
    transport_ready: ['scratch_ready', 'preparation_failed'],
    scratch_ready: ['child_started', 'preparation_failed', 'cleanup_started'],
    child_started: ['child_exited'],
    child_exited: ['cleanup_started'],
    preparation_failed: ['cleanup_started'],
    cleanup_started: ['cleanup_complete', 'failed'],
    cleanup_complete: [],
    failed: [],
  } : {
    null: ['prepared'],
    prepared: ['model_started', 'failure_pending'],
    model_started: ['result_sealed', 'failure_pending'],
    result_sealed: ['apply_started', 'verdict_recorded', 'evidence_recorded', 'task_failure_recorded', 'failure_pending'],
    apply_started: ['commit_created', 'failure_pending'],
    commit_created: ['ref_published', 'failure_pending'],
    ref_published: ['completed', 'failed'],
    verdict_recorded: ['completed', 'failed'],
    evidence_recorded: ['completed', 'failed'],
    task_failure_recorded: ['completed', 'failed'],
    failure_pending: ['failed'],
    completed: [],
    failed: [],
  };
  return Object.hasOwn(transitions, String(prior)) && transitions[String(prior)].includes(next);
}

function validPayload(kind, state, payload) {
  const keys = kind === 'resource' ? {
    allocated: ['tokenDigest', 'device'],
    view_ready: ['viewPathSha256', 'device', 'inode', 'sourceViewSha256', 'sourceCommit', 'proposalDeltaSha256'],
    transport_ready: ['transportPathSha256', 'profileSha256', 'authMaterialSha256'],
    scratch_ready: ['scratchPathSha256', 'device', 'inode', 'mode'],
    preparation_failed: ['primaryFailureCode', 'primaryExit'],
    child_started: ['pid', 'processGroupId'],
    child_exited: ['exitCode', 'signal'],
    cleanup_started: ['tokenDigest'],
    cleanup_complete: ['removed'],
    failed: ['phase', 'primaryFailureCode', 'primaryExit'],
  } : {
    prepared: ['resourceAttemptKeySha256', 'resourceAttemptOrdinal', 'requestSha256', 'sourceViewSha256',
      'sourceCommit', 'proposalDeltaSha256', 'profileSha256', 'startingState',
      'priorProposalCommit', 'priorResultRef'],
    model_started: ['runId', 'sessionId', 'pid', 'processGroupId'],
    result_sealed: ['resultSha256', 'patchSha256'],
    apply_started: ['applyTokenDigest', 'sourceCommit'],
    commit_created: ['proposalCommit', 'resultTree'],
    ref_published: ['proposalCommit', 'resultRef'],
    verdict_recorded: ['status', 'resultSha256', 'blockingFindingIds'],
    evidence_recorded: ['status', 'resultSha256', 'failedEvidenceRefs'],
    task_failure_recorded: ['status', 'resultSha256'],
    failure_pending: ['phase', 'primaryFailureCode', 'primaryExit', 'retainedResultSha256', 'proposalCommit', 'resultRef'],
    completed: ['status', 'resultSha256', 'proposalCommit', 'resultRef'],
    failed: ['phase', 'primaryFailureCode', 'primaryExit', 'retainedResultSha256', 'proposalCommit', 'resultRef'],
  };
  return Object.hasOwn(keys, state) && sameKeys(payload, keys[state]);
}

function appendJournal(filename, identity, base) {
  privateDirectory(path.dirname(filename));
  const records = readJournal(filename, identity);
  const prior = records.length ? sha256(canonicalJson(records.at(-1))) : null;
  const record = {
    ...base,
    modelRunnerIdentitySha256: IDENTITY,
    [identity.name]: identity.value,
    sequence: records.length,
    at: atSecond(),
    priorRecordSha256: prior,
  };
  const descriptor = fs.openSync(
    filename,
    fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, canonicalJson(record) + '\n');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(filename));
  return record;
}

function runtimePaths(root, manifestSha256, taskKey) {
  const anchor = path.join(root, '.loop-engineering', 'runtime', 'model-runner-v3');
  privateDirectory(anchor);
  const task = path.join(anchor, manifestSha256, taskKey);
  privateDirectory(task);
  return {
    anchor,
    task,
    status: path.join(task, 'status.json'),
    lock: path.join(task, 'task.lock'),
    operationDirectory: path.join(task, 'operation-journals'),
    reservationDirectory: path.join(task, 'reservations'),
    resourceJournalDirectory: path.join(task, 'resource-journals'),
    attemptDirectory: path.join(task, 'attempts'),
    resultDirectory: path.join(task, 'results'),
    liveDirectory: path.join(task, 'live-resources'),
  };
}

function acquireTaskLock(filename) {
  const token = crypto.randomBytes(32).toString('hex');
  const row = {
    protocol: 'model-runner-task-lock-v3.5',
    modelRunnerIdentitySha256: IDENTITY,
    pid: process.pid,
    tokenDigest: sha256(token),
    createdAt: atSecond(),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeExclusive(filename, row);
      return { filename, token, tokenDigest: row.tokenDigest };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try {
        existing = JSON.parse(fs.readFileSync(filename, 'utf8'));
      } catch {
        throw new RunnerError(11);
      }
      assert(existing.protocol === row.protocol && existing.modelRunnerIdentitySha256 === IDENTITY &&
        Number.isSafeInteger(existing.pid) && existing.pid > 0 && /^[0-9a-f]{64}$/u.test(existing.tokenDigest), 11);
      try {
        process.kill(existing.pid, 0);
        throw new RunnerError(8);
      } catch (caught) {
        if (caught instanceof RunnerError) throw caught;
        if (caught.code !== 'ESRCH') throw new RunnerError(8);
      }
      fs.unlinkSync(filename);
      fsyncDirectory(path.dirname(filename));
    }
  }
  throw new RunnerError(8);
}

function releaseTaskLock(lock) {
  const existing = JSON.parse(fs.readFileSync(lock.filename, 'utf8'));
  assert(existing.tokenDigest === lock.tokenDigest && existing.pid === process.pid, 11);
  fs.unlinkSync(lock.filename);
  fsyncDirectory(path.dirname(lock.filename));
}

function reserveResource(paths, operationIdentity, startingState, removeOwnedResourceFn = removeOwnedResource) {
  const directory = path.join(paths.reservationDirectory, operationIdentity.operationKeySha256);
  privateDirectory(directory);
  const entries = fs.readdirSync(directory).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  entries.forEach((entry, ordinal) => {
    assert(entry === `${ordinal}.json`, 11);
    const row = JSON.parse(fs.readFileSync(path.join(directory, entry), 'utf8'));
    assert(
      row.protocol === 'model-runner-resource-reservation-v3.5' &&
      row.modelRunnerIdentitySha256 === IDENTITY &&
      row.operationKeySha256 === operationIdentity.operationKeySha256 &&
      row.resourceAttemptOrdinal === ordinal &&
      row.resourceAttemptKeySha256 === resourceAttemptKey(row),
      11,
    );
    const journal = path.join(paths.resourceJournalDirectory, `${row.resourceAttemptKeySha256}.jsonl`);
    let records = readJournal(journal, { name: 'resourceAttemptKeySha256', value: row.resourceAttemptKeySha256 });
    if (!records.length || !['cleanup_complete', 'failed'].includes(records.at(-1).state)) {
      const operationJournal = path.join(paths.operationDirectory, `${operationIdentity.operationKeySha256}.jsonl`);
      assert(!fs.existsSync(operationJournal), 11);
      const append = (state, payload, failureCode = null, exit = null) => appendJournal(
        journal,
        { name: 'resourceAttemptKeySha256', value: row.resourceAttemptKeySha256 },
        {
          protocol: 'model-runner-resource-journal-v3.5',
          operationKeySha256: row.operationKeySha256,
          resourceAttemptKeySha256: row.resourceAttemptKeySha256,
          resourceAttemptOrdinal: row.resourceAttemptOrdinal,
          state,
          payload,
          failureCode,
          exit,
        },
      );
      const last = records.at(-1)?.state;
      assert(
        last === undefined || ['allocated', 'view_ready', 'transport_ready', 'scratch_ready'].includes(last),
        11,
      );
      append('preparation_failed', { primaryFailureCode: 'TASK_FAILED', primaryExit: 10 });
      append('cleanup_started', { tokenDigest: row.tokenDigest });
      const live = path.join(paths.liveDirectory, row.tokenDigest);
      try {
        if (fs.existsSync(live)) removeOwnedResourceFn(live, row);
        append('cleanup_complete', { removed: true });
      } catch {
        append(
          'failed',
          { phase: 'cleanup', primaryFailureCode: 'TASK_FAILED', primaryExit: 10 },
          'IO_ERROR',
          11,
        );
        const cleanupError = new RunnerError(11);
        cleanupError.resourceReservation = row;
        throw cleanupError;
      }
      records = readJournal(journal, {
        name: 'resourceAttemptKeySha256',
        value: row.resourceAttemptKeySha256,
      });
    }
    assert(records.length > 0 && ['cleanup_complete', 'failed'].includes(records.at(-1).state), 11);
    if (records.at(-1).state === 'failed') {
      assert(records.at(-1).failureCode === 'IO_ERROR' && records.at(-1).exit === 11, 11);
      const cleanupError = new RunnerError(11);
      cleanupError.resourceReservation = row;
      throw cleanupError;
    }
  });
  const ordinal = entries.length;
  assert(Number.isSafeInteger(ordinal), 11);
  const token = crypto.randomBytes(32).toString('hex');
  const resourceAttemptKeySha256 = resourceAttemptKey({
    modelRunnerIdentitySha256: IDENTITY,
    operationKeySha256: operationIdentity.operationKeySha256,
    resourceAttemptOrdinal: ordinal,
  });
  const row = {
    protocol: 'model-runner-resource-reservation-v3.5',
    modelRunnerIdentitySha256: IDENTITY,
    operationKeySha256: operationIdentity.operationKeySha256,
    resourceAttemptOrdinal: ordinal,
    resourceAttemptKeySha256,
    operation: operationIdentity.operation,
    round: operationIdentity.round,
    startingState,
    tokenDigest: sha256(token),
    device: String(fs.lstatSync(paths.anchor).dev),
    createdAt: atSecond(),
  };
  writeExclusive(path.join(directory, `${ordinal}.json`), row);
  return { ...row, token };
}

function createOwnedResource(paths, reservation) {
  privateDirectory(paths.liveDirectory);
  const directory = path.join(paths.liveDirectory, reservation.tokenDigest);
  fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() &&
    String(stat.dev) === reservation.device, 11);
  writeExclusive(path.join(directory, '.owner-token'), reservation.tokenDigest + '\n');
  return { directory, stat };
}

function removeOwnedResource(directory, reservation) {
  const rootStat = fs.lstatSync(directory);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink() && rootStat.uid === process.getuid() &&
    String(rootStat.dev) === reservation.device, 11);
  const marker = path.join(directory, '.owner-token');
  assert(fs.readFileSync(marker, 'utf8') === reservation.tokenDigest + '\n', 11);
  function remove(current) {
    const currentStat = fs.lstatSync(current);
    assert(!currentStat.isSymbolicLink() && currentStat.dev === rootStat.dev && currentStat.uid === process.getuid(), 11);
    if (currentStat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) remove(path.join(current, entry));
      fs.rmdirSync(current);
    } else {
      assert(currentStat.isFile() && currentStat.nlink === 1, 11);
      fs.unlinkSync(current);
    }
  }
  remove(directory);
  fsyncDirectory(path.dirname(directory));
}

module.exports = {
  IDENTITY,
  appendJournal,
  atomicReplace,
  acquireTaskLock,
  atSecond,
  createOwnedResource,
  fsyncDirectory,
  privateDirectory,
  readJournal,
  releaseTaskLock,
  removeOwnedResource,
  reserveResource,
  runtimePaths,
  writeExclusive,
};
