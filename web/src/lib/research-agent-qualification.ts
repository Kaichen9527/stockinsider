import { createHash } from 'node:crypto';

export const THESIS_QUALIFICATION_POLICY = 'thesis-qualification-v1' as const;
export const TECHNICAL_MONITORING_POLICY = 'technical-monitoring-v1' as const;
export type ThesisStatus = 'qualified' | 'rejected' | 'needs_evidence' | 'stale' | 'invalidated';

export type ThesisQualification = {
  symbol: string;
  thesisRevisionId: string;
  articleRevisionId: string;
  articleHash: string;
  evidenceSnapshotHash: string;
  reviewReceiptHash: string;
  policyVersion: typeof THESIS_QUALIFICATION_POLICY;
  status: ThesisStatus;
  horizon: '1-3m' | '3-6m' | '6-18m';
  support: string[];
  counterEvidence: string[];
  invalidationConditions: string[];
  materialEventIds: string[];
  qualifiedAt: string;
  nextReviewAt: string;
};

type ReviewInput = {
  symbol: string;
  thesisRevisionId: string;
  articleRevisionId: string;
  articleHash: string;
  acceptedArticle: boolean;
  authorId: string;
  reviewerId: string;
  reviewerReadEvidenceHash: string;
  evidenceSnapshotHash: string;
  financialBridgeVerified: boolean;
  decision: 'qualified' | 'rejected' | 'needs_evidence';
  horizon: ThesisQualification['horizon'];
  support: string[];
  counterEvidence: string[];
  invalidationConditions: string[];
  materialEventIds: string[];
  reviewedAt: string;
};

