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
  twse_insider: '董監持股揭露',
};

const marketRegimeLabel: Record<string, string> = {
  'risk-on-ai': 'AI 風險偏好',
  'selective-risk-on': '選股型風險偏好',
};

const reportKindLabel: Record<string, string> = {
  daily_radar: '每日雷達',
  hot_theme: '主題快報',
  weekly_conviction: '每週高信念',
  deep_dive: '深度分析',
};

const contentStatusLabel: Record<string, string> = {
  complete: 'Live 來源完整',
  partial_live: '部分 Live 來源',
  derived_from_registry: 'Registry 候選內容',
  missing_live_sources: 'Live 來源待補',
};

const displayBucketLabel: Record<string, string> = {
  formal: '正式推薦',
  scenario: '情境追蹤',
  early: '早期可關注',
  hot_tracking: '熱股追蹤',
  historical_observation: '歷史觀察',
  revaluation_queue: '重估佇列',
  valuation_reflected_archive: '估值已反映',
  archived_over_target: '過價歸檔',
  theme_candidate: '主題候選',
  candidate: '候選',
};

const targetCoverageLabel: Record<string, string> = {
  base_upside: 'Base 尚有空間',
  scenario_only: 'Base 已反映，追情境',
  over_base_and_scenario: '估值已反映',
  missing_target: '目標價待補',
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
        <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
          <Link href="/" className="inline-flex rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            回到雷達首頁
          </Link>
          <p className="mt-6 text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{detail.theme.windowType}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{detail.theme.themeName}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-100/72">
            熱度 {detail.theme.heatScore.toFixed(2)}，關聯股票 {detail.theme.relatedSymbols.join(', ')}，市場狀態 {(detail.theme.marketRegime && marketRegimeLabel[detail.theme.marketRegime]) || detail.theme.marketRegime || '未標記'}，目前驗證層級為 {detail.theme.verificationStatus}。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-teal-600/12 px-3 py-1 text-xs font-medium text-teal-700 dark:text-teal-300">
              {contentStatusLabel[detail.contentStatus || 'missing_live_sources'] || detail.contentStatus || '內容狀態待補'}
            </span>
            <span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              非買進建議：主題頁只做候選與驗證追蹤
            </span>
          </div>
        </header>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">主題劇本</p>
          <h2 className="mt-2 text-2xl font-semibold">這個主題為什麼值得追蹤</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[1.5rem] border border-line bg-surface-strong p-4">
              <p className="text-sm font-semibold text-slate-600 dark:text-emerald-100/70">核心 thesis</p>
              <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-emerald-100/72">
                {detail.themeBrief?.thesis || '此主題已進研究雷達，仍待更多 live 來源驗證。'}
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-emerald-100/70">為什麼現在看</p>
              <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-emerald-100/72">
                {detail.themeBrief?.whyNow || '系統會追蹤最新社群、官方/月營收、券商與價量是否形成閉環。'}
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-line bg-surface-strong p-4">
              <p className="text-sm font-semibold text-slate-600 dark:text-emerald-100/70">追蹤條件</p>
              <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-emerald-100/72">
                {detail.themeBrief?.trackingFocus || '追蹤關聯股票是否通過 Base bridge、情境 checklist 與進場 Gate。'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(detail.themeBrief?.validationRules || []).map((rule) => (
                  <span key={rule} className="rounded-full border border-line px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/65">
                    {rule}
                  </span>
                ))}
              </div>
              {detail.themeBrief?.overseasLeadLagSummary ? (
                <p className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
                  海外 lead-lag：{detail.themeBrief.overseasLeadLagSummary}
                </p>
              ) : null}
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">關聯股票追蹤</p>
          <h2 className="mt-2 text-2xl font-semibold">候選、熱股與待驗證標的</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/70">
            沒有正式推薦時，這裡仍會列出主題映射股票與未進正式推薦原因，避免研究主題看起來像沒有內容。
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {(detail.trackedSymbols || []).map((item) => (
              <Link key={item.symbol} href={`/stock/${item.symbol}`} className="block rounded-[1.5rem] border border-line bg-surface-strong p-4 transition hover:border-accent">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold">
                      {item.symbol}
                      <span className="ml-2 text-base font-normal text-slate-600 dark:text-emerald-100/70">{item.name}</span>
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{item.roleInTheme}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-500/12 px-3 py-1 text-xs text-sky-700 dark:text-sky-300">
                    {displayBucketLabel[String(item.displayBucket || '')] || item.displayBucket || '候選'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-black/5 px-3 py-1 text-slate-600 dark:bg-white/10 dark:text-emerald-100/65">
                    {targetCoverageLabel[String(item.targetCoverageStatus || '')] || item.targetCoverageStatus || '目標價待驗證'}
                  </span>
                  {item.entryActionLabel ? (
                    <span className="rounded-full bg-teal-600/12 px-3 py-1 text-teal-700 dark:text-teal-300">進場：{item.entryActionLabel}</span>
                  ) : null}
                </div>
                {item.latestEvidence ? (
                  <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">最新線索：{item.latestEvidence}</p>
                ) : null}
                {item.whyNotFormal ? (
                  <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-emerald-100/50">未正式：{item.whyNotFormal}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">來源揭露</p>
          <h2 className="mt-2 text-2xl font-semibold">主題來源與覆蓋狀態</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {detail.sourceCoverage.length > 0 ? detail.sourceCoverage.map((source, index) => (
              <article key={`${source.sourceName}-${index}`} className="rounded-[1.5rem] border border-line bg-surface-strong p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{source.sourceName}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">
                      {sourceTypeLabel[source.sourceType] || source.sourceType} · {source.verificationStatus} · 權重 {source.weight.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-emerald-100/45">
                    {source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '未標記時間'}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{source.summary || '尚無摘要。'}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/45">命中股票：{source.symbols.join(', ') || '未綁定'}</p>
                {source.sourceUrl ? (
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-accent underline-offset-2 hover:underline">
                    開啟來源
                  </a>
                ) : null}
              </article>
            )) : (
              <article className="rounded-[1.5rem] border border-dashed border-line bg-surface-strong p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                Live source coverage 尚未寫入。此頁先以主題 registry 與候選追蹤承接，下一輪補抓會優先搜尋社群、官方、券商與海外 lead-lag。
              </article>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-slate-700 dark:text-emerald-100/72">
            缺漏來源：{detail.missingSources.length > 0 ? detail.missingSources.join('、') : '目前主要來源已覆蓋'}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">主題相關推薦</p>
            <h2 className="mt-2 text-2xl font-semibold">條件式推薦股票</h2>
            <div className="mt-5 space-y-3">
              {detail.opportunities.map((rec) => (
                <Link key={rec.recommendationId} href={`/stock/${rec.symbol}`} className="block rounded-[1.5rem] border border-line bg-surface-strong p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold">
                        {rec.symbol}
                        <span className="ml-2 text-base font-normal text-slate-600 dark:text-emerald-100/70">{rec.chineseName || rec.name}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-emerald-100/72">{rec.thesisTitle || rec.rationale}</p>
                    </div>
                    <span className="rounded-full bg-teal-600/12 px-3 py-1 text-xs text-teal-700 dark:text-teal-300">{rec.verificationStatus || '未證實'}</span>
                  </div>
                </Link>
              ))}
              {detail.opportunities.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-line p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                  目前沒有通過正式 Gate 的推薦。請先看上方「關聯股票追蹤」與下方來源矩陣，這些標的仍會進候選、情境或重估佇列。
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">故事摘要</p>
            <h2 className="mt-2 text-2xl font-semibold">主題下的股票敘事</h2>
            <div className="mt-5 space-y-3">
              {detail.supportingStories.map((story) => (
                <article key={`${story.symbol}-${story.title}`} className="rounded-[1.5rem] border border-line bg-surface-strong p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-lg font-semibold">{story.symbol}</p>
                    <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">{story.storyType}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium">{story.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{story.catalystSummary || '待補催化內容'}</p>
                </article>
              ))}
              {detail.supportingStories.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-line p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                  Live story candidates 尚未命中；本頁會用 registry-derived 主題故事避免空白，並在下一輪 theme/story scan 補入 Supabase evidence。
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">來源矩陣</p>
            <h2 className="mt-2 text-2xl font-semibold">已命中與待補來源</h2>
            <div className="mt-5 space-y-3">
              {(detail.evidenceMatrix || []).map((item) => (
                <article key={`${item.sourceGroup}-${item.status}`} className="rounded-[1.25rem] border border-line bg-surface-strong p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{item.sourceGroup}</p>
                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-slate-600 dark:bg-white/10 dark:text-emerald-100/65">
                      {item.status === 'hit' ? '已命中' : item.status === 'pending' ? '補抓中' : '待補'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{item.summary}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/45">股票：{item.symbols.join(', ') || '尚未綁定'}</p>
                  {item.sourceUrl ? (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-accent underline-offset-2 hover:underline">
                      開啟來源
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">缺口與下次補抓</p>
            <h2 className="mt-2 text-2xl font-semibold">接下來要補什麼資料</h2>
            <div className="mt-5 space-y-3">
              {(detail.nextRefreshPlan || []).map((plan) => (
                <article key={plan.sourceGroup} className="rounded-[1.25rem] border border-line bg-surface-strong p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{plan.sourceGroup}</p>
                    <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
                      {plan.status === 'complete' ? '已覆蓋' : plan.status === 'scheduled' ? '已排程' : plan.status === 'waiting_source' ? '等來源' : '阻塞'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{plan.action}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/50">{plan.reason}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">研究 memo</p>
          <h2 className="mt-2 text-2xl font-semibold">相關研究輸出</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {detail.reports.map((memo) => (
              <Link key={memo.slug} href={memo.relatedSymbols[0] ? `/stock/${memo.relatedSymbols[0]}` : '/sources'} className="block rounded-[1.5rem] border border-line bg-surface-strong p-4 transition hover:border-accent">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{reportKindLabel[memo.reportKind] || memo.reportKind}</p>
                <p className="mt-2 text-lg font-semibold">{memo.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{memo.summary}</p>
              </Link>
            ))}
            {detail.reports.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-line p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                目前沒有研究 memo 直接掛到此主題；候選股票會先在關聯追蹤中顯示，等 deep-dive / report build 補齊後再回填。
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
