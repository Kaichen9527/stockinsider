import { NextResponse } from 'next/server';
import { loadPublishedDecisionRevision } from '@/lib/radar-projection-read';
import { buildPublishedDecisionDetailResult, selectUniquePublishedDecisionCard } from '@/lib/opportunity-v3/decision-publication';

export const dynamic='force-dynamic';

function unavailable(symbol:string,reason:string,status=409){
  return NextResponse.json({status:'unavailable',symbol,reason,
    message:'此唯讀 API 只發布同一個 immutable DecisionEnvelope revision；不回退 legacy 建議，也不觸發補抓。'},
  {status,headers:{'Cache-Control':'no-store'}});
}

export async function GET(request:Request,context:{params:Promise<{symbol:string}>}){
  const {symbol:raw}=await context.params;const symbol=raw.toUpperCase();
  const revisionValues=new URL(request.url).searchParams.getAll('decisionRevisionId');
  const revisionId=revisionValues.length===1?revisionValues[0]:null;
  if(!/^\d{4}$/u.test(symbol))return unavailable(symbol,'symbol_invalid',404);
  if(revisionValues.length!==1||!revisionId||!/^decision-v3[.](?:13|14):[0-9a-f]{64}$/u.test(revisionId))
    return unavailable(symbol,revisionValues.length>1?'decision_revision_ambiguous':'decision_revision_required');
  const projection=await loadPublishedDecisionRevision(symbol,revisionId).catch(()=>null);
  const resolved=selectUniquePublishedDecisionCard(projection as Record<string,unknown>|null,symbol,revisionId);
  if(!resolved)return unavailable(symbol,'decision_revision_unavailable',404);
  const snapshot=resolved.card.researchSnapshot;
  if(resolved.card.projectionReadOnly===true&&snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)){
    return NextResponse.json({schema:resolved.card.researchDossier===undefined?'stock-detail-v3.17.0':'stock-detail-v3.18.0',status:'research_only',symbol,
      decisionRevisionId:resolved.envelope.decisionRevisionId,decisionEnvelope:resolved.envelope,
      researchSnapshot:snapshot,sourceProvenance:resolved.card.sourceProvenance,
      citations:resolved.card.citations,researchDossier:resolved.card.researchDossier??null,
      actionAuthority:'disabled'}, {status:200,headers:{'Cache-Control':'no-store'}});
  }
  const result=buildPublishedDecisionDetailResult(resolved);
  return NextResponse.json(result.body,{status:result.statusCode,
    headers:{'Cache-Control':result.cacheControl}});
}
