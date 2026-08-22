import type { CompactRadarProjection } from './compact-radar-validation';
import type { ProjectionHealth } from './projection-freshness';

const CARD_BUCKETS = [
  'opportunities', 'scenarioUpsideCandidates', 'hotTracking', 'recentFormal7d', 'fallbackOpportunities90d',
  'earlyWatchlist', 'earlySignals', 'partiallyVerified', 'validatedIdeas', 'sourceSignals',
] as const;

function readonlyCard(value: unknown, legacySchema = false): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const card = structuredClone(value) as Record<string, unknown>;
  card.projectionReadOnly = true;
  const envelope = card.decisionEnvelope;
  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
    const typedEnvelope=envelope as Record<string,unknown>;
    card.lastKnownAction = typedEnvelope.userAction;
    if (typeof card.decisionRevisionId !== 'string' && typeof typedEnvelope.decisionRevisionId === 'string') {
      card.decisionRevisionId=typedEnvelope.decisionRevisionId;
    }
    // A consumer that ignores projectionHealth must still be unable to mistake
    // a last-good card for current action authority.  The immutable revision id
    // remains navigable; its detail reader independently returns stale-readonly.
    delete card.decisionEnvelope;
  }
  if (legacySchema) {
    if (!card.lastKnownAction && typeof card.newPositionAction === 'string') card.lastKnownAction = card.newPositionAction;
    delete card.decisionEnvelope;
    delete card.decisionRevisionId;
    if (typeof card.symbol === 'string' && /^\d{4}$/u.test(card.symbol)) {
      card.detailHref = `/stock/${card.symbol}`;
      card.researchOnlyDetail = true;
    } else {
      delete card.detailHref;
    }
    card.projectionBlockers = ['legacy_schema_without_v314_decision_authority'];
  }
  if ('newPositionAction' in card) card.newPositionAction = 'valuation_review';
  if ('opportunityAction' in card) card.opportunityAction = 'evidence_watch';
  const researchDecision = card.researchDecision;
  if (researchDecision && typeof researchDecision === 'object' && !Array.isArray(researchDecision)) {
    card.researchDecision = {
      ...(researchDecision as Record<string, unknown>),
      newPositionAction: 'valuation_review',
      projectionReadOnly: true,
    };
  }
  return card;
}

export function withProjectionHealth(selected: CompactRadarProjection, health: ProjectionHealth): CompactRadarProjection {
  const payload = structuredClone(selected) as CompactRadarProjection;
  const revisionBoundSchema=['legacy-radar-v3.17.0','legacy-radar-v3.18.0'].includes(payload.sourceLedCorrectness.schema);
  const legacySchema = !['legacy-radar-v3.14.0','legacy-radar-v3.17.0','legacy-radar-v3.18.0'].includes(payload.sourceLedCorrectness.schema);
  const effectiveHealth=legacySchema?{...health,actionsEnabled:false,actionAuthority:'disabled' as const,
    researchVisibility:'last_good_readonly' as const}:health;
  payload.projectionHealth = effectiveHealth;
  if (legacySchema) payload.compatibilityAdapter = {
    version: 'legacy-readonly-adapter-v3.14.0', sourceSchema: payload.sourceLedCorrectness.schema,
    blocker: 'legacy_schema_without_v314_decision_authority',
  };
  if (effectiveHealth.status === 'fresh'&&!legacySchema
      &&effectiveHealth.actionAuthority==='enabled'&&effectiveHealth.actionsEnabled===true) return payload;
  for (const bucket of CARD_BUCKETS) {
    const cards = payload[bucket];
    if (!Array.isArray(cards)) continue;
    payload[bucket] = (effectiveHealth.researchVisibility === 'none' ? []
      : cards.map((card)=>readonlyCard(card,legacySchema,revisionBoundSchema))) as Array<Record<string, unknown>>;
  }
  payload.loadStatus = effectiveHealth.researchVisibility === 'none' ? 'unavailable' : 'degraded';
  payload.loadWarnings = legacySchema
    ? ['legacy_schema_without_v314_decision_authority']
    : [effectiveHealth.actionAuthority==='disabled'&&effectiveHealth.status==='fresh'
      ?`projection_${effectiveHealth.reason}`:`projection_${effectiveHealth.status}`];
  return payload;
}
