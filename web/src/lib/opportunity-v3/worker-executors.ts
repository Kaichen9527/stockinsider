import { canonicalJson, roundHalfAwayFromZero, sha256Canonical } from './canonical.ts';
import type {
  MarketGroupV3,
} from './contracts.ts';
import { marketContext } from './market.ts';
import { linkMention, normalizeAlias, normalizeCanonicalUrl } from './source.ts';
import { actionDecision, formalResearchStatus, validActionDecisionV3 } from './decision.ts';
import { scoreHorizon, type7Quantile, valuationFactor, weightedFactor } from './scoring.ts';
import { sectorCycle, type SectorCycleInputV3 } from './sector-cycle.ts';
import {
  buildValuationDistribution,
  selectValuationMethod,
  selectVerifiedResearchDistribution,
  type VerifiedResearchObservationV3,
} from './valuation.ts';
import {
  buildHomepageSummary,
  buildStrategyBakeoff,
  buildVerifiedChangeWorkspace,
  type ReviewerResolutionV3,
  type StrategyCandidateV3,
  type VerifiedChangeCandidateInputV3,
} from './verified-change.ts';
import type {
  OpportunityCardV3,
  FactorKeyV3,
  FactorValueV3,
  InstrumentV3,
  MarketContextV3,
  PriorComparableV3,
  SourceClassV3,
  ValuationDistributionV3,
  VerifiedEvidenceRowV3,
} from './contracts.ts';
import type { OpportunityDetailV3 } from './detail.ts';
import { buildFactorCorrectnessV311, parseReferenceBundle } from './factor-correctness-v311.ts';

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError('invalid worker input');
  return value;
}

function finiteJson(value: unknown): void {
  canonicalJson(value);
}

export type WorkerExecutionContextV3 = {
  runId: string;
};

export function executeWorkerPayload(
  payloadKind: string,
  body: unknown,
  context?: WorkerExecutionContextV3,
): unknown {
  finiteJson(body);
  switch (payloadKind) {
    case 'source_parse_batch': {
      return parseSourceRevision(body);
    }
    case 'source_connector_summary':
      return connectorSummary(body);
    case 'market_context_snapshot':
      return marketContextFromNativeRows(body);
    case 'shallow_candidate_batch':
      return shallowCandidateRows(body);
    case 'sector_cycle_batch':
      return array(body, 5).map((tuple) => {
        const row = array(tuple, 2);
        if (row.length !== 2 || typeof row[0] !== 'string' || !record(row[1])) {
          throw new TypeError('invalid sector cycle input');
        }
        const input = row[1] as Record<string, unknown>;
        const computed = sectorCycle(input as unknown as SectorCycleInputV3);
        const reasons = [
          typeof input.sectorReferenceCount === 'number' && input.sectorReferenceCount < 8
            ? 'insufficient_sector_reference'
            : null,
          computed.levelScore === null ? 'missing_level_inputs' : null,
          computed.changeScore === null ? 'missing_change_inputs' : null,
          computed.marketScore === null ? 'missing_market_inputs' : null,
          computed.matchedRule === 'no_rule_match' ? 'no_rule_match' : null,
        ].filter((reason): reason is string => reason !== null);
        return [row[0], {
          contractVersion: 'sector-cycle-v3.0',
          ...computed,
          inputs: Array.isArray(input.inputs) ? input.inputs : [],
          reasons,
          asOf: input.asOf,
        }];
      });
    case 'deep_candidate_batch':
      return deepCandidateRows(body);
    case 'portfolio_allocation_batch':
      return portfolioRows(body);
    case 'projection_bundle': {
      const tuple = array(body, 8);
      if (
        tuple.length !== 8 ||
        !Array.isArray(tuple[0]) ||
        !record(tuple[1]) ||
        !Array.isArray(tuple[2]) ||
        !Array.isArray(tuple[3]) ||
        !Array.isArray(tuple[4]) ||
        !record(tuple[5]) ||
        !Array.isArray(tuple[6]) ||
        !Array.isArray(tuple[7])
      ) {
        throw new TypeError('invalid projection bundle');
      }
      if (
        tuple[0].length > 60 ||
        tuple[2].length > 30 ||
        tuple[3].length > 20 ||
        tuple[4].length > 20 ||
        tuple[6].length > 20 ||
        tuple[7].length > 120
      ) throw new TypeError('projection bound exceeded');
      return projectionBundle(tuple, context);
    }
    case 'outcome_batch':
      return outcomeRows(body);
    case 'evaluation_bundle': {
      if (Array.isArray(body) && body.length === 0) {
        return emptyEvaluationBundle();
      }
      if (Array.isArray(body)) return evaluationSummary(body);
      if (!record(body) || !Array.isArray(body.candidates) || !record(body.reviewer)) {
        throw new TypeError('invalid evaluation input');
      }
      const strategyRows = buildStrategyBakeoff(
        body.candidates as StrategyCandidateV3[],
        body.reviewer as unknown as ReviewerResolutionV3,
      );
      return {
        strategyRows,
        status: strategyRows.every((row) => row.facts.length === 0) ? 'pass' : 'fail',
      };
    }
    default:
      throw new TypeError('unsupported worker payload');
  }
}

function marketContextFromNativeRows(value: unknown) {
  const sections = array(value, 3);
  if (sections.length !== 3) throw new TypeError('invalid market context worker input');
  const includedSection = array(sections[0], 1_024);
  const excludedSection = array(sections[1], 1_024);
  const conservationSection = array(sections[2], 64);
  if (includedSection.length + excludedSection.length > 1_024) {
    throw new TypeError('invalid market context worker input');
  }
  const included = includedSection.map((valueRow) => {
    const row = array(valueRow, 11);
    if (
      row.length !== 11 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string'
    ) throw new TypeError('invalid market context included row');
    return row;
  });
  const excluded = excludedSection.map((valueRow) => {
    const row = array(valueRow, 7);
    if (
      row.length !== 7 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      typeof row[4] !== 'string'
    ) throw new TypeError('invalid market context excluded row');
    return row;
  });
  for (const valueRow of conservationSection) {
    const row = array(valueRow, 6);
    if (row.length !== 6 || typeof row[0] !== 'string' || typeof row[1] !== 'string') {
      throw new TypeError('invalid market context conservation row');
    }
  }
  const values = new Map<string, number>();
  let asOf = '1970-01-01T00:00:00.000Z';
  for (const row of included) {
    if (row[0] !== 'market_context') continue;
    if (
      row[4] !== 'number' ||
      typeof row[5] !== 'number' ||
      !Number.isFinite(row[5]) ||
      typeof row[7] !== 'string'
    ) throw new TypeError('invalid market context native value');
    if (values.has(String(row[1]))) {
      throw new TypeError('duplicate market context native value');
    }
    values.set(String(row[1]), Number(row[5]));
    if (String(row[7]) > asOf) asOf = String(row[7]);
  }
  const mean = (keys: string[], required = 1) => {
    const selected = keys.flatMap((key) => {
      const value = values.get(key);
      return value === undefined ? [] : [value];
    });
    return selected.length >= required
      ? roundHalfAwayFromZero(
        selected.reduce((total, member) => total + member, 0) / selected.length,
        2,
      )
      : null;
  };
  const indexTrend = (prefix: 'taiex' | 'otc') => {
    const close = values.get(`${prefix}_close`);
    const ma20 = values.get(`${prefix}_ma20`);
    const ma60 = values.get(`${prefix}_ma60`);
    return close === undefined || ma20 === undefined || ma60 === undefined
      ? null
      : 50 * Number(close >= ma20) + 50 * Number(close >= ma60);
  };
  const taiexTrend = indexTrend('taiex');
  const otcTrend = indexTrend('otc');
  const scoreByGroup: Record<MarketGroupV3, number | null> = {
    trend: taiexTrend === null || otcTrend === null
      ? null : (taiexTrend + otcTrend) / 2,
    breadth: mean([
      'active_common_above_ma20_pct',
      'active_common_above_ma60_pct',
    ], 2),
    flow: mean([
      'foreign_cash_net_5d',
      'investment_trust_net_5d',
      'aggregate_margin_balance_change_5d',
    ]),
    derivatives: mean([
      'foreign_index_futures_net_oi',
      'put_call_ratio',
      'taiwan_vix',
    ]),
    global: mean([
      'sox_return_5d',
      'nasdaq_return_5d',
      'usd_twd_return_5d',
    ]),
  };
  const groupKeys: Record<MarketGroupV3, string[]> = {
    trend: ['taiex_close', 'taiex_ma20', 'taiex_ma60', 'otc_close', 'otc_ma20', 'otc_ma60'],
    breadth: ['active_common_above_ma20_pct', 'active_common_above_ma60_pct'],
    flow: ['foreign_cash_net_5d', 'investment_trust_net_5d', 'aggregate_margin_balance_change_5d'],
    derivatives: ['foreign_index_futures_net_oi', 'put_call_ratio', 'taiwan_vix'],
    global: ['sox_return_5d', 'nasdaq_return_5d', 'usd_twd_return_5d'],
  };
  const groups = Object.fromEntries((Object.keys(groupKeys) as MarketGroupV3[]).map((key) => {
    const stale = excluded.some((row) =>
      row[0] === 'market_context' &&
      groupKeys[key].includes(String(row[1])) &&
      row[4] === 'stale_observation');
    return [key, {
      status: scoreByGroup[key] !== null ? 'fresh' : stale ? 'stale' : 'missing',
      score: scoreByGroup[key],
    }];
  }));
  return marketContext(groups as never, asOf);
}

function shallowCandidateRows(value: unknown) {
  const bundle = array(value, 4);
  if (bundle.length !== 4) throw new TypeError('invalid shallow candidate bundle');
  const candidateRows = array(bundle[0], 5);
  const factorRows = array(bundle[1], 70);
  const sectorRows = array(bundle[2], 50);
  const peerRows = array(bundle[3], 15);
  const candidates = candidateRows.map((valueRow) => {
    const row = array(valueRow, 10);
    if (
      row.length !== 10 ||
      !Number.isSafeInteger(row[0]) ||
      typeof row[1] !== 'string' ||
      typeof row[2] !== 'string' ||
      row[3] !== true ||
      row[4] !== 'direct_candidate' ||
      typeof row[5] !== 'string' ||
      typeof row[6] !== 'string' ||
      typeof row[7] !== 'string' ||
      typeof row[8] !== 'number' ||
      !Number.isFinite(row[8]) ||
      row[8] < 0 ||
      row[8] > 100 ||
      !Array.isArray(row[9]) ||
      row[9].length > 12 ||
      row[9].some((item) => typeof item !== 'string')
    ) throw new TypeError('invalid shallow candidate ledger row');
    return row;
  });
  if (new Set(candidates.map((row) => row[2])).size !== candidates.length) {
    throw new TypeError('duplicate shallow candidate');
  }
  const candidateSymbols = new Set(candidates.map((row) => String(row[2])));
  const factorScores = new Map<string, Map<string, number>>();
  for (const valueRow of factorRows) {
    const row = array(valueRow, 11);
    if (
      row.length !== 11 ||
      row[0] !== 'candidate_factor' ||
      typeof row[1] !== 'string' ||
      typeof row[3] !== 'string' ||
      !candidateSymbols.has(row[3]) ||
      typeof row[5] !== 'number' ||
      !Number.isFinite(row[5]) ||
      row[5] < 0 ||
      row[5] > 100
    ) throw new TypeError('invalid shallow factor row');
    const scores = factorScores.get(row[3]) ?? new Map<string, number>();
    if (scores.has(row[1])) throw new TypeError('duplicate shallow factor row');
    scores.set(row[1], row[5]);
    factorScores.set(row[3], scores);
  }
  const candidateSectors = new Set(candidates.map((row) => String(row[7])));
  for (const valueRow of sectorRows) {
    const row = array(valueRow, 9);
    if (
      row.length !== 9 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      !candidateSectors.has(row[1])
    ) throw new TypeError('invalid shallow sector row');
  }
  for (const valueRow of peerRows) {
    const row = array(valueRow, 16);
    if (
      row.length !== 16 ||
      typeof row[3] !== 'string' ||
      typeof row[6] !== 'string' ||
      !candidateSymbols.has(row[3]) &&
        !candidateSymbols.has(row[6])
    ) throw new TypeError('invalid shallow peer row');
  }
  const average = (
    scores: Map<string, number>,
    keys: Array<[string, boolean?]>,
  ) => {
    const values = keys.flatMap(([key, inverse]) => {
      const score = scores.get(key);
      return score === undefined ? [] : [inverse ? 100 - score : score];
    });
    return values.length === 0
      ? 0
      : roundHalfAwayFromZero(
        values.reduce((total, score) => total + score, 0) / values.length,
        2,
      );
  };
  const computedRows = candidates.map((row) => {
    const scores = factorScores.get(String(row[2])) ?? new Map<string, number>();
    return [
      row[1],
      row[2],
      true,
      'direct_candidate',
      row[5],
      row[8],
      average(scores, [
        ['sector_excess_return_5d'],
        ['sector_excess_return_20d'],
        ['volume_ratio_20d'],
        ['ma20_slope_5d'],
      ]),
      average(scores, [
        ['foreign_net_5d_over_turnover_5d'],
        ['trust_net_5d_over_turnover_5d'],
        ['margin_balance_change_5d_over_turnover_5d', true],
        ['sbl_short_balance_change_5d_over_turnover_5d', true],
      ]),
      average(scores, [
        ['avg_turnover_20d'],
        ['zero_volume_sessions_20d', true],
      ]),
      row[7],
      'succeeded',
      null,
      row[9],
    ];
  });
  return computedRows;
}

