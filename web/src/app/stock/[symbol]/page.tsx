import Link from 'next/link';
import { notFound } from 'next/navigation';
import StockChart from '@/components/StockChart';
import { getStockDeepDiveLookup } from '@/lib/domain';
import PendingDeepDive from './PendingDeepDive';

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
  podcast: 'Podcast',
  youtube: 'YouTube',
};

const connectorLabel: Record<string, string> = {
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
};

function connectorStatusLabel(status: string) {
  if (status === 'success' || status === 'valid') return '正常';
  if (status === 'running') return '同步中';
  if (status === 'timed_out') return '逾時待重試';
  if (status === 'failed' || status === 'invalid') return '失敗';
  return '待確認';
}

const ratingFromState: Record<string, { label: string; color: string }> = {
  actionable_setup: { label: '買進', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  validated_thesis: { label: '增持', color: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' },
  partially_verified: { label: '觀察', color: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  signal_candidate: { label: '追蹤', color: 'bg-slate-950/8 text-slate-700 dark:text-emerald-100/72' },
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

export default async function StockDetail({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const deepDiveLookup = await getStockDeepDiveLookup(symbol.toUpperCase());

  if (deepDiveLookup.status === 'not_found') {
    notFound();
  }
  const isPending = deepDiveLookup.status === 'pending';
  const pendingData = deepDiveLookup.status === 'pending' ? deepDiveLookup.data : null;
  const deepDive = deepDiveLookup.status === 'ready' ? deepDiveLookup.data : null;

  if (isPending && pendingData) {
    return (
      <main className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur md:p-8">
            <Link href="/" className="inline-flex rounded-full border border-[var(--line)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              回到雷達首頁
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">
              {pendingData.symbol} 深度分析準備中
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-emerald-50/85">
              系統已自動觸發：{pendingData.triggeredJobs.join('、')}。資料建模完成後，頁面會自動刷新，不需要手動重跑。
            </p>
            <div className="mt-4">
              <PendingDeepDive symbol={pendingData.symbol} retryAfterSec={pendingData.retryAfterSec} />
            </div>
          </header>
        </div>
      </main>
    );
  }

  if (!deepDive) notFound();

  const investanchorsSources = deepDive.sourceCoverage.filter((source) => source.sourceType === 'investanchors');
  const nonInvestanchorsSources = deepDive.sourceCoverage.filter((source) => source.sourceType !== 'investanchors');

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur md:p-8">
          <Link href="/" className="inline-flex rounded-full border border-[var(--line)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            回到雷達首頁
          </Link>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-[-0.04em]">
                  {deepDive.symbol}
                  {deepDive.recommendation?.chineseName ? (
                    <span className="ml-2 text-2xl font-normal text-slate-600 dark:text-emerald-100/65">{deepDive.recommendation.chineseName}</span>
                  ) : null}
                </h1>
                {(() => {
                  const rating = ratingFromState[deepDive.thesisState] || ratingFromState.signal_candidate;
                  return <span className={`rounded-full px-4 py-1 text-sm font-medium ${rating.color}`}>{rating.label}</span>;
                })()}
                <span className="rounded-full bg-teal-600/12 px-3 py-1 text-xs text-teal-700 dark:text-teal-300">{deepDive.verificationStatus}</span>
                {deepDive.storyType ? (
                  <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">{deepDive.storyType}</span>
                ) : null}
              </div>
              <p className="text-lg text-slate-700 dark:text-emerald-50/88">{deepDive.name}</p>

              {deepDive.recommendation?.firstRecommendedAt && (
                <div className="flex flex-wrap gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                  <span className="text-slate-500 dark:text-emerald-100/50">
                    📅 首次推薦：<span className="font-medium text-slate-800 dark:text-emerald-100/85">{new Date(deepDive.recommendation.firstRecommendedAt).toLocaleDateString('zh-TW')}</span>
                  </span>
                  <span className="text-slate-400 dark:text-emerald-100/30">|</span>
                  <span className="text-slate-500 dark:text-emerald-100/50">
                    狀態：<span className="font-medium text-slate-800 dark:text-emerald-100/85">{deepDive.thesisState === 'actionable_setup' ? '可進場' : deepDive.thesisState === 'validated_thesis' ? '高信念' : deepDive.thesisState === 'partially_verified' ? '驗證中' : '觀察中'}</span>
                  </span>
                </div>
              )}

              <h2 className="max-w-4xl text-2xl font-medium">{deepDive.thesisTitle || '深度分析內容尚在整理中。'}</h2>
              <p className="max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-50/88">
                {deepDive.thesisSummary || deepDive.catalystSummary || '目前尚無完整故事摘要。'}
              </p>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm leading-6 text-slate-700 dark:text-emerald-50/88">
                {deepDive.conditionalRecommendationNote}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[480px] shrink-0">
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">最新價格</p>
                <p className="mt-2 text-3xl font-semibold">{formatNumber(deepDive.price)}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-emerald-100/60">{new Date(deepDive.asOf).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-400/30 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">預估上行空間</p>
                {deepDive.expectedUpsidePct != null && deepDive.expectedUpsidePct > 0 ? (
                  <>
                    <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">+{deepDive.expectedUpsidePct.toFixed(1)}%</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">Base case 1-3 個月</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-semibold text-slate-500 dark:text-emerald-100/50">評估中</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">等待目標價更新</p>
                  </>
                )}
              </div>
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">預估催化劑日期</p>
                <p className="mt-2 text-xl font-semibold">
                  {deepDive.recommendation?.estimatedCatalystDate ?? '待確認'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">法說會 / 月營收 / 重大公告</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">價格與技術面</p>
                  <h3 className="mt-2 text-2xl font-semibold">K 線與技術指標</h3>
                </div>
                <div className="text-right text-sm text-slate-600 dark:text-emerald-100/60">
                  <p>新鮮度：{deepDive.freshness}</p>
                  <p>成交量：{deepDive.volume?.toLocaleString() || '-'}</p>
                </div>
              </div>

              <div className="mt-5">
                <StockChart data={deepDive.chart} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">MA5</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.indicators.maShort)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">MA20</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.indicators.maMid)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">MA60</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.indicators.maLong)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">RSI</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.indicators.rsi)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">MACD</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.indicators.macd, 4)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">技術面分數</p>
                  <p className="mt-2 text-lg font-semibold">{formatNumber(deepDive.timingScore)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">投顧報告級主論點</p>
              <h3 className="mt-2 text-2xl font-semibold">研究主論點與估值邏輯</h3>
              {deepDive.thesisModel ? (
                <div className="mt-5 space-y-4">
                    <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <p className="text-sm font-semibold">{deepDive.thesisModel.thesisTitle}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-emerald-50/88">{deepDive.thesisModel.thesisSummary}</p>
                  </article>
                  <div className="grid gap-4 md:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">故事來源</p>
                      <p className="mt-2 text-sm leading-6">{deepDive.thesisModel.storySourceSummary || '尚未整理完整故事來源。'}</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">驗證摘要</p>
                      <p className="mt-2 text-sm leading-6">{deepDive.thesisModel.verificationSummary || '等待更多官方與財務驗證。'}</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">財務推估</p>
                      <p className="mt-2 text-sm leading-6">{deepDive.thesisModel.financialProjectionSummary || '尚未形成完整財務推估。'}</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">估值方法</p>
                      <p className="mt-2 text-sm leading-6">{deepDive.thesisModel.valuationSummary || '尚未形成穩定估值區間。'}</p>
                      <p className="mt-3 text-xs text-slate-500 dark:text-emerald-100/45">
                        區間 {formatNumber(deepDive.thesisModel.targetPriceLow)} - {formatNumber(deepDive.thesisModel.targetPriceHigh)} / 信心 {formatNumber(deepDive.thesisModel.confidence)}
                      </p>
                      {deepDive.financialProjectionMetrics ? (
                        <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-emerald-100/55">
                          <p>Base: Rev {formatNumber(deepDive.financialProjectionMetrics.baseRevenueAnnual, 0)} / EPS {formatNumber(deepDive.financialProjectionMetrics.baseEps)} / PE {formatNumber(deepDive.financialProjectionMetrics.basePe)}</p>
                          <p>Upside: Rev {formatNumber(deepDive.financialProjectionMetrics.upsideRevenueAnnual, 0)} / EPS {formatNumber(deepDive.financialProjectionMetrics.upsideEps)} / PE {formatNumber(deepDive.financialProjectionMetrics.upsidePe)}</p>
                          <p>Bear: Rev {formatNumber(deepDive.financialProjectionMetrics.bearRevenueAnnual, 0)} / EPS {formatNumber(deepDive.financialProjectionMetrics.bearEps)} / PE {formatNumber(deepDive.financialProjectionMetrics.bearPe)}</p>
                        </div>
                      ) : null}
                    </article>
                  </div>
                  {deepDive.missingFields && deepDive.missingFields.length > 0 ? (
                    <div className="rounded-[1.2rem] border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                      缺漏欄位：{deepDive.missingFields.join('、')}（尚未完全補齊，報告已標示風險）
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600 dark:text-emerald-100/65">目前尚未生成完整 thesis model。</p>
              )}
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">故事驗證</p>
              <h3 className="mt-2 text-2xl font-semibold">證據矩陣</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {deepDive.verificationTimeline.map((item) => (
                  <article key={item.stage} className="rounded-2xl border border-[var(--line)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{item.stage}</p>
                      <span className="text-xs text-slate-500 dark:text-emerald-100/45">{item.completed ? '已完成' : '待補強'}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{item.summary}</p>
                  </article>
                ))}
              </div>

              {deepDive.evidenceMatrix.length > 0 ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {deepDive.evidenceMatrix.map((item, index) => (
                    <article key={`${item.sourceLabel}-${index}`} className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{item.sourceLabel}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">
                            {item.evidenceType} · {item.stance === 'supporting' ? '支持' : item.stance === 'contradicting' ? '反證' : '中性'}
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white">
                          {formatNumber(item.strength)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{item.summary}</p>
                      {item.sourceUrl ? (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                          開啟證據來源
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                {deepDive.evidenceItems.length > 0 ? (
                  deepDive.evidenceItems.map((item, index) => (
                    <article key={`${item.headline}-${index}`} className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{item.headline}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">
                            {item.evidenceClass} · {item.sourceName}
                          </p>
                        </div>
                        <div className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white">
                          強度 {item.evidenceStrength.toFixed(2)}
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{item.excerpt || '尚無摘要。'}</p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 dark:text-emerald-100/65">尚未收集到足夠證據項目。</p>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">社群與市場線索</p>
              <h3 className="mt-2 text-2xl font-semibold">早期來源與覆蓋狀態</h3>
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-slate-700 dark:text-emerald-100/72">
                缺漏來源：{deepDive.missingCoverage.length > 0 ? deepDive.missingCoverage.join('、') : '目前主要來源已覆蓋'}
              </div>
              <div className="mt-5 space-y-3">
                {deepDive.communitySignals.length > 0 ? (
                  deepDive.communitySignals.map((signal, index) => (
                    <article key={`${signal.sourceName}-${index}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{signal.sourceName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/45">
                            {sourceTypeLabel[signal.sourceType] || signal.sourceType} · {signal.verificationStatus} · 權重 {signal.weight.toFixed(2)}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-emerald-100/45">
                          {signal.sourceTimestamp ? new Date(signal.sourceTimestamp).toLocaleString() : '未標記時間'}
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-50/88">{signal.summary || '尚無摘要。'}</p>
                      {signal.sourceUrl ? (
                        <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                          開啟來源
                        </a>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 dark:text-emerald-100/65">目前尚未收集到社群來源。</p>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">估值情境</p>
              <h3 className="mt-2 text-2xl font-semibold">估值與失效條件</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {deepDive.valuationCompleteness ? (
                  <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4 md:col-span-3">
                    <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">估值完整度</p>
                    <p className="mt-2 text-sm leading-6">
                      需求情境：{deepDive.valuationCompleteness.requiredCases.join(' / ')}；已提供：{deepDive.valuationCompleteness.availableCases.join(' / ') || '無'}；
                      狀態：{deepDive.valuationCompleteness.isComplete ? '完整' : '未完整'}
                    </p>
                  </article>
                ) : null}
                {deepDive.valuationCases.map((valuation, index) => {
                  const caseLabels: Record<string, { name: string; color: string }> = {
                    base: { name: '基準情境', color: 'text-[var(--accent)]' },
                    upside: { name: '樂觀情境', color: 'text-emerald-600 dark:text-emerald-400' },
                    invalidation: { name: '失效情境', color: 'text-red-600 dark:text-red-400' },
                    bear: { name: '悲觀情境', color: 'text-red-600 dark:text-red-400' },
                  };
                  const label = caseLabels[valuation.caseType] || { name: valuation.caseType, color: '' };
                  const assumptions = valuation.assumptions as Record<string, string> | null;
                  const assumptionText = assumptions
                    ? Object.values(assumptions).filter(Boolean).join('；')
                    : '';
                  return (
                    <article key={`${valuation.caseType}-${valuation.targetPrice ?? 'na'}-${index}`} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{label.name}</p>
                      <p className={`mt-2 text-2xl font-semibold ${label.color}`}>{formatNumber(valuation.targetPrice)}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600 dark:text-emerald-100/60">
                        {valuation.expectedReturnPct == null ? '-' : `預估 ${valuation.expectedReturnPct > 0 ? '+' : ''}${valuation.expectedReturnPct.toFixed(1)}%`}
                      </p>
                      {assumptionText ? (
                        <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-emerald-100/60">{assumptionText}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="mt-5 space-y-3">
                {deepDive.riskCounterpoints.map((risk) => (
                  <article key={risk.label} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <p className="text-sm font-semibold">{risk.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{risk.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">券商 / 投顧觀點</p>
              <h3 className="mt-2 text-2xl font-semibold">報告摘要</h3>
              <div className="mt-5 space-y-3">
                {deepDive.brokerViews.length > 0 ? (
                  deepDive.brokerViews.map((view, index) => (
                    <article key={`${view.brokerName}-${index}`} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{view.brokerName}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-emerald-100/45">{view.reportDate || '未標日期'}</p>
                        </div>
                        <div className="text-right">
                          {view.rating ? (
                            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white">{view.rating}</span>
                          ) : null}
                          {view.targetPrice != null ? (
                            <p className="mt-1 text-sm font-semibold text-[var(--accent)]">TP {formatNumber(view.targetPrice)}</p>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-medium">{view.thesisTitle || '未命名報告主軸'}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-50/88">{view.summary || '尚無摘要。'}</p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 dark:text-emerald-100/65">目前尚未收錄券商或投顧報告。放入 PDF 至 materials/ 資料夾後系統將自動解析入庫。</p>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/65">來源同步狀態</p>
              <h3 className="mt-2 text-2xl font-semibold">Connector 健康度</h3>
              <div className="mt-5 space-y-3">
                {deepDive.connectorStatus.map((item) => (
                  <article key={item.connector} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{connectorLabel[item.connector] || item.connector}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
                          憑證 {item.credentialStatus} · 最近檢查 {item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString('zh-TW') : '未檢查'}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-50/88">
                        {connectorStatusLabel(item.lastRunStatus || item.credentialStatus)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-50/88">
                      最近成功時間：{item.lastSuccessAt ? new Date(item.lastSuccessAt).toLocaleString('zh-TW') : '尚無成功紀錄'}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">進出場規則</p>
              <h3 className="mt-2 text-2xl font-semibold">執行計畫</h3>
              {deepDive.strategy ? (
                <div className="mt-5 space-y-4 text-sm">
                  <div className="rounded-2xl border border-[var(--line)] p-4">
                    <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">進場</p>
                    <p className="mt-2 leading-6">{deepDive.strategy.entryRule}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] p-4">
                    <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">部位</p>
                    <p className="mt-2 leading-6">{deepDive.strategy.positionSizeRule}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-2xl border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">目標價</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--accent)]">{formatNumber(deepDive.strategy.targetPrice)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--line)] p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">停損價</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--danger)]">{formatNumber(deepDive.strategy.stopLoss)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600 dark:text-emerald-100/65">目前尚未形成可執行 setup。</p>
              )}
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">財務速覽</p>
              <h3 className="mt-2 text-2xl font-semibold">基本面快照</h3>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">EPS (TTM)</p>
                  <p className="mt-2 text-xl font-semibold">{formatNumber(deepDive.fundamentalSnapshot?.epsTtm)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">毛利率</p>
                  <p className="mt-2 text-xl font-semibold">{deepDive.fundamentalSnapshot?.grossMargin ? `${formatNumber(deepDive.fundamentalSnapshot.grossMargin)}%` : '-'}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">PE 比</p>
                  <p className="mt-2 text-xl font-semibold">{formatNumber(deepDive.fundamentalSnapshot?.peRatio)}x</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">營益率</p>
                  <p className="mt-2 text-xl font-semibold">{deepDive.fundamentalSnapshot?.operatingMargin ? `${formatNumber(deepDive.fundamentalSnapshot.operatingMargin)}%` : '-'}</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-[var(--line)] p-3">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">月營收</p>
                <p className="mt-1 text-sm">
                  {deepDive.revenueSignal?.monthlyRevenue ? deepDive.revenueSignal.monthlyRevenue.toLocaleString() : '-'}
                  <span className="ml-2 text-xs text-slate-500 dark:text-emerald-100/45">
                    YoY {deepDive.revenueSignal?.yoyGrowth != null ? `${deepDive.revenueSignal.yoyGrowth > 0 ? '+' : ''}${formatNumber(deepDive.revenueSignal.yoyGrowth)}%` : '-'}
                    {' · '}
                    MoM {deepDive.revenueSignal?.momGrowth != null ? `${deepDive.revenueSignal.momGrowth > 0 ? '+' : ''}${formatNumber(deepDive.revenueSignal.momGrowth)}%` : '-'}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">事件與報告</p>
              <h3 className="mt-2 text-2xl font-semibold">公司事件與研究 memo</h3>
              <div className="mt-5 space-y-3">
                {deepDive.companyEvents.map((event) => (
                  <article key={`${event.eventTimestamp}-${event.headline}`} className="rounded-2xl border border-[var(--line)] p-4">
                    <p className="text-sm font-semibold">{event.headline}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{event.summary}</p>
                  </article>
                ))}
                {deepDive.memo ? (
                  <article className="rounded-2xl border border-[var(--line)] bg-[var(--accent)] p-4 text-white">
                    <p className="text-xs tracking-[0.2em] opacity-65">{deepDive.memo.reportKind}</p>
                    <p className="mt-2 text-lg font-semibold">{deepDive.memo.title}</p>
                    <p className="mt-3 text-sm leading-6 opacity-80">{deepDive.memo.summary}</p>
                  </article>
                ) : null}
              </div>
            </div>
          </aside>
        </section>

        {/* 全平台來源 */}
        {(deepDive.kolCoverage.length > 0 || deepDive.podcastMentions.length > 0 || deepDive.sourceCoverage.length > 0) && (
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
            <div className="mb-6">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">原始來源</p>
              <h2 className="mt-2 text-2xl font-semibold">全平台討論彙整</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-emerald-100/65">
                來自社群、KOL、Podcast 等平台的原始資料，點擊每筆展開查看全文。
              </p>
            </div>

            {deepDive.kolCoverage.length > 0 && (
              <div className="mb-8">
                <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-slate-500 dark:text-emerald-100/50">台股 KOL 觀點 ({deepDive.kolCoverage.length})</p>
                <div className="space-y-2">
                  {deepDive.kolCoverage.map((source, i) => (
                    <details key={`kol-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate text-sm font-semibold">{source.sourceName}</span>
                          <span className="shrink-0 rounded-full bg-violet-600/10 px-2.5 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                            {sourceTypeLabel[source.sourceType] ?? source.sourceType}
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${source.verificationStatus === '已證實' ? 'bg-teal-600/12 text-teal-700 dark:text-teal-300' : source.verificationStatus === '部分證實' ? 'bg-sky-600/12 text-sky-700 dark:text-sky-300' : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'}`}>
                            {source.verificationStatus}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-emerald-100/45">
                          {source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleDateString('zh-TW') : '未標記'}
                        </span>
                      </summary>
                      <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
                        <p className="text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{source.summary || '尚無摘要。'}</p>
                        {source.sourceUrl && (
                          <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                            開啟來源 →
                          </a>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {deepDive.podcastMentions.length > 0 && (
              <div className="mb-8">
                <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-slate-500 dark:text-emerald-100/50">Podcast / YouTube 提及 ({deepDive.podcastMentions.length})</p>
                <div className="space-y-2">
                  {deepDive.podcastMentions.map((mention, i) => (
                    <details key={`podcast-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{mention.episodeTitle}</p>
                          <p className="text-xs text-slate-500 dark:text-emerald-100/45">{mention.podcastName} · {mention.platform}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${mention.transcriptStatus === 'ready' ? 'bg-teal-600/12 text-teal-700 dark:text-teal-300' : 'bg-slate-950/8 text-slate-500 dark:text-emerald-100/50'}`}>
                          {mention.transcriptStatus === 'ready' ? '已轉錄' : mention.transcriptStatus === 'pending' ? '轉錄中' : '未轉錄'}
                        </span>
                      </summary>
                      <div className="space-y-3 border-t border-[var(--line)] px-4 pb-4 pt-3">
                        {mention.excerpt && <p className="text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{mention.excerpt}</p>}
                        {mention.thesisHighlights.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">看多觀點</p>
                            <ul className="space-y-1">{mention.thesisHighlights.map((h, j) => <li key={j} className="text-xs text-slate-600 dark:text-emerald-100/65">· {h}</li>)}</ul>
                          </div>
                        )}
                        {mention.riskHighlights.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">風險提示</p>
                            <ul className="space-y-1">{mention.riskHighlights.map((h, j) => <li key={j} className="text-xs text-slate-600 dark:text-emerald-100/65">· {h}</li>)}</ul>
                          </div>
                        )}
                        <a href={mention.episodeUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                          開啟集數 →
                        </a>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-slate-500 dark:text-emerald-100/50">定錨投筆來源 ({investanchorsSources.length})</p>
              {investanchorsSources.length > 0 ? (
                <div className="space-y-2">
                  {investanchorsSources.map((source, i) => (
                    <details key={`investanchors-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate text-sm font-semibold">{source.sourceName}</span>
                          <span className="shrink-0 rounded-full bg-amber-500/14 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                            定錨投筆
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${source.verificationStatus === '已證實' ? 'bg-teal-600/12 text-teal-700 dark:text-teal-300' : source.verificationStatus === '部分證實' ? 'bg-sky-600/12 text-sky-700 dark:text-sky-300' : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'}`}>
                            {source.verificationStatus}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-emerald-100/45">
                          {source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleDateString('zh-TW') : '未標記'}
                        </span>
                      </summary>
                      <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
                        <p className="text-xs text-slate-500 dark:text-emerald-100/65">來源平台：{sourceTypeLabel[source.sourceType] ?? source.sourceType}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{source.summary || '尚無摘要。'}</p>
                        {source.sourceUrl && (
                          <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                            開啟來源 →
                          </a>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-slate-600 dark:text-emerald-100/65">
                  此檔目前尚未命中定錨投筆文章。來源同步正常後，命中的文章會出現在這裡。
                </div>
              )}
            </div>

            {nonInvestanchorsSources.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-slate-500 dark:text-emerald-100/50">其他監控來源 ({nonInvestanchorsSources.length})</p>
                <div className="space-y-2">
                  {nonInvestanchorsSources.map((source, i) => (
                    <details key={`source-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate text-sm font-semibold">{source.sourceName}</span>
                          <span className="shrink-0 rounded-full bg-slate-950/8 px-2.5 py-0.5 text-xs text-slate-600 dark:text-emerald-100/60">
                            {sourceTypeLabel[source.sourceType] ?? source.sourceType}
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${source.verificationStatus === '已證實' ? 'bg-teal-600/12 text-teal-700 dark:text-teal-300' : source.verificationStatus === '部分證實' ? 'bg-sky-600/12 text-sky-700 dark:text-sky-300' : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'}`}>
                            {source.verificationStatus}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-emerald-100/45">
                          {source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleDateString('zh-TW') : '未標記'}
                        </span>
                      </summary>
                      <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
                        <p className="text-xs text-slate-500 dark:text-emerald-100/65">來源平台：{sourceTypeLabel[source.sourceType] ?? source.sourceType}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{source.summary || '尚無摘要。'}</p>
                        {source.sourceUrl && (
                          <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                            開啟來源 →
                          </a>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <p className="border-t border-[var(--line)] pt-4 text-xs text-slate-500 dark:text-emerald-100/45">{deepDive.riskDisclosure}</p>
      </div>
    </main>
  );
}
