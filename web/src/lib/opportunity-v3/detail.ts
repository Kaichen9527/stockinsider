import {
  ACCEPTANCE_VERSION_V3,
  DETAIL_CONTRACT_V3,
  type OpportunityCardV3,
  type FactorKeyV3,
  type HorizonV3,
  type VerifiedChangeBriefV3,
} from './contracts.ts';
import { canonicalJson, sha256Canonical } from './canonical.ts';
import { getOpportunityV3ServerClient } from './service-client.ts';
import { v3PublicEnabled } from './deployment.ts';
import { assertNoPublicSizing } from './verified-change.ts';
import {
  validSourceEvidence,
  type OpportunityDetailSourceEvidenceV3,
} from './detail-schema.ts';
import {
  FACTORS,
  validOpportunityCardV3,
  validVerifiedChangeBriefV3,
} from './public-schema.ts';

export const DETAIL_UNAVAILABLE_V3 = {
  contractVersion: DETAIL_CONTRACT_V3,
  acceptanceVersion: ACCEPTANCE_VERSION_V3,
  availability: 'unavailable',
  status: 404,
  reason: 'detail_not_available',
  disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE',
} as const;

export type OpportunityDetailV3 = {
  contractVersion: typeof DETAIL_CONTRACT_V3;
  acceptanceVersion: typeof ACCEPTANCE_VERSION_V3;
  mode: 'shadow';
  decisionAuthority: 'research_only';
  runId: string;
  sourceRunId: string;
  sourceCutoff: string;
  symbol: string;
  chineseName: string | null;
  card: OpportunityCardV3;
  verifiedChangeBrief: VerifiedChangeBriefV3 | null;
  sourceEvidence: OpportunityDetailSourceEvidenceV3[];
  horizonDetails: Array<{
    horizon: HorizonV3;
    rank: number;
    score: number;
    scoreConfidence: number;
    availableWeight: number;
    factors: Array<{
      key: FactorKeyV3;
      value: number | null;
      contribution: number;
      status: 'available' | 'missing' | 'stale';
      evidenceRefs: string[];
    }>;
  }>;
  decisionEvidence: {
    marketContextRef: string;
    sectorCycleRef: string;
    financialManifestRef: string | null;
    scoringManifestRef: string;
    valuationManifestRef: string | null;
    blockReasons: string[];
  };
  disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
};

export function validRunId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

export function validSymbol(value: string): boolean {
  return /^[0-9A-Z]{4,10}$/u.test(value);
}

