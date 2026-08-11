'use strict';

const { canonicalJson, sha256 } = require('./codec');

const MATERIAL_MEMBERS = Object.freeze(['sourceEvidence', 'facts', 'priceTrigger', 'technical', 'valuation', 'risk', 'factor']);
const MATERIAL_TAG = 'stockinsider-material-change-v2';
const MATERIAL_REASON_BY_INDEX = Object.freeze([
  'source_evidence_changed', 'financial_fact_changed', 'price_trigger_changed',
  'technical_state_changed', 'valuation_changed', 'risk_changed', 'factor_correctness_changed',
]);

function buildMaterialIdentity(input) {
  return Object.freeze([MATERIAL_TAG, input?.symbol ?? null,
    ...MATERIAL_MEMBERS.map((key) => input?.[key] ?? null)]);
}

function hashMaterialAnalysisChange(input) {
  const identity = buildMaterialIdentity(input);
  return Object.freeze({ materialChangeHash: sha256(canonicalJson(identity)), materialIdentity: identity });
}

function materialChangedReasons(priorIdentity, nextIdentity) {
  if (!Array.isArray(priorIdentity) || priorIdentity[0] !== MATERIAL_TAG) return [];
  if (!Array.isArray(nextIdentity) || nextIdentity[0] !== MATERIAL_TAG) return [];
  return Object.freeze(MATERIAL_REASON_BY_INDEX.filter((_, index) =>
    canonicalJson(priorIdentity[index + 2]) !== canonicalJson(nextIdentity[index + 2])));
}

module.exports = { MATERIAL_MEMBERS, MATERIAL_TAG, buildMaterialIdentity, hashMaterialAnalysisChange,
  materialChangedReasons };
