'use strict';

const { assert } = require('./artifacts');

function commitMessage({ changeId, taskId, round, manifestSha256, requestSha256, resultSha256, patchSha256, sourceViewSha256, modelRunnerIdentitySha256 }) {
  for (const value of [manifestSha256, requestSha256, resultSha256, patchSha256, sourceViewSha256, modelRunnerIdentitySha256]) assert(/^[0-9a-f]{64}$/.test(value), 4);
  assert(Number.isSafeInteger(round) && round > 0, 4);
  return 'model-runner-v3: ' + changeId + '/' + taskId + '/make/' + round + '\n\n'
    + 'Manifest-SHA256: ' + manifestSha256 + '\n'
    + 'Request-SHA256: ' + requestSha256 + '\n'
    + 'Result-SHA256: ' + resultSha256 + '\n'
    + 'Patch-SHA256: ' + patchSha256 + '\n'
    + 'Source-View-SHA256: ' + sourceViewSha256 + '\n'
    + 'Runner-Identity-SHA256: ' + modelRunnerIdentitySha256 + '\n';
}

function resultRef(manifestSha256, taskKey, round) {
  assert(/^[0-9a-f]{64}$/.test(manifestSha256) && /^[0-9a-f]{64}$/.test(taskKey) && Number.isSafeInteger(round) && round > 0, 4);
  return 'refs/model-runner-v3/results/' + manifestSha256 + '/' + taskKey + '/make-' + round;
}

module.exports = { commitMessage, resultRef };
