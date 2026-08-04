import Link from 'next/link';
import type { OpportunityEngineV3, VerifiedChangeKindV3 } from '@/lib/opportunity-v3/contracts';

const kindLabel: Record<VerifiedChangeKindV3, string> = {
  official_event: '官方事件',
  fundamental_update: '基本面更新',
  valuation_update: '估值更新',
  source_corroboration: '來源佐證',
  contradiction: '待覆核矛盾',
};

export function ShadowOpportunityV3({ engine }: { engine: OpportunityEngineV3 }) {
  if (engine.availability === 'unavailable') {
    return (
      <section className="rounded-[2rem] border border-dashed border-amber-500/35 bg-amber-500/5 p-6">
        <p className="text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">V3 影子研究</p>
        <h2 className="mt-2 text-xl font-semibold">Source-led engine 正在累積不可變證據</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-emerald-100/65">
          目前沒有可安全顯示的 verified-change 摘要。此區不改動既有推薦排序，也不構成投資建議。
        </p>
        <Link href="/opportunity-v3" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          前往 workspace
        </Link>
      </section>
    );
  }
  const summary = engine.homepageSummary;
  return (
    <section className="rounded-[2rem] border border-amber-500/35 bg-amber-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">V3 影子研究 — 非正式推薦／非投資建議</p>
          <h2 className="mt-2 text-2xl font-semibold">最近確認的變化</h2>
        </div>
        <span className="rounded-full border border-amber-500/30 px-3 py-1 text-xs">
          資料截止 <time dateTime={engine.asOf}>{engine.asOf}</time>
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.topItems.map((item) => (
          <Link key={item.symbol} href={item.detailPath} className="min-h-11 rounded-2xl border border-line bg-surface p-4 hover:border-amber-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            <p className="font-semibold">{item.chineseName ?? item.symbol} <span className="text-xs text-slate-500">{item.symbol}</span></p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{kindLabel[item.changeKind]}</p>
            <p className="mt-3 text-sm">{item.headline}</p>
            <p className="mt-2 text-xs text-slate-500">
              確認時間 <time dateTime={item.verifiedAt}>{item.verifiedAt}</time>
            </p>
          </Link>
        ))}
      </div>
      {!summary.topItems.length ? <p className="mt-5 text-sm text-slate-600">此 cutoff 沒有新的 verified change。</p> : null}
      <Link href={summary.workspacePath} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
        查看完整 workspace
      </Link>
    </section>
  );
}
