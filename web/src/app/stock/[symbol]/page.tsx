import {
  loadPublishedDecisionRevision,
  loadPublishedRadarProjection,
} from '@/lib/radar-projection-read';
import { parseDecisionRevisionQuery, selectUniquePublishedDecisionCard } from '@/lib/opportunity-v3/decision-publication';
import RevisionBoundDecisionBrief, {
  RevisionBoundDecisionUnavailable,
} from './RevisionBoundDecisionBrief';

export const dynamic = 'force-dynamic';

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
    const { v313FixtureSignals, v313DetailFailureFixtures } = await import('../../v313-decision-fixture/fixture-data');
    const fixture = [...v313FixtureSignals, ...v313DetailFailureFixtures].find((candidate) => candidate.symbol === normalizedSymbol
      && (!validRequestedRevision || candidate.decisionRevisionId === validRequestedRevision));
    if (fixture?.decisionEnvelope) {
      return <RevisionBoundDecisionBrief symbol={normalizedSymbol} envelope={fixture.decisionEnvelope}
        card={fixture as unknown as Record<string, unknown>}/>;
    }
  } else {
    const projection = validRequestedRevision
      ? await loadPublishedDecisionRevision(normalizedSymbol, validRequestedRevision).catch(() => null)
      : await loadPublishedRadarProjection('home').catch(() => null);
    const resolved = selectUniquePublishedDecisionCard(projection as Record<string, unknown> | null,
      normalizedSymbol, validRequestedRevision??undefined);
    if (resolved) {
      return <RevisionBoundDecisionBrief symbol={normalizedSymbol} envelope={resolved.envelope}
        card={resolved.card}/>;
    }
  }

  return <RevisionBoundDecisionUnavailable symbol={normalizedSymbol}
    revisionId={validRequestedRevision ?? 'current'}
    reason={validRequestedRevision ? 'decision_revision_unavailable' : 'authoritative_decision_envelope_missing'}/>;
}
