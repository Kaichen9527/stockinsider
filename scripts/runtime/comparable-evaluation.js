'use strict';

const { buildComparableRunIdentity } = require('./comparison-identity');

function evaluateComparableRun(input) {
  return Object.freeze({ identity: buildComparableRunIdentity(input), state: 'shadow_only', rows: input.rows ?? [] });
}

module.exports = { evaluateComparableRun };
