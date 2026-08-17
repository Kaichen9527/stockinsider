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
        {reasonList.map((reason) => <li key={reason} className="rounded-xl bg-white/70 px-3 py-2 font-mono text-xs dark:bg-slate-950/45">{reason}</li>)}
      </ul>
      {sourceUrl ? <a className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4" href={sourceUrl} target="_blank" rel="noreferrer">查看原始來源</a> : null}
    </section>
  </main>;
}
