import {
  compactRadarEtag,
  legacyCorrectnessProjectionEnabled,
  loadCompactRadarProjection,
  loadCompactRadarDecisionRevision,
  RadarProjectionUnavailableError,
  type CompactRadarProjection,
} from './opportunity-v3/compact-radar-read';

/**
 * Optional published Radar projection.  Legacy route modules only depend on
 * this neutral reader so their response contract remains independent from a
 * feature implementation name and can keep serving legacy data when no
 * compatible projection has been published.
 */
export function loadPublishedRadarProjection(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
): Promise<CompactRadarProjection | null> {
  return loadCompactRadarProjection(window);
}

export function loadPublishedDecisionRevision(symbol: string, decisionRevisionId: string): Promise<CompactRadarProjection | null> {
  return loadCompactRadarDecisionRevision(symbol, decisionRevisionId);
}

export { compactRadarEtag, legacyCorrectnessProjectionEnabled, RadarProjectionUnavailableError };
