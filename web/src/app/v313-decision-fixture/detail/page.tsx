import { notFound } from 'next/navigation';
import RevisionBoundDecisionBrief from '@/app/stock/[symbol]/RevisionBoundDecisionBrief';
import { v313FixtureSignals } from '../fixture-data';

export const dynamic = 'force-dynamic';

export default async function V313DecisionFixtureDetail({ searchParams }: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  if(process.env.OPPORTUNITY_V3_UI_FIXTURE!=='enabled')notFound();
  const query=await searchParams;
  const revision=Array.isArray(query.decisionRevisionId)?query.decisionRevisionId[0]:query.decisionRevisionId;
  const card=v313FixtureSignals.find((candidate)=>candidate.decisionRevisionId===revision);
  if(!card?.decisionEnvelope)notFound();
  return <RevisionBoundDecisionBrief symbol={card.symbol} envelope={card.decisionEnvelope}
    card={card as unknown as Record<string,unknown>}/>;
}
