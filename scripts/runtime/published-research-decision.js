'use strict';

const { serializeCorrectnessPublicUnion } = require('./public-projection');

// Production decision-card boundary. Keeping this adapter distinct from the
// closed-union owner makes the caller dependency executable and reviewable.
function serializePublishedResearchDecision(decision) {
  return serializeCorrectnessPublicUnion(decision);
}

module.exports = { serializePublishedResearchDecision };
