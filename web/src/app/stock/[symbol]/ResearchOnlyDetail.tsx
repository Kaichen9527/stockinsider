import Link from 'next/link';

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown, maximum = 240): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, maximum) : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate=text(value,2048);
  if(!candidate)return null;
  try {
    const parsed=new URL(candidate);
    return parsed.protocol==='https:'&&parsed.username===''&&parsed.password===''&&parsed.hostname.length>0
      ?parsed.toString():null;
  } catch { return null; }
}

const blockerLabel: Record<string,string> = {
  action_authority_disabled:'目前為唯讀研究，買進動作已停用',
  authoritative_decision_pending:'正式決策仍待完成',
  authoritative_decision_envelope_missing:'正式決策資料尚未建立',
  projection_stale:'研究快照已過期，等待下一次評估',
  projection_missing:'研究投影尚未建立',
  projection_conflict:'研究資料校驗衝突，暫停顯示動作',
  checksum_conflict:'研究資料校驗衝突，暫停顯示動作',
  runtime_doctor_failed:'資料生產健康檢查尚未通過',
  consumer_producer_incompatible:'網站與資料生產版本尚未同步',
  manifest_incompatible:'資料生產版本識別尚未同步',
  migration_incompatible:'資料結構版本尚未同步',
  frozen_acquisition_authority_unavailable:'來源封存驗證尚未完成',
  legacy_schema_without_v314_decision_authority:'舊研究快照缺少現行決策權威',
  support_must_be_reclaimed:'股價需先收復支撐，才重新評估進場',
  breakout_not_confirmed:'等待量價突破確認',
  entry_price_above_required_value_gate:'現價高於所需安全邊際，等待合理價格',
  market_regime_gate:'市場條件尚未通過',
  price_extended_wait_for_reset:'短期乖離偏高，等待回到合理區間',
  data_required_for_formal_decision:'正式決策所需資料仍待補齊',
  research_axes_incomplete:'研究所需核心資料尚未齊全',
  valuation_authority_incomplete:'官方估值資料尚未齊全',
  research_authority_incomplete:'研究權威鏈尚未完成',
};

function displayBlocker(value: string): string {
  if (blockerLabel[value]) return blockerLabel[value];
  if (value.startsWith('missing:')) return `尚缺資料：${value.slice(8).replaceAll('_','、')}`;
  return '研究條件待補；請查看資料來源與下一步。';
}

function blockers(card: Record<string, unknown>): string[] {
  const values = [
    ...(Array.isArray(card.projectionBlockers) ? card.projectionBlockers : []),
    ...((card.decisionEnvelope && typeof card.decisionEnvelope === 'object' && !Array.isArray(card.decisionEnvelope)
      && Array.isArray((card.decisionEnvelope as Record<string, unknown>).blockers))
      ? (card.decisionEnvelope as Record<string, unknown>).blockers as unknown[] : []),
    ...(Array.isArray(card.missingAxes) ? card.missingAxes : []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value)=>value.slice(0,160));
  return [...new Set(values.length > 0 ? values : ['authoritative_decision_pending'])].slice(0,12);
}

