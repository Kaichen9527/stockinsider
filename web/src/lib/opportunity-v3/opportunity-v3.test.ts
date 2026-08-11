import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { canonicalJson, roundHalfAwayFromZero, sha256Canonical } from './canonical.ts';
import { boundedCandidates, fairQuota } from './funnel.ts';
import { marketContext } from './market.ts';
import { percentile, scoreHorizon, type7Quantile, valuationFactor } from './scoring.ts';
import { collapseRevisionFamilies, dedupeClaims, linkMention, normalizeAlias, normalizeCanonicalUrl, sourceAvailability } from './source.ts';
import {
  buildValuationDistribution,
  selectValuationMethod,
  selectVerifiedResearchDistribution,
  verificationFresh,
} from './valuation.ts';
import { actionDecision, formalResearchStatus, validActionDecisionV3 } from './decision.ts';
import { requireInternalPrincipalV3 } from './principal.ts';
import { validSourceEvidence } from './detail-schema.ts';
import { validOpportunityDetailPayload, type OpportunityDetailV3 } from './detail.ts';
import { evaluationConstructibility, productValueMeasures } from './evaluation-readiness.ts';
import {
  comparisonMetrics,
  evaluatePromotion,
  evaluationRunMetrics,
  macroEvaluationMetrics,
  mostRecentDistinctCohorts,
  rankIdenticalCohort,
  relativeImprovement,
} from './evaluation.ts';
import { computeCandidateValuation, executeWorkerPayload } from './worker-executors.ts';
import { applyProductionBiasPrecedence } from './factor-correctness-v311.ts';
import { selectProjectionRunAtCutoff, type ProjectionRunAtCutoffV3 } from './projection.ts';
import { validAvailableProjectionPayload } from './public-schema.ts';
import { COMPARISON_CONTRACT_KEY_V3 } from './config.ts';
import { beginAdHocRun } from './control.ts';
import { layerHomepageOpportunityV3, preserveLegacyRadarV3 } from './deployment.ts';
import { ingestionHandler } from './ingestion.ts';
import {
  mapBlindedReviewRemoteError,
  serializeBlindedReviewSuccess,
} from './blinded-review.ts';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential.ts';
import { runtimeObservationMatchesProducer } from './runtime-health.ts';
import {
  validateBlindedReviewValuesV3,
  validateHumanAuthorityValuesV3,
  validateIngestionValuesV3,
} from './request-values.ts';
import {
  COMPARISON_PREIMAGE_CANONICAL_V3,
  COMPARISON_PREIMAGE_V3,
  STATIC_IDENTITY_MEMBERS_V3,
} from './identity.ts';
import {
  assertNoPublicSizing,
  buildHomepageSummary,
  buildStrategyBakeoff,
  buildVerifiedChangeWorkspace,
  deriveVerifiedChangeBrief,
  toPublicActionDecision,
} from './verified-change.ts';
import type { ReviewerResolutionV3, StrategyCandidateV3 } from './verified-change.ts';
import type {
  ActionDecisionV3,
  CandidateV3,
  FactorKeyV3,
  FactorValueV3,
  HorizonV3,
  MarketGroupV3,
  OpportunityCardV3,
  VerifiedEvidenceRowV3,
  ValuationDistributionV3,
  SectorCycleV3,
} from './contracts.ts';

const valuationFixture = (overrides: Partial<ValuationDistributionV3> = {}): ValuationDistributionV3 => ({
  status: 'normal', method: 'pe', p10: 90, p50: 130, p90: 160,
  bear: { case: 'bear', value: 90, asOf: '2026-07-01T00:00:00Z',
    inputs: [{ key: 'diluted_eps', value: 9, unit: 'TWD_per_share', sourceRef: 'official:earnings', asOf: '2026-07-01T00:00:00Z' }],
    sensitivity: [{ key: 'fundamental', delta: -0.1, result: 81 }, { key: 'fundamental', delta: 0.1, result: 99 },
      { key: 'multiple_or_discount', delta: -0.1, result: 81 }, { key: 'multiple_or_discount', delta: 0.1, result: 99 }] },
  base: { case: 'base', value: 130, asOf: '2026-07-01T00:00:00Z',
    inputs: [{ key: 'diluted_eps', value: 13, unit: 'TWD_per_share', sourceRef: 'official:earnings', asOf: '2026-07-01T00:00:00Z' }],
    sensitivity: [{ key: 'fundamental', delta: -0.1, result: 117 }, { key: 'fundamental', delta: 0.1, result: 143 },
      { key: 'multiple_or_discount', delta: -0.1, result: 117 }, { key: 'multiple_or_discount', delta: 0.1, result: 143 }] },
  bull: { case: 'bull', value: 160, asOf: '2026-07-01T00:00:00Z',
    inputs: [{ key: 'diluted_eps', value: 16, unit: 'TWD_per_share', sourceRef: 'official:earnings', asOf: '2026-07-01T00:00:00Z' }],
    sensitivity: [{ key: 'fundamental', delta: -0.1, result: 144 }, { key: 'fundamental', delta: 0.1, result: 176 },
      { key: 'multiple_or_discount', delta: -0.1, result: 144 }, { key: 'multiple_or_discount', delta: 0.1, result: 176 }] },
  crossChecks: [], confidence: 0.8, reasons: [],
  asOf: '2026-07-01T00:00:00Z', evidenceRefs: [], verificationRef: null, referenceManifestRef: null,
  historicalSampleCount: 8, peerSampleCount: 5,
  historicalReferenceQuantiles: { p10: 8, p50: 10, p90: 12 },
  peerReferenceQuantiles: { p10: 9, p50: 11, p90: 13 },
  ...overrides,
});

