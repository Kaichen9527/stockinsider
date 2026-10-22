import { marketJudgment, type MarketInput } from './market.ts';
import { inputHash,taipeiDate, type Session } from './policy.ts';
import { REQUIRED_SECTIONS } from './research.ts';
import type {Claim} from './research.ts';
import type {reviewedValuation} from './reviewed-valuation.ts';
type ResearchScore={confirmedPoints:number;availableWeight:number};
export type PublishedMember = { symbol: string; state: 'researching' | 'waiting' | 'eligible'; inputHash: string; publishedInputHash: string | null;
  revisionId: string | null; publishedAt: string | null; eventAt: string | null; reasons: string[]; gaps: string[];
  score: ResearchScore | null; initialScore?:ResearchScore|null;deepScore?:ResearchScore|null;deepScoreAt?:string|null;sourceRights?:{current:boolean;reason:string|null}; content: Record<string, unknown> | null; statusReason?: string | null;
  qualification?: Record<string,unknown> & { qualified: boolean; inputHash: string; expiresAt: string; proofHash: string; financialCoverage: { status: string }; priceBasis: { status: string };schemaVersion?:string;checkedAt?:string;valuation?:ReturnType<typeof reviewedValuation> };
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
    const checkedAt=Date.parse(proof?.checkedAt||''),expiresAt=Date.parse(proof?.expiresAt||''),readAt=Date.parse(now);
    if(proof?.schemaVersion!=='stockinsider-vnext-authority-proof-v1' || proof.qualified!==true || proof.inputHash!==member.inputHash || typeof proof.checkedAt!=='string' || typeof proof.expiresAt!=='string' || !/^[a-f0-9]{64}$/u.test(proof.proofHash)
      || ![checkedAt,expiresAt,readAt].every(Number.isFinite) || checkedAt>readAt || expiresAt<readAt || expiresAt>checkedAt+120000
      || proof.financialCoverage?.status!=='complete' || proof.priceBasis?.status!=='verified')return false;
    const {proofHash,...bound}=proof;if(proofHash!==inputHash(bound))return false;
    const valuation=proof.valuation,raw=valuation?.valuation;
    if(valuation?.usable!==true || !Array.isArray(valuation.gaps) || valuation.gaps.length || !raw || !Array.isArray(raw.provenance) || !raw.provenance.length
      || !raw.provenance.every((source)=>typeof source==='string' && source.length>0) || !Array.isArray(valuation.claimIds) || valuation.claimIds.length<4 || valuation.claimIds.length>5 || new Set(valuation.claimIds).size!==valuation.claimIds.length)return false;
    const values=[raw.current,raw.bear,raw.base,raw.bull,valuation.remainingUpside,valuation.downside,valuation.rewardRisk];
    if(!values.every((value)=>typeof value==='number' && Number.isFinite(value) && value>0))return false;
    const [current,bear,base,bull,upside,downside,rewardRisk]=values as number[];
    if(!(bear<current && current<base && base<=bull) || !['forward_pe','forward_pb','normalized_pe','ev_ebitda','dcf'].includes(raw.method))return false;
    const equal=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-10,Math.abs(b)*1e-8);
    if(!equal(upside,base/current-1) || !equal(downside,1-bear/current) || !equal(rewardRisk,upside/downside))return false;
    const civil=(value:string)=>/^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
    if(!civil(raw.quoteAt) || !civil(raw.valuationAt) || raw.quoteAt!==member.content?.quoteDate || raw.valuationAt!==member.content?.valuationDate || raw.valuationAt<raw.quoteAt || raw.valuationAt>taipeiDate(proof.checkedAt!))return false;
    const claims=(Array.isArray(member.content?.claims)?member.content.claims:[]) as Claim[],units=new Set(['TWD','TWD_per_share','TWD/share']);
    if(!claims.every((claim)=>claim && typeof claim==='object' && typeof claim.id==='string' && (claim.numeric===undefined || claim.numeric && typeof claim.numeric==='object')))return false;
    const scenarios=['valuation_bear','valuation_base','valuation_bull'].map((key)=>claims.filter((claim)=>claim.numeric?.key===key));
    const price=claims.filter((claim)=>claim.numeric?.key==='current_price' && claim.numeric.value===current && claim.numeric.period===raw.quoteAt && units.has(claim.numeric.unit));
    const method=claims.filter((claim)=>claim.id===`valuation:${raw.method}`);
    if(scenarios.some((matches,index)=>matches.length!==1 || matches[0].numeric!.value!==[bear,base,bull][index] || !units.has(matches[0].numeric!.unit) || !matches[0].numeric!.period) || price.length!==1 || method.length!==1
      || new Set(scenarios.map((matches)=>matches[0].numeric!.unit)).size!==1 || new Set(scenarios.map((matches)=>matches[0].numeric!.period)).size!==1)return false;
    const expected=new Set([...scenarios.map((matches)=>matches[0].id),price[0].id,method[0].id]);
    return expected.size===valuation.claimIds.length && valuation.claimIds.every((id)=>expected.has(id));
  };
  const members = home.members.filter((m) => /^\d{4}$/u.test(m.symbol) && ['researching', 'waiting', 'eligible'].includes(m.state))
    .map((m) => ({ ...m, entryEligible: m.state === 'eligible' && m.sourceRights?.current===true && validContent(m) && qualified(m) && m.inputHash === m.publishedInputHash && !judgment.entryBlocked,
      retained: Boolean(m.revisionId && m.inputHash !== m.publishedInputHash) }));
  return { ...home, market: judgment, members };
}
