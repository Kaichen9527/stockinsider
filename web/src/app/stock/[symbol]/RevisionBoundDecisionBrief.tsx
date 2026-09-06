import Link from 'next/link';
import type { DecisionEnvelopeV313 } from '@/lib/types';
import { validatePublishedDecisionCard } from '@/lib/opportunity-v3/decision-publication';
import { displayResearchDiagnostic } from '@/lib/opportunity-v3/research-display';

const actionLabel: Record<DecisionEnvelopeV313['userAction'], string> = {
  buy: '可買進', accumulate: '可分批', research_starter: '研究型小量分批',
  wait_value:'等待價格',wait_market:'等待大盤',wait_breakout: '等待突破', wait_reclaim: '等待收復支撐', avoid_chase: '不追價',
  avoid: '暫時避開', unavailable: '資料待補',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function numberText(value: unknown, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function validateRevisionDecisionBrief(card: Record<string, unknown> | null) {
  return validatePublishedDecisionCard(card);
}

export default function RevisionBoundDecisionBrief({ symbol, envelope, card }: {
  symbol: string; envelope: DecisionEnvelopeV313; card: Record<string, unknown> | null;
}) {
  const validated=validateRevisionDecisionBrief(card);
  if(!validated||validated.envelope.decisionRevisionId!==envelope.decisionRevisionId){
    return <RevisionBoundDecisionUnavailable symbol={symbol} revisionId={envelope?.decisionRevisionId??'invalid'}
      reason="revision_envelope_brief_or_provenance_invalid"/>;
  }
  if(validated.detailAvailability==='stale_readonly'){
    return <RevisionBoundDecisionUnavailable symbol={symbol} revisionId={envelope.decisionRevisionId}
      reason={`projection_stale_readonly:last_known_${String(validated.lastKnownAction)}`}/>;
  }
  if(validated.detailAvailability==='unavailable'){
    return <RevisionBoundDecisionUnavailable symbol={symbol} revisionId={envelope.decisionRevisionId}
      reason={`decision_brief_unavailable:${validated.briefBlocker}`}/>;
  }
  const thesis=validated?.thesis??[];
  const risks=validated?.risks??[];
  const citations=validated?.citations??[];
  const provenance=validated?.provenance??null;
  const range=validated.envelope.valuationSummary.formalRange??validated.envelope.valuationSummary.relativeBand;
  const rangeText=range?('bear' in range?`${range.bear} / ${range.base} / ${range.bull}`
    :`${range.low} / ${range.base} / ${range.high}`):null;
  const blockerText=envelope.blockers.length>0?envelope.blockers.map(displayResearchDiagnostic).join('、')
    :displayResearchDiagnostic('valuation_unavailable');
  // The landing card is intentionally compact.  A V3.18 dossier is validated
  // with the same immutable revision as the envelope, so this detail page can
  // show the evidence behind a formal action without issuing a new analysis.
  const dossier=record(validated.card.researchDossier);
  const dossierValuation=record(dossier?.valuation);
  const dossierTechnical=record(dossier?.technical);
  const dossierFundamental=record(dossier?.fundamental);
  const dossierRange=record(dossierValuation?.formalRange);
  const dossierRelative=record(dossierValuation?.relative);
  const dossierThesis=Array.isArray(dossierFundamental?.thesis)
    ?dossierFundamental.thesis.filter((value):value is string=>typeof value==='string').slice(0,3):[];
  const dossierRisks=Array.isArray(dossierFundamental?.risks)
    ?dossierFundamental.risks.filter((value):value is string=>typeof value==='string').slice(0,3):[];
  return <main className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50 md:px-10"><section data-testid="decision-brief" aria-labelledby="revision-brief-title" className="mx-auto max-w-[1040px] rounded-[2rem] bg-slate-950 p-6 text-white dark:bg-emerald-950 md:p-8">
    <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 text-sm">回到雷達首頁</Link>
    <p className="mt-8 text-xs tracking-[0.2em] text-amber-300">REVISION-BOUND DECISION BRIEF</p><h1 id="revision-brief-title" className="mt-2 text-3xl font-semibold">{symbol} · <span data-testid="detail-action">{envelope.userAction}</span> · {actionLabel[envelope.userAction]}</h1><p className="mt-3 text-white/72">{envelope.whyNow}</p>
    <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-white/15 sm:grid-cols-4"><div className="bg-slate-950/90 p-4"><dt className="text-xs text-white/50">權限</dt><dd data-testid="detail-authority" className="mt-1">{envelope.recommendationAuthority}</dd></div><div className="bg-slate-950/90 p-4"><dt className="text-xs text-white/50">估值</dt><dd data-testid="detail-valuation" className="mt-1">{rangeText??`尚缺：${blockerText}`}</dd></div><div className="bg-slate-950/90 p-4"><dt className="text-xs text-white/50">Entry</dt><dd data-testid="detail-entry" className="mt-1">{envelope.entryPlan?.entryZone?.join('–')??'尚無'}</dd></div><div className="bg-slate-950/90 p-4"><dt className="text-xs text-white/50">Stop</dt><dd data-testid="detail-invalidation" className="mt-1">{envelope.entryPlan?.invalidation??'尚無'}</dd></div></dl>
    <div className="mt-6 grid gap-6 lg:grid-cols-3"><div><h2 className="text-xs tracking-[0.16em] text-white/50">三項 THESIS</h2><ol data-testid="detail-thesis" className="mt-2 space-y-2 text-sm leading-6">{thesis.map((item,index)=><li key={`revision-thesis-${index}`}>{index+1}. {item}</li>)}</ol></div><div><h2 className="text-xs tracking-[0.16em] text-white/50">三項風險</h2><ol data-testid="detail-risks" className="mt-2 space-y-2 text-sm leading-6">{risks.map((item,index)=><li key={`revision-risk-${index}`}>{index+1}. {item}</li>)}</ol></div><div><h2 className="text-xs tracking-[0.16em] text-white/50">來源日期</h2><p data-testid="detail-source-dates" className="mt-2 text-sm leading-6">發布：{formatDateTime(String(provenance?.publishedAt??''))}<br/>收集：{formatDateTime(String(provenance?.collectedAt??''))}<br/>評估：{formatDateTime(String(provenance?.evaluatedAt??''))}</p><ul data-testid="detail-citations" className="mt-3 space-y-2 text-sm">{citations.map((citation)=><li key={String(citation.ref)}><a className="underline decoration-white/35 underline-offset-4 hover:decoration-white" href={String(citation.sourceUrl)} target="_blank" rel="noreferrer">{String(citation.sourceName??citation.sourceKey??citation.ref)}</a></li>)}</ul></div></div>
    {dossier?<section data-testid="research-dossier" className="mt-7 border-t border-white/15 pt-6"><h2 className="text-sm font-semibold tracking-[0.14em] text-amber-200">研究資料與判斷依據</h2><div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4"><h3 className="text-xs tracking-[0.12em] text-white/55">估值</h3><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-white/50">方法／狀態</dt><dd>{String(dossierValuation?.method??'待選擇')} / {String(dossierValuation?.status??'待補')}</dd></div><div><dt className="text-white/50">Bear／Base／Bull</dt><dd>{numberText(dossierRange?.bear)} / {numberText(dossierRange?.base)} / {numberText(dossierRange?.bull)}</dd></div><div><dt className="text-white/50">PE／歷史／同業</dt><dd>{numberText(dossierRelative?.current)} / {numberText(dossierRelative?.ownHistoryMedian)} / {numberText(dossierRelative?.sector)}</dd></div></dl></div><div className="rounded-2xl bg-white/10 p-4"><h3 className="text-xs tracking-[0.12em] text-white/55">技術狀態</h3><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-white/50">狀態</dt><dd>{String(dossierTechnical?.state??'待補')}</dd></div><div><dt className="text-white/50">觸發／失效</dt><dd>{numberText(dossierTechnical?.trigger)} / {numberText(dossierTechnical?.invalidation)}</dd></div><div><dt className="text-white/50">BIAS 20／60／120</dt><dd>{numberText(dossierTechnical?.bias20Pct,1)}% / {numberText(dossierTechnical?.bias60Pct,1)}% / {numberText(dossierTechnical?.bias120Pct,1)}%</dd></div><div><dt className="text-white/50">RSI／ATR</dt><dd>{numberText(dossierTechnical?.rsi14,1)} / {numberText(dossierTechnical?.atr)}</dd></div></dl></div><div className="rounded-2xl bg-white/10 p-4"><h3 className="text-xs tracking-[0.12em] text-white/55">基本面</h3><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-white/50">營收年增／品質</dt><dd>{numberText(dossierFundamental?.revenueYoy,1)}% / {numberText(dossierFundamental?.qualityScore,1)}</dd></div></dl>{dossierThesis.length>0?<ol className="mt-3 space-y-1 text-sm">{dossierThesis.map((item,index)=><li key={`dossier-thesis-${index}`}>{index+1}. {item}</li>)}</ol>:null}{dossierRisks.length>0?<ol className="mt-3 space-y-1 text-sm text-amber-100">{dossierRisks.map((item,index)=><li key={`dossier-risk-${index}`}>風險 {index+1}. {item}</li>)}</ol>:null}</div></div></section>:null}
    <p data-testid="detail-revision" className="mt-6 border-t border-white/15 pt-4 text-xs text-white/55">研究版本已鎖定，可在後端稽核。</p>
  </section></main>;
}

export function RevisionBoundDecisionUnavailable({symbol,revisionId: _revisionId,reason}:{symbol:string;revisionId:string;reason:string}){
  void _revisionId;
  return <main data-testid="detail-unavailable" className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50 md:px-10"><section className="mx-auto max-w-[760px] rounded-[2rem] border border-amber-300/40 bg-amber-50 p-6 dark:bg-amber-950/30"><Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-current px-4 text-sm">回到雷達首頁</Link><h1 className="mt-8 text-2xl font-semibold">{symbol} 決策版本暫時無法顯示</h1><p className="mt-3">精確 revision 未取得完整且一致的決策摘要；本頁不回退到 legacy 資料，也不產生買進建議。</p><p className="mt-4 text-sm">{displayResearchDiagnostic(reason)}</p></section></main>;
}
