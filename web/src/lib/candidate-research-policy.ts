/**
 * Candidate technical research needs a point-in-time, 520-session official
 * price history. A deployment can explicitly disable that work when its
 * network cannot obtain the historical official response. This is a
 * fail-closed operational switch: source-hit cards continue to publish, but
 * no stock is reclassified from incomplete price data.
 */
export function isCandidateHistoricalPriceAccessEnabled(value = process.env.CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED) {
  return value !== 'false';
}
