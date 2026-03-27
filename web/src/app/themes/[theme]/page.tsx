import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getThemeDetail } from '@/lib/domain';

export const dynamic = 'force-dynamic';

const sourceTypeLabel: Record<string, string> = {
  official: '官方資料',
  financial: '財務數據',
  public_research: '公開研究',
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  bulltalk: '股市爆料同學會',
  ptt: 'PTT Stock',
  kol: '台股 KOL',
  news: '新聞',
  industry: '產業資料',
};

const marketRegimeLabel: Record<string, string> = {
  'risk-on-ai': 'AI 風險偏好',
  'selective-risk-on': '選股型風險偏好',
};

export default async function ThemeDetailPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  const detail = await getThemeDetail(theme);

  if (!detail) {
    notFound();
  }

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur md:p-8">
          <Link href="/" className="inline-flex rounded-full border border-[var(--line)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            回到雷達首頁
          </Link>
          <p className="mt-6 text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{detail.theme.windowType}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{detail.theme.themeName}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-100/72">
            熱度 {detail.theme.heatScore.toFixed(2)}，關聯股票 {detail.theme.relatedSymbols.join(', ')}，市場狀態 {(detail.theme.marketRegime && marketRegimeLabel[detail.theme.marketRegime]) || detail.theme.marketRegime || '未標記'}，目前驗證層級為 {detail.theme.verificationStatus}。
          </p>
        </header>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">來源揭露</p>
          <h2 className="mt-2 text-2xl font-semibold">主題來源與覆蓋狀態</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {detail.sourceCoverage.map((source, index) => (
              <article key={`${source.sourceName}-${index}`} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{source.sourceName}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">
                      {sourceTypeLabel[source.sourceType] || source.sourceType} · {source.verificationStatus} · 權重 {source.weight.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-emerald-100/45">
                    {source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleString() : '未標記時間'}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{source.summary || '尚無摘要。'}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/45">命中股票：{source.symbols.join(', ') || '未綁定'}</p>
                {source.sourceUrl ? (
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                    開啟來源
                  </a>
                ) : null}
              </article>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-slate-700 dark:text-emerald-100/72">
            缺漏來源：{detail.missingSources.length > 0 ? detail.missingSources.join('、') : '目前主要來源已覆蓋'}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">主題相關推薦</p>
            <h2 className="mt-2 text-2xl font-semibold">條件式推薦股票</h2>
            <div className="mt-5 space-y-3">
              {detail.opportunities.map((rec) => (
                <Link key={rec.recommendationId} href={`/stock/${rec.symbol}`} className="block rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold">{rec.symbol}</p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-emerald-100/72">{rec.thesisTitle || rec.rationale}</p>
                    </div>
                    <span className="rounded-full bg-teal-600/12 px-3 py-1 text-xs text-teal-700 dark:text-teal-300">{rec.verificationStatus || '未證實'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">故事摘要</p>
            <h2 className="mt-2 text-2xl font-semibold">主題下的股票敘事</h2>
            <div className="mt-5 space-y-3">
              {detail.supportingStories.map((story) => (
                <article key={`${story.symbol}-${story.title}`} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-lg font-semibold">{story.symbol}</p>
                    <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">{story.storyType}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium">{story.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{story.catalystSummary || '待補催化內容'}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">研究 memo</p>
          <h2 className="mt-2 text-2xl font-semibold">相關研究輸出</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {detail.reports.map((memo) => (
              <article key={memo.slug} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{memo.reportKind}</p>
                <p className="mt-2 text-lg font-semibold">{memo.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{memo.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
