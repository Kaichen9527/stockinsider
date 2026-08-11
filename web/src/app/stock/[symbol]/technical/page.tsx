import { redirect } from 'next/navigation';
import { RevisionBoundDecisionUnavailable } from '../RevisionBoundDecisionBrief';

export const dynamic = 'force-dynamic';

// Technical timing is no longer an independent recommendation surface.  The public
// chart-room URL is retained as a compatibility route, but it resolves through the
// same immutable DecisionEnvelope detail page and never runs a GET-triggered refresh.
export default async function StockTechnicalPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const {symbol}=await params;
  const query=await searchParams;
  const values=query.decisionRevisionId===undefined?[]:
    Array.isArray(query.decisionRevisionId)?query.decisionRevisionId:[query.decisionRevisionId];
  if(values.length>1||values.length===1&&!/^decision-v3[.](?:13|14):[0-9a-f]{64}$/u.test(values[0])){
    return <RevisionBoundDecisionUnavailable symbol={symbol.toUpperCase()} revisionId="invalid"
      reason="decision_revision_parameter_invalid_or_ambiguous"/>;
  }
  const suffix=values.length===1?`?decisionRevisionId=${encodeURIComponent(values[0])}`:'';
  redirect(`/stock/${encodeURIComponent(symbol.toUpperCase())}${suffix}`);
}