describe('internal principal secret mapping', () => {
  it('accepts only a closed, canonical, time-valid principal configuration', () => {
    const priorBearer = process.env.INTERNAL_API_KEY;
    const priorRegistry = process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON;
    const bearer = 'principal-boundary-test';
    const keyId = 'review-key-1';
    const principalId = '00000000-0000-4000-8000-000000000123';
    const hmacKey = 'test-only-principal-hmac-key';
    const rawBody = '{}';
    const path = '/api/internal/source-identity-authority-v3';
    const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const nonce = '0123456789abcdef';
    const signature = createHmac('sha256', hmacKey).update(canonicalJson([
      'internal-principal-v3.8', keyId, principalId, 'POST', path, timestamp, nonce,
      createHash('sha256').update(rawBody, 'utf8').digest('hex'),
    ]), 'utf8').digest('hex');
    const request = new Request(`https://example.test${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'x-stockinsider-key-id': keyId,
        'x-stockinsider-timestamp': timestamp,
        'x-stockinsider-nonce': nonce,
        'x-stockinsider-signature': signature,
      },
      body: rawBody,
    });
    const valid = {
      principalId,
      roles: ['source_reviewer'],
      hmacKey,
      validFrom: '2020-01-01T00:00:00Z',
      validTo: null,
      status: 'active',
    };
    try {
      process.env.INTERNAL_API_KEY = bearer;
      for (const malformed of [
        { ...valid, validFrom: 'not-a-date' },
        { ...valid, validTo: 'not-a-date' },
        { ...valid, roles: ['source_reviewer', 'source_reviewer'] },
        { ...valid, roles: ['unknown_role'] },
        { ...valid, hmacKey: '' },
        { ...valid, unexpected: true },
      ]) {
        process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON = JSON.stringify({ [keyId]: malformed });
        assert.deepEqual(requireInternalPrincipalV3(request, rawBody, path, 'source_reviewer'), { ok: false });
      }
      process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON = JSON.stringify({ [keyId]: valid });
      assert.deepEqual(requireInternalPrincipalV3(request, rawBody, path, 'source_reviewer'), {
        ok: true, principalId, nonce, timestamp,
      });
    } finally {
      if (priorBearer === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = priorBearer;
      if (priorRegistry === undefined) delete process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON;
      else process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON = priorRegistry;
    }
  });
});

const sectorCycleFixture: SectorCycleV3 = {
  contractVersion: 'sector-cycle-v3.0', state: 'unknown',
  levelScore: null, changeScore: null, marketScore: null, matchedRule: 'unavailable',
  inputs: [], reasons: ['missing_level_inputs'], asOf: '2026-07-01T00:00:00Z',
};

describe('durable runtime health identity', () => {
  it('accepts only an observation bound to the latest producer commit, worker and config', () => {
    const producer = { commitSha: 'a'.repeat(40), workerSha256: 'b'.repeat(64),
      schedulerConfigSha256: 'c'.repeat(64) };
    const observation = { producerCommitSha: producer.commitSha, workerSha256: producer.workerSha256,
      schedulerConfigSha256: producer.schedulerConfigSha256 };
    assert.equal(runtimeObservationMatchesProducer(observation, producer), true);
    assert.equal(runtimeObservationMatchesProducer({ ...observation, producerCommitSha: 'd'.repeat(40) }, producer), false);
    assert.equal(runtimeObservationMatchesProducer({ ...observation, workerSha256: 'e'.repeat(64) }, producer), false);
    assert.equal(runtimeObservationMatchesProducer({ ...observation, schedulerConfigSha256: 'f'.repeat(64) }, producer), false);
  });
});

describe('canonical boundary', () => {
  it('sorts object members and rejects non-finite values', () => {
    assert.equal(canonicalJson({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
    assert.equal(sha256Canonical({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
    assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
  });
  it('rounds half away from zero', () => {
    assert.equal(roundHalfAwayFromZero(1.235), 1.24);
    assert.equal(roundHalfAwayFromZero(-1.235), -1.24);
  });
});

describe('control-plane request precedence', () => {
  const endpoint = 'https://stockinsider.invalid/api/internal/opportunity-run';
  const validBody = JSON.stringify({
    mode: 'source_scan',
    sourceCutoff: '2026-07-24T08:00:00Z',
  });

  async function response(
    body: string,
    authorization: string | null,
    init: Omit<RequestInit, 'body' | 'headers' | 'method'> = {},
    url = endpoint,
  ) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (authorization !== null) headers.set('authorization', authorization);
    return beginAdHocRun(new Request(url, {
      ...init,
      method: 'POST',
      headers,
      body,
    }));
  }

  it('rejects method, query and media framing before bearer authentication', async () => {
    const method = await beginAdHocRun(new Request(endpoint, { method: 'GET' }));
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'POST');
    assert.deepEqual(await method.json(), {
      code: 'method_not_allowed',
      error: 'opportunity_control_request_rejected',
    });
    const query = await response(validBody, null, {}, `${endpoint}?dryRun=1`);
    assert.equal(query.status, 422);
    const media = await beginAdHocRun(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: validBody,
    }));
    assert.equal(media.status, 422);
  });

  it('authenticates before parsed object and cutoff validation', async () => {
    const priorKey = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = 'control-test-key';
    try {
      for (const body of [
        '{}',
        '{"mode":"source_scan","sourceCutoff":"bad"}',
        '{"mode":"source_scan","sourceCutoff":"2026-07-24T08:00:00Z","extra":true}',
      ]) {
        const unauthenticated = await response(body, null);
        assert.equal(unauthenticated.status, 403);
        assert.deepEqual(await unauthenticated.json(), {
          code: 'authentication_rejected',
          error: 'opportunity_control_request_rejected',
        });
        const authenticated = await response(body, 'Bearer control-test-key');
        assert.equal(authenticated.status, 422);
        assert.deepEqual(await authenticated.json(), {
          code: 'invalid_request',
          error: 'opportunity_control_request_rejected',
        });
      }
    } finally {
      if (priorKey === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = priorKey;
    }
  });
});

describe('source ingestion and linking', () => {
  it('normalizes aliases and canonical URLs deterministically', () => {
    assert.equal(normalizeAlias('  ＴＳＭＣ 股份有限公司 '), 'tsmc');
    assert.equal(normalizeCanonicalUrl('HTTPS://EXAMPLE.COM/a/?utm_source=x&b=2#fragment'), 'https://example.com/a?b=2');
  });
  it('collapses revision families at cutoff and retains typed failures', () => {
    const common = {
      revisionFamilyKey: 'a'.repeat(64),
      sourceKey: 'threads',
      sourceClass: 'community' as const,
      sourceIdentityAuthorityId: 'authority',
      approvedSourceIdentityId: 'identity',
      stableConnectorDocumentId: 'doc',
      canonicalUrl: null,
      publishedAt: '2026-07-01T00:00:00Z',
      collectedAt: '2026-07-01T01:00:00Z',
      fields: ['2330 台積電'],
    };
    const selected = collapseRevisionFamilies([
      { ...common, revisionId: 'a', recordedAt: '2026-07-01T02:00:00Z', acquisitionStatus: 'complete' },
      { ...common, revisionId: 'b', recordedAt: '2026-07-01T03:00:00Z', acquisitionStatus: 'required_field_missing', fields: [] },
      { ...common, revisionId: 'c', recordedAt: '2026-07-03T03:00:00Z', acquisitionStatus: 'complete' },
    ], '2026-07-02T00:00:00Z');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].revisionId, 'b');
  });
  it('deduplicates exact claims and never fuzzy-autolinks', () => {
    const base = {
      canonicalClaimHash: 'same',
      evidenceRootId: 'root',
      sourceKey: 'threads',
      sourceClass: 'community' as const,
      effectiveAt: '2026-07-01T00:00:00Z',
      text: '台積電',
    };
    assert.equal(dedupeClaims([
      { ...base, claimId: 'a', confidence: 0.5 },
      { ...base, claimId: 'b', confidence: 0.9 },
    ]).unique[0].claimId, 'b');
    const instruments = [{
      stockId: 's', symbol: '2330', exchange: 'TWSE' as const, instrumentType: 'common_stock',
      listingStatus: 'active', officialName: '台積電', sector: 'semiconductor', aliases: ['台積'],
    }];
    assert.equal(linkMention({ token: '2330', context: '股票 2330', explicitTicker: true, stockContext: true }, instruments).symbol, '2330');
    assert.equal(linkMention({ token: '台積模糊', context: '', explicitTicker: false, stockContext: false }, instruments).outcome, 'rejected_low_confidence');
  });
  it('accounts for connector rights and degrades without relaxing eligibility', () => {
    const availability = sourceAvailability([
      { sourceKey: 'mops_material_event', configured: true, access: 'authorized', health: 'ok' },
      { sourceKey: 'threads', configured: true, access: 'expired', health: 'ok' },
      { sourceKey: 'ptt', configured: true, access: 'authorized', health: 'failed' },
    ]);
    assert.equal(availability.status, 'degraded');
    assert.equal(availability.eligibleCount, 1);
    assert.equal(availability.excludedCount, 2);
    assert.equal(availability.sources.find((source) => source.sourceKey === 'threads')?.reason, 'access_expired');
    assert.equal(availability.sources.find((source) => source.sourceKey === 'ptt')?.reason, 'connector_failed');
  });
});

describe('bounded funnel', () => {
  const candidates: CandidateV3[] = Array.from({ length: 80 }, (_, index) => ({
    symbol: String(1000 + index),
    sector: `sector_${index % 4}`,
    anchor: {
      claimId: `claim_${index}`, canonicalClaimHash: `hash_${index}`, evidenceRootId: `root_${index}`,
      sourceKey: index % 2 ? 'threads' : 'mops_material_event',
      sourceClass: index % 2 ? 'community' : 'official', effectiveAt: '2026-07-01T00:00:00Z',
      confidence: 1, text: 'claim',
    },
    claims: [],
    directSource: true,
    preResearchScore: 100 - index,
  }));
  it('enforces 60/30/20/12 bounds', () => {
    const result = boundedCandidates(candidates);
    assert.deepEqual([result.active.length, result.shallow.length, result.deep.length, result.visible.length], [60, 30, 20, 12]);
  });
  it('prevents a single group from consuming a bounded pool', () => {
    const selected = fairQuota(candidates.slice(0, 20), 12, (candidate) => candidate.sector, 0.35);
    const counts = Object.groupBy(selected, (candidate) => candidate.sector);
    assert.ok(Object.values(counts).every((rows) => (rows?.length ?? 0) <= 5));
  });
});

describe('market, scoring and valuation', () => {
  const groups = Object.fromEntries((['trend', 'breadth', 'flow', 'derivatives', 'global'] as MarketGroupV3[])
    .map((group) => [group, { status: 'fresh' as const, score: 70 }])) as Record<MarketGroupV3, { status: 'fresh'; score: number }>;
  it('fails market context closed when core evidence is missing', () => {
    assert.equal(marketContext({ ...groups, trend: { status: 'missing', score: null } }, '2026-07-01T00:00:00Z').regime, 'unknown');
    assert.equal(marketContext(groups, '2026-07-01T00:00:00Z').regime, 'risk_on');
    assert.equal(marketContext({ ...groups, breadth: { status: 'fresh', score: 20 } }, '2026-07-01T00:00:00Z').regime, 'risk_off');
  });
  it('implements Type-7 and midrank percentiles', () => {
    assert.equal(type7Quantile([0, 10], 0.25), 2.5);
    assert.equal(percentile(5, [5]), 50);
  });
  it('does not renormalize missing horizon factors', () => {
    const factors = Object.fromEntries((['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'] as FactorKeyV3[])
      .map((key) => [key, { value: key === 'valuation' ? null : 100, status: key === 'valuation' ? 'missing' : 'fresh' }])) as Record<FactorKeyV3, FactorValueV3>;
    const score = scoreHorizon('momentum_5_20d', factors, 1, 1);
    assert.equal(score.availableWeight, 95);
    assert.equal(score.score, 95);
    assert.equal(valuationFactor(90, 120, 100), 80);
  });
  it('selects methods and hard-blocks extreme distributions', () => {
    assert.equal(selectValuationMethod({ sector: 'finance_insurance', bookValuePerShare: 20, roe: 10 }), 'pb_roe');
    assert.equal(selectValuationMethod({ sector: 'finance_insurance', bookValuePerShare: 20, roe: 10,
      roeSeries: Array(8).fill(10), pbRoeCrossCheckAvailable: true }), 'residual_income');
    assert.equal(selectValuationMethod({ sector: 'construction', netAssetValue: 300, dilutedShares: 10 }), 'nav');
    assert.equal(selectValuationMethod({ sector: 'semiconductor', ttmNetIncome: 5, dilutedEps: 2,
      cycleNetIncome: Array(12).fill(1), evEbitdaCrossCheckAvailable: true }), 'normalized_pe');
    assert.equal(selectValuationMethod({ sector: 'semiconductor', ttmNetIncome: 5, dilutedEps: 2,
      cycleNetIncome: Array(11).fill(1), evEbitdaCrossCheckAvailable: true }), null);
    assert.equal(applyProductionBiasPrecedence({ action: 'wait_trigger', bias20Atr: -3.5,
      technicalState: 'below_support' }), 'wait_trigger');
    assert.equal(applyProductionBiasPrecedence({ action: 'wait_trigger', bias20Atr: -3.5,
      technicalState: 'reclaim_required' }), 'wait_trigger');
    assert.equal(applyProductionBiasPrecedence({ action: 'starter_now', bias20Atr: -3.5,
      technicalState: 'at_support' }), 'avoid');
    const distribution = buildValuationDistribution({
      method: 'pe', fundamentals: [10, 20, 40],
      historicalMultiples: [8, 9, 10, 11, 12, 13, 14, 15],
      peerMultiples: [10, 11, 12, 13, 14],
      currentPrice: 100,
      formulaSourceRef: 'official:earnings', evidenceRefs: ['official:earnings'],
    });
    assert.equal(distribution.status, 'outlier_review');
    assert.ok(distribution.reasons.includes('unverified_base_upside'));
    const ninthFormulaSource = buildValuationDistribution({
      method: 'pe', fundamentals: [1, 1.1, 1.2], historicalMultiples: [8,9,10,11,12,13,14,15],
      peerMultiples: [9,10,11,12,13], currentPrice: 20,
      formulaSourceRef: 'official:formula',
      evidenceRefs: [...Array.from({ length: 8 }, (_, index) => `official:other-${index}`), 'official:formula'],
    });
    assert.equal(ninthFormulaSource.evidenceRefs[0], 'official:formula');
    assert.equal(ninthFormulaSource.evidenceRefs.length, 8);
    assert.deepEqual(buildValuationDistribution({ method: 'pe', fundamentals: [1, 2, 3],
      historicalMultiples: [8,9,10,11,12,13,14,15], peerMultiples: [9,10,11,12,13],
      currentPrice: 20 }).reasons, ['missing_formula_source']);
    const enterprise = buildValuationDistribution({ method: 'ev_ebitda', fundamentals: [100, 120, 140],
      historicalMultiples: [8,9,10,11,12,13,14,15], peerMultiples: [9,10,11,12,13], currentPrice: 100,
      netDebt: 200, dilutedShares: 10, asOf: '2026-07-01T00:00:00Z', formulaSourceRef: 'official:ebitda',
      evidenceRefs: ['official:ebitda'], referenceManifestRef: 'reference:ev-ebitda' });
    assert.deepEqual(enterprise.base?.inputs.map((row) => row.key),
      ['primary_fundamental','selected_multiple','net_debt','diluted_weighted_shares']);
    assert.notEqual(enterprise.base?.sensitivity[0].result,
      roundHalfAwayFromZero(Number(enterprise.base?.value) * 0.9, 2), 'EV sensitivity recomputes before net debt');
    const fact = (key: string, value: number, quarter: number) => {
      const row = Array(18).fill(null); row[1] = key; row[3] = `2026-0${quarter}-30`; row[5] = value;
      row[8] = 'official_filing'; row[9] = `2026-0${quarter}-30T08:00:00Z`;
      row[12] = `official:${key}:${quarter}`; return row;
    };
    const inconsistentFacts = Array.from({ length: 4 }, (_, index) => index + 1).flatMap((quarter) => [
      fact('quarterly_revenue', 100, quarter), fact('quarterly_ebitda', 20, quarter),
      fact('quarterly_gross_profit', 40, quarter), fact('quarterly_operating_expense', 10, quarter),
      fact('quarterly_operating_income', 30, quarter), fact('quarterly_non_operating_income', 5, quarter),
      fact('quarterly_pretax_income', 35, quarter), fact('quarterly_income_tax_expense', 5, quarter),
      fact('quarterly_noncontrolling_interest', 0, quarter),
      fact('quarterly_net_income_attributable_to_common', quarter === 4 ? 300 : 30, quarter),
      fact('diluted_weighted_average_shares', 100, quarter),
    ]);
    assert.deepEqual(computeCandidateValuation({ canonicalSector: 'technology', currentPrice: 100,
      sourceCutoff: '2026-07-01T00:00:00Z', financialFacts: inconsistentFacts }).reasons,
    ['missing_operating_bridge']);
    assert.equal(verificationFresh('2026-06-19T04:00:00Z', '2026-07-19T03:59:59Z'), true);
    assert.equal(verificationFresh('2026-06-19T04:00:00Z', '2026-07-19T04:00:00Z'), false);
  });
  it('selects verified analyst and consensus rows by latest institution and top eight', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      institutionId: `broker-${String(index).padStart(2, '0')}`,
      metric: 'target_price' as const,
      value: 100 + index * 10,
      unit: 'TWD_per_share' as const,
      periodEnd: '2027-06-30',
      sourceTimestamp: `2026-07-${String(20 - index).padStart(2, '0')}T04:00:00Z`,
      recordedAt: `2026-07-${String(20 - index).padStart(2, '0')}T05:00:00Z`,
      evidenceRef: `broker-target:${index}`,
      publisherVerified: true,
      estimateKind: 'broker_consensus' as const,
      estimateHorizon: 'target_12m' as const,
      selectionDisposition: 'eligible_verified_estimate' as const,
    }));
    rows.push({
      ...rows[0],
      value: 999,
      sourceTimestamp: '2026-07-19T04:00:00Z',
      evidenceRef: 'broker-target:superseded',
    });
    const selected = selectVerifiedResearchDistribution({
      observations: rows,
      metric: 'target_price',
      sourceCutoff: '2026-07-24T04:00:00Z',
    });
    assert.equal(selected.retained.length, 8);
    assert.equal(selected.retained[0].evidenceRef, 'broker-target:0');
    assert.ok(selected.excluded.some((row) => row.reason === 'superseded'));
    assert.ok(selected.excluded.some((row) => row.reason === 'top_eight_cap'));
    assert.deepEqual(selected.distribution, { p10: 107, p50: 135, p90: 163 });
  });
});

describe('formal and action separation', () => {
  const factors = Object.fromEntries((['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'] as FactorKeyV3[])
    .map((key) => [key, { value: 80, status: 'fresh' as const }])) as Record<FactorKeyV3, FactorValueV3>;
  const momentum = scoreHorizon('momentum_5_20d', factors, 0.9, 0.9);
  const swing = scoreHorizon('swing_20_60d', factors, 0.9, 0.9);
  const thesis = scoreHorizon('thesis_120_250d', factors, 0.9, 0.9);
  const market = marketContext(Object.fromEntries((['trend', 'breadth', 'flow', 'derivatives', 'global'] as MarketGroupV3[])
    .map((group) => [group, { status: 'fresh', score: 80 }])) as never, '2026-07-01T00:00:00Z');
  it('requires independent formal evidence', () => {
    assert.equal(formalResearchStatus({
      inDeepPool: true, criticalDataInvalid: false,
      valuation: valuationFixture(),
      thesis, sourceConfidence: 0.8, independentClasses: 1, hasOfficialOrResearch: true,
    }), 'insufficient_evidence');
  });
  it('blocks outlier valuation before buy-like action', () => {
    const decision = actionDecision({
      formalStatus: 'formal_candidate', market, momentum, swing,
      valuation: valuationFixture({ status: 'outlier_review', p50: 200, p90: 300, reasons: ['unverified_base_upside'] }),
      sourceClass: 'official', sourceConfidence: 0.9, independentRootCount: 2, criticalDataInvalid: false,
      technicalState: 'at_support', qualityActionEligible: true, biasSafetyObserveOnly: false,
      entryConfirmed: true, technicallyExtended: false, currentPrice: 100,
      p50UpsidePct: 100, p10DownsidePct: -10, liquidityFactor: 70, triggerCapable: true,
      entryTrigger: 'must-not-leak', stopPrice: 90, evidenceExpiresAt: '2026-07-31T00:00:00Z',
    });
    assert.equal(decision.newPositionAction, 'valuation_review');
    assert.equal(decision.publicationEligible, false);
    assert.equal(decision.entryTrigger, null);
    assert.deepEqual(decision.invalidation, { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null });
  });
  it('blocks missing and stale valuation before the verified-event starter branch', () => {
    for (const status of ['missing', 'stale'] as const) {
      const decision = actionDecision({
        formalStatus: 'insufficient_evidence', market, momentum, swing,
        valuation: valuationFixture({ status, method: null, p10: null, p50: null, p90: null,
          confidence: null, reasons: [] }),
        sourceClass: 'official', sourceConfidence: 0.9, independentRootCount: 2,
        technicalState: 'at_support', qualityActionEligible: true, biasSafetyObserveOnly: false,
        criticalDataInvalid: false, entryConfirmed: true, technicallyExtended: false,
        currentPrice: 100, p50UpsidePct: null, p10DownsidePct: null, liquidityFactor: 70,
        triggerCapable: true, entryTrigger: 'verified-event-entry', stopPrice: 90,
        evidenceExpiresAt: '2026-07-31T00:00:00Z',
      });
      assert.equal(decision.newPositionAction, 'valuation_review');
      assert.deepEqual(decision.blockReasons, ['valuation_unavailable']);
      assert.equal(decision.initialPositionPct, 0);
      assert.equal(decision.entryTrigger, null);
      assert.deepEqual(decision.invalidation, { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null });
    }
  });
  it('rejects buy-like decisions when the stop is not below entry or the trigger is empty', () => {
    for (const geometry of [
      { entryTrigger: 'reclaim 100', stopPrice: 100 },
      { entryTrigger: 'reclaim 100', stopPrice: 101 },
      { entryTrigger: '', stopPrice: 90 },
      { entryTrigger: 'reclaim 100', stopPrice: null },
    ] as const) {
      const decision = actionDecision({
        formalStatus: 'formal_candidate', market, momentum, swing,
        valuation: valuationFixture(), sourceClass: 'official', sourceConfidence: 0.9,
        technicalState: 'at_support', qualityActionEligible: true, biasSafetyObserveOnly: false,
        independentRootCount: 2, criticalDataInvalid: false, entryConfirmed: true,
        technicallyExtended: false, currentPrice: 100, p50UpsidePct: 25,
        p10DownsidePct: -8, liquidityFactor: 70, triggerCapable: true,
        entryTrigger: geometry.entryTrigger, stopPrice: geometry.stopPrice,
        evidenceExpiresAt: '2026-07-31T00:00:00Z',
      });
      assert.equal(decision.newPositionAction, 'avoid');
      assert.deepEqual(decision.blockReasons, ['entry_data_unavailable']);
      assert.equal(decision.entryTrigger, null);
      assert.deepEqual(decision.invalidation, { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null });
    }
    const valid = actionDecision({
      formalStatus: 'formal_candidate', market, momentum, swing,
      valuation: valuationFixture(), sourceClass: 'official', sourceConfidence: 0.9,
      technicalState: 'at_support', qualityActionEligible: true, biasSafetyObserveOnly: false,
      independentRootCount: 2, criticalDataInvalid: false, entryConfirmed: true,
      technicallyExtended: false, currentPrice: 100, p50UpsidePct: 25,
      p10DownsidePct: -8, liquidityFactor: 70, triggerCapable: true,
      entryTrigger: 'reclaim 100', stopPrice: 90,
      evidenceExpiresAt: '2026-07-31T00:00:00Z',
    });
    assert.equal(valid.newPositionAction, 'starter_now');
    assert.deepEqual(valid.invalidation, {
      code: 'price_stop_or_evidence_expiry', stopPrice: 90, evidenceExpiresAt: '2026-07-31T00:00:00Z',
    });
  });
  it('fails closed when a caller omits typed technical or quality safety authority', () => {
    const base = {
      formalStatus: 'formal_candidate' as const, market, momentum, swing,
      valuation: valuationFixture(), sourceClass: 'official' as const, sourceConfidence: .9,
      independentRootCount: 2, criticalDataInvalid: false, entryConfirmed: true,
      technicallyExtended: false, currentPrice: 100, p50UpsidePct: 25,
      p10DownsidePct: -8, liquidityFactor: 70, triggerCapable: true,
      entryTrigger: 'entry', stopPrice: 90, evidenceExpiresAt: '2026-07-31T00:00:00Z',
      biasSafetyObserveOnly: false,
    };
    assert.equal(actionDecision({ ...base, technicalState: undefined,
      qualityActionEligible: true } as never).newPositionAction, 'avoid');
    assert.equal(actionDecision({ ...base, technicalState: 'at_support',
      qualityActionEligible: undefined } as never).newPositionAction, 'avoid');
  });
  it('enforces action-owned reasons and primary-horizon nullability at the exact ABI', () => {
    const cutoff = '2026-07-01T00:00:00Z';
    const critical = actionDecision({
      formalStatus: 'insufficient_evidence', market, momentum: null, swing: null,
      valuation: valuationFixture(), sourceClass: 'official', sourceConfidence: 0,
      independentRootCount: 0, criticalDataInvalid: true, entryConfirmed: false,
      technicallyExtended: false, currentPrice: 100, p50UpsidePct: null,
      p10DownsidePct: null, liquidityFactor: null, triggerCapable: false,
      entryTrigger: null, stopPrice: null, evidenceExpiresAt: null,
      technicalState: null, qualityActionEligible: false, biasSafetyObserveOnly: false,
    });
    assert.equal(validActionDecisionV3(critical, { sourceCutoff: cutoff }), true);
    assert.equal(critical.primaryHorizon, null);

    const wait = actionDecision({
      formalStatus: 'formal_watch', market, momentum, swing,
      valuation: valuationFixture(), sourceClass: 'official', sourceConfidence: .9,
      independentRootCount: 2, criticalDataInvalid: false, entryConfirmed: false,
      technicallyExtended: false, currentPrice: 100, p50UpsidePct: 25,
      p10DownsidePct: -8, liquidityFactor: 70, triggerCapable: true,
      entryTrigger: 'breakout 110', stopPrice: null,
      evidenceExpiresAt: '2026-07-31T00:00:00Z', technicalState: 'breakout_pending',
      qualityActionEligible: true, biasSafetyObserveOnly: false,
    });
    assert.equal(validActionDecisionV3(wait, { sourceCutoff: cutoff }), true);
    assert.equal(validActionDecisionV3({ ...wait, primaryHorizon: null }, { sourceCutoff: cutoff }), false);
    assert.equal(validActionDecisionV3({ ...wait, newPositionAction: 'avoid', entryTrigger: null,
      invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null },
      blockReasons: ['missing_required_inputs'] }, { sourceCutoff: cutoff }), false);
    assert.equal(validActionDecisionV3({ ...wait, newPositionAction: 'valuation_review', entryTrigger: null,
      invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null },
      blockReasons: ['valuation_unavailable', 'missing_required_inputs'] }, { sourceCutoff: cutoff }), false);
    assert.equal(validActionDecisionV3({ ...wait, newPositionAction: 'event_starter',
      initialPositionPct: 3, maximumPositionPct: 10, blockReasons: [],
      primaryHorizon: 'swing_20_60d', entryTrigger: 'entry',
      invalidation: { code: 'price_stop_or_evidence_expiry', stopPrice: 90,
        evidenceExpiresAt: '2026-07-31T00:00:00Z' } }, { sourceCutoff: cutoff }), false);
  });
});

describe('hybrid verified-change product boundary', () => {
  const internalDecision: ActionDecisionV3 = {
    decisionAuthority: 'research_only',
    publicationEligible: false,
    newPositionAction: 'starter_now',
    existingPositionAction: 'no_position',
    existingTargetExposurePct: null,
    existingReason: 'portfolio_context_unavailable',
    primaryHorizon: 'swing_20_60d',
    initialPositionPct: 5,
    maximumPositionPct: 10,
    blockReasons: [],
    confidence: 0.8,
    entryTrigger: '{"kind":"market_zone","lower":100,"upper":102}',
    invalidation: { code: 'price_stop_or_evidence_expiry', stopPrice: 90, evidenceExpiresAt: '2026-08-01T00:00:00Z' },
  };
  const card = (symbol: string, scoreDelta: number | null = 8): OpportunityCardV3 => ({
    symbol,
    chineseName: `公司${symbol}`,
    detailPath: `/opportunity-v3/123e4567-e89b-42d3-a456-426614174000/${symbol}`,
    directSource: true,
    candidateState: 'actionable_now',
    primaryHorizon: 'swing_20_60d',
    rank: 1,
    score: 78,
    scoreDelta,
    factorScores: { priceVolume: 80, chip: 70, catalyst: 90, marketSector: 70, fundamental: 85, valuation: 75 },
    factorAxes: {
      discovery: { status: 'continued', reason: null, score: 80 },
      quality: { status: 'unavailable', reason: 'insufficient_quality_inputs', score: null, availableWeight: 0,
        components: { roicOrRoe: null, growthAcceleration: null, marginTrend: null, cashConversionAccruals: null, leverageInterestCover: null, revisions: null }, referenceManifestRef: null },
      valuation: { status: 'valuation_review', score: null, reason: 'valuation_review' },
      timingRisk: { status: 'unavailable', score: null, reason: 'technical_unavailable', shadowBiasPoints: { momentum_5_20d: null, swing_20_60d: null, thesis_120_250d: null } },
    },
    availableWeight: 100,
    sourceRefs: [`ref-${symbol}`],
    sourceSummary: {
      anchorSourceKey: 'mops_material_event',
      anchorSourceClass: 'official',
      anchorEffectiveAt: '2026-07-23T06:00:00Z',
      independentRootCount: 2,
    },
    researchMaturity: 'source_signal',
    fundamental: { thesis: '來源訊號已確認。', latestChange: '已重新評估。', risks: ['資料不足'], evidenceRefs: [`ref-${symbol}`], asOf: '2026-07-23T08:00:00Z' },
    formalResearchStatus: 'formal_candidate',
    actionDecision: toPublicActionDecision(internalDecision),
    valuation: { ...valuationFixture({ evidenceRefs: [`valuation-${symbol}`] }),
      relativeMultiple: {
        exchangeReportedPe: { status: 'unavailable', reason: 'missing_official_pe', value: null, asOf: null, sourceRef: null, manifestRef: null },
        ownHistory: { status: 'unavailable', reason: 'insufficient_own_history', count: 0, p10: null, p25: null, p50: null, p75: null, p90: null, currentPercentile: null, asOf: null, manifestRef: null },
        sector: { status: 'unavailable', reason: 'sector_reference_insufficient', count: 0, p25: null, p50: null, p75: null, capWeightedAggregate: null, asOf: null, manifestRef: null },
        modelComparablePe: null,
      } },
    technicalDecision: { contractVersion: 'opportunity-technical-decision-v3.11.1', availability: 'available', state: 'at_support',
      reason: null, asOf: '2026-07-23T08:00:00Z', currentPrice: 100, support: 95,
      resistance: 110, trigger: null,
      entryZone: { kind: 'market_zone', lower: 100, upper: 102 },
      invalidation: { stop: 90, thesisLevel: 95 }, indicators: {
        ma20: 98, ma60: 96, ma120: 90, rsi14: 55, macd: 1, macdSignal: .8,
        macdHistogram: .2, atr14: 3, volumeRatio20: 1.1,
        relativeStrengthTaiex20: 2, relativeStrengthSector20: null,
      },
      maDeviation: { availability: 'available', reason: null, bias20Pct: 1, bias60Pct: 2,
        bias120Pct: 3, bias20Atr: 0,
        ownHistory: { status: 'unavailable', reason: 'insufficient_own_history', count: 0,
          p10: null, p25: null, p50: null, p75: null, p90: null, label: null, asOf: null, manifestRef: null },
        sector: { status: 'unavailable', reason: 'sector_reference_insufficient', count: 0,
          p10: null, p25: null, p50: null, p75: null, p90: null, asOf: null, manifestRef: null } } },
    sectorCycle: sectorCycleFixture,
    changedBecause: [{ code: 'factor_contribution_changed', factor: 'fundamental', delta: 6 }],
    lastEvaluatedAt: '2026-07-23T08:00:00Z',
    analysisGeneratedAt: '2026-07-23T08:00:00Z',
    materialChangeHash: 'a'.repeat(64),
    materialChangedBecause: ['factor_correctness_changed'],
    noChangeMessage: null,
  });
  const evidence = (symbol: string, sourceClass: 'official' | 'community' = 'official'): VerifiedEvidenceRowV3[] => [{
    sourceSelectionOrdinal: 1,
    claimOrdinal: 1,
    evidenceRef: `ref-${symbol}`,
    evidenceRootId: `root-${symbol}`,
    sourceClass,
    sourceKey: sourceClass === 'official' ? 'mops_material_event' : 'threads',
    effectiveAt: '2026-07-23T06:00:00Z',
    freshness: 'fresh',
    verificationTier: sourceClass === 'official' ? 'publisher_verified' : 'provenance_verified',
    stance: 'supports',
    runId: '123e4567-e89b-42d3-a456-426614174000',
    revisionId: '123e4567-e89b-42d3-a456-426614174010',
    stockId: '123e4567-e89b-42d3-a456-426614174002',
    symbol,
    mentionOutcome: 'linked_new',
  }];

  it('omits every sizing key from public decisions and rejects nested leaks', () => {
    const serialized = toPublicActionDecision(internalDecision);
    assert.equal('initialPositionPct' in serialized, false);
    assert.equal('maximumPositionPct' in serialized, false);
    assert.equal('existingTargetExposurePct' in serialized, false);
    assert.doesNotThrow(() => assertNoPublicSizing({ nested: serialized }));
    assert.throws(() => assertNoPublicSizing({ nested: { initialPositionPct: 5 } }), /forbidden/);
  });

  it('requires exact persisted verification tier and stance on detail evidence', () => {
    const row = {
      ref: 'ref-2330',
      sourceKey: 'mops_material_event',
      sourceClass: 'official',
      effectiveAt: '2026-07-23T06:00:00Z',
      linkReason: 'explicit_ticker_context',
      verificationTier: 'publisher_verified',
      stance: 'supports',
    };
    assert.equal(validSourceEvidence([row]), true);
    assert.equal(validSourceEvidence([{ ...row, verificationTier: undefined }]), false);
    assert.equal(validSourceEvidence([{ ...row, stance: undefined }]), false);
    assert.equal(validSourceEvidence([{ ...row, verificationTier: 'verified' }]), false);
    assert.equal(validSourceEvidence([{ ...row, symbol: '2317' }]), false);
    assert.equal(validSourceEvidence([{ ...row, sourceKey: 'unregistered_source' }]), false);
    assert.equal(validSourceEvidence([{ ...row, extra: true }]), false);
    assert.equal(validSourceEvidence([row], '2026-07-23T05:59:59Z'), false);
    assert.equal(validSourceEvidence([], '2026-07-23T06:00:00Z'), false);
  });

  it('rejects recursively malformed detail cards, horizons and factor tuples', () => {
    const runId = '123e4567-e89b-42d3-a456-426614174000';
    const sourceCutoff = '2026-07-23T08:00:00Z';
    const detailCard = card('2330');
    const detail: OpportunityDetailV3 = {
      contractVersion: 'opportunity-detail-v3.3',
      acceptanceVersion: '1.46.0',
      mode: 'shadow',
      decisionAuthority: 'research_only',
      runId,
      sourceRunId: '123e4567-e89b-42d3-a456-426614174020',
      sourceCutoff,
      symbol: '2330',
      chineseName: '公司2330',
      card: detailCard,
      verifiedChangeBrief: null,
      sourceEvidence: [{
        ref: 'ref-2330',
        sourceKey: 'mops_material_event',
        sourceClass: 'official',
        effectiveAt: '2026-07-23T06:00:00Z',
        linkReason: 'explicit_ticker_context',
        verificationTier: 'publisher_verified',
        stance: 'supports',
      }],
      horizonDetails: (
        ['momentum_5_20d', 'swing_20_60d', 'thesis_120_250d'] as HorizonV3[]
      ).map((horizon) => ({
        horizon,
        rank: 1,
        score: 78,
        scoreConfidence: 0.8,
        availableWeight: 100,
        factors: (
          ['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'] as FactorKeyV3[]
        ).map((key) => ({
          key,
          value: detailCard.factorScores[key],
          contribution: detailCard.factorScores[key],
          status: 'available' as const,
          evidenceRefs: [] as string[],
        })),
      })),
      decisionEvidence: {
        marketContextRef: 'market-ref',
        sectorCycleRef: 'sector-ref',
        financialManifestRef: null,
        scoringManifestRef: 'scoring-ref',
        valuationManifestRef: null,
        blockReasons: [],
      },
      disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE',
    };
    assert.equal(validOpportunityDetailPayload(detail, runId, '2330'), true);
    const mutations: Array<(payload: OpportunityDetailV3 & Record<string, unknown>) => void> = [
      (payload) => { (payload.card as OpportunityCardV3 & { extra?: boolean }).extra = true; },
      (payload) => { payload.card.symbol = '2317'; },
      (payload) => { payload.horizonDetails.pop(); },
      (payload) => { payload.horizonDetails[1].horizon = 'momentum_5_20d'; },
      (payload) => { payload.horizonDetails[0].factors.pop(); },
      (payload) => { payload.horizonDetails[0].factors[0].key = 'valuation'; },
      (payload) => { payload.horizonDetails[0].score = Number.NaN; },
      (payload) => { payload.sourceEvidence[0].ref = 'different-ref'; },
      (payload) => { if (payload.card.valuation.bear) payload.card.valuation.bear.inputs[0].sourceRef = 'broker:untrusted'; },
      (payload) => { payload.card.valuation.base?.sensitivity.pop(); },
      (payload) => { payload.card.candidateState = 'waiting_trigger'; },
      (payload) => {
        payload.card.actionDecision = {
          ...payload.card.actionDecision,
          entryTrigger: null,
          invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null },
        };
      },
      (payload) => { payload.card.primaryHorizon = 'momentum_5_20d'; },
      (payload) => { payload.card.actionDecision.entryTrigger = 'attacker-controlled'; },
      (payload) => { payload.card.actionDecision.invalidation = {
        code: 'price_stop_or_evidence_expiry', stopPrice: 0,
        evidenceExpiresAt: '2026-08-01T00:00:00Z',
      }; },
      (payload) => { payload.card.technicalDecision.entryZone = null; },
      (payload) => { (payload.card.technicalDecision.invalidation as { stop: number }).stop = 100; },
      (payload) => { payload.decisionEvidence.blockReasons = ['unexpected']; },
      (payload) => { payload.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const malformed = structuredClone(detail) as OpportunityDetailV3 & Record<string, unknown>;
      mutate(malformed);
      assert.equal(validOpportunityDetailPayload(malformed, runId, '2330'), false);
    }
  });

  it('derives deterministic brief, lane bounds and sizing-free homepage summary', () => {
    const candidates = Array.from({ length: 24 }, (_, index) => {
      const symbol = String(3000 + index);
      return {
        runId: '123e4567-e89b-42d3-a456-426614174000',
        stockId: '123e4567-e89b-42d3-a456-426614174002',
        candidateOrigin: 'direct_candidate' as const,
        sourceRunId: '123e4567-e89b-42d3-a456-426614174000',
        anchorClaimId: `claim-${symbol}`,
        deepStatus: 'succeeded' as const,
        card: card(symbol),
        anchorSourceClass: 'official' as const,
        anchorEffectiveAt: '2026-07-23T06:00:00Z',
        sourceCutoff: '2026-07-23T08:00:00Z',
        evidenceRows: evidence(symbol),
        priorComparable: null,
      };
    });
    const first = deriveVerifiedChangeBrief(candidates[0]);
    assert.equal(first.changeKind, 'official_event');
    assert.equal(first.headline, '3000 已確認官方事件');
    const workspace = buildVerifiedChangeWorkspace(candidates);
    assert.equal(workspace.status, 'available');
    assert.equal(workspace.lanes[0].items.length, 8);
    assert.ok(workspace.lanes.reduce((sum, lane) => sum + lane.items.length, 0) <= 18);
    const summary = buildHomepageSummary(workspace, '2026-07-23T08:00:00Z');
    assert.equal(summary.topItems.length, 3);
    assert.equal(summary.workspacePath, '/opportunity-v3');
    assert.doesNotThrow(() => assertNoPublicSizing(summary));
  });

  it('assigns contradictions first and computes fixed-order strategy rows with null facts', () => {
    const communityCard = card('4999');
    communityCard.sourceSummary.anchorSourceClass = 'community';
    const candidateInput = {
      runId: '123e4567-e89b-42d3-a456-426614174000',
      stockId: '123e4567-e89b-42d3-a456-426614174002',
      candidateOrigin: 'direct_candidate' as const,
      sourceRunId: '123e4567-e89b-42d3-a456-426614174000',
      anchorClaimId: 'claim-4999',
      deepStatus: 'succeeded' as const,
      card: communityCard,
      anchorSourceClass: 'community' as const,
      anchorEffectiveAt: '2026-07-23T06:00:00Z',
      sourceCutoff: '2026-07-23T08:00:00Z',
      evidenceRows: evidence('4999', 'community'),
      priorComparable: null,
    };
    const workspace = buildVerifiedChangeWorkspace([candidateInput]);
    assert.equal(workspace.lanes[2].items[0].brief.contradictions[0].code, 'missing_official_confirmation');
    const brief = workspace.lanes[2].items[0].brief;
    const runId = candidateInput.runId;
    const evaluationDatasetLockHash = 'a'.repeat(64);
    const comparisonContractKey = 'b'.repeat(64);
    const candidateSnapshotId = '123e4567-e89b-42d3-a456-426614174003';
    const evidenceRootHash = sha256Canonical(candidateInput.evidenceRows);
    const briefInputHash = sha256Canonical(candidateInput);
    const reviewer = {
      resolved: 0,
      total: 0,
      evaluationCutoff: candidateInput.sourceCutoff,
      evaluationInputCutoff: candidateInput.sourceCutoff,
      resolutionCutoff: candidateInput.sourceCutoff,
      evaluationDatasetLockHash,
      comparisonContractKey,
      evaluationInputRows: [{ section: 'backtest_rows' as const, rowOrdinal: 0, enrichRunId: runId }],
      supplyingRuns: [{
        runId,
        mode: 'enrich_rank' as const,
        runPurpose: 'backtest_daily_primary' as const,
        status: 'success' as const,
        evaluationDatasetLockHash,
        comparisonContractKey,
        sourceCutoff: candidateInput.sourceCutoff,
      }],
      populationManifestId: '123e4567-e89b-42d3-a456-426614174004',
      populationManifestHash: 'c'.repeat(64),
      populationRows: [{
        rowOrdinal: 0,
        runId,
        candidateSnapshotId,
        stockId: candidateInput.stockId,
        symbol: '4999',
        evidenceRootHash,
        briefInputHash,
      }],
    };
    const rows = buildStrategyBakeoff([{
      runId,
      candidateSnapshotId,
      stockId: candidateInput.stockId,
      symbol: '4999',
      evidenceRootHash,
      briefInputHash,
      sourceCutoff: candidateInput.sourceCutoff,
      directSource: true,
      candidateOrigin: 'direct_candidate',
      anchorClaimId: '123e4567-e89b-42d3-a456-426614174001',
      deepStatus: 'succeeded',
      evidenceRows: candidateInput.evidenceRows,
      briefDerivationInput: candidateInput,
      brief,
    }, {
      runId,
      candidateSnapshotId: '123e4567-e89b-42d3-a456-426614174005',
      stockId: '123e4567-e89b-42d3-a456-426614174006',
      symbol: '5000',
      evidenceRootHash: 'd'.repeat(64),
      briefInputHash: 'e'.repeat(64),
      sourceCutoff: candidateInput.sourceCutoff,
      directSource: false,
      candidateOrigin: 'comparison_only',
      anchorClaimId: null,
      deepStatus: 'not_reached',
      evidenceRows: [],
      briefDerivationInput: null,
      brief: null,
    }], reviewer);
    assert.deepEqual(rows.map((row) => row.strategy), ['official_only', 'source_led', 'hybrid']);
    assert.equal(rows[0].selectedCount, 0);
    assert.equal(rows[1].selectedCount, 1);
    assert.equal(rows[1].preCapCandidateCount, 1);
    assert.deepEqual(rows[1].selectedCandidateIds, [[runId, '4999']]);
    assert.equal(
      rows[1].preCapOrderedIdentityHash,
      sha256Canonical(['strategy-population-v3.0', [[runId, '4999']]]),
    );
    assert.ok(rows.every((row) => row.excludedCandidateIdsAndReasons.every(
      ([identity]) => identity[1] !== '5000',
    )));
    assert.ok(rows.every((row) => row.facts.includes('insufficient_product_value_evidence')));
    assert.throws(() => buildStrategyBakeoff([{
      runId,
      candidateSnapshotId: '123e4567-e89b-42d3-a456-426614174007',
      stockId: '123e4567-e89b-42d3-a456-426614174008',
      symbol: '5001',
      evidenceRootHash: 'f'.repeat(64),
      briefInputHash: '0'.repeat(64),
      sourceCutoff: candidateInput.sourceCutoff,
      directSource: true,
      candidateOrigin: 'comparison_only',
      anchorClaimId: null,
      deepStatus: 'succeeded',
      evidenceRows: [],
      briefDerivationInput: null,
      brief: null,
    }], reviewer), /origin tuple/);
    assert.throws(() => buildStrategyBakeoff([], {
      ...reviewer,
      evaluationInputRows: [{ section: 'live_rows', rowOrdinal: 0, enrichRunId: 'roster-only-run' }],
    }), /supplying run/);
  });

  it('hashes the complete pre-cap population and retains exactly the first 400 rows', () => {
    const runId = '123e4567-e89b-42d3-a456-426614174100';
    const sourceCutoff = '2026-07-23T08:00:00Z';
    const uuid = (offset: number) =>
      `123e4567-e89b-42d3-a456-${String(426_614_175_000 + offset).padStart(12, '0')}`;
    for (const size of [399, 400, 401]) {
      const candidates: StrategyCandidateV3[] = Array.from({ length: size }, (_, index) => ({
        runId,
        candidateSnapshotId: uuid(index),
        stockId: uuid(500 + index),
        symbol: `T${String(index).padStart(4, '0')}`,
        evidenceRootHash: 'a'.repeat(64),
        briefInputHash: 'b'.repeat(64),
        sourceCutoff,
        directSource: true,
        candidateOrigin: 'direct_candidate',
        anchorClaimId: uuid(1_000 + index),
        deepStatus: 'succeeded',
        evidenceRows: [],
        briefDerivationInput: null,
        brief: null,
      }));
      const reviewer: ReviewerResolutionV3 = {
        resolved: 0,
        total: 0,
        evaluationCutoff: sourceCutoff,
        evaluationInputCutoff: sourceCutoff,
        resolutionCutoff: sourceCutoff,
        evaluationDatasetLockHash: 'c'.repeat(64),
        comparisonContractKey: 'd'.repeat(64),
        evaluationInputRows: [{ section: 'backtest_rows', rowOrdinal: 0, enrichRunId: runId }],
        supplyingRuns: [{
          runId,
          mode: 'enrich_rank',
          runPurpose: 'backtest_daily_primary',
          status: 'success',
          evaluationDatasetLockHash: 'c'.repeat(64),
          comparisonContractKey: 'd'.repeat(64),
          sourceCutoff,
        }],
        populationManifestId: uuid(2_000),
        populationManifestHash: 'e'.repeat(64),
        populationRows: candidates.map((candidate, rowOrdinal) => ({
          rowOrdinal,
          runId,
          candidateSnapshotId: candidate.candidateSnapshotId,
          stockId: candidate.stockId,
          symbol: candidate.symbol,
          evidenceRootHash: candidate.evidenceRootHash,
          briefInputHash: candidate.briefInputHash,
        })),
      };
      const identities = candidates.map(
        (candidate): [string, string] => [candidate.runId, candidate.symbol],
      );
      const rows = buildStrategyBakeoff(candidates, reviewer);
      for (const row of rows) {
        assert.equal(row.preCapCandidateCount, size);
        assert.equal(row.retainedCandidateCount, Math.min(size, 400));
        assert.equal(row.deferredDueStrategyEvidenceCap, Math.max(size - 400, 0));
        assert.equal(
          row.preCapOrderedIdentityHash,
          sha256Canonical(['strategy-population-v3.0', identities]),
        );
        assert.equal(
          row.selectedCandidateIds.length + row.excludedCandidateIdsAndReasons.length,
          Math.min(size, 400),
        );
        assert.deepEqual(
          row.excludedCandidateIdsAndReasons.map(([identity]) => identity),
          identities.slice(0, 400),
        );
      }
    }
  });
});

describe('evaluation and product-value readiness', () => {
  it('ranks one identical cohort and reproduces Precision, NDCG and Type-7 MAE', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      symbol: String(2300 + index),
      score: index === 19 ? null : index < 2 ? 90 : 80 - index,
      confidence: index === 0 ? 0.8 : index === 1 ? 0.9 : 0.5,
      relevant: index < 4,
      grade: (index === 0 ? 3 : index === 1 ? 2 : index < 4 ? 1 : 0) as 0 | 1 | 2 | 3,
      mae20Pct: -index,
    }));
    assert.deepEqual(rankIdenticalCohort(rows).slice(0, 2).map(({ symbol }) => symbol), ['2301', '2300']);
    assert.equal(rankIdenticalCohort(rows).at(-1)?.symbol, '2319');
    const metrics = evaluationRunMetrics(rows);
    assert.equal(metrics.precisionAt20, 0.2);
    assert.equal(metrics.ndcgAt20 > 0 && metrics.ndcgAt20 < 1, true);
    assert.equal(metrics.worstDecileMae20Pct, -17.1);
    assert.deepEqual(macroEvaluationMetrics([rows, rows]), {
      precisionAt20: metrics.precisionAt20,
      ndcgAt20: metrics.ndcgAt20,
      worstDecileMae20Pct: metrics.worstDecileMae20Pct,
    });
    assert.equal(relativeImprovement(0.55, 0.5), 0.1);
  });

  it('computes V3 and legacy metrics from the same supplied cohort', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      symbol: String(2300 + index),
      v3Rank: index + 1,
      legacyRank: 10 - index,
      relevant: index < 5,
      grade: (index < 2 ? 3 : index < 5 ? 2 : 0) as 0 | 1 | 2 | 3,
      mae20Pct: -index,
    }));
    const result = comparisonMetrics([rows]);
    assert.equal(result.v3Metrics.precisionAt20, 0.5);
    assert.equal(result.legacyMetrics.precisionAt20, 0.5);
    assert.ok(result.v3Metrics.ndcgAt20 > result.legacyMetrics.ndcgAt20);
    assert.equal(result.v3Metrics.worstDecileMae20Pct, -8.1);
    assert.equal(result.legacyMetrics.worstDecileMae20Pct, -8.1);
  });

  it('keeps partial maturity fail-closed and requires every promotion conjunct', () => {
    const metrics = {
      precisionAt20: 0.55,
      ndcgAt20: 0.66,
      worstDecileMae20Pct: -9,
    };
    assert.deepEqual(evaluatePromotion({
      backtestCount: 119,
      liveCount: 19,
      v3Metrics: null,
      legacyMetrics: null,
      linkPrecision: null,
      linkRecall: null,
      acceptancePassed: true,
      securityPassed: true,
      operationsPassed: true,
    }).mode, 'shadow');
    const passed = evaluatePromotion({
      backtestCount: 120,
      liveCount: 20,
      v3Metrics: metrics,
      legacyMetrics: {
        precisionAt20: 0.5,
        ndcgAt20: 0.6,
        worstDecileMae20Pct: -8,
      },
      linkPrecision: 0.95,
      linkRecall: 0.9,
      acceptancePassed: true,
      securityPassed: true,
      operationsPassed: true,
    });
    assert.equal(passed.pass, true);
    assert.equal(passed.mode, 'eligible_for_promotion');
    assert.equal(evaluatePromotion({
      backtestCount: 120,
      liveCount: 20,
      v3Metrics: metrics,
      legacyMetrics: {
        precisionAt20: 0.5,
        ndcgAt20: 0.6,
        worstDecileMae20Pct: -8,
      },
      linkPrecision: 0.949999,
      linkRecall: 0.9,
      acceptancePassed: true,
      securityPassed: true,
      operationsPassed: true,
    }).pass, false);
  });

  it('selects exact most-recent distinct cohorts and rejects duplicate dates', () => {
    const rows = Array.from({ length: 22 }, (_, index) => ({
      tradingDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
      maturitySession: `2026-07-${String(index + 1).padStart(2, '0')}`,
    }));
    const selected = mostRecentDistinctCohorts(rows, 20);
    assert.equal(selected.length, 20);
    assert.equal(selected[0].tradingDate, '2026-06-03');
    assert.throws(() => mostRecentDistinctCohorts([...rows, rows[0]], 20), /duplicate/u);
  });

  it('blocks rather than fabricates an incomplete 120-date point-in-time corpus', () => {
    const rows = Array.from({ length: 119 }, (_, index) => ({
      evaluationDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      sourceCutoff: new Date(Date.UTC(2026, 0, index + 1, 8)).toISOString().replace('.000Z', 'Z'),
      snapshotRecordedAt: new Date(Date.UTC(2026, 0, index + 1, 7)).toISOString().replace('.000Z', 'Z'),
      directCandidateCount: 1,
      immutableInputHash: index.toString(16).padStart(64, '0'),
    }));
    assert.deepEqual(evaluationConstructibility(rows), {
      status: 'blocked',
      requiredDates: 120,
      observedDates: 119,
      missingDates: 1,
      reasons: ['insufficient_historical_dates'],
    });
    assert.equal(evaluationConstructibility([
      ...rows,
      {
        evaluationDate: '2026-05-01',
        sourceCutoff: '2026-05-01T08:00:00Z',
        snapshotRecordedAt: '2026-05-01T07:00:00Z',
        directCandidateCount: 0,
        immutableInputHash: 'f'.repeat(64),
      },
    ]).status, 'constructible');
  });

  it('computes bounded feedback measures without persistent or portfolio state', () => {
    const viewer = 'a'.repeat(64);
    const measures = productValueMeasures([
      {
        viewerHash: viewer, symbol: '2330', shownAt: '2026-07-24T08:10:00Z',
        evidenceEffectiveAt: '2026-07-24T08:00:00Z', action: 'shown',
        trustScore: 4, decisionUsefulnessScore: 5,
      },
      {
        viewerHash: viewer, symbol: '2330', shownAt: '2026-07-25T08:30:00Z',
        evidenceEffectiveAt: '2026-07-25T08:00:00Z', action: 'shown',
        trustScore: 5, decisionUsefulnessScore: 4,
      },
      {
        viewerHash: viewer, symbol: '2330', shownAt: '2026-07-25T08:30:00Z',
        evidenceEffectiveAt: '2026-07-25T08:00:00Z', action: 'saved',
        trustScore: null, decisionUsefulnessScore: null,
      },
    ]);
    assert.equal(measures.evidenceLeadTimeMinutesP50, 20);
    assert.equal(measures.saveRate, 0.5);
    assert.equal(measures.repeatedUseRate, 1);
    assert.equal(measures.trustScoreP50, 4.5);
  });
});

describe('blinded review serialization', () => {
  const assignmentRow = (overrides: Record<string, unknown> = {}) => ({
    disposition: 'reviewer_open_slot',
    sample_manifest_id: '123e4567-e89b-42d3-a456-426614170301',
    sample_id: 'sample-1',
    review_source_key: 'threads',
    evidence_ref: 'evidence-1',
    review_context: '2330 股票營收成長',
    review_mention_start_offset: 0,
    review_mention_end_offset: 4,
    normalized_token: '2330',
    link_mode: 'ticker',
    engine_outcome: 'linked_new',
    engine_reason: 'explicit_ticker_context',
    engine_canonical_symbol: '2330',
    review_evidence_hash: 'a'.repeat(64),
    assigned_label_role: 'reviewer_1',
    own_canonical_symbol: null,
    own_no_link: null,
    reviewer_one_canonical_symbol: null,
    reviewer_one_no_link: null,
    reviewer_two_canonical_symbol: null,
    reviewer_two_no_link: null,
    ...overrides,
  });

  it('maps exact assignment and label rows while rejecting reviewer-label disclosure', () => {
    const reviewer = serializeBlindedReviewSuccess(
      'assignment',
      false,
      assignmentRow(),
    );
    assert.deepEqual(reviewer, {
      disposition: 'reviewer_open_slot',
      sampleManifestId: '123e4567-e89b-42d3-a456-426614170301',
      sampleId: 'sample-1',
      reviewEvidence: {
        sourceKey: 'threads',
        evidenceRef: 'evidence-1',
        reviewContext: '2330 股票營收成長',
        mentionStartOffset: 0,
        mentionEndOffset: 4,
        normalizedToken: '2330',
        linkMode: 'ticker',
        engineOutcome: 'linked_new',
        engineReason: 'explicit_ticker_context',
        engineCanonicalSymbol: '2330',
        reviewEvidenceHash: 'a'.repeat(64),
      },
      assignedLabelRole: 'reviewer_1',
      ownCanonicalSymbol: null,
      ownNoLink: null,
      reviewerOneCanonicalSymbol: null,
      reviewerOneNoLink: null,
      reviewerTwoCanonicalSymbol: null,
      reviewerTwoNoLink: null,
    });
    assert.equal(serializeBlindedReviewSuccess(
      'assignment',
      false,
      assignmentRow({
        reviewer_one_canonical_symbol: '2330',
        reviewer_one_no_link: false,
      }),
    ), null);
    assert.notEqual(serializeBlindedReviewSuccess(
      'assignment',
      true,
      assignmentRow({
        disposition: 'adjudicator_open',
        assigned_label_role: 'adjudicator',
        reviewer_one_canonical_symbol: '2330',
        reviewer_one_no_link: false,
        reviewer_two_canonical_symbol: null,
        reviewer_two_no_link: true,
      }),
    ), null);
    assert.deepEqual(serializeBlindedReviewSuccess('label', false, {
      sample_manifest_id: '123e4567-e89b-42d3-a456-426614170301',
      sample_id: 'sample-1',
      label_role: 'reviewer_1',
      label_hash: 'b'.repeat(64),
      submitted_at: '2026-07-26T08:00:00Z',
    }), {
      sampleManifestId: '123e4567-e89b-42d3-a456-426614170301',
      sampleId: 'sample-1',
      labelRole: 'reviewer_1',
      labelHash: 'b'.repeat(64),
      submittedAt: '2026-07-26T08:00:00Z',
    });
  });

  it('maps remote PostgREST credential rejection to the closed service-unavailable response', () => {
    assert.equal(
      isPreFunctionCredentialRejectionV3(401, { code: 'PGRST301' }),
      true,
    );
    assert.equal(
      isPreFunctionCredentialRejectionV3(403, { code: '42501' }),
      true,
    );
    assert.equal(
      isPreFunctionCredentialRejectionV3(403, { code: 'PT403' }),
      false,
    );
    assert.deepEqual(
      mapBlindedReviewRemoteError(401, 'PGRST301', 'invalid jwt'),
      { code: 'v3_service_role_unavailable', status: 503 },
    );
    assert.deepEqual(
      mapBlindedReviewRemoteError(403, '42501', 'permission denied'),
      { code: 'v3_service_role_unavailable', status: 503 },
    );
    assert.deepEqual(
      mapBlindedReviewRemoteError(403, 'PT403', 'principal_role_unavailable'),
      { code: 'authentication_rejected', status: 403 },
    );
    assert.deepEqual(
      mapBlindedReviewRemoteError(409, 'PT409', 'adjudication_completed'),
      { code: 'adjudication_completed', status: 409 },
    );
  });
});

describe('closed HTTP body value schemas', () => {
  it('keeps legacy radar arrays and ordering byte-identical when V3 shadow display is enabled', async () => {
    const legacy = {
      opportunities: [{ symbol: '2330' }, { symbol: '2454' }],
      scenarioUpsideCandidates: [{ symbol: '2308' }],
      earlyWatchlist: [{ symbol: '2317' }, { symbol: '2382' }],
      recentFormal7d: [{ symbol: '2881' }],
      fallbackOpportunities90d: [{ symbol: '2891' }, { symbol: '2882' }],
      hotTracking: [{ symbol: '2603' }],
    };
    const before = canonicalJson(legacy);
    const shadow = preserveLegacyRadarV3(legacy);
    assert.equal(shadow, legacy);
    assert.equal(canonicalJson(shadow), before);
    assert.deepEqual(
      Object.fromEntries(Object.entries(shadow).map(([key, rows]) => [
        key,
        rows.map((row) => row.symbol),
      ])),
      {
        opportunities: ['2330', '2454'],
        scenarioUpsideCandidates: ['2308'],
        earlyWatchlist: ['2317', '2382'],
        recentFormal7d: ['2881'],
        fallbackOpportunities90d: ['2891', '2882'],
        hotTracking: ['2603'],
      },
    );
    const shadowEngine = { runId: 'shadow-run-1', lanes: [] };
    let shadowLoads = 0;
    const layered = await layerHomepageOpportunityV3({
      legacyRadar: legacy,
      loadShadowEngine: async () => {
        shadowLoads += 1;
        return shadowEngine;
      },
      shadowEnabled: true,
    });
    assert.equal(shadowLoads, 1);
    assert.equal(layered.radar, legacy);
    assert.equal(layered.opportunityEngineV3, shadowEngine);
    assert.equal(canonicalJson(layered.radar), before);
    const root = path.basename(process.cwd()) === 'web'
      ? process.cwd()
      : path.join(process.cwd(), 'web');
    const pageSource = readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
    assert.match(
      pageSource,
      /const publishedRadar = await loadPublishedRadarProjection\('home'\);[\s\S]*const legacyRadar = \(publishedRadar \?\? await getDailyRadarData\(\)\)[\s\S]*layerHomepageOpportunityV3\(\{[\s\S]*legacyRadar,[\s\S]*loadShadowEngine:[\s\S]*shadowEnabled: v3PublicEnabled\(\),/u,
    );
    assert.match(pageSource, /\(radar\.reports \|\| \[\]\)\.filter/u);
    assert.match(pageSource, /\(sourceHealth\?\.connectorDetails \|\| \[\]\)\.filter/u);
    assert.ok(
      pageSource.indexOf('<ShadowOpportunityV3') <
        pageSource.indexOf('<RadarTabs radar={radar}'),
    );
    for (const route of [
      'src/app/api/radar/daily/route.ts',
      'src/app/api/radar/hot/route.ts',
      'src/app/api/radar/weekly/route.ts',
    ]) {
      const source = readFileSync(path.join(root, route), 'utf8');
      assert.doesNotMatch(source, /opportunity-v3|SOURCE_LED_OPPORTUNITY_V3/u);
    }
  });

  it('rejects key-correct but type-invalid human and blinded bodies before RPC work', () => {
    assert.equal(validateHumanAuthorityValuesV3(
      'append_source_identity_authority_v3',
      {
        sourceIdentityId: 7,
        sourceKey: [],
        sourceClass: false,
        distributionIdentity: {},
        validFrom: 1,
        validTo: 'later',
        status: 'unknown',
      },
    ), false);
    assert.equal(validateBlindedReviewValuesV3(
      'assignment',
      false,
      { sampleManifestId: 7, sampleId: [] },
    ), false);
    assert.equal(validateBlindedReviewValuesV3(
      'label',
      false,
      {
        sampleManifestId: '00000000-0000-4000-8000-000000000001',
        sampleId: 'sample-001',
        labelRole: 'reviewer_1',
        canonicalSymbol: '2330',
        noLink: false,
      },
    ), true);
    assert.equal(validateBlindedReviewValuesV3(
      'label',
      false,
      {
        sampleManifestId: '00000000-0000-4000-8000-000000000001',
        sampleId: 'sample-001',
        labelRole: 'reviewer_1',
        canonicalSymbol: '233',
        noLink: false,
      },
    ), false);
  });

  it('enforces every ingestion route owning-contract cross-field before RPC acquisition', () => {
    const rawFieldPayload = ['2330', '', ''];
    const sourceRevision = {
      sourceIdentityAuthorityId: '00000000-0000-4000-8000-000000000001',
      stableConnectorDocumentId: 'threads:post-1',
      canonicalUrlCandidate: 'https://example.com/post-1',
      publishedAt: '2026-07-24T07:00:00Z',
      collectedAt: '2026-07-24T07:01:00Z',
      adapterVersion: 'source-adapter-v3.3',
      acquisitionStatus: 'complete',
      rawFieldPayload,
      rawCodePointCount: 4,
      rawFieldPayloadAlgorithmVersion: 'raw-field-payload-v3.0',
      ingestionContentRevisionSha256: sha256Canonical({
        version: 'raw-field-payload-v3.0',
        adapterVersion: 'source-adapter-v3.3',
        fields: rawFieldPayload,
      }),
      canonicalContentAlgorithmVersion: 'canonical-content-v3.0',
      ingestionCanonicalContentHashV3: '2'.repeat(64),
      supersedesRevisionId: null,
    };
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      sourceRevision,
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      { ...sourceRevision, acquisitionStatus: 'invalid_utf8' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      { ...sourceRevision, rawCodePointCount: 5 },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      { ...sourceRevision, ingestionContentRevisionSha256: '1'.repeat(64) },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      { ...sourceRevision, rawFieldPayloadAlgorithmVersion: 'raw-field-payload-v3.1' },
    ), false);
    const compatibilityExpansion = '\u337F'.repeat(100_000);
    const expandingPayload = [compatibilityExpansion, '', ''];
    assert.equal(validateIngestionValuesV3(
      'append_source_document_revision_v3',
      {
        ...sourceRevision,
        rawFieldPayload: expandingPayload,
        rawCodePointCount: 100_000,
        ingestionContentRevisionSha256: sha256Canonical({
          version: 'raw-field-payload-v3.0',
          adapterVersion: 'source-adapter-v3.3',
          fields: expandingPayload,
        }),
      },
    ), false);

    const roster = {
      stockId: '00000000-0000-4000-8000-000000000001',
      symbol: '2330',
      exchange: 'TWSE',
      instrumentType: 'common_stock',
      listingStatus: 'active',
      officialLegalName: '台灣積體電路製造股份有限公司',
      officialShortName: '台積電',
      provider: 'twse',
      sourceTimestamp: '2026-07-24T07:00:00Z',
      validFrom: '2026-07-24T07:00:00Z',
      validTo: null,
      rosterVersion: 'tw-instrument-roster-v3.0',
    };
    assert.equal(validateIngestionValuesV3(
      'append_instrument_roster_authority_v3',
      roster,
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_instrument_roster_authority_v3',
      { ...roster, provider: 'tpex' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_instrument_roster_authority_v3',
      { ...roster, officialLegalName: null },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_instrument_roster_authority_v3',
      { ...roster, rosterVersion: 'tw-instrument-roster-v3.1' },
    ), false);

    const sector = {
      stockId: roster.stockId,
      market: 'TWSE',
      officialIndustryCode: '24',
      canonicalSectorKey: 'semiconductor',
      provider: 'twse',
      sourceTimestamp: '2026-07-24T07:00:00Z',
      validFrom: '2026-07-24T07:00:00Z',
      validTo: null,
      taxonomyVersion: 'tw-sector-taxonomy-v3.0',
      status: 'active',
    };
    assert.equal(validateIngestionValuesV3(
      'append_stock_sector_assignment_v3',
      sector,
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_stock_sector_assignment_v3',
      { ...sector, taxonomyVersion: 'v-next' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_stock_sector_assignment_v3',
      { ...sector, canonicalSectorKey: 'finance_insurance' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_stock_sector_assignment_v3',
      { ...sector, officialIndustryCode: '99', canonicalSectorKey: 'unknown' },
    ), true);

    const session = {
      sessionId: '2026-07-24',
      market: 'TWSE',
      openAt: '2026-07-24T01:00:00Z',
      closeAt: '2026-07-24T05:30:00Z',
      status: 'completed',
      provider: 'twse',
      sourceTimestamp: '2026-07-24T05:31:00Z',
      collectedAt: '2026-07-24T05:32:00Z',
      sourceRef: 'twse:calendar:20260724',
    };
    assert.equal(validateIngestionValuesV3('append_trading_session_v3', session), true);
    assert.equal(validateIngestionValuesV3(
      'append_trading_session_v3',
      { ...session, closeAt: session.openAt },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_trading_session_v3',
      { ...session, sessionId: '2026-07-23' },
    ), false);

    const market = {
      factKey: 'above_ma20',
      scopeKey: 'TWSE_ACTIVE_COMMON',
      sessionId: '2026-07-24',
      sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
      value: 50,
      unit: 'percentage_points',
      provider: 'twse',
      providerIdentity: null,
      breadthNumeratorCount: 400,
      breadthObservedCount: 800,
      breadthEligibleCount: 900,
      breadthRosterManifestId: '00000000-0000-4000-8000-000000000003',
      breadthRosterManifestHash: '3'.repeat(64),
      observedAt: '2026-07-24T05:30:00Z',
      collectedAt: '2026-07-24T05:31:00Z',
      sourceRef: 'twse:breadth:20260724',
      providerRevision: 'v1',
    };
    assert.equal(validateIngestionValuesV3('append_market_observation_v3', market), true);
    assert.equal(validateIngestionValuesV3(
      'append_market_observation_v3',
      { ...market, providerIdentity: 'caller-selected' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_market_observation_v3',
      { ...market, value: 51 },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_market_observation_v3',
      { ...market, sessionId: null, sessionAuthorityId: null },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_market_observation_v3',
      {
        ...market,
        factKey: 'taiex_close',
        scopeKey: 'TAIEX',
        value: 0,
        unit: 'index_points',
        breadthNumeratorCount: null,
        breadthObservedCount: null,
        breadthEligibleCount: null,
        breadthRosterManifestId: null,
        breadthRosterManifestHash: null,
      },
    ), false);

    const flow = {
      stockId: roster.stockId,
      exchange: 'TWSE',
      sessionId: '2026-07-24',
      sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
      factKey: 'sbl_short_balance_shares',
      value: 100,
      unit: 'shares',
      provider: 'twse',
      sourceTimestamp: '2026-07-24T05:30:00Z',
      collectedAt: '2026-07-24T05:31:00Z',
      sourceRef: 'twse:sbl:2330:20260724',
      providerRevision: 'v1',
    };
    assert.equal(validateIngestionValuesV3(
      'append_stock_flow_observation_v3',
      flow,
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_stock_flow_observation_v3',
      { ...flow, unit: 'TWD' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_stock_flow_observation_v3',
      { ...flow, provider: 'tpex' },
    ), false);
  });

  it('returns the same deterministic 422 for every route cross-field failure before client work', async () => {
    const priorKey = process.env.INTERNAL_API_KEY;
    const priorPrincipal = process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID;
    process.env.INTERNAL_API_KEY = 'route-cross-field-test';
    process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID =
      '00000000-0000-4000-8000-000000000001';
    const uuidValue = '00000000-0000-4000-8000-000000000002';
    const cases = [
      ['source-document-revision-v3', 'append_source_document_revision_v3', {
        sourceIdentityAuthorityId: uuidValue, stableConnectorDocumentId: 'doc-1',
        canonicalUrlCandidate: null, publishedAt: null, collectedAt: '2026-07-24T07:00:00Z',
        adapterVersion: 'source-adapter-v3.3', acquisitionStatus: 'complete',
        rawFieldPayload: null, rawCodePointCount: 0,
        rawFieldPayloadAlgorithmVersion: 'raw-v3.3',
        ingestionContentRevisionSha256: null,
        canonicalContentAlgorithmVersion: 'canonical-v3.3',
        ingestionCanonicalContentHashV3: null, supersedesRevisionId: null,
      }],
      ['instrument-roster-v3', 'append_instrument_roster_authority_v3', {
        stockId: uuidValue, symbol: '2330', exchange: 'TWSE',
        instrumentType: 'common_stock', listingStatus: 'active',
        officialLegalName: '台灣積體電路製造股份有限公司', officialShortName: '台積電',
        provider: 'tpex', sourceTimestamp: '2026-07-24T07:00:00Z',
        validFrom: '2026-07-24T07:00:00Z', validTo: null,
        rosterVersion: 'tw-instrument-roster-v3.0',
      }],
      ['stock-sector-assignment-v3', 'append_stock_sector_assignment_v3', {
        stockId: uuidValue, market: 'TWSE', officialIndustryCode: '24',
        canonicalSectorKey: 'semiconductor', provider: 'twse',
        sourceTimestamp: '2026-07-24T07:00:00Z',
        validFrom: '2026-07-24T07:00:00Z', validTo: null,
        taxonomyVersion: 'v-next', status: 'active',
      }],
      ['trading-session-v3', 'append_trading_session_v3', {
        sessionId: '2026-07-24', market: 'TWSE',
        openAt: '2026-07-24T05:30:00Z', closeAt: '2026-07-24T05:30:00Z',
        status: 'completed', provider: 'twse',
        sourceTimestamp: '2026-07-24T05:31:00Z',
        collectedAt: '2026-07-24T05:32:00Z', sourceRef: 'twse:calendar',
      }],
      ['price-authority-v3', 'append_price_authority_v3', {
        kind: 'raw_price', rawPrice: null, corporateActionSnapshot: null,
        exchangeReportedPe: null,
      }],
      ['market-observation-v3', 'append_market_observation_v3', {
        factKey: 'above_ma20', scopeKey: 'TWSE_ACTIVE_COMMON',
        sessionId: '2026-07-24', sessionAuthorityId: uuidValue,
        value: 50, unit: 'percentage_points', provider: 'twse',
        providerIdentity: 'caller-selected', breadthNumeratorCount: 400,
        breadthObservedCount: 800, breadthEligibleCount: 900,
        breadthRosterManifestId: '00000000-0000-4000-8000-000000000003',
        breadthRosterManifestHash: '3'.repeat(64),
        observedAt: '2026-07-24T05:30:00Z', collectedAt: '2026-07-24T05:31:00Z',
        sourceRef: 'twse:breadth', providerRevision: 'v1',
      }],
      ['stock-flow-observation-v3', 'append_stock_flow_observation_v3', {
        stockId: uuidValue, exchange: 'TWSE', sessionId: '2026-07-24',
        sessionAuthorityId: uuidValue, factKey: 'sbl_short_balance_shares',
        value: 100, unit: 'TWD', provider: 'twse',
        sourceTimestamp: '2026-07-24T05:30:00Z',
        collectedAt: '2026-07-24T05:31:00Z',
        sourceRef: 'twse:sbl', providerRevision: 'v1',
      }],
      ['financial-fact-v3', 'append_financial_fact_v3', {
        stockId: uuidValue, factKey: 'book_value_per_share', periodStart: null,
        periodEnd: '2026-06-30', durationKind: 'instant', value: 42,
        unit: 'TWD_per_share', provider: 'mops', authorityTier: 'official_filing',
        estimateKind: 'reported', estimateHorizon: 'reported_period',
        filingPublishedAt: null, sourceTimestamp: '2026-07-20T08:00:00Z',
        collectedAt: '2026-07-20T08:00:01Z',
        filingRestatementId: null, sourceRef: 'mops:2330:2026q2',
      }],
    ] as const;
    try {
      for (const [route, rpc, body] of cases) {
        const path = `/api/internal/${route}`;
        const response = await ingestionHandler(new Request(`https://example.test${path}`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer route-cross-field-test',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }), {
          path,
          rpc,
          inputArgument: 'input',
          keys: Object.keys(body),
          outputKeys: ['recordedAt'],
        });
        assert.equal(response.status, 422, route);
        assert.equal(
          await response.text(),
          '{"code":"invalid_request","error":"v3_ingestion_request_rejected"}',
          route,
        );
      }
    } finally {
      if (priorKey === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = priorKey;
      if (priorPrincipal === undefined) {
        delete process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID;
      } else {
        process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID = priorPrincipal;
      }
    }
  });

  it('owns the eighth stock-flow route and nested price discriminator schemas', () => {
    assert.equal(validateIngestionValuesV3(
      'append_stock_flow_observation_v3',
      {
        stockId: '00000000-0000-4000-8000-000000000001',
        exchange: 'TWSE',
        sessionId: '2026-07-24',
        sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
        factKey: 'foreign_net_twd',
        value: 123,
        unit: 'TWD',
        provider: 'twse',
        sourceTimestamp: '2026-07-24T08:00:00Z',
        collectedAt: '2026-07-24T08:00:00Z',
        sourceRef: 'fixture',
        providerRevision: 'v1',
      },
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_stock_flow_observation_v3',
      {
        stockId: 'not-a-uuid',
        exchange: 'TWSE',
        sessionId: '2026-07-24',
        sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
        factKey: 'foreign_net_twd',
        value: Number.NaN,
        unit: 'TWD',
        provider: 'twse',
        sourceTimestamp: '2026-07-24T08:00:00Z',
        collectedAt: '2026-07-24T08:00:00Z',
        sourceRef: 'fixture',
        providerRevision: 'v1',
      },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_price_authority_v3',
      {
        kind: 'raw_price',
        rawPrice: null,
        corporateActionSnapshot: null,
        exchangeReportedPe: null,
      },
    ), false);
    const instantFact = {
      stockId: '00000000-0000-4000-8000-000000000001',
      factKey: 'book_value_per_share',
      periodStart: null,
      periodEnd: '2026-06-30',
      durationKind: 'instant',
      value: 42,
      unit: 'TWD_per_share',
      provider: 'mops',
      authorityTier: 'official_filing',
      estimateKind: 'reported',
      estimateHorizon: 'reported_period',
      filingPublishedAt: '2026-07-20T08:00:00Z',
      sourceTimestamp: '2026-07-20T08:00:00Z',
      collectedAt: '2026-07-20T08:00:01Z',
      filingRestatementId: null,
      sourceRef: 'mops:2330:2026q2',
    };
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      instantFact,
    ), true);
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      { ...instantFact, periodStart: '2026-06-30' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      { ...instantFact, authorityTier: 'finmind_mirror' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      { ...instantFact, unit: 'dimensionless' },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      { ...instantFact, filingPublishedAt: null },
    ), false);
    assert.equal(validateIngestionValuesV3(
      'append_financial_fact_v3',
      {
        ...instantFact,
        estimateKind: 'broker_consensus',
        estimateHorizon: 'reported_period',
      },
    ), false);
  });

  it('enforces price provider, OHLC and complete corporate-action snapshot cross-fields', () => {
    const rawPrice = {
      stockId: '00000000-0000-4000-8000-000000000001',
      exchange: 'TWSE',
      sessionId: '2026-07-24',
      sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
      rawOpen: 100,
      rawHigh: 110,
      rawLow: 95,
      rawClose: 105,
      volume: 1000,
      turnoverTwd: 105000,
      provider: 'twse',
      sourceTimestamp: '2026-07-24T06:00:00Z',
      collectedAt: '2026-07-24T06:00:01Z',
      sourceRef: 'twse:2330:20260724',
    };
    assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
      kind: 'raw_price',
      rawPrice,
      corporateActionSnapshot: null,
      exchangeReportedPe: null,
    }), true);
    assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
      kind: 'raw_price',
      rawPrice: { ...rawPrice, provider: 'tpex' },
      corporateActionSnapshot: null,
      exchangeReportedPe: null,
    }), false);
    assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
      kind: 'raw_price',
      rawPrice: { ...rawPrice, rawLow: 106 },
      corporateActionSnapshot: null,
      exchangeReportedPe: null,
    }), false);

    const feeds = [
      'twse:twt49u:v1', 'twse:twtauu:v1', 'twse:twtb8u:v1',
    ].map((feedIdentity, index) => ({
      feedIdentity,
      responseByteCount: 100,
      responseSha256: '1'.repeat(64),
      parsedRowCount: index === 0 ? 1 : 0,
    }));
    const eventBase = {
      symbol: '2330',
      eventKind: 'ex_right_dividend',
      preActionReferencePrice: 100,
      postActionReferencePrice: 95,
      feedIdentity: feeds[0].feedIdentity,
    };
    const event = {
      ...eventBase,
      sourceRowRef: sha256Canonical([
        'corporate-action-source-row-v3.1',
        'TWSE',
        '2026-07-24',
        eventBase.symbol,
        eventBase.eventKind,
        eventBase.preActionReferencePrice,
        eventBase.postActionReferencePrice,
        eventBase.feedIdentity,
      ]),
    };
    const snapshot = {
      exchange: 'TWSE',
      sessionId: '2026-07-24',
      sessionAuthorityId: '00000000-0000-4000-8000-000000000002',
      corporateActionVersion: 'tw-corporate-action-v3.1',
      provider: 'twse',
      collectedAt: '2026-07-24T06:00:01Z',
      feedEvidence: feeds,
      declaredEventCount: 1,
      events: [event],
    };
    assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
      kind: 'corporate_action_snapshot',
      rawPrice: null,
      corporateActionSnapshot: snapshot,
      exchangeReportedPe: null,
    }), true);
    for (const invalidSnapshot of [
      { ...snapshot, provider: 'tpex' },
      { ...snapshot, corporateActionVersion: 'v-next' },
      { ...snapshot, feedEvidence: [feeds[1], feeds[0], feeds[2]] },
      {
        ...snapshot,
        feedEvidence: feeds.map((feed) => ({ ...feed, parsedRowCount: 0 })),
      },
      { ...snapshot, declaredEventCount: 2 },
      { ...snapshot, events: [{ ...event, preActionReferencePrice: 0 }] },
      { ...snapshot, events: [{ ...event, sourceRowRef: '2'.repeat(64) }] },
    ]) {
      assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
        kind: 'corporate_action_snapshot',
        rawPrice: null,
        corporateActionSnapshot: invalidSnapshot,
        exchangeReportedPe: null,
      }), false);
    }

    const exchangeReportedPe = {
      stockId: '00000000-0000-4000-8000-000000000001',
      exchange: 'TWSE',
      sessionDate: '2026-07-24',
      close: 105,
      reportedPe: 18.4,
      publishedAt: '2026-07-24T05:31:00Z',
      sourceTimestamp: '2026-07-24T05:32:00Z',
      collectedAt: '2026-07-24T05:33:00Z',
      sourceRef: 'twse:reported-pe:2330:20260724',
    };
    assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
      kind: 'exchange_reported_pe',
      rawPrice: null,
      corporateActionSnapshot: null,
      exchangeReportedPe,
    }), true);
    for (const invalidReportedPe of [
      { ...exchangeReportedPe, sourceRef: 'tpex:reported-pe:2330:20260724' },
      { ...exchangeReportedPe, close: 0 },
      { ...exchangeReportedPe, reportedPe: Number.NaN },
      { ...exchangeReportedPe, publishedAt: '2026-07-24T05:34:00Z' },
    ]) {
      assert.equal(validateIngestionValuesV3('append_price_authority_v3', {
        kind: 'exchange_reported_pe',
        rawPrice: null,
        corporateActionSnapshot: null,
        exchangeReportedPe: invalidReportedPe,
      }), false);
    }
  });
});

