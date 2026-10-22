import { marketJudgment, type MarketInput } from './market.ts';
import { inputHash, type Session } from './policy.ts';
import { REQUIRED_SECTIONS } from './research.ts';
type ResearchScore={confirmedPoints:number;availableWeight:number};
export type PublishedMember = { symbol: string; state: 'researching' | 'waiting' | 'eligible'; inputHash: string; publishedInputHash: string | null;
  revisionId: string | null; publishedAt: string | null; eventAt: string | null; reasons: string[]; gaps: string[];
  score: ResearchScore | null; initialScore?:ResearchScore|null;deepScore?:ResearchScore|null;deepScoreAt?:string|null;sourceRights?:{current:boolean;reason:string|null}; content: Record<string, unknown> | null; statusReason?: string | null;
  qualification?: { qualified: boolean; inputHash: string; expiresAt: string; proofHash: string; financialCoverage: { status: string }; priceBasis: { status: string } };
  citations?: Array<{ id: string; url: string; contentHash: string }> };
export type PublishedHome = { version: string; market: MarketInput & { sessions: Session[] }; members: PublishedMember[]; publishedAt: string; latestSession?: Session };
export function publicHome(value: unknown, now: string) {
  const home = value as PublishedHome | null;
  if (!home || typeof home.version !== 'string' || !Array.isArray(home.members) || home.members.length > 20 || !home.market) return null;
  const market = home.market;
  const validatedMarket: MarketInput = {
    risk: ['risk_on', 'selective', 'risk_off', 'breakdown', 'unknown'].includes(market.risk) ? market.risk : 'unknown',
    confidence: ['complete', 'limited', 'insufficient'].includes(market.confidence) ? market.confidence : 'insufficient',
    session: market.session || null, sourceAt: market.sourceAt || null, expiresAt: market.expiresAt || null,
    continuity: market.continuity === true, provenance: Array.isArray(market.provenance) ? market.provenance : [],
    gaps: Array.isArray(market.gaps) ? market.gaps : ['market_gaps_unknown'], overseas: Array.isArray(market.overseas) ? market.overseas : [],
    reasons: Array.isArray(market.reasons) ? market.reasons : [], risks: Array.isArray(market.risks) ? market.risks : [],
    conditions: Array.isArray(market.conditions) ? market.conditions : [], background: market.background,
    aiInterpretation: market.aiInterpretation,
  };
  const sessions = [...(Array.isArray(market.sessions) ? market.sessions : []), ...(home.latestSession ? [home.latestSession] : [])];
  const judgment = marketJudgment(validatedMarket, sessions, now);
  const validContent = (member: PublishedMember) => {
    const content = member.content; const sections = content?.sections as Record<string, unknown> | undefined;
    return Boolean(member.revisionId && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(member.revisionId)
      && content?.schemaVersion === 'stockinsider-vnext-research-v1' && content.inputHash === member.publishedInputHash
      && content.outputHash === inputHash({ ...content, outputHash: undefined }) && content.modelVersion
      && Array.isArray(content.claims) && content.claims.length > 0 && sections && REQUIRED_SECTIONS.every((key) => sections[key]));
  };
  const qualified = (member: PublishedMember) => {
    const proof = member.qualification;
    return proof?.qualified === true && proof.inputHash === member.inputHash && /^[a-f0-9]{64}$/u.test(proof.proofHash)
      && Number.isFinite(Date.parse(proof.expiresAt)) && Date.parse(proof.expiresAt) >= Date.parse(now)
      && proof.financialCoverage?.status === 'complete' && proof.priceBasis?.status === 'verified';
  };
  const members = home.members.filter((m) => /^\d{4}$/u.test(m.symbol) && ['researching', 'waiting', 'eligible'].includes(m.state))
    .map((m) => ({ ...m, entryEligible: m.state === 'eligible' && m.sourceRights?.current===true && validContent(m) && qualified(m) && m.inputHash === m.publishedInputHash && !judgment.entryBlocked,
      retained: Boolean(m.revisionId && m.inputHash !== m.publishedInputHash) }));
  return { ...home, market: judgment, members };
}