function deepCandidateRows(value: unknown) {
  const bundle = array(value, 9);
  if (bundle.length !== 9) throw new TypeError('invalid deep candidate bundle');
  const candidateRows = array(bundle[0], 5);
  const financialRows = array(bundle[1], 4_000);
  const factorRows = array(bundle[2], 70);
  const sectorRows = array(bundle[3], 20);
  const verificationRows = array(bundle[4], 325);
  const evidenceRows = array(bundle[5], 1_000);
  const biasReference = parseReferenceBundle(bundle[6], 'bias reference');
  const technicalReference = parseReferenceBundle(bundle[7], 'technical history reference');
  const reportedPeReference = parseReferenceBundle(bundle[8], 'reported PE reference');
  const candidates = candidateRows.map((valueRow) => {
    const row = array(valueRow, 20);
    if (
      row.length !== 20 ||
      !Number.isSafeInteger(row[0]) ||
      typeof row[1] !== 'string' ||
      typeof row[2] !== 'string' ||
      row[3] !== true ||
      row[4] !== 'direct_candidate' ||
      typeof row[5] !== 'string' ||
      typeof row[6] !== 'string' ||
      typeof row[7] !== 'string' ||
      ![8, 9, 10, 11].every((index) =>
        typeof row[index] === 'number' &&
        Number.isFinite(row[index]) &&
        Number(row[index]) >= 0 &&
        Number(row[index]) <= 100) ||
      !(row[12] === null || (
        typeof row[12] === 'number' &&
        Number.isFinite(row[12]) &&
        row[12] > 0
      )) ||
      !(row[13] === null || typeof row[13] === 'string') ||
      !(row[14] === null || record(row[14])) ||
      !(row[15] === null || record(row[15])) ||
      typeof row[16] !== 'string' ||
      typeof row[17] !== 'string' ||
      !(row[18] === null || (typeof row[18] === 'string' && /^[0-9a-f]{64}$/u.test(row[18]))) ||
      !(row[19] === null || typeof row[19] === 'string')
    ) throw new TypeError('invalid deep candidate native row');
    return row;
  });
  if (new Set(candidates.map((row) => row[2])).size !== candidates.length) {
    throw new TypeError('duplicate deep candidate');
  }
  const symbols = new Set(candidates.map((row) => String(row[2])));
  const stockIds = new Map(candidates.map((row) => [String(row[2]), String(row[1])]));
  const normalizedFinancial = financialRows.map((valueRow) => {
    const row = array(valueRow, 18);
    if (row.length !== 18 || typeof row[0] !== 'string' || !symbols.has(row[0])) {
      throw new TypeError('invalid deep financial row');
    }
    return row;
  });
  const normalizedFactors = factorRows.map((valueRow) => {
    const row = array(valueRow, 11);
    if (
      row.length !== 11 ||
      row[0] !== 'candidate_factor' ||
      typeof row[3] !== 'string' ||
      !symbols.has(row[3])
    ) throw new TypeError('invalid deep factor row');
    return row;
  });
  const sectors = new Set(candidates.map((row) => String(row[6])));
  const normalizedSectors = sectorRows.map((valueRow) => {
    const row = array(valueRow, 6);
    if (row.length !== 6 || typeof row[0] !== 'string' || !sectors.has(row[0])) {
      throw new TypeError('invalid deep sector row');
    }
    return row;
  });
  for (const valueRow of verificationRows) {
    const row = array(valueRow, 11);
    if (row.length !== 11 || typeof row[1] !== 'string' || !symbols.has(row[1])) {
      throw new TypeError('invalid deep valuation verification row');
    }
  }
  const normalizedEvidence = evidenceRows.map((valueRow) => {
    const row = array(valueRow, 19);
    if (
      row.length !== 19 ||
      typeof row[12] !== 'string' ||
      typeof row[13] !== 'string' ||
      !symbols.has(row[13]) ||
      stockIds.get(row[13]) !== row[12] ||
      !['linked_new', 'linked_refresh', 'linked_duplicate_claim'].includes(String(row[14])) ||
      typeof row[15] !== 'string' ||
      typeof row[16] !== 'number' || !Number.isFinite(row[16]) || row[16] < 0 || row[16] > 1 ||
      typeof row[17] !== 'string' ||
      !['explicit_ticker_context','exact_unique_alias_context','duplicate_claim_link'].includes(String(row[18]))
    ) throw new TypeError('invalid deep source evidence row');
    return row;
  });
  return candidates.map((row) => {
    const symbol = String(row[2]);
    const candidateFinancial = normalizedFinancial.filter((fact) => fact[0] === symbol);
    const researchObservations = candidateFinancial.flatMap((fact) => {
      if (
        fact[14] === 'reported' ||
        typeof fact[16] !== 'string' ||
        fact[16].length === 0 ||
        fact[17] !== 'eligible_verified_estimate' ||
        typeof fact[1] !== 'string' ||
        typeof fact[3] !== 'string' ||
        typeof fact[5] !== 'number' ||
        typeof fact[6] !== 'string' ||
        typeof fact[9] !== 'string' ||
        typeof fact[11] !== 'string' ||
        typeof fact[12] !== 'string'
      ) return [];
      const metric = fact[1] === 'quarterly_diluted_eps' ? 'diluted_eps'
        : fact[1] === 'quarterly_ebitda' ? 'ebitda'
          : fact[1] === 'quarterly_revenue' ? 'revenue'
            : fact[1] === 'book_value_per_share' ? 'book_value_per_share'
              : fact[1] === 'broker_target_price' ? 'target_price' : null;
      return metric === null ? [] : [{
        evidenceRef: fact[12],
        institutionId: fact[16],
        metric,
        periodEnd: fact[3],
        publisherVerified: true,
        recordedAt: fact[11],
        sourceTimestamp: fact[9],
        unit: fact[6],
        value: fact[5],
        estimateKind: fact[14],
        estimateHorizon: fact[15],
        selectionDisposition: fact[17],
      }];
    });
    const candidateEvidence = normalizedEvidence.filter(
      (evidence) => evidence[13] === symbol,
    );
    if (
      candidateEvidence.length === 0 ||
      typeof row[12] !== 'number' ||
      typeof row[13] !== 'string'
    ) {
      return [
        row[1], symbol, true, 'direct_candidate', row[5], row[6],
        null, null, null, null, null, null, null, null, 'data_integrity_failure',
      ];
    }
    return computeDeepCandidateRow({
      anchorClaimId: row[5],
      candidateOrdinal: row[0],
      canonicalSector: row[6],
      currentPrice: row[12],
      evidenceRows: candidateEvidence,
      factorInputs: normalizedFactors.filter((factor) => factor[3] === symbol),
      financialFacts: candidateFinancial,
      financialManifestRef: row[16],
      priorMaterialChangeHash: row[18],
      priorAnalysisGeneratedAt: row[19],
      marketContext: row[14],
      moverEvidenceRef: row[13],
      researchObservations,
      sectorCycle: row[15],
      sectorValuationReferences: normalizedSectors.filter(
        (sector) => sector[0] === row[6],
      ),
      sectorValuationManifestRef: row[17],
      shallowChip: row[10],
      shallowLiquidity: row[11],
      shallowPriceVolume: row[9],
      sourceCutoff: row[7],
      sourcePriority: row[8],
      stockId: row[1],
      symbol,
      biasReference,
      technicalReference,
      reportedPeReference,
    });
  });
}

const factorKeys: FactorKeyV3[] = [
  'priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation',
];

const sourceClassTtlSeconds: Record<SourceClassV3, number> = {
  official: 3_024_000,
  public_research: 604_800,
  curated_thesis: 604_800,
  community: 259_200,
};

const sourceClassAuthority: Record<SourceClassV3, number> = {
  official: 0,
  public_research: 1,
  curated_thesis: 2,
  community: 3,
};

function decisionEvidenceRows(evidence: unknown[][], sourceCutoff?: string): unknown[][] {
  const eligible = evidence.filter((row) =>
    row[7] === 'fresh' && row[9] === 'supports' &&
    typeof row[3] === 'string' &&
    typeof row[4] === 'string' && row[4] in sourceClassAuthority &&
    (sourceCutoff === undefined || (
      Number.isFinite(Date.parse(String(row[6]))) &&
      Date.parse(String(row[6])) + sourceClassTtlSeconds[row[4] as SourceClassV3] * 1_000 >
        Date.parse(sourceCutoff)
    )),
  ).sort((left, right) =>
    Number(right[16]) - Number(left[16]) ||
    String(right[6]).localeCompare(String(left[6])) ||
    String(left[17]).localeCompare(String(right[17])) ||
    String(left[2]).localeCompare(String(right[2])),
  );
  return eligible.filter((row, index) =>
    eligible.findIndex((candidate) => candidate[3] === row[3]) === index,
  );
}

function sourceConfidenceFromRoots(evidence: unknown[][]): number {
  const weights = [1, .7, .5, .3, .2];
  const selected = evidence.slice(0, weights.length);
  if (selected.length === 0) return 0;
  const denominator = weights.slice(0, selected.length).reduce((sum, weight) => sum + weight, 0);
  return roundHalfAwayFromZero(selected.reduce((sum, row, index) =>
    sum + Number(row[16]) * weights[index], 0) / denominator, 4);
}

function earliestEvidenceExpiry(evidence: unknown[][]): string | null {
  const expiries = evidence.flatMap((row) => {
    const sourceClass = row[4] as SourceClassV3;
    const effectiveAt = typeof row[6] === 'string' ? Date.parse(row[6]) : Number.NaN;
    const ttl = sourceClassTtlSeconds[sourceClass];
    return Number.isFinite(effectiveAt) && Number.isFinite(ttl)
      ? [effectiveAt + ttl * 1_000] : [];
  });
  return expiries.length ? new Date(Math.min(...expiries)).toISOString().replace('.000Z', 'Z') : null;
}

function technicalEntryTrigger(technical: Record<string, unknown>): string | null {
  const entryZone = record(technical.entryZone) ? technical.entryZone : null;
  const trigger = record(technical.trigger) ? technical.trigger : null;
  if (!entryZone && !trigger) return null;
  return canonicalJson(entryZone ?? trigger).slice(0, 160);
}