describe('typed worker executors', () => {
  it('normalizes one immutable source revision into conserved document and claim rows', () => {
    const rawFields = ['未調高 2330 目標價。', '', '營收維持成長'];
    const canonicalContentHash = sha256Canonical([
      ['title', rawFields[0]],
      ['summary', rawFields[1]],
      ['body', rawFields[2]],
    ]);
    const parsed = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170101', 7, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'post-7',
      'https://example.com/post-7', '2026-07-23T06:00:00Z',
      '2026-07-23T06:01:00Z', rawFields, 19, 'source-adapter-v3.3',
      'complete', canonicalContentHash, 'community', 'threads:test',
      [[
        '123e4567-e89b-42d3-a456-426614170233', '2330', 'TWSE',
        'common_stock', 'active', '台積電', ['台積電'], 'semiconductor',
      ]],
      [],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.equal(parsed[0].length, 1);
    assert.equal(parsed[1].length, 2);
    assert.equal(parsed[2].length, 1);
    assert.equal(parsed[0][0][5], 'processed_with_claims');
    assert.equal(parsed[0][0][7], 2);
    assert.equal(parsed[0][0][8], 1);
    assert.equal(parsed[1][0][11], 'contradicts');
    assert.equal(parsed[2][0][12], 'linked_new');
    assert.deepEqual(executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170102', 8, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'post-8', null, null,
      '2026-07-23T06:01:00Z', null, 100001, 'source-adapter-v3.3',
      'content_overflow', null, 'community', 'threads:test',
      [],
      [],
    ]), [[[
      'threads',
      '123e4567-e89b-42d3-a456-426614170102',
      8,
      sha256Canonical([
        'threads',
        '123e4567-e89b-42d3-a456-426614170001',
        'post-8',
      ]),
      '2026-07-23T06:01:00Z',
      'parse_failure',
      null,
      0,
      0,
    ]], [], []]);
  });

  it('normalizes canonical URL identity and fails malformed percent encoding before parsing', () => {
    const fields = ['2330 股票成長。', '', ''];
    const contentHash = sha256Canonical([
      ['title', fields[0]], ['summary', ''], ['body', ''],
    ]);
    const canonicalDocumentId = sha256Canonical([
      'threads',
      '123e4567-e89b-42d3-a456-426614170001',
      'https://example.com/post',
    ]);
    const duplicate = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170108', 13, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'url-normalized',
      'https://EXAMPLE.com/post/?utm_source=x#frag', null,
      '2026-07-23T06:01:00Z', fields, [...fields.join('')].length,
      'source-adapter-v3.3', 'complete', contentHash, 'community',
      'threads:test', [], [[canonicalDocumentId, null]],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.equal(duplicate[0][0][3], canonicalDocumentId);
    assert.equal(duplicate[0][0][5], 'duplicate_document');
    assert.deepEqual(duplicate[1], []);
    assert.deepEqual(duplicate[2], []);

    const malformed = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170109', 14, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'url-malformed',
      'https://example.com/%zz', null, '2026-07-23T06:01:00Z',
      fields, [...fields.join('')].length, 'source-adapter-v3.3',
      'complete', contentHash, 'community', 'threads:test', [], [],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.deepEqual(malformed[0][0].slice(3), [
      null,'2026-07-23T06:01:00Z','parse_failure',null,0,0,
    ]);
    assert.deepEqual(malformed[1], []);
    assert.deepEqual(malformed[2], []);
  });

  it('links exact aliases only with stock context, rejects year-like tickers and deduplicates claims', () => {
    const rawFields = [
      '台積電股票營收成長。',
      '西元 2026 年景氣回升。',
      '台積電股票營收成長。',
    ];
    const canonicalContentHash = sha256Canonical(
      [
        ['title', rawFields[0]],
        ['summary', rawFields[1]],
        ['body', rawFields[2]],
      ],
    );
    const parsed = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170103', 9, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'post-9',
      'https://example.com/post-9', '2026-07-23T06:00:00Z',
      '2026-07-23T06:01:00Z', rawFields, 34, 'source-adapter-v3.3',
      'complete', canonicalContentHash, 'community', 'threads:test',
      [
        [
          '123e4567-e89b-42d3-a456-426614170233', '2330', 'TWSE',
          'common_stock', 'active', '台灣積體電路製造', ['台積電'], 'semiconductor',
        ],
        [
          '123e4567-e89b-42d3-a456-426614172026', '2026', 'TWSE',
          'common_stock', 'active', '測試公司', ['測試'], 'other',
        ],
      ],
      [],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.equal(parsed[1][0][3], 'unique_claim');
    assert.equal(parsed[1][2][3], 'duplicate_claim');
    assert.equal(parsed[1][2][5], 0);
    assert.equal(parsed[2][0][9], 'exact_alias');
    assert.equal(parsed[2][0][11], '2330');
    assert.equal(parsed[2][0][12], 'linked_new');
    assert.equal(parsed[2][1][3], '2026');
    assert.equal(parsed[2][1][11], null);
    assert.equal(parsed[2][1][12], 'rejected_low_confidence');
    assert.equal(parsed[2][1][13], 'missing_stock_context');
    assert.equal(parsed[2][2][12], 'linked_duplicate_claim');
    assert.equal(parsed[2][2][13], 'duplicate_claim_link');
  });

  it('uses the normative transcript key and rejects claim or mention overflow atomically', () => {
    const transcriptFields = [
      '法說會',
      '',
      [
        [1000, 'segment-b', '後段維持成長。'],
        [0, 'segment-a', '2330 股票營收成長。'],
      ],
    ];
    const transcriptHash = sha256Canonical([
      ['title', '法說會'],
      ['summary', ''],
      ['transcript', [
        [0, '2330 股票營收成長。'],
        [1000, '後段維持成長。'],
      ]],
    ]);
    const transcript = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170104', 10, 'podcast',
      '123e4567-e89b-42d3-a456-426614170001', 'episode-10',
      'https://example.com/episode-10', '2026-07-23T06:00:00Z',
      '2026-07-23T06:01:00Z', transcriptFields, 25, 'source-adapter-v3.3',
      'complete', transcriptHash, 'community', 'podcast:test',
      [[
        '123e4567-e89b-42d3-a456-426614170233', '2330', 'TWSE',
        'common_stock', 'active', '台積電', ['台積電'], 'semiconductor',
      ]],
      [],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.equal(transcript[0][0][5], 'processed_with_claims');
    assert.equal(transcript[0][0][6], transcriptHash);

    for (const [revisionId, stableId, body] of [
      [
        '123e4567-e89b-42d3-a456-426614170105',
        'claim-overflow',
        Array.from({ length: 201 }, () => '2330 股票').join('。'),
      ],
      [
        '123e4567-e89b-42d3-a456-426614170106',
        'mention-overflow',
        '2330 '.repeat(1001).trim(),
      ],
    ]) {
      const fields = [body, '', ''];
      const contentHash = sha256Canonical([
        ['title', fields[0]], ['summary', ''], ['body', ''],
      ]);
      const parsed = executeWorkerPayload('source_parse_batch', [
        revisionId, 11, 'threads',
        '123e4567-e89b-42d3-a456-426614170001', stableId,
        null, null, '2026-07-23T06:01:00Z', fields,
        [...body].length, 'source-adapter-v3.3', 'complete', contentHash,
        'community', 'threads:test',
        [[
          '123e4567-e89b-42d3-a456-426614170233', '2330', 'TWSE',
          'common_stock', 'active', '台積電', ['台積電'], 'semiconductor',
        ]],
        [],
      ]) as [unknown[][], unknown[][], unknown[][]];
      assert.deepEqual(parsed[0][0].slice(5), ['parse_failure', null, 0, 0]);
      assert.deepEqual(parsed[1], []);
      assert.deepEqual(parsed[2], []);
    }
  });

  it('discards an empty normalized segment before claim counting and ordinal assignment', () => {
    const rawFields = ['———。2330 股票營收成長。', '', ''];
    const canonicalContentHash = sha256Canonical([
      ['title', rawFields[0]],
      ['summary', rawFields[1]],
      ['body', rawFields[2]],
    ]);
    const parsed = executeWorkerPayload('source_parse_batch', [
      '123e4567-e89b-42d3-a456-426614170107', 12, 'threads',
      '123e4567-e89b-42d3-a456-426614170001', 'empty-normalized',
      null, null, '2026-07-23T06:01:00Z', rawFields,
      [...rawFields.join('')].length, 'source-adapter-v3.3', 'complete',
      canonicalContentHash, 'community', 'threads:test',
      [[
        '123e4567-e89b-42d3-a456-426614170233', '2330', 'TWSE',
        'common_stock', 'active', '台積電', ['台積電'], 'semiconductor',
      ]],
      [],
    ]) as [unknown[][], unknown[][], unknown[][]];
    assert.equal(parsed[0][0][5], 'processed_with_claims');
    assert.equal(parsed[0][0][7], 1);
    assert.equal(parsed[1].length, 1);
    assert.equal(parsed[1][0][1], 0);
    assert.notEqual(parsed[1][0][2], sha256Canonical(['', []]));
  });

  it('derives market and shallow outputs instead of echoing arbitrary input', () => {
    const marketRow = (key: string, scope: string, value: number) => [
      'market_context', key, scope, null, 'number', value, null,
      '2026-07-24T08:00:00Z', `market:${key}`, 'official', null,
    ];
    const market = executeWorkerPayload('market_context_snapshot', [[
      marketRow('taiex_close', 'TAIEX', 100),
      marketRow('taiex_ma20', 'TAIEX', 90),
      marketRow('taiex_ma60', 'TAIEX', 80),
      marketRow('otc_close', 'OTC', 100),
      marketRow('otc_ma20', 'OTC', 90),
      marketRow('otc_ma60', 'OTC', 80),
      marketRow('active_common_above_ma20_pct', 'TW_ACTIVE_COMMON', 70),
      marketRow('active_common_above_ma60_pct', 'TW_ACTIVE_COMMON', 70),
      marketRow('foreign_cash_net_5d', 'TW_ACTIVE_COMMON', 70),
      marketRow('investment_trust_net_5d', 'TW_ACTIVE_COMMON', 70),
      marketRow('aggregate_margin_balance_change_5d', 'TW_ACTIVE_COMMON', 70),
      marketRow('foreign_index_futures_net_oi', 'TAIFEX', 70),
      marketRow('put_call_ratio', 'TAIFEX', 70),
      marketRow('taiwan_vix', 'TAIFEX', 70),
      marketRow('sox_return_5d', 'SOX', 70),
      marketRow('nasdaq_return_5d', 'NASDAQ', 70),
      marketRow('usd_twd_return_5d', 'USD_TWD', 70),
    ], [], []]) as { regime: string };
    assert.equal(market.regime, 'risk_on');
    assert.throws(() => executeWorkerPayload('market_context_snapshot', []), /invalid/);
    assert.deepEqual(executeWorkerPayload(
      'shallow_candidate_batch',
      [[], [], [], []],
    ), []);
    assert.throws(
      () => executeWorkerPayload('deep_candidate_batch', Array(21).fill([])),
      /invalid worker input/,
    );
  });

  it('computes a deep candidate from immutable inputs and fails evidence gaps closed', () => {
    const stockId = '123e4567-e89b-42d3-a456-426614170233';
    const anchorClaimId = '123e4567-e89b-42d3-a456-426614170234';
    const emptyReference = ['123e4567-e89b-42d3-a456-426614170235', 'a'.repeat(64), []];
    const historyRows = Array.from({ length: 252 }, (_, index) => ['2330', stockId,
      new Date(Date.UTC(2025, 0, index + 1)).toISOString(), -2 + index / 100, -1, 0, -.5]);
    const technicalSessions = Array.from({ length: 122 }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)).toISOString());
    const technicalCloses = technicalSessions.map((_, index) => 100 - 2 * Math.cos((index - 121) * Math.PI / 10));
    const technicalReference = ['123e4567-e89b-42d3-a456-426614170236', 'b'.repeat(64), [
      ...historyRows.map((row) => ['history_rows', row]),
      ...technicalSessions.map((session, index) => ['raw_adjusted_rows', ['2330', 0, technicalSessions.at(-1), index,
        session, technicalCloses[index] - .1, technicalCloses[index] + .5, technicalCloses[index] - .5,
        technicalCloses[index], ['adjusted-price-evidence-v3.1'], 1_000]]),
      ...technicalSessions.map((session, index) => ['market_benchmark_rows', [session, technicalCloses[index], `taiex:${session}`]]),
    ]];
    const biasReference = ['123e4567-e89b-42d3-a456-426614170237', 'c'.repeat(64), [
      ['current_rows', [stockId, '2330', '2026-07-24T08:00:00Z', 1, 2, 3, .5]],
      ['sector_rows', ['semiconductor', '2026-07-24T08:00:00Z', 8, -5, -2, 0, 2, 5]],
    ]];
    const input = [[[
      0, stockId, '2330', true, 'direct_candidate', anchorClaimId,
      'semiconductor', '2026-07-24T08:00:00Z',
      80, 50, 50, 50, 100, 'mover:2330', null, null,
      'financial-manifest-ref', 'sector-valuation-manifest-ref', null, null,
    ]], [], [], [], [], [[
        0, 0, 'evidence:1', 'root:1', 'official', 'mops',
        '2026-07-24T07:00:00Z', 'fresh', 'publisher_verified', 'supports',
        'claim:1', 'revision:1', stockId, '2330', 'linked_new', anchorClaimId, .9,
        'canonical-claim:1', 'explicit_ticker_context',
      ]], biasReference, technicalReference, emptyReference];
    const computed = executeWorkerPayload('deep_candidate_batch', input) as unknown[][];
    assert.equal(computed.length, 1);
    assert.equal(computed[0][1], '2330');
    assert.equal((computed[0][7] as { status: string }).status, 'missing');
    assert.equal((computed[0][8] as { newPositionAction: string }).newPositionAction, 'valuation_review');
    assert.equal((computed[0][11] as unknown[]).length, 3);
    assert.equal('newPositionAction' in (computed[0][13] as Record<string, unknown>), false);
    assert.equal((computed[0][13] as { technicalDecision: { state: string } }).technicalDecision.state, 'at_support');
    assert.equal(computed[0][14], null);
    const staleEvidence = structuredClone(input);
    (staleEvidence[5] as unknown[][])[0][7] = 'stale';
    const staleResult = executeWorkerPayload('deep_candidate_batch', staleEvidence) as unknown[][];
    assert.equal((staleResult[0][8] as { newPositionAction: string }).newPositionAction, 'avoid');
    assert.deepEqual((staleResult[0][8] as { blockReasons: string[] }).blockReasons, ['data_integrity']);
    const contradictingEvidence = structuredClone(input);
    (contradictingEvidence[5] as unknown[][])[0][9] = 'contradicts';
    const contradictingResult = executeWorkerPayload('deep_candidate_batch', contradictingEvidence) as unknown[][];
    assert.deepEqual((contradictingResult[0][8] as { blockReasons: string[] }).blockReasons, ['data_integrity']);
    const mutated = structuredClone(input);
    (mutated[6] as unknown[])[1] = 'd'.repeat(64);
    const recomputed = executeWorkerPayload('deep_candidate_batch', mutated) as unknown[][];
    assert.equal((computed[0][13] as { materialChangeHash: string }).materialChangeHash,
      (recomputed[0][13] as { materialChangeHash: string }).materialChangeHash,
      'run-varying manifest identity alone must not create a material analysis revision');
  });

  it('validates database-computed outcomes and fixed empty strategy evidence', () => {
    const outcome = {
      scoreSnapshotId: '123e4567-e89b-42d3-a456-426614170001',
      maturityHorizon: 'session_20',
      entrySession: '2026-07-01',
      entrySessionAuthorityHash: 'a'.repeat(64),
      maturitySession: '2026-07-29',
      maturitySessionAuthorityHash: 'b'.repeat(64),
      entryPriceRef: 'price:entry',
      outcomePriceRef: 'price:outcome',
      sectorBenchmarkManifestId: '123e4567-e89b-42d3-a456-426614170002',
      returnPct: 10,
      sectorRelativeReturnPct: 6,
      mfePct: 15,
      maePct: -10,
      sectorRelativeMfePct: 11,
    };
    assert.deepEqual(executeWorkerPayload('outcome_batch', [outcome]), [outcome]);
    assert.throws(
      () => executeWorkerPayload('outcome_batch', [{ ...outcome, relevant: true }]),
      /invalid outcome/u,
    );
    const evaluation = executeWorkerPayload('evaluation_bundle', []) as {
      strategyRows: Array<{ strategy: string }>;
      status: string;
    };
    assert.deepEqual(
      evaluation.strategyRows.map((row) => row.strategy),
      ['official_only', 'source_led', 'hybrid'],
    );
    assert.equal(evaluation.status, 'fail');
  });

  it('allocates only the complete canonical decision and clears rejected buy geometry atomically', () => {
    const buyDecision: ActionDecisionV3 = {
      decisionAuthority: 'research_only', publicationEligible: false,
      newPositionAction: 'starter_now', existingPositionAction: 'no_position',
      existingTargetExposurePct: null, existingReason: 'portfolio_context_unavailable',
      primaryHorizon: 'swing_20_60d', initialPositionPct: 5, maximumPositionPct: 10,
      blockReasons: [], confidence: 0.8,
      entryTrigger: '{"kind":"market_zone","lower":100,"upper":102}',
      invalidation: { code: 'price_stop_or_evidence_expiry', stopPrice: 90,
        evidenceExpiresAt: '2026-08-01T00:00:00Z' },
    };
    const accepted = executeWorkerPayload('portfolio_allocation_batch', [[
      '2330', 'semiconductor', 80, 15, buyDecision,
    ]]) as Array<[string, ActionDecisionV3]>;
    assert.deepEqual(accepted, [['2330', buyDecision]]);
    const rejected = executeWorkerPayload('portfolio_allocation_batch', [[
      '2330', 'semiconductor', 80, 2, buyDecision,
    ]]) as Array<[string, ActionDecisionV3]>;
    assert.deepEqual(rejected[0][1], {
      ...buyDecision,
      newPositionAction: 'avoid',
      initialPositionPct: 0,
      maximumPositionPct: 0,
      blockReasons: ['capacity_exhausted'],
      entryTrigger: null,
      invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null },
    });
  });

  it('derives a closed sizing-free public projection from normalized lineage rows', () => {
    const zeroReasons = {
      explicit_ticker_context: 0, exact_unique_alias_context: 0, ambiguous_number: 0,
      ambiguous_alias: 0, fuzzy_below_auto_threshold: 0, below_min_confidence: 0,
      inactive_or_unknown_symbol: 0, missing_stock_context: 0, unsupported_market: 0,
      non_common_stock: 0, unsupported_instrument_type: 0, duplicate_claim_link: 0,
    };
    const projection = executeWorkerPayload('projection_bundle', [
      [],
      {
        contractVersion: 'market-context-v3.6',
        regime: 'unknown',
        completeness: 'insufficient',
        composite: null,
        newPositionBudgetPct: 15,
        groups: Object.fromEntries(([
          'trend', 'breadth', 'flow', 'derivatives', 'global',
        ] as MarketGroupV3[]).map((key) => [key, { status: 'missing', score: null }])),
        missingGroups: ['trend', 'breadth', 'flow', 'derivatives', 'global'],
        overrideReason: null,
        asOf: '2026-07-23T08:00:00Z',
      },
      [], [], [],
      {
        auditedSessionDate: '2026-07-22',
        auditedCloseAt: '2026-07-22T08:00:00Z',
        auditWindowClosesAt: '2026-07-25T08:00:00Z',
        laterMentionedCount: 0,
        maturity: 'pending',
        moverCount: 0,
        sourceCollectionCutoff: '2026-07-23T08:00:00Z',
        sourceRecallPct: null,
        sourceRunId: '123e4567-e89b-42d3-a456-426614174001',
        sourceFunnel: {
          eligibleDocuments: 0, selectedDocuments: 0, deferredDueScanCap: 0,
          documentOutcomes: {
            duplicate_document: 0, expired_document: 0, parse_failure: 0,
            processed_no_claim: 0, processed_with_claims: 0,
          },
          extractedClaims: 0,
          claimOutcomes: { unique_claim: 0, duplicate_claim: 0 },
          rawMentions: 0,
          mentionOutcomes: {
            linked_new: 0, linked_refresh: 0, linked_duplicate_claim: 0,
            ambiguous_symbol: 0, rejected_low_confidence: 0, unsupported_instrument: 0,
          },
          mentionReasonCounts: zeroReasons,
          activeCandidateCount: 0, shallowPlannedCount: 0, shallowSucceededCount: 0,
          shallowFailedCount: 0, deferredBeforeShallowCount: 0, deepPlannedCount: 0,
          deepSucceededCount: 0, deepFailedCount: 0, deferredBeforeDeepCount: 0,
          quotaUnderfillReasons: [], connectorAccounting: [],
        },
        symbols: [],
      },
      [],
      [],
    ], {
      runId: '123e4567-e89b-42d3-a456-426614174000',
    }) as [unknown[], unknown, unknown[]];
    assert.equal(validAvailableProjectionPayload(projection[1]), true);
    assert.deepEqual(projection[0], []);
    assert.deepEqual(projection[2], []);

    const decision = {
      newPositionAction: 'valuation_review',
      initialPositionPct: 0,
      maximumPositionPct: 0,
      entryTrigger: null,
      blockReasons: ['missing_required_inputs'],
      confidence: 0,
      decisionAuthority: 'research_only',
      existingPositionAction: 'no_position',
      existingReason: 'portfolio_context_unavailable',
      existingTargetExposurePct: null,
      invalidation: {
        code: 'data_integrity_review',
        evidenceExpiresAt: null,
        stopPrice: null,
      },
      primaryHorizon: 'swing_20_60d',
      publicationEligible: false,
    };
    const deepRow = [
      '123e4567-e89b-42d3-a456-426614174002',
      '2330',
      true,
      'direct_candidate',
      '123e4567-e89b-42d3-a456-426614174010',
      'semiconductor',
      'insufficient_evidence',
      { ...valuationFixture({ asOf: '2026-07-23T08:00:00Z' }), relativeMultiple: {
        exchangeReportedPe: { status: 'unavailable', reason: 'missing_official_pe', value: null, asOf: null, sourceRef: null, manifestRef: null },
        ownHistory: { status: 'unavailable', reason: 'insufficient_own_history', count: 0, p10: null, p25: null, p50: null, p75: null, p90: null, currentPercentile: null, asOf: null, manifestRef: null },
        sector: { status: 'unavailable', reason: 'sector_reference_insufficient', count: 0, p25: null, p50: null, p75: null, capWeightedAggregate: null, asOf: null, manifestRef: null }, modelComparablePe: null,
      } },
      decision,
      0,
      0,
      [
        ...(['momentum_5_20d','swing_20_60d','thesis_120_250d'] as const).map((horizon, index) =>
          [horizon, 1, 72 - index * 2, 0.7, 100, Object.fromEntries(
            (['priceVolume','chip','catalyst','marketSector','fundamental','valuation'] as const).map((key) =>
              [key, { value: 70, contribution: 70, status: 'available', evidenceRefs: [] }]),
          )]),
      ],
      [[
        0, 0, 'ref-2330', 'root-2330', 'official', 'mops_material_event',
        '2026-07-23T06:00:00Z', 'fresh', 'publisher_verified', 'supports',
        '123e4567-e89b-42d3-a456-426614174001',
        '123e4567-e89b-42d3-a456-426614174011',
        '123e4567-e89b-42d3-a456-426614174002', '2330', 'linked_new',
        '123e4567-e89b-42d3-a456-426614174010', .9, 'canonical-2330', 'explicit_ticker_context',
      ]],
      {
        researchMaturity: 'fundamental_review',
        fundamental: { thesis: '來源訊號已確認。', latestChange: '已重新評估。', risks: ['資料不足'], evidenceRefs: ['ref-2330'], asOf: '2026-07-23T08:00:00Z' },
        technicalDecision: { contractVersion: 'opportunity-technical-decision-v3.11.1', availability: 'unavailable', state: null,
          reason: 'taiex_reference_unavailable', asOf: '2026-07-23T08:00:00Z', trigger: null, entryZone: null,
          invalidation: null, indicators: null, maDeviation: { availability: 'unavailable', reason: 'manifest_missing',
            bias20Pct: null, bias60Pct: null, bias120Pct: null, bias20Atr: null,
            ownHistory: { status: 'unavailable', reason: 'manifest_missing', count: 0,
              p10: null, p25: null, p50: null, p75: null, p90: null, label: null, asOf: null, manifestRef: null },
            sector: { status: 'unavailable', reason: 'manifest_missing', count: 0,
              p10: null, p25: null, p50: null, p75: null, p90: null, asOf: null, manifestRef: null } } },
        factorAxes: {
          discovery: { status: 'continued', reason: null, score: 80 },
          quality: { status: 'unavailable', reason: 'insufficient_quality_inputs', score: null, availableWeight: 0,
            components: { roicOrRoe: null, growthAcceleration: null, marginTrend: null, cashConversionAccruals: null, leverageInterestCover: null, revisions: null }, referenceManifestRef: null },
          valuation: { status: 'valuation_review', score: null, reason: 'valuation_review' },
          timingRisk: { status: 'unavailable', score: null, reason: 'technical_unavailable', shadowBiasPoints: { momentum_5_20d: null, swing_20_60d: null, thesis_120_250d: null } },
        },
        lastEvaluatedAt: '2026-07-23T08:00:00Z', analysisGeneratedAt: '2026-07-23T08:00:00Z',
        materialChangeHash: 'a'.repeat(64), materialChangedBecause: ['factor_correctness_changed'], noChangeMessage: null,
      },
      null,
    ];
    const allocations = executeWorkerPayload('portfolio_allocation_batch', [[
      '2330', 'semiconductor', 70, 15, decision,
    ]]);
    const nonempty = executeWorkerPayload('projection_bundle', [
      [[
        '123e4567-e89b-42d3-a456-426614174002', '2330', true, 'direct_candidate',
        '123e4567-e89b-42d3-a456-426614174010', 'succeeded', 'succeeded',
        { state: 'deep_succeeded' },
      ]],
      {
        contractVersion: 'market-context-v3.6',
        regime: 'unknown',
        completeness: 'insufficient',
        composite: null,
        newPositionBudgetPct: 15,
        groups: Object.fromEntries(([
          'trend', 'breadth', 'flow', 'derivatives', 'global',
        ] as MarketGroupV3[]).map((key) => [key, { status: 'missing', score: null }])),
        missingGroups: ['trend', 'breadth', 'flow', 'derivatives', 'global'],
        overrideReason: null,
        asOf: '2026-07-23T08:00:00Z',
      },
      [[['semiconductor', { ...sectorCycleFixture, asOf: '2026-07-23T08:00:00Z' }]]],
      [[deepRow]],
      allocations,
      ([
        [],
        {
          contractVersion: 'market-context-v3.6',
          regime: 'unknown',
          completeness: 'insufficient',
          composite: null,
          newPositionBudgetPct: 15,
          groups: Object.fromEntries(([
            'trend', 'breadth', 'flow', 'derivatives', 'global',
          ] as MarketGroupV3[]).map((key) => [key, { status: 'missing', score: null }])),
          missingGroups: ['trend', 'breadth', 'flow', 'derivatives', 'global'],
          overrideReason: null,
          asOf: '2026-07-23T08:00:00Z',
        },
        [], [], [],
        {
          auditedSessionDate: '2026-07-22',
          auditedCloseAt: '2026-07-22T08:00:00Z',
          auditWindowClosesAt: '2026-07-25T08:00:00Z',
          laterMentionedCount: 0,
          maturity: 'pending',
          moverCount: 0,
          sourceCollectionCutoff: '2026-07-23T08:00:00Z',
          sourceRecallPct: null,
          sourceRunId: '123e4567-e89b-42d3-a456-426614174001',
          sourceFunnel: (projection[1] as { sourceFunnel: unknown }).sourceFunnel,
          symbols: [],
        },
        [],
      ] as unknown[])[5],
      [[
        '123e4567-e89b-42d3-a456-426614174000',
        '2330',
        '/opportunity-v3/123e4567-e89b-42d3-a456-426614174000/2330',
        'official',
        '2026-07-23T06:00:00Z',
        '2026-07-23T08:00:00Z',
        deepRow[12],
        [],
        'insufficient_evidence',
        'swing_20_60d',
        null,
        'valuation_review',
        'normal',
        [],
        null,
      ]],
      [],
    ], {
      runId: '123e4567-e89b-42d3-a456-426614174000',
    }) as [unknown[], unknown, unknown[]];
    assert.equal(validAvailableProjectionPayload(nonempty[1]), true);
    assert.equal((nonempty[1] as { valuationReview: Array<{ formalResearchStatus: string }> })
      .valuationReview[0].formalResearchStatus, 'insufficient_evidence');
    assert.equal(nonempty[2].length, 1);
    assert.equal(validOpportunityDetailPayload(
      nonempty[2][0],
      '123e4567-e89b-42d3-a456-426614174000',
      '2330',
    ), true);
  });
});

