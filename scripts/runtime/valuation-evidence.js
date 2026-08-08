'use strict';

const { unavailable } = require('./codec');

function verifyCompanyValuationEvidence({ stockId, cutoff, evidence = [] }) {
  const cutoffMs = Date.parse(cutoff);
  if (!stockId || !Number.isFinite(cutoffMs)) return unavailable('invalid_evidence_cutoff');
  const valid = evidence.filter((row) => row.stockId === stockId && row.companySpecific === true && Number.isFinite(Date.parse(row.publishedAt)) && Date.parse(row.publishedAt) <= cutoffMs);
  if (!valid.length) return unavailable('unverified_company_evidence');
  return Object.freeze({ availability: 'available', evidence: valid.sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt))) });
}

module.exports = { verifyCompanyValuationEvidence };