function computeDeepCandidateRow(input: Record<string, unknown>) {
  if (
    typeof input.stockId !== 'string' ||
    typeof input.symbol !== 'string' ||
    typeof input.anchorClaimId !== 'string' ||
    typeof input.canonicalSector !== 'string' ||
    typeof input.sourceCutoff !== 'string' ||
    !Number.isSafeInteger(input.candidateOrdinal) ||
    typeof input.sourcePriority !== 'number' ||
    !Array.isArray(input.evidenceRows) ||
    input.evidenceRows.length === 0
  ) throw new TypeError('invalid deep candidate computation input');
  const evidence = input.evidenceRows as unknown[][];
  const decisionEvidence = decisionEvidenceRows(evidence, String(input.sourceCutoff));
  const anchorEvidence = evidence.find((row) =>
    row[15] === input.anchorClaimId && row[7] === 'fresh' && row[9] === 'supports' &&
    Date.parse(String(row[6])) + sourceClassTtlSeconds[row[4] as SourceClassV3] * 1_000 >
      Date.parse(String(input.sourceCutoff)));
  const sourceConfidence = sourceConfidenceFromRoots(decisionEvidence);
  const valuation = computeCandidateValuation(input);
  const factorRows = array(input.factorInputs ?? [], 14);
  const percentileByKey = new Map<string, number>();
  for (const valueRow of factorRows) {
    const row = array(valueRow, 11);
    if (
      row.length !== 11 ||
      row[0] !== 'candidate_factor' ||
      typeof row[1] !== 'string' ||
      typeof row[5] !== 'number' ||
      !Number.isFinite(row[5])
    ) continue;
    percentileByKey.set(row[1], row[5]);
  }
  const part = (key: string, weight: number, inverse = false) => {
    const selected = percentileByKey.get(key);
    return {
      value: selected === undefined ? null : inverse ? 100 - selected : selected,
      status: selected === undefined ? 'missing' as const : 'fresh' as const,
      weight,
    };
  };
  const priceVolume = weightedFactor([
    part('sector_excess_return_5d', 0.30),
    part('sector_excess_return_20d', 0.30),
    part('volume_ratio_20d', 0.25),
    part('ma20_slope_5d', 0.15),
  ]);
  const chip = weightedFactor([
    part('foreign_net_5d_over_turnover_5d', 0.45),
    part('trust_net_5d_over_turnover_5d', 0.25),
    part('margin_balance_change_5d_over_turnover_5d', 0.15, true),
    part('sbl_short_balance_change_5d_over_turnover_5d', 0.15, true),
  ]);
  const fundamental = weightedFactor([
    part('monthly_revenue_yoy', 0.40),
    part('revenue_yoy_acceleration_3m', 0.25),
    part('quarterly_eps_yoy', 0.25),
    part('operating_margin_yoy_delta', 0.10),
  ]);
  const liquidity = weightedFactor([
    part('avg_turnover_20d', 0.70),
    part('zero_volume_sessions_20d', 0.30, true),
  ]);
  const market = validMarketContext(input.marketContext)
    ? input.marketContext as unknown as MarketContextV3
    : marketContext({
      trend: { status: 'missing', score: null },
      breadth: { status: 'missing', score: null },
      flow: { status: 'missing', score: null },
      derivatives: { status: 'missing', score: null },
      global: { status: 'missing', score: null },
    }, input.sourceCutoff);
  const sector = record(input.sectorCycle) ? input.sectorCycle : null;
  const marketNumeric = market.regime === 'risk_on' ? 90 :
    market.regime === 'selective' ? 65 :
      market.regime === 'risk_off' ? 0 : null;
  const sectorNumeric = sector && typeof sector.marketScore === 'number'
    ? sector.marketScore : null;
  const marketSector = weightedFactor([
    {
      value: marketNumeric,
      status: marketNumeric === null ? 'missing' : 'fresh',
      weight: 0.40,
    },
    part('sector_excess_return_20d', 0.40),
    {
      value: sectorNumeric,
      status: sectorNumeric === null ? 'missing' : 'fresh',
      weight: 0.20,
    },
  ]);
  const valuationValue = valuation.status === 'normal' &&
    valuation.p10 !== null && valuation.p50 !== null &&
    typeof input.currentPrice === 'number' && input.currentPrice > 0
    ? valuationFactor(valuation.p10, valuation.p50, input.currentPrice)
    : null;
  const factors: Record<FactorKeyV3, FactorValueV3> = {
    priceVolume,
    chip,
    catalyst: { value: input.sourcePriority, status: 'fresh' },
    marketSector,
    fundamental,
    valuation: {
      value: valuationValue,
      status: valuationValue === null
        ? valuation.status === 'stale' ? 'stale' : 'missing'
        : 'fresh',
    },
  };
  const horizons = ([
    'momentum_5_20d', 'swing_20_60d', 'thesis_120_250d',
  ] as const).map((horizon) =>
    scoreHorizon(horizon, factors, sourceConfidence, valuation.confidence));
  const thesis = horizons[2];
  const sourceClasses = new Set(decisionEvidence.map((row) => row[4]).filter(
    (sourceClass) => typeof sourceClass === 'string',
  ));
  const formalStatus = formalResearchStatus({
    inDeepPool: true,
    criticalDataInvalid: decisionEvidence.length === 0 || !anchorEvidence,
    valuation,
    thesis,
    sourceConfidence,
    independentClasses: sourceClasses.size,
    hasOfficialOrResearch: decisionEvidence.some(
      (row) => (row[4] === 'official' || row[4] === 'public_research') &&
        row[8] === 'publisher_verified',
    ),
  });
  const correctness = buildFactorCorrectnessV311({
    symbol: String(input.symbol),
    stockId: String(input.stockId),
    sector: String(input.canonicalSector),
    sourceCutoff: String(input.sourceCutoff),
    sourcePriority: Number(input.sourcePriority),
    financialRows: input.financialFacts as unknown[][],
    valuation: valuation as unknown as Record<string, unknown>,
    technical: input.technicalReference as ReturnType<typeof parseReferenceBundle>,
    bias: input.biasReference as ReturnType<typeof parseReferenceBundle>,
    reportedPe: input.reportedPeReference as ReturnType<typeof parseReferenceBundle>,
    factorManifestRef: String(input.sectorValuationManifestRef),
    financialManifestRef: String(input.financialManifestRef),
    priorMaterialChangeHash: typeof input.priorMaterialChangeHash === 'string'
      ? input.priorMaterialChangeHash : null,
    priorAnalysisGeneratedAt: typeof input.priorAnalysisGeneratedAt === 'string'
      ? input.priorAnalysisGeneratedAt : null,
  });
  const currentPrice = typeof input.currentPrice === 'number' && input.currentPrice > 0
    ? input.currentPrice : 1;
  const technical = correctness.technicalDecision as unknown as Record<string, unknown>;
  const technicalState = technical.availability === 'available' && typeof technical.state === 'string'
    ? technical.state as 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' |
      'breakout_confirmed' | 'extended' | 'invalidated'
    : null;
  const technicalBuyEligible = technicalState === 'at_support' || technicalState === 'breakout_confirmed';
  const technicalWaitEligible = technicalState === 'breakout_pending' || technicalState === 'extended';
  const technicalInvalidation = record(technical.invalidation) ? technical.invalidation : null;
  const stopPrice = technicalBuyEligible && typeof technicalInvalidation?.stop === 'number'
    ? technicalInvalidation.stop : null;
  const quality = correctness.factorAxes.quality;
  const qualityActionEligible = quality.status === 'available' &&
    quality.availableWeight >= 0.65 && typeof quality.score === 'number' && quality.score >= 50;
  const bias20Atr = record(technical.maDeviation) && typeof technical.maDeviation.bias20Atr === 'number'
    ? technical.maDeviation.bias20Atr : null;
  const decision = actionDecision({
    formalStatus,
    market,
    momentum: horizons[0],
    swing: horizons[1],
    valuation,
    sourceClass: anchorEvidence?.[8] === 'publisher_verified'
      ? anchorEvidence[4] as 'official' | 'public_research' | 'curated_thesis' | 'community'
      : 'community',
    sourceConfidence,
    independentRootCount: decisionEvidence.length,
    criticalDataInvalid: decisionEvidence.length === 0 || !anchorEvidence,
    entryConfirmed: technicalBuyEligible,
    technicallyExtended: technicalState === 'extended',
    technicalState,
    qualityActionEligible,
    biasSafetyObserveOnly: technicalState !== null &&
      !['below_support', 'reclaim_required', 'invalidated'].includes(technicalState) &&
      bias20Atr !== null && bias20Atr <= -3,
    currentPrice,
    p50UpsidePct: valuation.p50 === null ? null : 100 * (valuation.p50 / currentPrice - 1),
    p10DownsidePct: valuation.p10 === null ? null : 100 * (valuation.p10 / currentPrice - 1),
    liquidityFactor: liquidity.value,
    triggerCapable: technicalBuyEligible || technicalWaitEligible,
    entryTrigger: technicalEntryTrigger(technical),
    stopPrice,
    evidenceExpiresAt: earliestEvidenceExpiry(decisionEvidence),
  });
  if (!validActionDecisionV3(decision, { sourceCutoff: String(input.sourceCutoff) })) {
    throw new TypeError('invalid internal action decision');
  }
  return [
    input.stockId,
    input.symbol,
    true,
    'direct_candidate',
    input.anchorClaimId,
    input.canonicalSector,
    formalStatus,
    { ...valuation, relativeMultiple: correctness.relativeMultiple },
    decision,
    decision.initialPositionPct,
    decision.maximumPositionPct,
    horizons.map((horizon) => [
      horizon.horizon,
      Number(input.candidateOrdinal) + 1,
      horizon.score,
      horizon.confidence,
      horizon.availableWeight,
      Object.fromEntries(factorKeys.map((key) => [key, {
        value: horizon.factors[key].value,
        status: horizon.factors[key].status === 'fresh' ? 'available' : horizon.factors[key].status,
        contribution: horizon.factors[key].contribution,
        evidenceRefs: [],
      }])),
    ]),
    input.evidenceRows,
    correctness,
    null,
  ];
}

function validMarketContext(value: unknown): value is Record<string, unknown> {
  return record(value) &&
    ['risk_off', 'unknown', 'selective', 'risk_on'].includes(String(value.regime)) &&
    record(value.groups);
}

type FinancialFactRow = {
  key: string;
  periodEnd: string;
  value: number;
  authorityTier: string;
  sourceTimestamp: string;
  sourceRef: string;
};

function operatingBridge(facts: FinancialFactRow[]) {
  const select = (key: string, count = 4) => facts.filter((fact) => fact.key === key)
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd) ||
      right.sourceTimestamp.localeCompare(left.sourceTimestamp) || left.sourceRef.localeCompare(right.sourceRef))
    .slice(0, count);
  const requiredKeys = ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense','quarterly_operating_income',
    'quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense','quarterly_noncontrolling_interest',
    'quarterly_net_income_attributable_to_common'] as const;
  const selected = new Map(requiredKeys.map((key) => [key, select(key)]));
  const sharesRows = select('diluted_weighted_average_shares');
  if ([...selected.values()].some((rows) => rows.length !== 4) || sharesRows.length !== 4) return null;
  const periods = selected.get('quarterly_revenue')!.map((row) => row.periodEnd);
  if ([...selected.values(), sharesRows].some((rows) => rows.some((row, index) => row.periodEnd !== periods[index]))) return null;
  const sumRows = (rows: FinancialFactRow[]) => rows.reduce((total, row) => total + row.value, 0);
  const revenue = sumRows(selected.get('quarterly_revenue')!);
  const grossProfit = sumRows(selected.get('quarterly_gross_profit')!);
  const operatingExpense = sumRows(selected.get('quarterly_operating_expense')!);
  const operatingIncome = sumRows(selected.get('quarterly_operating_income')!);
  const nonOperatingIncome = sumRows(selected.get('quarterly_non_operating_income')!);
  const pretaxIncome = sumRows(selected.get('quarterly_pretax_income')!);
  const incomeTax = sumRows(selected.get('quarterly_income_tax_expense')!);
  const noncontrollingInterest = sumRows(selected.get('quarterly_noncontrolling_interest')!);
  const commonNetIncome = sumRows(selected.get('quarterly_net_income_attributable_to_common')!);
  const dilutedShares = sumRows(sharesRows) / sharesRows.length;
  const tolerance = Math.max(1, Math.abs(pretaxIncome) * 0.05);
  if (![revenue,grossProfit,operatingExpense,operatingIncome,nonOperatingIncome,pretaxIncome,incomeTax,noncontrollingInterest,commonNetIncome,dilutedShares].every(Number.isFinite)
    || revenue <= 0 || dilutedShares <= 0 || grossProfit > revenue + tolerance
    || Math.abs((grossProfit - operatingExpense) - operatingIncome) > tolerance
    || Math.abs((operatingIncome + nonOperatingIncome) - pretaxIncome) > tolerance
    || (pretaxIncome > 0 && (incomeTax < 0 || incomeTax > pretaxIncome * 0.6))
    || Math.abs((pretaxIncome - incomeTax - noncontrollingInterest) - commonNetIncome) > tolerance) return null;
  const used = [...selected.values()].flat().concat(sharesRows);
  const asOf = used.map((row) => row.sourceTimestamp).sort().at(-1)!;
  return { revenue, grossProfit, operatingExpense, operatingIncome, nonOperatingIncome, pretaxIncome, incomeTax,
    noncontrollingInterest, commonNetIncome, dilutedShares,
    dilutedEps: commonNetIncome / dilutedShares, asOf,
    sourceRef: used.map((row) => row.sourceRef).sort()[0] };
}

