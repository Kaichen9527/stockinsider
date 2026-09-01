import Link from 'next/link';
import type { CandidateDetailPayload } from '@/lib/candidate-detail';

export default function CandidateDetailView({ detail }: { detail: CandidateDetailPayload }) {
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 text-slate-900 dark:text-slate-100">
    <Link href="/" className="text-sm text-emerald-700 dark:text-emerald-300">← 回到三層選股</Link>
    <header className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span>{detail.lifecycleStage}</span><span>研究 revision {detail.revisionId.slice(0, 8)}</span><span>{detail.sessionDate}</span>
      </div>
      <h1 className="mt-3 text-3xl font-bold">{detail.chineseName} {detail.symbol}</h1>
      <p className="mt-4 leading-7 text-slate-700 dark:text-slate-300">{detail.summary}</p>
      {detail.narrativeKind === 'codex_enriched' ? <p className="mt-3 text-xs text-emerald-700">已通過 fact ID 驗證的敘事補充</p> : <p className="mt-3 text-xs text-slate-500">確定性事實版；不依賴 AI 才能發布</p>}
    </header>
    <section className="mt-6 grid gap-4">
      {detail.sections.map((section) => <article key={section.key} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700 dark:text-slate-300">{section.body}</p>
        {section.factIds.length > 0 ? <p className="mt-3 text-xs text-slate-500">Fact IDs：{section.factIds.slice(0, 8).join('、')}</p> : null}
      </article>)}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="text-lg font-semibold">五年價格與 PE／PB 歷史</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        估值基礎：{detail.valuation.basis || '資料待補'} · 覆蓋 {detail.valuation.monthsCovered ?? 0}/60 月
        {detail.valuation.historicalPercentile != null ? ` · 目前倍數 percentile ${Math.round(detail.valuation.historicalPercentile * 100) / 100}` : ''}
      </p>
      {detail.valuation.historicalMultiples?.length ? <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 dark:bg-slate-900"><tr><th className="p-2">月份</th><th className="p-2">PE</th><th className="p-2">PB</th><th className="p-2">月末價</th></tr></thead><tbody>
          {[...detail.valuation.historicalMultiples].reverse().map((item) => {
            const price = detail.valuation.historicalPrices?.find((row) => row.month === item.date.slice(0, 7));
            return <tr key={item.date} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{item.date.slice(0, 7)}</td><td className="p-2">{item.peRatio ?? '—'}</td><td className="p-2">{item.pbRatio ?? '—'}</td><td className="p-2">{price?.close ?? '—'}</td></tr>;
          })}
        </tbody></table>
      </div> : <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">官方五年倍數仍在回填；未達 48/60 前不建立正式倍數目標。</p>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="text-lg font-semibold">官方事實資料</h2>
      {detail.facts.length ? <div className="mt-4 max-h-80 overflow-auto"><ul className="space-y-2 text-sm">{detail.facts.slice(0, 100).map((fact) => <li key={fact.factId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><span className="font-medium">{fact.factKey}</span> · {fact.periodEnd} · {fact.value ?? '—'} {fact.unit || ''}{fact.sourceUrl ? <> · <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">官方來源</a></> : null}</li>)}</ul></div> : <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">官方 fact bundle 尚待補齊；頁面保留研究進度，不會顯示虛構數字。</p>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="text-lg font-semibold">來源連結</h2>
      {detail.sourceLinks.length ? <ul className="mt-3 space-y-2">{detail.sourceLinks.map((source) => <li key={source.url}><a className="break-all text-emerald-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul> : <p className="mt-3 text-slate-500">目前只有官方研究進度，尚無可公開的原文連結。</p>}
    </section>
  </main>;
}
