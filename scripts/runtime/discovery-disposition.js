'use strict';

const { invariant } = require('./codec');

function deriveDiscoveryDisposition({ linked, seedSymbols, priorLedger, evidenceHash, sourceAvailable = true, confidence = 1 }) {
  if (!sourceAvailable) return { disposition: 'rejected', reason: 'source_unavailable', researchDisposition: 'not_selected', researchReason: null };
  if (!linked || linked.disposition !== 'linked') return { disposition: 'rejected', reason: linked?.reason ?? 'ambiguous_symbol', researchDisposition: 'not_selected', researchReason: null };
  if (confidence < 0.65) return { disposition: 'rejected', reason: 'low_confidence', researchDisposition: 'not_selected', researchReason: null };
  const prior = priorLedger.find((row) => row.stockId === linked.stockId);
  if (prior?.materialEvidenceHash === evidenceHash) return { disposition: 'unchanged', reason: 'same_material_evidence', researchDisposition: 'not_selected', researchReason: null };
  const inSeed = seedSymbols.includes(linked.symbol);
  return {
    disposition: prior ? 'refreshed' : 'promoted',
    reason: prior ? 'material_source_change' : (inSeed ? 'new_in_seed_symbol' : 'new_out_of_seed_symbol'),
    researchDisposition: 'source_signal_only',
    researchReason: null,
    seedMembership: inSeed ? 'in_seed' : 'out_of_seed',
  };
}

module.exports = { deriveDiscoveryDisposition };