export function computeCandidateValuation(input: Record<string, unknown>): ValuationDistributionV3 {
  const missing = (reason: string): ValuationDistributionV3 => ({
    status: 'missing',
    method: null,
    p10: null,
    p50: null,
    p90: null,
    bear: null,
    base: null,
    bull: null,
    crossChecks: [],
    confidence: null,
    reasons: [reason],
    asOf: String(input.sourceCutoff),
    evidenceRefs: [] as string[],
    verificationRef: null,
    referenceManifestRef: null,
    historicalSampleCount: 0,
    peerSampleCount: 0,
    historicalReferenceQuantiles: null,
    peerReferenceQuantiles: null,
  });
  const rows = array(input.financialFacts ?? [], 800);
  const facts: FinancialFactRow[] = rows.flatMap((valueRow) => {
    if (!Array.isArray(valueRow) || valueRow.length !== 18) return [];
    if (
      typeof valueRow[1] !== 'string' ||
      typeof valueRow[3] !== 'string' ||
      typeof valueRow[5] !== 'number' ||
      typeof valueRow[9] !== 'string' ||
      typeof valueRow[12] !== 'string'
    ) return [];
    return [{
      key: valueRow[1],
      periodEnd: valueRow[3],
      value: valueRow[5],
      authorityTier: String(valueRow[8] ?? ''),
      sourceTimestamp: valueRow[9],
      sourceRef: valueRow[12],
    }];
  });
  const officialFacts = facts.filter((fact) =>
    ['official_filing','official_company_event','official'].includes(fact.authorityTier));
  const values = (key: string, maximum = Number.MAX_SAFE_INTEGER) =>
    officialFacts.filter((fact) => fact.key === key)
      .sort((left, right) =>
        right.periodEnd.localeCompare(left.periodEnd) ||
        right.sourceTimestamp.localeCompare(left.sourceTimestamp) ||
        left.sourceRef.localeCompare(right.sourceRef))
      .slice(0, maximum);
  const sum = (key: string, maximum = 4) => {
    const selected = values(key, maximum);
    return selected.length === maximum
      ? selected.reduce((total, fact) => total + fact.value, 0)
      : null;
  };
  const bridge = operatingBridge(officialFacts);
  const ttmRevenue = bridge?.revenue ?? sum('quarterly_revenue');
  const ttmNetIncome = bridge?.commonNetIncome ?? sum('quarterly_net_income');
  const dilutedEps = bridge?.dilutedEps ?? null;
  const ttmEbitda = sum('quarterly_ebitda');
  const depreciation = sum('depreciation_amortization');
  const shares = bridge?.dilutedShares ?? values('diluted_weighted_average_shares', 1)[0]?.value ?? null;
  const netDebt = values('net_debt', 1)[0]?.value ?? null;
  const bookValues = values('book_value_per_share', 9);
  const bookValuePerShare = bookValues[0]?.value ?? null;
  const roeRows = values('roe', 8);
  const roe = roeRows[0]?.value ?? null;
  const netAssetValue = values('net_asset_value', 1)[0]?.value ?? null;
  const cycleNetIncome = values('quarterly_net_income_attributable_to_common', 12)
    .map((fact) => fact.value);
  const referenceRows = array(input.sectorValuationReferences ?? [], 4);
  const referenceAvailable = (method: string) => referenceRows.some((valueRow) =>
    Array.isArray(valueRow) && valueRow.length === 6 && valueRow[1] === method && Number(valueRow[2]) >= 5
    && [3, 4, 5].every((index) => typeof valueRow[index] === 'number'));
  const monthly = values('monthly_revenue', 16);
  const monthlyYoy = [0, 1, 2].flatMap((index) => {
    const current = monthly[index]?.value;
    const prior = monthly[index + 12]?.value;
    return typeof current === 'number' && typeof prior === 'number' && prior > 0
      ? [100 * (current / prior - 1)] : [];
  });
  const method = selectValuationMethod({
    sector: String(input.canonicalSector),
    bookValuePerShare,
    roe,
    ttmNetIncome,
    dilutedEps,
    depreciationAmortizationPctRevenue:
      depreciation !== null && ttmRevenue !== null && ttmRevenue !== 0
        ? 100 * depreciation / ttmRevenue : null,
    ttmEbitda,
    ttmRevenue,
    revenueYoyMedian3m: monthlyYoy.length === 3
      ? type7Quantile(monthlyYoy, 0.5) : null,
    grossMarginPct: ratioMargin(values('quarterly_gross_profit', 1),
      values('quarterly_revenue', 1)),
    netDebt,
    dilutedShares: shares,
    cycleNetIncome,
    evEbitdaCrossCheckAvailable: ttmEbitda !== null && ttmEbitda > 0 && netDebt !== null && shares !== null && shares > 0
      && referenceAvailable('ev_ebitda'),
    roeSeries: roeRows.map((fact) => fact.value),
    pbRoeCrossCheckAvailable: referenceAvailable('pb_roe'),
    netAssetValue,
  });
  if (!method) return missing('no_eligible_method');
  if (!['pb_roe','residual_income','nav'].includes(method) && bridge === null) {
    return missing('missing_operating_bridge');
  }
  if (typeof input.currentPrice !== 'number' || input.currentPrice <= 0) {
    return missing('missing_required_inputs');
  }
  const research = array(input.researchObservations ?? [], 200)
    .filter(record) as unknown as VerifiedResearchObservationV3[];
  const metric = method === 'pe' || method === 'normalized_pe' ? 'diluted_eps' :
    method === 'ev_ebitda' ? 'ebitda' :
      method === 'ev_sales' ? 'revenue' : 'book_value_per_share';
  const analyst = selectVerifiedResearchDistribution({
    observations: research,
    metric,
    sourceCutoff: String(input.sourceCutoff),
  });
  const consensus = selectVerifiedResearchDistribution({
    observations: research,
    metric: 'target_price',
    sourceCutoff: String(input.sourceCutoff),
  });
  const fundamentals = analyst.distribution && !['residual_income','nav'].includes(method)
    ? [analyst.distribution.p10, analyst.distribution.p50, analyst.distribution.p90] as
      [number, number, number]
    : formulaFundamentals({
      method,
      monthlyYoy,
      quarterlyRevenue: values('quarterly_revenue', 5),
      quarterlyNetIncome: values('quarterly_net_income_attributable_to_common', 5),
      quarterlyEbitda: values('quarterly_ebitda', 5),
      ttmRevenue,
      shares,
      bookValues,
      cycleNetIncome,
      roeSeries: roeRows.map((fact) => fact.value),
      netAssetValue,
    });
  if (!fundamentals) return missing(
    ['pb_roe','residual_income','nav','normalized_pe'].includes(method) || monthlyYoy.length < 3
      ? 'insufficient_series' : 'missing_required_inputs',
  );
  const multipleKey = method === 'pe' || method === 'normalized_pe' ? 'pe_multiple' :
    method === 'pb_roe' || method === 'residual_income' ? 'pb_multiple' :
      method === 'nav' ? 'nav_discount' :
      method === 'ev_ebitda' ? 'ev_ebitda_multiple' : 'ev_sales_multiple';
  const historical = values(multipleKey, 20).map((fact) => fact.value)
    .filter((value) => Number.isFinite(value) && value > 0);
  const peerRow = referenceRows.find((valueRow) =>
    Array.isArray(valueRow) && valueRow[1] === method);
  const peerReference = Array.isArray(peerRow) &&
    peerRow.length === 6 &&
    [2, 3, 4, 5].every((index) => typeof peerRow[index] === 'number')
    ? {
      count: Number(peerRow[2]),
      p10: Number(peerRow[3]),
      p50: Number(peerRow[4]),
      p90: Number(peerRow[5]),
    }
    : null;
  const evidenceRefs = [
    ...analyst.retained.map((row) => row.evidenceRef),
    ...officialFacts.map((fact) => fact.sourceRef),
    typeof input.moverEvidenceRef === 'string' ? input.moverEvidenceRef : '',
  ].filter(Boolean);
  const applicableAsOf = [bridge?.asOf, ...analyst.retained.map((row) => row.sourceTimestamp)]
    .filter((value): value is string => typeof value === 'string').sort().at(-1)
    ?? officialFacts.map((fact) => fact.sourceTimestamp).sort().at(-1) ?? String(input.sourceCutoff);
  const crossChecks: NonNullable<Parameters<typeof buildValuationDistribution>[0]['crossChecks']> = [];
  const methodOperands: NonNullable<Parameters<typeof buildValuationDistribution>[0]['methodOperands']> = {};
  if (method === 'nav' && netAssetValue !== null && shares !== null && shares > 0) {
    const fact = values('net_asset_value', 1)[0]!;
    methodOperands.nav = { netAssetValue, dilutedShares: shares, discounts: [0.65,0.8,0.95],
      sourceRef: fact.sourceRef, asOf: fact.sourceTimestamp };
  } else if (method === 'residual_income' && bookValues[0] && roeRows.length === 8) {
    methodOperands.residualIncome = { bookValuePerShare: bookValues[0].value,
      roes: [0.25,0.5,0.75].map((quantile) => (type7Quantile(roeRows.map((row) => row.value), quantile) ?? 0) / 100) as [number,number,number],
      costs: [0.12,0.1,0.08], growth: [0,0.03,0.05], sourceRef: bookValues[0].sourceRef,
      asOf: [bookValues[0].sourceTimestamp, ...roeRows.map((row) => row.sourceTimestamp)].sort().at(-1)! };
  }
  const officialFormulaSource = [
    bridge?.sourceRef,
    methodOperands.nav?.sourceRef,
    methodOperands.residualIncome?.sourceRef,
    ...officialFacts.map((fact) => fact.sourceRef),
  ].find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!officialFormulaSource) return missing('missing_formula_source');
  const referenceQuantiles = (crossMethod: string) => {
    const row = referenceRows.find((valueRow) => Array.isArray(valueRow) && valueRow[1] === crossMethod);
    return Array.isArray(row) && row.length === 6 && [3,4,5].every((index) => typeof row[index] === 'number')
      ? [Number(row[3]), Number(row[4]), Number(row[5])] as [number,number,number] : null;
  };
  if (method === 'normalized_pe') {
    const crossFundamentals = formulaFundamentals({ method: 'ev_ebitda', monthlyYoy,
      quarterlyRevenue: values('quarterly_revenue', 5), quarterlyNetIncome: values('quarterly_net_income', 5),
      quarterlyEbitda: values('quarterly_ebitda', 5), ttmRevenue, shares, bookValues,
      cycleNetIncome, roeSeries: roeRows.map((fact) => fact.value), netAssetValue });
    const multiples = referenceQuantiles('ev_ebitda');
    if (crossFundamentals && multiples && shares !== null && shares > 0 && netDebt !== null) {
      const crossValues = crossFundamentals.map((value, index) => (value * multiples[index] - netDebt) / shares) as [number,number,number];
      crossChecks.push({ method: 'ev_ebitda', bear: crossValues[0], base: crossValues[1], bull: crossValues[2],
        asOf: String(input.sourceCutoff), evidenceRefs: evidenceRefs.slice(0, 8) });
    }
  } else if (method === 'residual_income') {
    const crossFundamentals = formulaFundamentals({ method: 'pb_roe', monthlyYoy,
      quarterlyRevenue: [], quarterlyNetIncome: [], quarterlyEbitda: [], ttmRevenue, shares, bookValues,
      cycleNetIncome, roeSeries: roeRows.map((fact) => fact.value), netAssetValue });
    const multiples = referenceQuantiles('pb_roe');
    if (crossFundamentals && multiples) {
      const crossValues = crossFundamentals.map((value, index) => value * multiples[index]) as [number,number,number];
      crossChecks.push({ method: 'pb_roe', bear: crossValues[0], base: crossValues[1], bull: crossValues[2],
        asOf: String(input.sourceCutoff), evidenceRefs: evidenceRefs.slice(0, 8) });
    }
  }
  return buildValuationDistribution({
    method,
    fundamentals,
    historicalMultiples: historical,
    peerMultiples: [],
    peerReference,
    currentPrice: input.currentPrice,
    netDebt: netDebt ?? undefined,
    dilutedShares: shares ?? undefined,
    consensusP50: consensus.distribution?.p50,
    asOf: applicableAsOf,
    evidenceRefs,
    formulaSourceRef: officialFormulaSource,
    formulaFundamentalKey: method === 'pe' || method === 'normalized_pe' ? 'diluted_eps'
      : method === 'ev_ebitda' ? 'ebitda' : method === 'ev_sales' ? 'revenue'
        : method === 'nav' ? 'net_asset_value_per_share' : 'book_value_per_share',
    formulaFundamentalUnit: ['pe','normalized_pe','pb_roe','residual_income','nav'].includes(method)
      ? 'TWD_per_share' : 'TWD',
    methodOperands,
    referenceManifestRef:
      typeof input.sectorValuationManifestRef === 'string'
        ? input.sectorValuationManifestRef : null,
    crossChecks,
  });
}

function ratioMargin(numerator: FinancialFactRow[], denominator: FinancialFactRow[]) {
  if (!numerator[0] || !denominator[0] || denominator[0].value === 0) return null;
  return 100 * numerator[0].value / denominator[0].value;
}

function formulaFundamentals(input: {
  method: 'pe' | 'normalized_pe' | 'pb_roe' | 'residual_income' | 'nav' | 'ev_ebitda' | 'ev_sales';
  monthlyYoy: number[];
  quarterlyRevenue: FinancialFactRow[];
  quarterlyNetIncome: FinancialFactRow[];
  quarterlyEbitda: FinancialFactRow[];
  ttmRevenue: number | null;
  shares: number | null;
  bookValues: FinancialFactRow[];
  cycleNetIncome: number[];
  roeSeries: number[];
  netAssetValue: number | null;
}): [number, number, number] | null {
  if (input.method === 'nav') {
    if (input.netAssetValue === null || input.netAssetValue <= 0 || input.shares === null || input.shares <= 0) return null;
    const perShare = input.netAssetValue / input.shares;
    return [perShare * 0.65, perShare * 0.8, perShare * 0.95];
  }
  if (input.method === 'residual_income') {
    if (input.bookValues.length === 0 || input.roeSeries.length !== 8) return null;
    const bvps = input.bookValues[0].value;
    const policies = [[0.25, 0.12, 0], [0.5, 0.1, 0.03], [0.75, 0.08, 0.05]] as const;
    return policies.map(([quantile, cost, growth]) => {
      const scenarioRoe = (type7Quantile(input.roeSeries, quantile) ?? 0) / 100;
      return bvps + Math.max(-bvps, ((scenarioRoe - cost) * bvps) / (cost - growth));
    }) as [number, number, number];
  }
  if (input.method === 'pb_roe') {
    if (input.bookValues.length !== 9) return null;
    const changes = input.bookValues.slice(0, 8).map(
      (value, index) => value.value - input.bookValues[index + 1].value,
    );
    return ([0.1, 0.5, 0.9] as const).map((p) =>
      Math.max(0, input.bookValues[0].value + 4 * (type7Quantile(changes, p) ?? 0)),
    ) as [number, number, number];
  }
  if (input.method === 'normalized_pe') {
    if (input.cycleNetIncome.length !== 12 || input.shares === null || input.shares <= 0) return null;
    return ([0.25, 0.5, 0.75] as const).map((p) => Math.max(0, (type7Quantile(input.cycleNetIncome, p) ?? 0) * 4) / input.shares!) as [number, number, number];
  }
  if (input.monthlyYoy.length !== 3 || input.ttmRevenue === null) return null;
  const growthBase = Math.max(-30, Math.min(50, type7Quantile(input.monthlyYoy, 0.5) ?? 0));
  const deviations = input.monthlyYoy.map((value) => Math.abs(value - growthBase));
  const growthSpread = Math.max(5, Math.min(20,
    1.4826 * (type7Quantile(deviations, 0.5) ?? 0)));
  const growth = [
    Math.max(-50, Math.min(70, growthBase - growthSpread)),
    Math.max(-50, Math.min(70, growthBase)),
    Math.max(-50, Math.min(70, growthBase + growthSpread)),
  ];
  const revenue = growth.map((value) => input.ttmRevenue! * (1 + value / 100));
  if (input.method === 'ev_sales') return revenue as [number, number, number];
  const numerators = input.method === 'pe'
    ? input.quarterlyNetIncome : input.quarterlyEbitda;
  if (numerators.length < 5 || input.quarterlyRevenue.length < 5) return null;
  const margins = numerators.slice(0, 4).map((value, index) =>
    100 * value.value / input.quarterlyRevenue[index].value);
  if (margins.some((value) => !Number.isFinite(value))) return null;
  const latestDelta = margins[0] -
    100 * numerators[4].value / input.quarterlyRevenue[4].value;
  const ttmMargin = numerators.slice(0, 4).reduce(
    (total, value) => total + value.value, 0,
  ) / input.quarterlyRevenue.slice(0, 4).reduce(
    (total, value) => total + value.value, 0,
  ) * 100;
  const base = ttmMargin + Math.max(-3, Math.min(3, latestDelta / 2));
  const median = type7Quantile(margins, 0.5) ?? base;
  const spread = Math.max(1, type7Quantile(
    margins.map((value) => Math.abs(value - median)), 0.5,
  ) ?? 1);
  const outputs = revenue.map((value, index) =>
    value * (base + (index - 1) * spread) / 100);
  if (input.method === 'pe') {
    if (input.shares === null || input.shares <= 0) return null;
    return outputs.map((value) => value / input.shares!) as [number, number, number];
  }
  return outputs as [number, number, number];
}

