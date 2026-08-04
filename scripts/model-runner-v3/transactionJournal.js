'use strict';

const { assert } = require('./artifacts');
const { canonicalJson, sha256 } = require('./canonicalJson');

function operationKey({ modelRunnerIdentitySha256, checkpoint, manifestSha256, taskId, operation, inputHead, round }) {
  assert(/^[0-9a-f]{64}$/u.test(modelRunnerIdentitySha256), 12, 'runner identity is required');
  assert(typeof checkpoint === 'string' && checkpoint.length > 0, 12, 'checkpoint is required');
  assert(/^[0-9a-f]{64}$/u.test(manifestSha256), 12, 'manifest hash is required');
  assert(typeof taskId === 'string' && taskId.length > 0, 12, 'taskId is required');
  assert(['make', 'review', 'verify'].includes(operation), 12, 'operation is invalid');
  assert(/^[0-9a-f]{40}$/u.test(inputHead), 12, 'input head is required');
  assert(Number.isSafeInteger(round) && round > 0, 12, 'round is required');
  return sha256(canonicalJson([
    'model-runner-journal-v3.5', modelRunnerIdentitySha256, checkpoint,
    manifestSha256, taskId, operation, inputHead, round,
  ]));
}

function initialOperationRecord(identity) {
  return Object.freeze({
    protocol: 'model-runner-operation-journal-v3.5',
    modelRunnerIdentitySha256: identity.modelRunnerIdentitySha256,
    operationKeySha256: operationKey(identity),
    ...identity,
    state: 'pending',
  });
}

module.exports = { operationKey, initialOperationRecord };