export default function ResearchOnlyDetail({ symbol, card, projectionBlockers = [] }: {
  symbol: string;
  card: Record<string, unknown>;
  projectionBlockers?: string[];
}) {
  const name = text(card.chineseName) ?? text(card.name);
  const price = finiteNumber(card.currentPrice);
  const sourceSummary = text(card.sourceSummary,800) ?? text(card.summary,800) ?? '此股票仍在研究佇列中。';
  const source = card.sourceProvenance && typeof card.sourceProvenance === 'object' && !Array.isArray(card.sourceProvenance)
    ? card.sourceProvenance as Record<string, unknown> : null;
  const reasonList = [...new Set([...blockers(card), ...projectionBlockers])];
  const ranking = card.researchRanking && typeof card.researchRanking === 'object' && !Array.isArray(card.researchRanking)
    ? card.researchRanking as Record<string, unknown> : null;
  const score = finiteNumber(ranking?.rankingScore ?? card.underreactionScore);
  const coverage = finiteNumber(ranking?.coverage ?? card.scoreCoverage);
  const revisionId = text(card.decisionRevisionId);
  const sourceUrl = httpsUrl(source?.sourceUrl);
  // A V3.18 dossier lives only in the exact immutable detail revision. It is
  // intentionally preferred over the landing snapshot, while the V3.17
  // snapshot remains a safe compatibility fallback.
  const dossier=card.researchDossier&&typeof card.researchDossier==='object'&&!Array.isArray(card.researchDossier)
    ?card.researchDossier as Record<string,unknown>:null;
  const snapshot=card.researchSnapshot&&typeof card.researchSnapshot==='object'&&!Array.isArray(card.researchSnapshot)
    ?card.researchSnapshot as Record<string,unknown>:null;
  const valuation=(dossier?.valuation??snapshot?.valuation)&&typeof (dossier?.valuation??snapshot?.valuation)==='object'&&!Array.isArray(dossier?.valuation??snapshot?.valuation)
    ?(dossier?.valuation??snapshot?.valuation) as Record<string,unknown>:null;
  const technical=(dossier?.technical??snapshot?.technical)&&typeof (dossier?.technical??snapshot?.technical)==='object'&&!Array.isArray(dossier?.technical??snapshot?.technical)
    ?(dossier?.technical??snapshot?.technical) as Record<string,unknown>:null;
  const fundamental=(dossier?.fundamental??snapshot?.fundamental)&&typeof (dossier?.fundamental??snapshot?.fundamental)==='object'&&!Array.isArray(dossier?.fundamental??snapshot?.fundamental)
    ?(dossier?.fundamental??snapshot?.fundamental) as Record<string,unknown>:null;
  const nextStep=snapshot?.researchNextStep&&typeof snapshot.researchNextStep==='object'&&!Array.isArray(snapshot.researchNextStep)
    ?snapshot.researchNextStep as Record<string,unknown>:null;
  const thesis=Array.isArray(fundamental?.thesis)?fundamental.thesis.filter((value):value is string=>typeof value==='string').slice(0,3):[];
  const risks=Array.isArray(fundamental?.risks)?fundamental.risks.filter((value):value is string=>typeof value==='string').slice(0,3):[];
  const waterfall=Array.isArray(snapshot?.gateWaterfall)
    ?snapshot.gateWaterfall.filter((value):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value))).slice(0,5):[];
  const formalRange=valuation?.formalRange&&typeof valuation.formalRange==='object'&&!Array.isArray(valuation.formalRange)
    ?valuation.formalRange as Record<string,unknown>:null;
  const relative=valuation?.relative&&typeof valuation.relative==='object'&&!Array.isArray(valuation.relative)
    ?valuation.relative as Record<string,unknown>:null;

  return <main data-testid="research-only-detail" className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50 md:px-10">
    <section className="mx-auto max-w-[900px] rounded-[2rem] border border-sky-300/40 bg-sky-50 p-6 dark:bg-sky-950/30 md:p-8">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-current px-4 text-sm">回到雷達首頁</Link>
      <p className="mt-8 text-xs tracking-[0.2em] text-sky-700 dark:text-sky-300">RESEARCH-ONLY · ACTION DISABLED</p>
      <h1 className="mt-2 text-3xl font-semibold">{name ? `${name} ` : ''}{symbol}</h1>
      <p className="mt-3 text-base leading-7">{sourceSummary}</p>
      {revisionId ? <p data-testid="research-only-decision-revision" className="mt-2 break-all font-mono text-xs text-sky-800 dark:text-sky-200">決策版本：{revisionId}</p> : null}
      <div role="status" className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
        這是可追溯的研究快照，不是買進建議。正式決策資料尚未完整或目前版本不同步，因此所有買進型動作已停用。
      </div>
      <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-sky-900/10 sm:grid-cols-3">
        <div className="bg-white/75 p-4 dark:bg-slate-950/50"><dt className="text-xs text-slate-500">最後已知價格</dt><dd className="mt-1 text-lg font-semibold">{price == null ? '待補' : `NT$${price.toFixed(2)}`}</dd></div>
        <div className="bg-white/75 p-4 dark:bg-slate-950/50"><dt className="text-xs text-slate-500">研究排序</dt><dd className="mt-1 text-lg font-semibold">{score == null ? '待補' : score.toFixed(1)}</dd></div>
        <div className="bg-white/75 p-4 dark:bg-slate-950/50"><dt className="text-xs text-slate-500">資料覆蓋</dt><dd className="mt-1 text-lg font-semibold">{coverage == null ? '待補' : `${Math.round(coverage <= 1 ? coverage * 100 : coverage)}%`}</dd></div>
      </dl>
      <h2 className="mt-7 text-sm font-semibold tracking-[0.12em]">尚待解除</h2>
      <ul data-testid="research-only-blockers" className="mt-3 space-y-2 text-sm leading-6">
        {reasonList.map((reason) => <li key={reason} className="rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-slate-950/45">{displayBlocker(reason)}</li>)}
      </ul>
      <section data-testid="research-snapshot-detail" className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-sky-300/35 bg-white/65 p-5 dark:bg-slate-950/35">
          <h2 className="text-sm font-semibold tracking-[0.12em]">估值與基本面</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-slate-500">估值方法／狀態</dt><dd className="mt-1 font-semibold">{text(valuation?.method) ?? '待選擇'} / {text(valuation?.status) ?? '待官方資料'}</dd></div>
            <div><dt className="text-slate-500">Bear／Base／Bull</dt><dd className="mt-1 font-semibold">{finiteNumber(formalRange?.bear)?.toFixed(2) ?? '—'} / {finiteNumber(formalRange?.base)?.toFixed(2) ?? '—'} / {finiteNumber(formalRange?.bull)?.toFixed(2) ?? '—'}</dd></div>
            <div><dt className="text-slate-500">PE／歷史／同業</dt><dd className="mt-1 font-semibold">{finiteNumber(relative?.current ?? valuation?.currentPe)?.toFixed(2) ?? '待官方資料'} / {finiteNumber(relative?.ownHistoryMedian ?? valuation?.historyPeMedian)?.toFixed(2) ?? '—'} / {finiteNumber(relative?.sector ?? valuation?.sectorPe)?.toFixed(2) ?? '—'}</dd></div>
            <div><dt className="text-slate-500">營收年增</dt><dd className="mt-1 font-semibold">{finiteNumber(fundamental?.revenueYoy) == null ? '待補' : `${finiteNumber(fundamental?.revenueYoy)?.toFixed(1)}%`}</dd></div>
            <div><dt className="text-slate-500">品質分數</dt><dd className="mt-1 font-semibold">{finiteNumber(fundamental?.qualityScore)?.toFixed(1) ?? '待補'}</dd></div>
          </dl>
          {thesis.length>0?<><h3 className="mt-5 text-xs font-semibold tracking-[0.12em] text-slate-500">研究論點</h3><ul className="mt-2 space-y-2 text-sm leading-6">{thesis.map((item,index)=><li key={`thesis-${index}`}>{index+1}. {item}</li>)}</ul></>:null}
          {risks.length>0?<><h3 className="mt-5 text-xs font-semibold tracking-[0.12em] text-slate-500">風險</h3><ul className="mt-2 space-y-2 text-sm leading-6">{risks.map((item,index)=><li key={`risk-${index}`}>{index+1}. {item}</li>)}</ul></>:null}
        </div>
        <div className="rounded-2xl border border-sky-300/35 bg-white/65 p-5 dark:bg-slate-950/35">
          <h2 className="text-sm font-semibold tracking-[0.12em]">技術狀態與下一步</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-slate-500">技術狀態</dt><dd className="mt-1 font-semibold">{text(technical?.state) ?? '待補'}</dd></div>
            <div><dt className="text-slate-500">下一步</dt><dd className="mt-1 font-semibold">{text((dossier?.ranking as Record<string,unknown>|null)?.readiness) ?? text(nextStep?.kind) ?? 'data_needed'}</dd></div>
            <div><dt className="text-slate-500">BIAS 20 / 60 / 120</dt><dd className="mt-1 font-semibold">{finiteNumber(technical?.bias20Pct)?.toFixed(1) ?? '—'} / {finiteNumber(technical?.bias60Pct)?.toFixed(1) ?? '—'} / {finiteNumber(technical?.bias120Pct)?.toFixed(1) ?? '—'}%</dd></div>
            <div><dt className="text-slate-500">RSI / MACD / ATR</dt><dd className="mt-1 font-semibold">{finiteNumber(technical?.rsi14)?.toFixed(1) ?? '—'} / {finiteNumber(technical?.macd)?.toFixed(2) ?? '—'} / {finiteNumber(technical?.atr)?.toFixed(2) ?? '—'}</dd></div>
            <div><dt className="text-slate-500">觸發價</dt><dd className="mt-1 font-semibold">{finiteNumber(technical?.trigger ?? (nextStep?.trigger as Record<string,unknown>|null)?.threshold)?.toFixed(2) ?? '待條件'}</dd></div>
            <div><dt className="text-slate-500">失效價</dt><dd className="mt-1 font-semibold">{finiteNumber(technical?.invalidation ?? nextStep?.invalidation)?.toFixed(2) ?? '待補'}</dd></div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-emerald-100/70">{nextStep?.reason ? displayBlocker(String(nextStep.reason)) : '正式決策仍待資料補齊。'} 本頁僅呈現同一研究 revision 的資料，不會從舊推薦或即時抓取補出結論。</p>
        </div>
      </section>
      {waterfall.length>0?<section data-testid="research-gate-waterfall" className="mt-5 rounded-2xl border border-sky-300/35 bg-white/65 p-5 dark:bg-slate-950/35">
        <h2 className="text-sm font-semibold tracking-[0.12em]">Gate waterfall</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {waterfall.map((gate,index)=>{const status=text(gate.status,24) ?? 'missing';const reason=text(gate.reason,120) ?? 'data_required';return <li key={`${text(gate.gate,24) ?? index}-${reason}`} className="rounded-xl border border-line px-3 py-2 text-sm"><span className={status==='pass'?'font-semibold text-emerald-700 dark:text-emerald-300':'font-semibold text-amber-800 dark:text-amber-300'}>{text(gate.gate,24) ?? 'gate'} · {status}</span><span className="mt-1 block text-xs text-slate-500 dark:text-emerald-100/60">{reason}</span></li>;})}
        </ol>
      </section>:null}
      {sourceUrl ? <a className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4" href={sourceUrl} target="_blank" rel="noreferrer">查看原始來源</a> : null}
    </section>
  </main>;
}