function portfolioRows(value: unknown) {
  const rows = array(value, 20).map((valueRow) => {
    const row = array(valueRow, 5);
    if (
      row.length !== 5 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      typeof row[2] !== 'number' || !Number.isFinite(row[2]) ||
      typeof row[3] !== 'number' || !Number.isFinite(row[3]) || row[3] < 0 ||
      !validActionDecisionV3(row[4])
    ) throw new TypeError('invalid portfolio allocation row');
    return { symbol: row[0], sector: row[1], score: row[2], grossCapPct: row[3], decision: row[4] };
  });
  if (new Set(rows.map((row) => row.grossCapPct)).size > 1) {
    throw new TypeError('inconsistent portfolio gross cap');
  }
  let gross = 0;
  let accepted = 0;
  const sectorExposure = new Map<string, number>();
  const classOrder = (action: unknown) => action === 'starter_now' ? 0 : action === 'event_starter' ? 1 : 2;
  return rows.sort((left, right) =>
    classOrder(left.decision.newPositionAction) - classOrder(right.decision.newPositionAction) ||
    right.score - left.score ||
    Number(right.decision.confidence) - Number(left.decision.confidence) ||
    left.symbol.localeCompare(right.symbol)).map((row) => {
    const action = String(row.decision.newPositionAction);
    if (action !== 'starter_now' && action !== 'event_starter') return [row.symbol, row.decision];
    const requested = Number(row.decision.initialPositionPct);
    const minimum = action === 'starter_now' ? 3 : 2;
    const capacity = Math.max(0, Math.min(
      10,
      25 - (sectorExposure.get(row.sector) ?? 0),
      row.grossCapPct - gross,
    ));
    if (accepted >= 6 || capacity < minimum) {
      const rejected = {
        ...row.decision,
        newPositionAction: 'avoid',
        initialPositionPct: 0,
        maximumPositionPct: 0,
        blockReasons: ['capacity_exhausted'],
        entryTrigger: null,
        invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null },
      };
      if (!validActionDecisionV3(rejected)) throw new TypeError('invalid capacity rejection decision');
      return [row.symbol, rejected];
    }
    const allocated = Math.min(requested, capacity);
    gross += allocated;
    sectorExposure.set(row.sector, (sectorExposure.get(row.sector) ?? 0) + allocated);
    accepted += 1;
    const allocatedDecision = { ...row.decision, initialPositionPct: allocated };
    if (!validActionDecisionV3(allocatedDecision)) throw new TypeError('invalid allocated decision');
    return [row.symbol, allocatedDecision];
  });
}

