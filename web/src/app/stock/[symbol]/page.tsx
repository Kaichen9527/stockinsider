import {
  loadPublishedDecisionRevision,
  loadPublishedRadarProjection,
} from '@/lib/radar-projection-read';
import { parseDecisionRevisionQuery, selectUniquePublishedDecisionCard } from '@/lib/opportunity-v3/decision-publication';
import RevisionBoundDecisionBrief, {
  RevisionBoundDecisionUnavailable,
} from './RevisionBoundDecisionBrief';
import ResearchOnlyDetail from './ResearchOnlyDetail';

export const dynamic = 'force-dynamic';

const RESEARCH_BUCKETS = ['sourceSignals', 'earlyWatchlist', 'earlySignals', 'partiallyVerified', 'validatedIdeas',
  'opportunities', 'scenarioUpsideCandidates', 'hotTracking', 'recentFormal7d', 'fallbackOpportunities90d'] as const;

function selectResearchOnlyCard(projection: Record<string, unknown> | null, symbol: string,
  decisionRevisionId?: string): Record<string, unknown> | null {
  if (!projection) return null;
  for (const bucket of RESEARCH_BUCKETS) {
    const cards = projection[bucket];
    if (!Array.isArray(cards)) continue;
    const matches = cards.filter((card): card is Record<string, unknown> => Boolean(card && typeof card === 'object'
      && !Array.isArray(card) && (card as Record<string, unknown>).symbol === symbol
      && (!decisionRevisionId || (card as Record<string, unknown>).decisionRevisionId === decisionRevisionId)));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export default async function StockDetail({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { symbol } = await params;
  const query = await searchParams;
  const normalizedSymbol = symbol.toUpperCase();
  const revisionQuery=parseDecisionRevisionQuery(query);
  const revisionParameterPresent=revisionQuery.status!=='absent';
  const validRequestedRevision=revisionQuery.status==='valid'?revisionQuery.revisionId:null;

  // Every public detail route is a closed read-only decision-revision read. It never
  // runs a refresh and never falls back to a legacy recommendation, technical entry
  // plan or playbook when the authoritative envelope is missing or stale.
  if (revisionParameterPresent && !validRequestedRevision) {
    return <RevisionBoundDecisionUnavailable symbol={normalizedSymbol} revisionId="invalid"
      reason="decision_revision_parameter_invalid_or_ambiguous"/>;
  }

  if (process.env.OPPORTUNITY_V3_UI_FIXTURE === 'enabled') {
    const { v313FixtureSignals, v313DetailFailureFixtures, v317ResearchOnlyFixture, v317ResearchDataNeededFixture } = await import('../../v313-decision-fixture/fixture-data');
    const fixture = [...v313FixtureSignals, ...v313DetailFailureFixtures, v317ResearchOnlyFixture, v317ResearchDataNeededFixture].find((candidate) => candidate.symbol === normalizedSymbol
      && (!validRequestedRevision || candidate.decisionRevisionId === validRequestedRevision));
    if (fixture?.researchSnapshot) {
      return <ResearchOnlyDetail symbol={normalizedSymbol} card={fixture as unknown as Record<string, unknown>}
        projectionBlockers={['action_authority_disabled']}/>;
    }
    if (fixture?.decisionEnvelope) {
      return <RevisionBoundDecisionBrief symbol={normalizedSymbol} envelope={fixture.decisionEnvelope}
        card={fixture as unknown as Record<string, unknown>}/>;
    }
    if (!validRequestedRevision) {
      const {v314ReadonlyRadar}=await import('../../v314-readonly-fixture/fixture-data');
      const researchCard=selectResearchOnlyCard(v314ReadonlyRadar as unknown as Record<string,unknown>,normalizedSymbol);
      if(researchCard)return <ResearchOnlyDetail symbol={normalizedSymbol} card={researchCard}
        projectionBlockers={['legacy_schema_without_v314_decision_authority']}/>;
    }
  } else {
    const projection = validRequestedRevision
      ? await loadPublishedDecisionRevision(normalizedSymbol, validRequestedRevision).catch(() => null)
      : await loadPublishedRadarProjection('home').catch(() => null);
    const resolved = selectUniquePublishedDecisionCard(projection as Record<string, unknown> | null,
      normalizedSymbol, validRequestedRevision??undefined);
    if (resolved) {
      // A checksum-valid readonly revision remains useful research.  It must
      // never render an executable action, but hiding its valuation/technical
      // snapshot was worse than an honest stale-readonly detail page.
      if (resolved.card.projectionReadOnly === true || resolved.briefAvailability === 'unavailable') {
        const health = projection?.projectionHealth as {actionBlockers?:unknown}|undefined;
        return <ResearchOnlyDetail symbol={normalizedSymbol} card={resolved.card}
          projectionBlockers={Array.isArray(health?.actionBlockers)
            ? health.actionBlockers.filter((value):value is string=>typeof value==='string') : []}/>;
      }
      return <RevisionBoundDecisionBrief symbol={normalizedSymbol} envelope={resolved.envelope}
        card={resolved.card}/>;
    }
    {
      const researchCard = selectResearchOnlyCard(projection as Record<string, unknown> | null, normalizedSymbol,
        validRequestedRevision ?? undefined);
      if (researchCard) {
        const health = projection?.projectionHealth as {actionBlockers?:unknown}|undefined;
        return <ResearchOnlyDetail symbol={normalizedSymbol} card={researchCard}
          projectionBlockers={Array.isArray(health?.actionBlockers)
            ? health.actionBlockers.filter((value):value is string=>typeof value==='string') : []}/>;
      }
    }
  }

  return <RevisionBoundDecisionUnavailable symbol={normalizedSymbol}
    revisionId={validRequestedRevision ?? 'current'}
    reason={validRequestedRevision ? 'decision_revision_unavailable' : 'authoritative_decision_envelope_missing'}/>;
}
