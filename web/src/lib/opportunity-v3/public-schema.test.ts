import assert from 'node:assert/strict';
import test from 'node:test';
import type { OpportunityEngineAvailableV3 } from './contracts.ts';
import { validAvailableProjectionPayload } from './public-schema.ts';

const zeroDocumentOutcomes = {
  duplicate_document: 0,
  expired_document: 0,
  parse_failure: 0,
  processed_no_claim: 0,
  processed_with_claims: 0,
};
const zeroMentionOutcomes = {
  linked_new: 0,
  linked_refresh: 0,
  linked_duplicate_claim: 0,
  ambiguous_symbol: 0,
  rejected_low_confidence: 0,
  unsupported_instrument: 0,
};
const zeroMentionReasons = {
  explicit_ticker_context: 0,
  exact_unique_alias_context: 0,
  ambiguous_number: 0,
  ambiguous_alias: 0,
  fuzzy_below_auto_threshold: 0,
  below_min_confidence: 0,
  inactive_or_unknown_symbol: 0,
  missing_stock_context: 0,
  unsupported_market: 0,
  non_common_stock: 0,
  unsupported_instrument_type: 0,
  duplicate_claim_link: 0,
};

function fixture(): OpportunityEngineAvailableV3 {
  const emptyGroup = (reason: 'missing_trend' | 'missing_breadth' | 'missing_flow' | 'missing_derivatives' | 'missing_global') => ({
    status: 'missing' as const,
    score: null,
    inputs: [],
    reason,
  });
  return {
    contractVersion: 'source-led-opportunity-v3.6',
    availability: 'available',
    mode: 'shadow',
    featureVersion: 'source-led-v3.3',
    decisionVersion: 'decision-v3.3',
    runId: '123e4567-e89b-42d3-a456-426614174000',
    sourceRunId: '123e4567-e89b-42d3-a456-426614174001',
    asOf: '2026-07-23T08:00:00Z',
    decisionContext: { mode: 'research_only', personalized: false, sizingVisible: false },
    sourceFunnel: {
      eligibleDocuments: 0,
      selectedDocuments: 0,
      deferredDueScanCap: 0,
      documentOutcomes: { ...zeroDocumentOutcomes },
      extractedClaims: 0,
      claimOutcomes: { unique_claim: 0, duplicate_claim: 0 },
      rawMentions: 0,
      mentionOutcomes: { ...zeroMentionOutcomes },
      mentionReasonCounts: { ...zeroMentionReasons },
      activeCandidateCount: 0,
      shallowPlannedCount: 0,
      shallowSucceededCount: 0,
      shallowFailedCount: 0,
      deferredBeforeShallowCount: 0,
      deepPlannedCount: 0,
      deepSucceededCount: 0,
      deepFailedCount: 0,
      deferredBeforeDeepCount: 0,
      quotaUnderfillReasons: [],
      connectorAccounting: [],
    },
    sourceSignals: [],
    discoveryDelta: {
      asOf: '2026-07-23T08:00:00Z',
      entrants: [], exits: [], continuations: [],
      unchangedReasonCounts: {
        same_material_evidence: 0, duplicate_claim: 0, candidate_cap: 0, shallow_cap: 0, deep_cap: 0,
      },
    },
    marketContext: {
      contractVersion: 'market-context-v3.6',
      regime: 'unknown',
      completeness: 'insufficient',
      composite: null,
      newPositionBudgetPct: 15,
      groupEvidence: {
        trend: emptyGroup('missing_trend'),
        breadth: emptyGroup('missing_breadth'),
        flow: emptyGroup('missing_flow'),
        derivatives: emptyGroup('missing_derivatives'),
        global: emptyGroup('missing_global'),
      },
      missingGroups: ['trend', 'breadth', 'flow', 'derivatives', 'global'],
      overrideReason: null,
      asOf: '2026-07-23T08:00:00Z',
    },
    rankedLanes: [
      {
        horizon: 'momentum_5_20d',
        cards: [{
          symbol: '2330',
          rank: 1,
          score: 78,
          scoreDelta: null,
          formalResearchStatus: 'formal_candidate',
        }],
      },
      { horizon: 'swing_20_60d', cards: [] },
      { horizon: 'thesis_120_250d', cards: [] },
    ],
    actionableNow: [],
    waitingForTrigger: [],
    valuationReview: [],
    verifiedChangeWorkspace: {
      status: 'empty',
      lanes: [
        { key: 'new_verified_change', items: [] },
        { key: 'strengthened_thesis', items: [] },
        { key: 'contradiction_or_review', items: [] },
      ],
    },
    homepageSummary: {
      workspacePath: '/opportunity-v3',
      asOf: '2026-07-23T08:00:00Z',
      status: 'empty',
      totalCount: 0,
      laneCounts: {
        new_verified_change: 0,
        strengthened_thesis: 0,
        contradiction_or_review: 0,
      },
      topItems: [],
    },
    missedSourceAudit: {
      auditedSessionDate: '2026-07-22',
      auditedCloseAt: '2026-07-22T05:30:00Z',
      auditWindowClosesAt: '2026-07-23T05:30:00Z',
      sourceCollectionCutoff: '2026-07-23T08:00:00Z',
      maturity: 'pending',
      moverCount: 0,
      laterMentionedCount: 0,
      sourceRecallPct: null,
      symbols: [],
    },
    engineHealth: {
      status: 'degraded',
      sourceCutoff: '2026-07-23T08:00:00Z',
      acceptanceVersion: '1.46.0',
      modelInfluence: 'none',
      assistiveArtifacts: [],
      warnings: ['market_incomplete', 'shadow_only'],
    },
  };
}

test('available public projection is recursively closed and conservation checked', () => {
  const projection = fixture();
  assert.equal(validAvailableProjectionPayload(projection), true);

  const extraNested = structuredClone(projection);
  (extraNested.marketContext.groupEvidence.trend as typeof extraNested.marketContext.groupEvidence.trend & {
    extra?: boolean;
  }).extra = true;
  assert.equal(validAvailableProjectionPayload(extraNested), false);

  const wrongRank = structuredClone(projection);
  wrongRank.rankedLanes[0].cards[0].rank = 2;
  assert.equal(validAvailableProjectionPayload(wrongRank), false);

  const nonFinite = structuredClone(projection);
  nonFinite.rankedLanes[0].cards[0].score = Number.NaN;
  assert.equal(validAvailableProjectionPayload(nonFinite), false);

  const falseConservation = structuredClone(projection);
  falseConservation.sourceFunnel.documentOutcomes.processed_with_claims = 1;
  assert.equal(validAvailableProjectionPayload(falseConservation), false);

  const wrongLaneOrder = structuredClone(projection);
  wrongLaneOrder.verifiedChangeWorkspace.lanes.reverse();
  assert.equal(validAvailableProjectionPayload(wrongLaneOrder), false);

  const duplicateWarnings = structuredClone(projection);
  duplicateWarnings.engineHealth.warnings = ['shadow_only', 'shadow_only'];
  assert.equal(validAvailableProjectionPayload(duplicateWarnings), false);

  assert.equal(validAvailableProjectionPayload({ ...projection, unexpected: true }), false);
});