function projectionBundle(tuple: unknown[], context?: WorkerExecutionContextV3) {
  if (!context || typeof context.runId !== 'string') {
    throw new TypeError('projection context unavailable');
  }
  const candidateRows = tuple[0] as unknown[];
  const market = tuple[1] as Record<string, unknown>;
  const mover = tuple[5] as Record<string, unknown>;
  const sectorRows = (tuple[2] as unknown[]).flatMap((batch) => array(batch, 5));
  const deepRows = (tuple[3] as unknown[]).flatMap((batch) => array(batch, 20))
    .filter((valueRow) => {
      const row = array(valueRow, 15);
      if (row.length !== 15) throw new TypeError('invalid projection deep row');
      if (row[14] === null) return true;
      if (typeof row[14] !== 'string' || row[13] !== null) {
        throw new TypeError('invalid projection failed deep row');
      }
      return false;
    });
  const allocations = array(tuple[4], 20);
  if (
    !record(market.groups) ||
    typeof market.asOf !== 'string' ||
    typeof mover.sourceRunId !== 'string' ||
    !record(mover.sourceFunnel)
  ) throw new TypeError('projection lineage unavailable');
  const sourceRunId = mover.sourceRunId;
  const discoveryRows = array(tuple[7], 120).map((valueRow) => {
    const row = array(valueRow, 11);
    if (row.length !== 11 || !['current','exit'].includes(String(row[0])) ||
        typeof row[1] !== 'string' || typeof row[2] !== 'string') {
      throw new TypeError('invalid projection discovery row');
    }
    return row;
  });
  const groupKeys = ['trend', 'breadth', 'flow', 'derivatives', 'global'] as const;
  const groupEvidence = Object.fromEntries(groupKeys.map((key) => {
    const group = (market.groups as Record<string, unknown>)[key];
    if (!record(group)) throw new TypeError('invalid projection market group');
    const status = String(group.status);
    const reason = status === 'fresh' ? null : status === 'stale' ? 'stale_input' : `missing_${key}`;
    return [key, { ...group, inputs: [], reason }];
  }));
  const warnings = [
    Object.values(market.groups).some(
      (group) => !record(group) || group.status !== 'fresh',
    ) ? 'market_incomplete' : null,
    mover.maturity === 'pending' ? 'source_audit_pending' : null,
    'shadow_only',
  ].filter((warning): warning is string => warning !== null);
  const factorKeys = [
    'priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation',
  ] as const;
  const horizonOrder = [
    'momentum_5_20d', 'swing_20_60d', 'thesis_120_250d',
  ] as const;
  const globalRank = new Map<string, number>();
  for (const horizon of horizonOrder) {
    const ranked = deepRows.map((valueRow) => {
      const row = array(valueRow, 15);
      const score = array(row[11], 3).map((value) => array(value, 6))
        .find((value) => value[0] === horizon);
      if (!score || typeof row[1] !== 'string' || typeof score[2] !== 'number' ||
        typeof score[3] !== 'number') throw new TypeError('projection ranking input unavailable');
      return { symbol: row[1], score: Number(score[2]), confidence: Number(score[3]) };
    }).sort((left, right) => right.score - left.score || right.confidence - left.confidence ||
      left.symbol.localeCompare(right.symbol));
    ranked.forEach((value, index) => globalRank.set(`${horizon}:${value.symbol}`, index + 1));
  }
  const projected = deepRows.map((valueRow) => {
    const row = array(valueRow, 15);
    if (
      row.length !== 15 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      row[2] !== true ||
      row[3] !== 'direct_candidate' ||
      typeof row[4] !== 'string' ||
      typeof row[5] !== 'string' ||
      typeof row[6] !== 'string' ||
      !record(row[7]) ||
      !record(row[8]) ||
      typeof row[9] !== 'number' ||
      typeof row[10] !== 'number' ||
      !Array.isArray(row[11]) ||
      !Array.isArray(row[12]) ||
      row[12].length === 0 ||
      !record(row[13]) ||
      row[14] !== null
    ) throw new TypeError('invalid projection deep row');
    if (
      row[8].initialPositionPct !== row[9] ||
      row[8].maximumPositionPct !== row[10]
    ) throw new TypeError('projection deep decision mirror mismatch');
    const scoreRows = row[11].map((scoreValue) => {
      const score = array(scoreValue, 6);
      if (
        score.length !== 6 ||
        !horizonOrder.includes(score[0] as typeof horizonOrder[number]) ||
        !Number.isSafeInteger(score[1]) ||
        typeof score[2] !== 'number' ||
        typeof score[3] !== 'number' ||
        typeof score[4] !== 'number' ||
        !record(score[5])
      ) throw new TypeError('invalid projection score row');
      const factorDetails = score[5] as Record<string, unknown>;
      if (factorKeys.some(
        (key) => !record(factorDetails[key]) ||
          !['available','missing','stale'].includes(String(factorDetails[key].status)) ||
          !(factorDetails[key].value === null || (typeof factorDetails[key].value === 'number' &&
            Number.isFinite(factorDetails[key].value))) ||
          typeof factorDetails[key].contribution !== 'number' ||
          !Number.isFinite(factorDetails[key].contribution) ||
          !Array.isArray(factorDetails[key].evidenceRefs),
      )) throw new TypeError('invalid projection factor plane');
      return {
        horizon: score[0] as typeof horizonOrder[number],
        rank: globalRank.get(`${String(score[0])}:${String(row[1])}`) ?? 0,
        score: Number(score[2]),
        scoreConfidence: Number(score[3]),
        availableWeight: Number(score[4]),
        factorDetails,
      };
    });
    if (scoreRows.length !== 3) throw new TypeError('invalid projection score count');
    const primaryHorizon = row[8].primaryHorizon;
    if (!horizonOrder.slice(0, 2).includes(primaryHorizon as never)) {
      throw new TypeError('projection primary horizon unavailable');
    }
    const primaryScore = scoreRows.find((score) => score.horizon === primaryHorizon);
    if (!primaryScore) throw new TypeError('projection primary score unavailable');
    const evidence = row[12].map((evidenceValue) => {
      const evidenceRow = array(evidenceValue, 19);
      if (
        evidenceRow.length !== 19 ||
        !Number.isSafeInteger(evidenceRow[0]) ||
        !Number.isSafeInteger(evidenceRow[1]) ||
        ![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18]
          .every((index) => typeof evidenceRow[index] === 'string') ||
        !['official', 'public_research', 'curated_thesis', 'community']
          .includes(String(evidenceRow[4])) ||
        !['fresh', 'stale'].includes(String(evidenceRow[7])) ||
        !['provenance_verified', 'publisher_verified'].includes(String(evidenceRow[8])) ||
        !['supports', 'contradicts'].includes(String(evidenceRow[9])) ||
        !['linked_new', 'linked_refresh', 'linked_duplicate_claim']
          .includes(String(evidenceRow[14])) ||
        typeof evidenceRow[16] !== 'number' || !Number.isFinite(evidenceRow[16]) ||
        evidenceRow[16] < 0 || evidenceRow[16] > 1 ||
        !['explicit_ticker_context','exact_unique_alias_context','duplicate_claim_link']
          .includes(String(evidenceRow[18]))
      ) throw new TypeError('invalid projection verified evidence');
      return evidenceRow;
    });
    const selectedEvidence = decisionEvidenceRows(evidence, String(market.asOf));
    const anchorEvidence = evidence.find((evidenceRow) =>
      evidenceRow[15] === row[4] && evidenceRow[7] === 'fresh' && evidenceRow[9] === 'supports' &&
      Date.parse(String(evidenceRow[6])) + sourceClassTtlSeconds[evidenceRow[4] as SourceClassV3] * 1_000 >
        Date.parse(String(market.asOf)));
    const orderedEvidence = [anchorEvidence, ...selectedEvidence]
      .filter((evidenceRow): evidenceRow is unknown[] => Boolean(evidenceRow))
      .filter((evidenceRow, index, rows) => rows.findIndex((candidate) => candidate[2] === evidenceRow[2]) === index);
    const sourceRefs = orderedEvidence.map((evidenceRow) => String(evidenceRow[2]))
      .filter((ref, index, refs) => refs.indexOf(ref) === index)
      .slice(0, 5);
    if (!anchorEvidence || sourceRefs.length === 0) {
      throw new TypeError('projection source evidence unavailable');
    }
    const sectorTuple = sectorRows.find((sectorValue) => {
      const sectorRow = array(sectorValue, 2);
      return sectorRow[0] === row[5];
    });
    const sector = sectorTuple ? array(sectorTuple, 2)[1] : null;
    if (!record(sector)) throw new TypeError('projection sector cycle unavailable');
    const allocationTuple = allocations.find((allocationValue) => {
      const allocation = array(allocationValue, 2);
      return allocation[0] === row[1];
    });
    const internalDecision = allocationTuple ? array(allocationTuple, 2)[1] : null;
    if (!validActionDecisionV3(internalDecision, { sourceCutoff: String(market.asOf) }) ||
        !validActionDecisionV3(row[8], { sourceCutoff: String(market.asOf) })) {
      throw new TypeError('projection allocation unavailable');
    }
    const deepDecision = row[8];
    const deepAction = String(deepDecision.newPositionAction);
    const allocatedAction = String(internalDecision.newPositionAction);
    const capacityRejected = ['starter_now', 'event_starter'].includes(deepAction) &&
      allocatedAction === 'avoid' &&
      Array.isArray(internalDecision.blockReasons) &&
      canonicalJson(internalDecision.blockReasons) === canonicalJson(['capacity_exhausted']);
    if (allocatedAction !== deepAction && !capacityRejected) {
      throw new TypeError('projection allocation changed decision outside capacity');
    }
    if (allocatedAction === deepAction) {
      const normalizedDeep = { ...deepDecision, initialPositionPct: internalDecision.initialPositionPct };
      if (canonicalJson(normalizedDeep) !== canonicalJson(internalDecision)) {
        throw new TypeError('projection allocation rewrote canonical decision');
      }
    }
    const publicDecision = Object.fromEntries(Object.entries(internalDecision).filter(
      ([key]) => !['existingTargetExposurePct', 'initialPositionPct', 'maximumPositionPct'].includes(key),
    ));
    const correctness = row[13];
    if (!record(correctness)) throw new TypeError('projection factor correctness unavailable');
    const action = allocatedAction;
    const candidateState = action === 'valuation_review'
      ? 'valuation_review'
      : action === 'wait_trigger'
        ? 'waiting_trigger'
        : ['starter_now', 'event_starter'].includes(action)
          ? 'actionable_now'
          : 'avoid';
    const normalizedSector = {
      ...sector,
      inputs: Array.isArray(sector.inputs) && sector.inputs.every(record) ? sector.inputs : [],
    };
    const factorScores = Object.fromEntries(factorKeys.map(
      (key) => [key, Number((primaryScore.factorDetails[key] as Record<string, unknown>).value ?? 0)],
    ));
    const card = {
      symbol: row[1],
      chineseName: null,
      detailPath: `/opportunity-v3/${context.runId}/${row[1]}`,
      directSource: true,
      candidateState,
      primaryHorizon,
      rank: primaryScore.rank,
      score: primaryScore.score,
      scoreDelta: null,
      factorScores,
      factorAxes: correctness.factorAxes,
      availableWeight: primaryScore.availableWeight,
      sourceRefs,
      sourceSummary: {
        anchorSourceKey: String(anchorEvidence[5]),
        anchorSourceClass: String(anchorEvidence[4]),
        anchorEffectiveAt: String(anchorEvidence[6]),
        independentRootCount: new Set(selectedEvidence.map(
          (evidenceRow) => String(evidenceRow[3]),
        )).size,
      },
      researchMaturity: correctness.researchMaturity,
      fundamental: correctness.fundamental,
      formalResearchStatus: row[6],
      actionDecision: publicDecision,
      valuation: row[7],
      technicalDecision: correctness.technicalDecision,
      sectorCycle: normalizedSector,
      changedBecause: [],
      lastEvaluatedAt: correctness.lastEvaluatedAt,
      analysisGeneratedAt: correctness.analysisGeneratedAt,
      materialChangeHash: correctness.materialChangeHash,
      materialChangedBecause: correctness.materialChangedBecause,
      noChangeMessage: correctness.noChangeMessage,
    } as unknown as OpportunityCardV3;
    const sourceEvidence = orderedEvidence.slice(0, 12).map((evidenceRow) => ({
      ref: String(evidenceRow[2]),
      sourceKey: String(evidenceRow[5]),
      sourceClass: String(evidenceRow[4]),
      effectiveAt: String(evidenceRow[6]),
      linkReason: String(evidenceRow[18]),
      verificationTier: String(evidenceRow[8]),
      stance: String(evidenceRow[9]),
    }));
    const detail = {
      contractVersion: 'opportunity-detail-v3.3',
      acceptanceVersion: '1.46.0',
      mode: 'shadow',
      decisionAuthority: 'research_only',
      runId: context.runId,
      sourceRunId: mover.sourceRunId,
      sourceCutoff: market.asOf,
      symbol: row[1],
      chineseName: null,
      card,
      verifiedChangeBrief: null,
      sourceEvidence,
      horizonDetails: scoreRows.map((score) => ({
        horizon: score.horizon,
        rank: score.rank,
        score: score.score,
        scoreConfidence: score.scoreConfidence,
        availableWeight: score.availableWeight,
        factors: factorKeys.map((key) => ({
          key,
          ...(score.factorDetails[key] as Record<string, unknown>),
        })),
      })),
      decisionEvidence: {
        marketContextRef: `run:${context.runId}:market`,
        sectorCycleRef: `run:${context.runId}:sector:${String(row[5])}`,
        financialManifestRef: null,
        scoringManifestRef: `run:${context.runId}:scores:${row[1]}`,
        valuationManifestRef: null,
        blockReasons: Array.isArray(publicDecision.blockReasons) ? publicDecision.blockReasons : [],
      },
      disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE',
    } as unknown as OpportunityDetailV3;
    return { card, detail, scores: scoreRows };
  });
  const briefInputs = array(tuple[6], 20).map((inputValue) => {
    const input = array(inputValue, 15);
    if (
      input.length !== 15 ||
      input[0] !== context.runId ||
      typeof input[1] !== 'string' ||
      input[2] !== `/opportunity-v3/${context.runId}/${input[1]}` ||
      !['official', 'public_research', 'curated_thesis', 'community'].includes(String(input[3])) ||
      typeof input[4] !== 'string' ||
      input[5] !== market.asOf ||
      !Array.isArray(input[6]) ||
      !Array.isArray(input[7]) ||
      !['not_evaluated', 'insufficient_evidence', 'valuation_review', 'formal_watch', 'formal_candidate']
        .includes(String(input[8])) ||
      !['momentum_5_20d', 'swing_20_60d'].includes(String(input[9])) ||
      !(input[10] === null || (typeof input[10] === 'number' && Number.isFinite(input[10]))) ||
      !['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now']
        .includes(String(input[11])) ||
      !['normal', 'missing', 'stale', 'outlier_review'].includes(String(input[12])) ||
      !Array.isArray(input[13]) ||
      !(input[14] === null || Array.isArray(input[14]))
    ) throw new TypeError('invalid verified-change derivation row');
    const match = projected.find(({ card }) => card.symbol === input[1]);
    if (!match) throw new TypeError('verified-change candidate unavailable');
    if (
      match.card.formalResearchStatus !== input[8] ||
      match.card.actionDecision.newPositionAction !== input[11] ||
      match.card.valuation.status !== input[12]
    ) throw new TypeError('verified-change current snapshot mismatch');
    match.card.scoreDelta = input[10] as number | null;
    match.card.changedBecause = input[7] as never;
    match.detail.card = match.card;
    const evidenceRows = (input[6] as unknown[]).map((evidenceValue) => {
      const evidence = array(evidenceValue, 19);
      if (
        evidence.length !== 19 ||
        !Number.isSafeInteger(evidence[0]) ||
        !Number.isSafeInteger(evidence[1]) ||
        ![2, 3, 5, 6, 10, 11, 12, 13, 14, 15, 17, 18].every(
          (index) => typeof evidence[index] === 'string',
        ) ||
        !['official', 'public_research', 'curated_thesis', 'community']
          .includes(String(evidence[4])) ||
        !['fresh', 'stale'].includes(String(evidence[7])) ||
        !['provenance_verified', 'publisher_verified'].includes(String(evidence[8])) ||
        !['supports', 'contradicts'].includes(String(evidence[9])) ||
        evidence[10] !== sourceRunId ||
        evidence[13] !== match.detail.card.symbol ||
        !['linked_new', 'linked_refresh', 'linked_duplicate_claim'].includes(String(evidence[14])) ||
        typeof evidence[16] !== 'number' || !Number.isFinite(evidence[16]) ||
        evidence[16] < 0 || evidence[16] > 1
      ) throw new TypeError('invalid verified-change evidence row');
      return {
        sourceSelectionOrdinal: Number(evidence[0]),
        claimOrdinal: Number(evidence[1]),
        evidenceRef: String(evidence[2]),
        evidenceRootId: String(evidence[3]),
        sourceClass: evidence[4] as SourceClassV3,
        sourceKey: String(evidence[5]),
        effectiveAt: String(evidence[6]),
        freshness: evidence[7] as VerifiedEvidenceRowV3['freshness'],
        verificationTier: evidence[8] as VerifiedEvidenceRowV3['verificationTier'],
        stance: evidence[9] as VerifiedEvidenceRowV3['stance'],
        runId: String(evidence[10]),
        revisionId: String(evidence[11]),
        stockId: String(evidence[12]),
        symbol: String(evidence[13]),
        mentionOutcome: evidence[14] as VerifiedEvidenceRowV3['mentionOutcome'],
      };
    });
    const priorTuple = input[14] === null ? null : array(input[14], 5);
    if (
      priorTuple &&
      (
        priorTuple.length !== 5 ||
        typeof priorTuple[0] !== 'string' ||
        typeof priorTuple[1] !== 'string' ||
        !['not_evaluated', 'insufficient_evidence', 'valuation_review', 'formal_watch', 'formal_candidate']
          .includes(String(priorTuple[2])) ||
        ![1, 2, 3, 4].includes(Number(priorTuple[3])) ||
        !['normal', 'missing', 'stale', 'outlier_review'].includes(String(priorTuple[4]))
      )
    ) throw new TypeError('invalid verified-change prior row');
    const stockId = evidenceRows[0]?.stockId;
    if (!stockId || evidenceRows.some((row) => row.stockId !== stockId || row.symbol !== input[1])) {
      throw new TypeError('verified-change evidence identity mismatch');
    }
    const currentDeepRow = deepRows.map((rowValue) => array(rowValue, 15))
      .find((rowValue) => rowValue[1] === input[1]);
    return {
      runId: context.runId,
      sourceRunId,
      stockId,
      candidateOrigin: 'direct_candidate',
      anchorClaimId: String(currentDeepRow?.[4] ?? ''),
      deepStatus: 'succeeded',
      card: match.card,
      anchorSourceClass: input[3] as SourceClassV3,
      anchorEffectiveAt: String(input[4]),
      sourceCutoff: String(input[5]),
      evidenceRows,
      priorComparable: priorTuple ? {
        sourceCutoff: String(priorTuple[0]),
        anchorEffectiveAt: String(priorTuple[1]),
        formalResearchStatus: priorTuple[2],
        independentSourceClassCount: Number(priorTuple[3]),
        valuationStatus: priorTuple[4],
      } as PriorComparableV3 : null,
    } satisfies VerifiedChangeCandidateInputV3;
  });
  if (briefInputs.length !== projected.length) {
    throw new TypeError('verified-change derivation conservation failure');
  }
  const workspace = buildVerifiedChangeWorkspace(briefInputs);
  const homepageSummary = buildHomepageSummary(workspace, market.asOf);
  const briefBySymbol = new Map(workspace.lanes.flatMap(
    (lane) => lane.items.map((item) => [item.symbol, item.brief] as const),
  ));
  for (const value of projected) {
    value.detail.verifiedChangeBrief = briefBySymbol.get(value.card.symbol) ?? null;
  }
  const projectionCandidateRows = candidateRows.map((candidateValue) => {
    const candidate = array(candidateValue, 8);
    if (candidate.length !== 8 || typeof candidate[1] !== 'string' || !record(candidate[7])) {
      throw new TypeError('invalid projection candidate row');
    }
    if (candidate[6] !== 'succeeded') return candidate;
    const match = projected.find(({ card }) => card.symbol === candidate[1]);
    if (!match) throw new TypeError('projection card unavailable');
    return [...candidate.slice(0, 7), { state: 'deep_succeeded', card: match.card }];
  });
  const decisionOrder = (left: { card: OpportunityCardV3 }, right: { card: OpportunityCardV3 }) =>
    right.card.score - left.card.score ||
    Number(right.card.actionDecision.confidence) - Number(left.card.actionDecision.confidence) ||
    left.card.symbol.localeCompare(right.card.symbol);
  const actionable = projected.filter(({ card }) => card.candidateState === 'actionable_now')
    .sort((left, right) => {
      const actionClass = (value: OpportunityCardV3) =>
        value.actionDecision.newPositionAction === 'starter_now' ? 0 : 1;
      return actionClass(left.card) - actionClass(right.card) || decisionOrder(left, right);
    }).slice(0, 6);
  const waiting = projected.filter(({ card }) => card.candidateState === 'waiting_trigger')
    .sort(decisionOrder).slice(0, Math.max(0, 12 - actionable.length));
  const valuationReview = projected.filter(({ card }) => card.candidateState === 'valuation_review')
    .filter(({ card }) => card.researchMaturity !== 'source_signal')
    .sort(decisionOrder).slice(0, 8);
  const entrantReasons = ['new_in_seed_symbol','new_out_of_seed_symbol','new_source_evidence','material_source_change'];
  const currentDiscovery = discoveryRows.filter((row) => row[0] === 'current');
  const exitDiscovery = discoveryRows.filter((row) => row[0] === 'exit');
  if (currentDiscovery.length !== Number((mover.sourceFunnel as Record<string, unknown>).activeCandidateCount)) {
    throw new TypeError('projection discovery conservation failure');
  }
  const sourceSignals = currentDiscovery.flatMap((row) => {
    if (row[10] !== 'source_signal' || !entrantReasons.includes(String(row[2]))) return [];
    if (typeof row[4] !== 'string' || typeof row[5] !== 'string' || typeof row[6] !== 'string' ||
        !Array.isArray(row[7]) || typeof row[8] !== 'string' || typeof row[9] !== 'string') {
      throw new TypeError('invalid source signal authority');
    }
    return [{
      symbol: row[1], chineseName: row[3], researchMaturity: 'source_signal',
      newPositionAction: 'valuation_review', discoveredAt: row[4], sourceClass: row[5],
      sourceSummary: row[6], evidenceRefs: row[7], valuationStatus: row[8],
      technicalState: row[9], changedBecause: row[2],
    }];
  }).slice(0, 30);
  const discoveryDelta = {
    asOf: market.asOf,
    entrants: currentDiscovery.filter((row) => entrantReasons.includes(String(row[2])))
      .map((row) => ({ symbol: row[1], reason: row[2] })),
    exits: exitDiscovery.map((row) => ({ symbol: row[1], reason: row[2] })),
    continuations: currentDiscovery.filter((row) => ['refreshed','unchanged'].includes(String(row[2])))
      .map((row) => ({ symbol: row[1], reason: row[2] })),
    unchangedReasonCounts: {
      same_material_evidence: currentDiscovery.filter((row) => row[2] === 'unchanged').length,
      duplicate_claim: Number((mover.sourceFunnel as Record<string, unknown>).claimOutcomes &&
        ((mover.sourceFunnel as Record<string, unknown>).claimOutcomes as Record<string, unknown>).duplicate_claim || 0),
      candidate_cap: 0,
      shallow_cap: Number((mover.sourceFunnel as Record<string, unknown>).deferredBeforeShallowCount ?? 0),
      deep_cap: Number((mover.sourceFunnel as Record<string, unknown>).deferredBeforeDeepCount ?? 0),
    },
  };
  const publicProjection = {
    contractVersion: 'source-led-opportunity-v3.6',
    availability: 'available',
    mode: 'shadow',
    featureVersion: 'source-led-v3.3',
    decisionVersion: 'decision-v3.3',
    runId: context.runId,
    sourceRunId: mover.sourceRunId,
    asOf: market.asOf,
    decisionContext: { mode: 'research_only', personalized: false, sizingVisible: false },
    sourceFunnel: mover.sourceFunnel,
    sourceSignals,
    discoveryDelta,
    marketContext: {
      ...market,
      groupEvidence,
      groups: undefined,
    },
    rankedLanes: horizonOrder.map((horizon) => ({
      horizon,
      cards: projected.map(({ card, scores }) => {
        const score = scores.find((candidateScore) => candidateScore.horizon === horizon);
        if (!score) throw new TypeError('projection lane score unavailable');
        return {
          symbol: card.symbol,
          rank: score.rank,
          score: score.score,
          scoreDelta: card.scoreDelta,
          formalResearchStatus: card.formalResearchStatus,
        };
      }).sort((left, right) => left.rank - right.rank || left.symbol.localeCompare(right.symbol)).slice(0, 20),
    })),
    actionableNow: actionable.map(({ card }) => card),
    waitingForTrigger: waiting.map(({ card }) => card),
    valuationReview: valuationReview.map(({ card }) => card),
    verifiedChangeWorkspace: workspace,
    homepageSummary,
    missedSourceAudit: {
      auditedSessionDate: mover.auditedSessionDate,
      auditedCloseAt: mover.auditedCloseAt,
      auditWindowClosesAt: mover.auditWindowClosesAt,
      sourceCollectionCutoff: mover.sourceCollectionCutoff,
      maturity: mover.maturity,
      moverCount: mover.moverCount,
      laterMentionedCount: mover.laterMentionedCount,
      sourceRecallPct: mover.sourceRecallPct,
      symbols: mover.symbols,
    },
    engineHealth: {
      status: warnings.length > 1 ? 'degraded' : 'ok',
      sourceCutoff: market.asOf,
      acceptanceVersion: '1.46.0',
      modelInfluence: 'none',
      assistiveArtifacts: [],
      warnings,
    },
  };
  delete (publicProjection.marketContext as Record<string, unknown>).groups;
  return [projectionCandidateRows, publicProjection, projected.map(({ detail }) => detail)];
}