export function validOpportunityDetailPayload(
  value: unknown,
  expectedRunId?: string,
  expectedSymbol?: string,
): value is OpportunityDetailV3 {
  if (!exactKeys(value, [
    'contractVersion', 'acceptanceVersion', 'mode', 'decisionAuthority', 'runId', 'sourceRunId',
    'sourceCutoff', 'symbol', 'chineseName', 'card', 'verifiedChangeBrief', 'sourceEvidence',
    'horizonDetails', 'decisionEvidence', 'disclosure',
  ])) return false;
  const payload = value as Record<string, unknown>;
  if (
    payload.contractVersion !== DETAIL_CONTRACT_V3 ||
    payload.acceptanceVersion !== ACCEPTANCE_VERSION_V3 ||
    payload.mode !== 'shadow' ||
    payload.decisionAuthority !== 'research_only' ||
    typeof payload.runId !== 'string' ||
    !validRunId(payload.runId) ||
    (expectedRunId !== undefined && payload.runId !== expectedRunId) ||
    typeof payload.sourceRunId !== 'string' ||
    !validRunId(payload.sourceRunId) ||
    typeof payload.symbol !== 'string' ||
    !validSymbol(payload.symbol) ||
    (expectedSymbol !== undefined && payload.symbol !== expectedSymbol) ||
    !wholeSecondUtc(payload.sourceCutoff) ||
    !(payload.chineseName === null ||
      (typeof payload.chineseName === 'string' && [...payload.chineseName].length <= 80)) ||
    !validOpportunityCardV3(payload.card, payload.runId, payload.sourceCutoff as string) ||
    payload.card.symbol !== payload.symbol ||
    payload.card.chineseName !== payload.chineseName ||
    !validSourceEvidence(payload.sourceEvidence, payload.sourceCutoff as string) ||
    !Array.isArray(payload.horizonDetails) ||
    payload.horizonDetails.length !== 3 ||
    !exactKeys(payload.decisionEvidence, [
      'marketContextRef', 'sectorCycleRef', 'financialManifestRef', 'scoringManifestRef',
      'valuationManifestRef', 'blockReasons',
    ]) ||
    !boundedRef(payload.decisionEvidence.marketContextRef) ||
    !boundedRef(payload.decisionEvidence.sectorCycleRef) ||
    !(payload.decisionEvidence.financialManifestRef === null ||
      boundedRef(payload.decisionEvidence.financialManifestRef)) ||
    !boundedRef(payload.decisionEvidence.scoringManifestRef) ||
    !(payload.decisionEvidence.valuationManifestRef === null ||
      boundedRef(payload.decisionEvidence.valuationManifestRef)) ||
    !uniqueBoundedRefs(payload.decisionEvidence.blockReasons, 16) ||
    canonicalJson(payload.decisionEvidence.blockReasons) !== canonicalJson(payload.card.actionDecision.blockReasons) ||
    payload.disclosure !== 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE'
  ) return false;
  if (
    payload.verifiedChangeBrief !== null &&
    (!validVerifiedChangeBriefV3(payload.verifiedChangeBrief, payload.runId, payload.symbol) ||
      payload.verifiedChangeBrief.sourceCutoff !== payload.sourceCutoff ||
      payload.verifiedChangeBrief.formalResearchStatus !== payload.card.formalResearchStatus ||
      payload.verifiedChangeBrief.primaryHorizon !== payload.card.primaryHorizon ||
      payload.verifiedChangeBrief.scoreDelta !== payload.card.scoreDelta)
  ) return false;
  const evidenceRefs = payload.sourceEvidence.map((row) => row.ref);
  if (canonicalJson(evidenceRefs.slice(0, 5)) !== canonicalJson(payload.card.sourceRefs)) return false;
  const horizons: HorizonV3[] = ['momentum_5_20d', 'swing_20_60d', 'thesis_120_250d'];
  for (const [horizonIndex, detail] of payload.horizonDetails.entries()) {
    if (
      !exactKeys(detail, ['horizon', 'rank', 'score', 'scoreConfidence', 'availableWeight', 'factors']) ||
      detail.horizon !== horizons[horizonIndex] ||
      !positiveInteger(detail.rank) ||
      !boundedNumber(detail.score, 0, 100) ||
      !boundedNumber(detail.scoreConfidence, 0, 1) ||
      !boundedNumber(detail.availableWeight, 0, 100) ||
      !Array.isArray(detail.factors) ||
      detail.factors.length !== FACTORS.length
    ) return false;
    for (const [factorIndex, factor] of detail.factors.entries()) {
      if (
        !exactKeys(factor, ['key', 'value', 'contribution', 'status', 'evidenceRefs']) ||
        factor.key !== FACTORS[factorIndex] ||
        !(factor.value === null || boundedNumber(factor.value)) ||
        !boundedNumber(factor.contribution) ||
        !['available', 'missing', 'stale'].includes(String(factor.status)) ||
        (factor.status === 'available') !== (factor.value !== null) ||
        !uniqueBoundedRefs(factor.evidenceRefs, 3)
      ) return false;
    }
  }
  return true;
}

export async function loadOpportunityDetailV3(runId: string, symbol: string): Promise<OpportunityDetailV3 | null> {
  if (!v3PublicEnabled() || !validRunId(runId) || !validSymbol(symbol)) return null;
  const client = getOpportunityV3ServerClient();
  const { data, error } = await client
    .from('opportunity_detail_projections_v3')
    .select('payload_json,payload_canonical,payload_hash,opportunity_runs!inner(status)')
    .eq('run_id', runId)
    .eq('symbol', symbol)
    .eq('opportunity_runs.status', 'success')
    .limit(2);
  if (error || !data || data.length !== 1) return null;
  const row = data[0] as Record<string, unknown>;
  if (!validOpportunityDetailPayload(row.payload_json, runId, symbol)) return null;
  const payload = row.payload_json;
  try {
    assertNoPublicSizing(payload);
  } catch {
    return null;
  }
  if (decodeBytea(row.payload_canonical) !== canonicalJson(payload) || row.payload_hash !== sha256Canonical(payload)) return null;
  return payload;
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function wholeSecondUtc(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}

function boundedRef(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= 120;
}

function uniqueBoundedRefs(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) &&
    value.length <= maximum &&
    value.every(boundedRef) &&
    new Set(value).size === value.length;
}

function boundedNumber(
  value: unknown,
  minimum = -Number.MAX_VALUE,
  maximum = Number.MAX_VALUE,
): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function decodeBytea(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('\\x') ? Buffer.from(value.slice(2), 'hex').toString('utf8') : value;
}
