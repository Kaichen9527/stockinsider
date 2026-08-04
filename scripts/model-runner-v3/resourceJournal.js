'use strict';

const { assert } = require('./artifacts');
const { canonicalJson, sha256 } = require('./canonicalJson');

function resourceAttemptKey({ modelRunnerIdentitySha256, operationKeySha256, resourceAttemptOrdinal }) {
  assert(/^[a-f0-9]{64}$/.test(modelRunnerIdentitySha256), 12, 'runner identity is invalid');
  assert(typeof operationKeySha256 === 'string' && /^[a-f0-9]{64}$/.test(operationKeySha256), 12, 'operation key is invalid');
  assert(Number.isSafeInteger(resourceAttemptOrdinal) && resourceAttemptOrdinal >= 0, 12, 'attempt is invalid');
  return sha256(canonicalJson([
    'model-runner-resource-attempt-v3.5',
    modelRunnerIdentitySha256,
    operationKeySha256,
    resourceAttemptOrdinal,
  ]));
}

function initialResourceRecord(identity) {
  return Object.freeze({
    protocol: 'model-runner-resource-journal-v3.5',
    modelRunnerIdentitySha256: identity.modelRunnerIdentitySha256,
    resourceAttemptKeySha256: resourceAttemptKey(identity),
    ...identity,
    state: 'pending',
  });
}

module.exports = { resourceAttemptKey, initialResourceRecord };