type SourceFieldLayout = readonly [fieldKey: string, fieldKind: 'text' | 'transcript_segments'];

const SOURCE_FIELD_LAYOUTS: Record<string, readonly SourceFieldLayout[]> = {
  bulltalk: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  earnings_call: [['title', 'text'], ['summary', 'text'], ['transcript', 'transcript_segments']],
  instagram: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  investanchors: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  mops_material_event: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  podcast: [['title', 'text'], ['summary', 'text'], ['transcript', 'transcript_segments']],
  ptt: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  public_broker_research: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  telegram: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  threads: [['title', 'text'], ['summary', 'text'], ['body', 'text']],
  youtube: [['title', 'text'], ['summary', 'text'], ['transcript', 'transcript_segments']],
};

type PriorDocumentIdentity = {
  canonicalDocumentId: string;
  canonicalContentHash: string | null;
};

function normalizeSourceField(value: string): string {
  return value.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').normalize('NFKC');
}

function canonicalSourceContent(
  sourceKey: string,
  rawFieldPayload: unknown[],
): { canonicalContentHash: string; claimText: string } | null {
  const layout = SOURCE_FIELD_LAYOUTS[sourceKey];
  if (!layout || rawFieldPayload.length !== layout.length) return null;
  const canonicalFields: unknown[] = [];
  const claimFields: string[] = [];
  for (const [index, [fieldKey, fieldKind]] of layout.entries()) {
    const field = rawFieldPayload[index];
    if (fieldKind === 'transcript_segments') {
      if (!Array.isArray(field)) return null;
      const segments: Array<{ timestamp: number; segmentId: string; text: string }> = [];
      for (const segment of field) {
        if (!Array.isArray(segment) || segment.length !== 3 ||
          !Number.isSafeInteger(segment[0]) || typeof segment[1] !== 'string' ||
          typeof segment[2] !== 'string') return null;
        segments.push({
          timestamp: segment[0], segmentId: segment[1], text: normalizeSourceField(segment[2]),
        });
      }
      segments.sort((left, right) => left.timestamp - right.timestamp ||
        (left.segmentId < right.segmentId ? -1 : left.segmentId > right.segmentId ? 1 : 0));
      canonicalFields.push([fieldKey, segments.map(({ timestamp, text }) => [timestamp, text])]);
      claimFields.push(...segments.map(({ text }) => text));
      continue;
    }
    if (typeof field !== 'string') return null;
    const text = normalizeSourceField(field);
    canonicalFields.push([fieldKey, text]);
    claimFields.push(text);
  }
  return {
    canonicalContentHash: sha256Canonical(canonicalFields),
    claimText: claimFields.join('\n'),
  };
}

function parsePriorDocumentIdentities(value: unknown): PriorDocumentIdentity[] {
  if (!Array.isArray(value) || value.length > 999) throw new TypeError('invalid prior document identities');
  const seenDocumentIds = new Set<string>();
  return value.map((row) => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(row[0]) || !(row[1] === null ||
        (typeof row[1] === 'string' && /^[0-9a-f]{64}$/u.test(row[1])))) {
      throw new TypeError('invalid prior document identity');
    }
    if (seenDocumentIds.has(row[0])) throw new TypeError('duplicate prior document identity');
    seenDocumentIds.add(row[0]);
    return { canonicalDocumentId: row[0], canonicalContentHash: row[1] };
  });
}

function parseSourceRevision(value: unknown) {
  const row = array(value, 17);
  if (
    row.length !== 17 ||
    typeof row[0] !== 'string' ||
    !Number.isSafeInteger(row[1]) ||
    typeof row[2] !== 'string' ||
    typeof row[3] !== 'string' ||
    typeof row[4] !== 'string' ||
    !(row[5] === null || typeof row[5] === 'string') ||
    !(row[6] === null || typeof row[6] === 'string') ||
    typeof row[7] !== 'string' ||
    !(row[8] === null || Array.isArray(row[8])) ||
    !Number.isSafeInteger(row[9]) ||
    row[10] !== 'source-adapter-v3.3' ||
    !['complete', 'invalid_utf8', 'required_field_missing', 'content_overflow'].includes(String(row[11])) ||
    !(row[12] === null || typeof row[12] === 'string') ||
    typeof row[13] !== 'string' ||
    typeof row[14] !== 'string' ||
    !Array.isArray(row[15]) ||
    row[15].length > 256 ||
    !Array.isArray(row[16]) || row[16].length > 999
  ) throw new TypeError('invalid source parse row');
  const [
    revisionId, selectionOrdinal, sourceKey, approvedSourceIdentityId,
    stableConnectorDocumentId, canonicalUrlCandidate, publishedAt, collectedAt,
    rawFieldPayload, rawCodePointCount, , acquisitionStatus,
    ingestionCanonicalContentHash, sourceClass, , linkAuthorities, priorDocumentIdentities,
  ] = row;
  const rawCount = Number(rawCodePointCount);
  const effectiveAt = publishedAt ?? collectedAt;
  const normalizedCanonicalUrl = normalizeCanonicalUrl(canonicalUrlCandidate);
  if (canonicalUrlCandidate !== null && normalizedCanonicalUrl === null) {
    return [[[
      sourceKey, revisionId, selectionOrdinal, null, effectiveAt,
      'parse_failure', null, 0, 0,
    ]], [], []];
  }
  const canonicalDocumentId = sha256Canonical([
    sourceKey,
    approvedSourceIdentityId,
    normalizedCanonicalUrl ?? stableConnectorDocumentId,
  ]);
  const priorDocuments = parsePriorDocumentIdentities(priorDocumentIdentities);
  if (priorDocuments.some((prior) => prior.canonicalDocumentId === canonicalDocumentId)) {
    return [[[
      sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
      'duplicate_document', null, 0, 0,
    ]], [], []];
  }
  if (acquisitionStatus !== 'complete' || rawCount > 100_000 || rawFieldPayload === null) {
    return [[[
      sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
      'parse_failure', null, 0, 0,
    ]], [], []];
  }
  const canonicalContent = canonicalSourceContent(sourceKey, rawFieldPayload);
  if (!canonicalContent || ingestionCanonicalContentHash !== canonicalContent.canonicalContentHash) {
    return [[[
      sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
      'parse_failure', null, 0, 0,
    ]], [], []];
  }
  if (priorDocuments.some((prior) =>
    prior.canonicalContentHash === canonicalContent.canonicalContentHash)) {
    return [[[
      sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
      'duplicate_document', canonicalContent.canonicalContentHash, 0, 0,
    ]], [], []];
  }
  const sentences = splitClaimText(canonicalContent.claimText.replace(/https?:\/\/\S+/giu, ' '))
    .map((sentence) => sentence.normalize('NFKC').replace(/[A-Z]/gu,
      (character) => character.toLocaleLowerCase('en-US')))
    .filter((sentence) => sentence.length > 0);
  const sourceRef = normalizedCanonicalUrl ?? `${sourceKey}:${stableConnectorDocumentId}`;
  const verificationTier = ['official', 'public_research'].includes(String(sourceClass))
    ? 'publisher_verified'
    : 'provenance_verified';
  const contradiction = /^(?:不會|並未|否認|尚未|未|沒有|無|取消|停止|終止|撤回|駁斥|not(?: |$)|no(?: |$)|never(?: |$)|denies(?: |$)|denied(?: |$)|deny(?: |$)|cancelled(?: |$)|canceled(?: |$)|withdrawn(?: |$)|false(?: |$))/u;
  const instruments: InstrumentV3[] = [];
  const authorityBySymbol = new Map<string, unknown[]>();
  for (const valueAuthority of linkAuthorities as unknown[]) {
    const authority = array(valueAuthority, 8);
    if (
      authority.length !== 8 ||
      typeof authority[0] !== 'string' ||
      typeof authority[1] !== 'string' ||
      !/^[0-9]{4}$/u.test(authority[1]) ||
      typeof authority[2] !== 'string' ||
      typeof authority[3] !== 'string' ||
      typeof authority[4] !== 'string' ||
      !(authority[5] === null || typeof authority[5] === 'string') ||
      !Array.isArray(authority[6]) ||
      typeof authority[7] !== 'string'
    ) throw new TypeError('invalid source link authority');
    if (authorityBySymbol.has(authority[1])) throw new TypeError('conflicting source link authority');
    authorityBySymbol.set(authority[1], authority);
    instruments.push({
      stockId: authority[0],
      symbol: authority[1],
      exchange: authority[2] as InstrumentV3['exchange'],
      instrumentType: authority[3] as InstrumentV3['instrumentType'],
      listingStatus: authority[4] as InstrumentV3['listingStatus'],
      officialName: authority[5],
      aliases: authority[6] as string[],
      sector: authority[7],
    });
  }
  const claims: unknown[][] = [];
  const mentions: unknown[][] = [];
  const firstClaimByIdentity = new Map<string, { revisionId: string; ordinal: number }>();
  for (const sentence of sentences) {
    const normalizedClaimText = sentence
      .replace(/[\p{P}\p{Z}\t-\r]+/gu, ' ')
      .trim();
    const occurrences = sourceMentionOccurrences(
      sentence,
      instruments,
      1_001 - mentions.length,
    );
    if (mentions.length + occurrences.length > 1_000) {
      return [[[
        sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
        'parse_failure', null, 0, 0,
      ]], [], []];
    }
    if (normalizedClaimText.length === 0 && occurrences.length === 0) continue;
    if (claims.length >= 200) {
      return [[[
        sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
        'parse_failure', null, 0, 0,
      ]], [], []];
    }
    const claimOrdinal = claims.length;
    const canonicalClaimId = sha256Canonical([
      normalizedClaimText,
      occurrences.map(({ token, startOffset, endOffset, mode }) =>
        [normalizeAlias(token), startOffset, endOffset, mode])
        .sort((left, right) =>
          (left[0] as string) < (right[0] as string) ? -1 :
            (left[0] as string) > (right[0] as string) ? 1 :
              (left[1] as number) - (right[1] as number) ||
              (left[2] as number) - (right[2] as number) ||
              ((left[3] as string) < (right[3] as string) ? -1 :
                (left[3] as string) > (right[3] as string) ? 1 : 0)),
    ]);
    const priorClaim = firstClaimByIdentity.get(canonicalClaimId);
    if (!priorClaim) {
      firstClaimByIdentity.set(canonicalClaimId, {
        revisionId: String(revisionId),
        ordinal: claimOrdinal,
      });
    }
    claims.push([
      revisionId, claimOrdinal, canonicalClaimId,
      priorClaim ? 'duplicate_claim' : 'unique_claim',
      priorClaim?.revisionId ?? null, priorClaim?.ordinal ?? null,
      canonicalClaimId, effectiveAt, 1, sourceRef, verificationTier,
      contradiction.test(normalizedClaimText) ? 'contradicts' : 'supports',
    ]);
    for (const [mentionOrdinal, occurrence] of occurrences.entries()) {
      const codePoints = [...sentence];
      const reviewSliceStart = Math.max(0, occurrence.startOffset - 28);
      const reviewSliceEnd = Math.min(codePoints.length, occurrence.endOffset + 28);
      const reviewContext = codePoints.slice(reviewSliceStart, reviewSliceEnd).join('');
      const reviewStart = occurrence.startOffset - reviewSliceStart;
      const explicitLexeme = codePoints
        .slice(occurrence.startOffset, occurrence.endOffset).join('');
      const yearOrCommonNumber = /^(?:19|20)[0-9]{2}$/u.test(occurrence.token) ||
        /^(?:1000|1200|1500|1600|1700|1800|2000|3000|5000)$/u.test(occurrence.token);
      const markerContext = /[$#]|[.](?:tw|two)$/iu.test(explicitLexeme) ||
        /(?:代號|股號)/u.test(reviewContext);
      const namedContext = instruments.some((instrument) =>
        [instrument.officialName ?? '', ...instrument.aliases]
          .filter(Boolean)
          .some((name) => reviewContext.includes(name)));
      const link = linkMention({
        token: occurrence.token,
        context: reviewContext,
        explicitTicker: occurrence.mode === 'ticker',
        stockContext: yearOrCommonNumber
          ? markerContext || namedContext
          : markerContext || namedContext || hasStockContext(reviewContext),
      }, instruments);
      const authority = link.symbol ? authorityBySymbol.get(link.symbol) : undefined;
      const duplicateLink = priorClaim && link.outcome === 'linked_new';
      mentions.push([
        revisionId,
        claimOrdinal,
        mentionOrdinal,
        normalizeAlias(occurrence.token),
        occurrence.startOffset,
        occurrence.endOffset,
        reviewContext,
        reviewStart,
        reviewStart + (occurrence.endOffset - occurrence.startOffset),
        occurrence.mode,
        authority?.[0] ?? null,
        link.symbol,
        duplicateLink ? 'linked_duplicate_claim' : link.outcome,
        duplicateLink ? 'duplicate_claim_link' : link.reason,
        link.confidence,
      ]);
    }
  }
  return [[[
    sourceKey, revisionId, selectionOrdinal, canonicalDocumentId, effectiveAt,
    claims.length ? 'processed_with_claims' : 'processed_no_claim',
    canonicalContent.canonicalContentHash, claims.length, mentions.length,
  ]], claims, mentions];
}

type SourceMentionOccurrence = {
  token: string;
  startOffset: number;
  endOffset: number;
  mode: 'ticker' | 'exact_alias' | 'fuzzy';
};

function splitClaimText(value: string): string[] {
  const points = [...value];
  const rows: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) rows.push(current.join(''));
    current = [];
  };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const around = points.slice(Math.max(0, index - 6), index + 8).join('');
    const suffixPeriod = point === '.' &&
      /(?:[0-9]{4}[.](?:tw|two)|[0-9a-z]{1,6}[.](?:us|nyse|nasdaq|hk|hkg|jp|t|ks|kq|ss|sz))/iu
        .test(around);
    if (!suffixPeriod && /[\n。！？.!?]/u.test(point)) {
      flush();
      continue;
    }
    current.push(point);
    if (current.length === 500) flush();
  }
  flush();
  return rows;
}