const SHA256 = /^[0-9a-f]{64}$/u;
const date = (value: string) => Number.isFinite(Date.parse(value));
const uniq = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(',')}}`;
}
export function researchCanonicalHash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** A published bearish article is valid content; research qualification is a separate decision. */
export function issueThesisQualification(input: ReviewInput): ThesisQualification {
  if (!/^\d{4}$/u.test(input.symbol) || !input.thesisRevisionId || !input.articleRevisionId
    || !SHA256.test(input.articleHash) || !SHA256.test(input.evidenceSnapshotHash)
    || input.reviewerReadEvidenceHash !== input.evidenceSnapshotHash
    || !input.authorId || !input.reviewerId || input.authorId === input.reviewerId
    || !date(input.reviewedAt)) throw new Error('thesis_review_identity_invalid');
  if (input.decision === 'qualified' && (!input.acceptedArticle || !input.financialBridgeVerified
    || uniq(input.support).length === 0 || uniq(input.invalidationConditions).length === 0)) {
    throw new Error('thesis_qualification_evidence_incomplete');
  }
  const reviewReceiptHash = researchCanonicalHash(input);
  return {
    symbol: input.symbol, thesisRevisionId: input.thesisRevisionId,
    articleRevisionId: input.articleRevisionId, articleHash: input.articleHash,
    evidenceSnapshotHash: input.evidenceSnapshotHash, reviewReceiptHash,
    policyVersion: THESIS_QUALIFICATION_POLICY, status: input.decision, horizon: input.horizon,
    support: uniq(input.support), counterEvidence: uniq(input.counterEvidence),
    invalidationConditions: uniq(input.invalidationConditions), materialEventIds: uniq(input.materialEventIds),
    qualifiedAt: input.reviewedAt,
    nextReviewAt: new Date(Date.parse(input.reviewedAt) + 30 * 86400_000).toISOString(),
  };
}

export function researchEntryQualification(thesis: ThesisQualification, now: string) {
  if (!date(now) || !date(thesis.qualifiedAt) || !date(thesis.nextReviewAt)) {
    throw new Error('thesis_review_clock_invalid');
  }
  if (Date.parse(now) < Date.parse(thesis.qualifiedAt)) throw new Error('thesis_future_review');
  if (thesis.status !== 'qualified') return { allowed: false, reason: `thesis_${thesis.status}` };
  if (Date.parse(now) >= Date.parse(thesis.nextReviewAt)) return { allowed: false, reason: 'thesis_review_due' };
  return { allowed: true, reason: 'thesis_qualified' };
}

/** Corrections create a new revision and never change the earlier qualification. */
export function invalidateThesis(input: {
  thesis: ThesisQualification; eventId: string; observedAt: string; status: 'stale' | 'invalidated';
}): ThesisQualification {
  if (!input.eventId || !date(input.observedAt)
    || Date.parse(input.observedAt) < Date.parse(input.thesis.qualifiedAt)) throw new Error('thesis_event_clock_invalid');
  return { ...input.thesis, status: input.status,
    reviewReceiptHash: researchCanonicalHash({ priorReceipt: input.thesis.reviewReceiptHash,
      eventId: input.eventId, observedAt: input.observedAt, status: input.status }),
    materialEventIds: uniq([...input.thesis.materialEventIds, input.eventId]),
    nextReviewAt: input.observedAt };
}

/** A no-change review moves the review deadline without rewriting the article. */
export function renewThesisReview(input: {
  thesis: ThesisQualification;
  evidenceSnapshotHash: string;
  reviewerId: string;
  reviewedAt: string;
}): ThesisQualification {
  if (input.thesis.status !== 'qualified' || input.evidenceSnapshotHash !== input.thesis.evidenceSnapshotHash
    || !input.reviewerId || !date(input.reviewedAt)
    || Date.parse(input.reviewedAt) < Date.parse(input.thesis.qualifiedAt)) {
    throw new Error('thesis_review_revision_changed');
  }
  const nextReviewAt = new Date(Date.parse(input.reviewedAt) + 30 * 86400_000).toISOString();
  const reviewReceiptHash = researchCanonicalHash({
    priorReceipt: input.thesis.reviewReceiptHash, evidenceSnapshotHash: input.evidenceSnapshotHash,
    reviewerId: input.reviewerId, reviewedAt: input.reviewedAt,
  });
  return { ...input.thesis, reviewReceiptHash, qualifiedAt: input.reviewedAt, nextReviewAt };
}

export type TechnicalDecisionSnapshot = {
  schemaVersion: typeof TECHNICAL_MONITORING_POLICY;
  symbol: string;
  thesisRevisionId: string;
  articleRevisionId: string;
  articleHash: string;
  reviewReceiptHash: string;
  marketSession: string;
  marketDatasetHash: string;
  calendarHash: string;
  featureVersion: string;
  strategyVersion: string;
  observedAt: string;
  signalState: 'pending_data' | 'waiting' | 'confirmed';
  entryResearchEligible: boolean;
  monitorExistingPosition: boolean;
  blockers: string[];
};

export function createTechnicalDecisionSnapshot(input: {
  thesis: ThesisQualification;
  observedAt: string;
  marketSession: string;
  marketDatasetHash: string;
  calendarHash: string;
  finalDatasetConfirmed: boolean;
  featureVersion: string;
  strategyVersion: string;
  rawSignalConfirmed: boolean;
  evidenceCurrent: boolean;
  liquidityVerified: boolean;
  approvedStrategyVersion: string | null;
  existingPaperPosition: boolean;
}): TechnicalDecisionSnapshot {
  if (!date(input.observedAt) || !/^\d{4}-\d{2}-\d{2}$/u.test(input.marketSession)
    || !SHA256.test(input.marketDatasetHash) || !SHA256.test(input.calendarHash)
    || !input.featureVersion || !input.strategyVersion
    || input.marketSession > new Date(Date.parse(input.observedAt) + 8 * 3600_000).toISOString().slice(0, 10)) {
    throw new Error('technical_monitoring_input_invalid');
  }
  const qualification = researchEntryQualification(input.thesis, input.observedAt);
  const blockers = [
    !input.finalDatasetConfirmed ? 'official_final_dataset_pending' : null,
    !qualification.allowed ? qualification.reason : null,
    !input.evidenceCurrent ? 'article_source_retracted_or_missing' : null,
    !input.liquidityVerified ? 'liquidity_unverified' : null,
    input.approvedStrategyVersion !== input.strategyVersion ? 'strategy_version_not_approved' : null,
  ].filter((value): value is string => Boolean(value));
  return {
    schemaVersion: TECHNICAL_MONITORING_POLICY, symbol: input.thesis.symbol,
    thesisRevisionId: input.thesis.thesisRevisionId, articleRevisionId: input.thesis.articleRevisionId,
    articleHash: input.thesis.articleHash, reviewReceiptHash: input.thesis.reviewReceiptHash,
    marketSession: input.marketSession, marketDatasetHash: input.marketDatasetHash, calendarHash: input.calendarHash,
    featureVersion: input.featureVersion, strategyVersion: input.strategyVersion, observedAt: input.observedAt,
    signalState: !input.finalDatasetConfirmed ? 'pending_data' : input.rawSignalConfirmed ? 'confirmed' : 'waiting',
    entryResearchEligible: input.rawSignalConfirmed && blockers.length === 0,
    monitorExistingPosition: input.existingPaperPosition, blockers,
  };
}
