'use strict';

const { canonicalJson, sha256 } = require('./codec');

const MATERIAL_MEMBERS = Object.freeze(['sourceEvidence', 'facts', 'priceTrigger', 'technical', 'valuation', 'risk', 'factor']);

function hashMaterialAnalysisChange(input) {
  const identity = { schema: 'analysis-material-change-v2', ...Object.fromEntries(MATERIAL_MEMBERS.map((key) => [key, input?.[key] ?? null])) };
  return Object.freeze({ materialChangeHash: sha256(canonicalJson(identity)), materialIdentity: identity });
}

module.exports = { MATERIAL_MEMBERS, hashMaterialAnalysisChange };