function hasStockContext(value: string): boolean {
  return /(?:股|股票|代號|股號|標的|公司|台股|上市|上櫃|買|賣|法說|營收|EPS|PE|目標價|停損|外資|投信|自營|漲停|跌停|突破|回測|stock|shares?|ticker|price target|revenue|earnings)/iu
    .test(value);
}

function sourceMentionOccurrences(
  sentence: string,
  instruments: InstrumentV3[],
  maximum: number,
): SourceMentionOccurrence[] {
  if (maximum <= 0) return [];
  const candidates: SourceMentionOccurrence[] = [];
  const explicitPattern = /(?<![0-9A-Za-z$#])(?:([0-9]{4})[.](?:tw|two)|([$#])([0-9]{4})|([0-9]{4}))(?![0-9A-Za-z.])/giu;
  for (const match of sentence.matchAll(explicitPattern)) {
    const full = String(match[0]);
    const token = String(match[1] ?? match[3] ?? match[4]);
    const startOffset = [...sentence.slice(0, match.index ?? 0)].length;
    candidates.push({
      token,
      startOffset,
      endOffset: startOffset + [...full].length,
      mode: 'ticker',
    });
  }
  const nonTwPattern = /(?<![0-9A-Za-z])([0-9A-Za-z]{1,6})[.](us|nyse|nasdaq|hk|hkg|jp|t|ks|kq|ss|sz)(?![0-9A-Za-z])/giu;
  for (const match of sentence.matchAll(nonTwPattern)) {
    const full = String(match[0]).toLocaleLowerCase('en-US');
    const startOffset = [...sentence.slice(0, match.index ?? 0)].length;
    candidates.push({
      token: full,
      startOffset,
      endOffset: startOffset + [...full].length,
      mode: 'ticker',
    });
  }
  const aliasTokens = [...new Set(instruments.flatMap((instrument) => [
    instrument.officialName ?? '',
    ...instrument.aliases,
  ]).map((token) => token.normalize('NFKC').trim()).filter(
    (token) => token.length >= 2 && !/^[0-9]{4,6}$/u.test(token),
  ))].sort((left, right) => right.length - left.length || left.localeCompare(right));
  for (const token of aliasTokens) {
    let offset = 0;
    while (offset < sentence.length) {
      const index = sentence.indexOf(token, offset);
      if (index < 0) break;
      const startOffset = [...sentence.slice(0, index)].length;
      candidates.push({
        token,
        startOffset,
        endOffset: startOffset + [...token].length,
        mode: 'exact_alias',
      });
      offset = index + token.length;
    }
  }
  const occupied = candidates.map(({ startOffset, endOffset }) => [startOffset, endOffset]);
  for (const match of sentence.matchAll(/[^\p{P}\p{Z}\s]+/gu)) {
    const token = String(match[0]);
    if ([...token].length < 2 || [...token].length > 40) continue;
    const startOffset = [...sentence.slice(0, match.index ?? 0)].length;
    const endOffset = startOffset + [...token].length;
    if (occupied.some(([start, end]) => startOffset < end && start < endOffset)) continue;
    if (aliasTokens.some((alias) => levenshteinSimilarity(token, alias) >= 0.50)) {
      candidates.push({ token, startOffset, endOffset, mode: 'fuzzy' });
    }
  }
  return candidates
    .sort((left, right) =>
      left.startOffset - right.startOffset ||
      (right.endOffset - right.startOffset) - (left.endOffset - left.startOffset) ||
      (left.mode === right.mode ? 0 : ['ticker', 'exact_alias', 'fuzzy'].indexOf(left.mode) -
        ['ticker', 'exact_alias', 'fuzzy'].indexOf(right.mode)) ||
      left.token.localeCompare(right.token))
    .filter((candidate, index, ordered) => !ordered.slice(0, index).some(
      (prior) => candidate.startOffset < prior.endOffset &&
        prior.startOffset < candidate.endOffset,
    ))
    .slice(0, maximum);
}

function levenshteinSimilarity(leftValue: string, rightValue: string): number {
  const left = [...normalizeAlias(leftValue)];
  const right = [...normalizeAlias(rightValue)];
  if (left.length === 0 || right.length === 0) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function connectorSummary(value: unknown) {
  if (!record(value)) throw new TypeError('invalid connector summary');
  const exact = [
    'sourceKey', 'eligibleDocuments', 'selectedDocuments', 'deferredDueScanCap',
    'documentOutcomes', 'extractedClaims', 'claimOutcomes', 'rawMentions',
    'mentionOutcomes', 'mentionReasonCounts', 'linkedCandidateCount', 'status', 'failureReason',
  ];
  if (Object.keys(value).sort().join('\0') !== exact.sort().join('\0')) {
    throw new TypeError('invalid connector summary');
  }
  const integer = (key: string) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0;
  if (
    !integer('eligibleDocuments') ||
    !integer('selectedDocuments') ||
    !integer('deferredDueScanCap') ||
    Number(value.selectedDocuments) + Number(value.deferredDueScanCap) !== Number(value.eligibleDocuments)
  ) throw new TypeError('connector conservation failure');
  return value;
}

function outcomeRows(value: unknown) {
  const exactKeys = [
    'scoreSnapshotId', 'maturityHorizon', 'entrySession', 'entrySessionAuthorityHash',
    'maturitySession', 'maturitySessionAuthorityHash', 'entryPriceRef', 'outcomePriceRef',
    'sectorBenchmarkManifestId', 'returnPct', 'sectorRelativeReturnPct', 'mfePct',
    'maePct', 'sectorRelativeMfePct',
  ].sort();
  return array(value, 200).map((input) => {
    if (
      !record(input) ||
      Object.keys(input).sort().join('\0') !== exactKeys.join('\0') ||
      !['session_20', 'session_60', 'session_120', 'session_250']
        .includes(String(input.maturityHorizon)) ||
      !['returnPct', 'sectorRelativeReturnPct', 'mfePct', 'maePct']
        .every((key) => typeof input[key] === 'number' && Number.isFinite(input[key])) ||
      !(input.sectorRelativeMfePct === null ||
        (typeof input.sectorRelativeMfePct === 'number' &&
          Number.isFinite(input.sectorRelativeMfePct))) ||
      !['scoreSnapshotId', 'entrySession', 'entrySessionAuthorityHash', 'maturitySession',
        'maturitySessionAuthorityHash', 'entryPriceRef', 'outcomePriceRef',
        'sectorBenchmarkManifestId']
        .every((key) => typeof input[key] === 'string' && input[key].length > 0)
    ) throw new TypeError('invalid outcome computation row');
    return input;
  });
}

function emptyStrategyRows() {
  return (['official_only', 'source_led', 'hybrid'] as const).map((strategy) => ({
    strategy,
    selectedCandidateIds: [],
    excludedCandidateIdsAndReasons: [],
    selectedCount: 0,
    verifiedChangePrecisionNumerator: 0,
    verifiedChangePrecisionDenominator: 0,
    verifiedChangePrecision: null,
    contradictionCaptureNumerator: 0,
    contradictionCaptureDenominator: 0,
    contradictionCaptureRate: null,
    timeToFirstVerifiedChangeMinutes: null,
    reviewerResolutionNumerator: 0,
    reviewerResolutionDenominator: 0,
    reviewerResolutionRate: null,
    facts: ['insufficient_product_value_evidence'],
    preCapCandidateCount: 0,
    preCapOrderedIdentityHash: 'c5925b7094c24e45e8f37c0dc43f736f38490d782f783a4254a9b238bd335383',
    deferredDueStrategyEvidenceCap: 0,
    retainedCandidateCount: 0,
  }));
}

function emptyEvaluationBundle() {
  return {
    strategyRows: emptyStrategyRows(),
    status: 'fail',
  };
}

function evaluationSummary(body: unknown[]) {
  if (
    body.length !== 15 ||
    !Array.isArray(body[3]) ||
    !Number.isSafeInteger(body[4]) ||
    !Number.isSafeInteger(body[5]) ||
    !Array.isArray(body[11]) ||
    body[11].length !== 3 ||
    !record(body[12]) ||
    !Array.isArray(body[13]) ||
    !['pass', 'fail'].includes(String(body[14]))
  ) throw new TypeError('invalid evaluation computation summary');
  const strategyRows = body[11];
  const orderedStrategies = ['official_only', 'source_led', 'hybrid'];
  if (strategyRows.some(
    (row, index) => !record(row) || row.strategy !== orderedStrategies[index],
  )) throw new TypeError('invalid evaluation strategy order');
  return {
    evaluationInputManifestHash: body[0],
    linkAuditSampleManifestHash: body[1],
    linkAuditResolutionManifestHash: body[2],
    orderedInputRunAndManifestHashes: body[3],
    backtestCount: body[4],
    liveCount: body[5],
    v3Metrics: body[6],
    legacyMetrics: body[7],
    linkPrecision: body[8],
    linkRecall: body[9],
    strategyPopulationSummary: body[10],
    strategyRows,
    gateBooleans: body[12],
    gateFacts: body[13],
    status: body[14],
  };
}