describe('point-in-time projection selection', () => {
  it('freezes the exact 41-member v3.17 comparison identity and mutates every member', () => {
    assert.equal(STATIC_IDENTITY_MEMBERS_V3.length, 41);
    assert.equal(COMPARISON_PREIMAGE_CANONICAL_V3.length, 2729);
    assert.equal(
      COMPARISON_CONTRACT_KEY_V3,
      'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
    );
    assert.deepEqual(
      STATIC_IDENTITY_MEMBERS_V3.map(([name]) => name),
      STATIC_IDENTITY_MEMBERS_V3.map(([name]) => name).toSorted(),
    );
    for (let index = 0; index < STATIC_IDENTITY_MEMBERS_V3.length; index += 1) {
      const mutatedMembers = STATIC_IDENTITY_MEMBERS_V3.map(
        (member, memberIndex) => memberIndex === index ? [member[0], `${member[1]}-mutated`] : [...member],
      );
      assert.notEqual(
        sha256Canonical([
          COMPARISON_PREIMAGE_V3[0],
          ['staticIdentityMembers', mutatedMembers],
        ]),
        COMPARISON_CONTRACT_KEY_V3,
      );
    }
  });

  const cutoff = '2026-07-24T08:00:00Z';
  const run = (
    overrides: Partial<ProjectionRunAtCutoffV3> = {},
  ): ProjectionRunAtCutoffV3 => ({
    run_id: '123e4567-e89b-42d3-a456-426614174000',
    mode: 'enrich_rank',
    run_purpose: 'production_shadow_daily',
    source_cutoff: '2026-07-24T07:00:00Z',
    comparison_contract_key: COMPARISON_CONTRACT_KEY_V3,
    status: 'running',
    created_at: '2026-07-24T07:01:00Z',
    sealed_at: '2026-07-24T07:02:00Z',
    terminal_at: null,
    ...overrides,
  });

  it('distinguishes cold, nonmatching, active, failed and visible success at the exact cutoff', () => {
    assert.deepEqual(selectProjectionRunAtCutoff([], cutoff), {
      availability: 'unavailable', reason: 'cold_start',
    });
    assert.deepEqual(selectProjectionRunAtCutoff([
      run({ comparison_contract_key: 'f'.repeat(64) }),
    ], cutoff), {
      availability: 'unavailable', reason: 'no_matching_success',
    });
    assert.deepEqual(selectProjectionRunAtCutoff([run()], cutoff), {
      availability: 'unavailable', reason: 'matching_run_in_progress',
    });
    assert.deepEqual(selectProjectionRunAtCutoff([
      run({ status: 'failed', terminal_at: cutoff }),
    ], cutoff), {
      availability: 'unavailable', reason: 'latest_matching_failed',
    });
    assert.deepEqual(selectProjectionRunAtCutoff([
      run({ status: 'success', terminal_at: cutoff }),
      run({
        run_id: '123e4567-e89b-42d3-a456-426614174001',
        status: 'failed',
        terminal_at: '2026-07-24T07:59:59Z',
      }),
    ], cutoff), {
      availability: 'available',
      runId: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('treats post-cutoff terminalization as active and tied success as integrity failure', () => {
    assert.deepEqual(selectProjectionRunAtCutoff([
      run({ status: 'success', terminal_at: '2026-07-24T08:00:01Z' }),
    ], cutoff), {
      availability: 'unavailable', reason: 'matching_run_in_progress',
    });
    assert.deepEqual(selectProjectionRunAtCutoff([
      run({ status: 'success', terminal_at: cutoff }),
      run({
        run_id: '123e4567-e89b-42d3-a456-426614174002',
        status: 'success',
        terminal_at: cutoff,
      }),
    ], cutoff), {
      availability: 'unavailable', reason: 'latest_matching_failed',
    });
  });
});
