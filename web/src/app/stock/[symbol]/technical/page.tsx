import Link from 'next/link';
import { notFound } from 'next/navigation';
import StockChart from '@/components/StockChart';
import { getStockTechnicalLookup } from '@/lib/domain';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ symbol: string }>;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '待補';
  return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: digits }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '待補';
  return `NT$${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '待補';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function trendLabel(trend: string | null | undefined) {
  if (trend === 'buying') return '偏買';
  if (trend === 'selling') return '偏賣';
  if (trend === 'mixed') return '分歧';
  return '中性';
}

export default async function StockTechnicalPage({ params }: PageProps) {
  const { symbol } = await params;
  const lookup = await getStockTechnicalLookup(symbol);

  if (lookup.status === 'not_found') {
    notFound();
  }

  if (lookup.status === 'pending') {
    return (
      <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
          <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={`/stock/${lookup.data.symbol}`} className="rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                回到深度分析
              </Link>
              <span className="rounded-full bg-accent-soft px-4 py-2 text-xs text-accent">
                Chart Room · 技術圖與籌碼載入中
              </span>
            </div>
            <div className="mt-6">
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">技術圖與籌碼</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{lookup.data.symbol} 技術圖整理中</h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 dark:text-emerald-100/70">
                {lookup.data.reason}，系統已排程補抓資料，約 {lookup.data.retryAfterSec} 秒後再重新整理；先顯示技術頁骨架，避免等待時像卡住。
              </p>
            </div>
          </header>

          <section className="grid gap-6 xl:grid-cols-[270px_minmax(0,1fr)_360px]">
            <aside className="flex flex-col gap-4">
              <article className="rounded-[2rem] border border-line bg-slate-950 p-5 text-emerald-50 shadow-[0_18px_70px_rgba(8,18,26,0.22)] dark:bg-emerald-950/70">
                <p className="text-xs tracking-[0.22em] text-emerald-200/60">技術 Watchlist</p>
                <h2 className="mt-2 text-2xl font-semibold">{lookup.data.symbol}</h2>
                <p className="mt-1 text-sm text-emerald-100/70">等待最新日 K / 籌碼快照</p>
                <div className="mt-5 space-y-3 text-sm leading-6">
                  {['現價載入中', 'Base / 情境載入中', '目前策略載入中'].map((label) => (
                    <div key={label} className="rounded-2xl border border-emerald-200/12 bg-white/5 p-3">
                      <p className="text-xs text-emerald-100/55">{label}</p>
                      <div className="mt-2 h-6 w-28 animate-pulse rounded-full bg-emerald-100/15" />
                    </div>
                  ))}
                </div>
              </article>
              <article className="rounded-[2rem] border border-line bg-surface p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Alert levels</p>
                <div className="mt-4 space-y-3">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={`pending-alert-${item}`} className="h-12 animate-pulse rounded-2xl border border-line bg-surface-strong" />
                  ))}
                </div>
              </article>
            </aside>

            <article className="rounded-[2rem] border border-line bg-surface p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">兩年日 K</p>
                  <h2 className="mt-1 text-2xl font-semibold">K 線、成交量與均線</h2>
                </div>
                <p className="rounded-full border border-line px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">資料整理中</p>
              </div>
              <div className="h-[560px] animate-pulse rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
            </article>

            <aside className="flex flex-col gap-4">
              <article className="rounded-[2rem] border border-accent/25 bg-accent-soft p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">進場計畫</p>
                <h2 className="mt-2 text-2xl font-semibold">整理中</h2>
                <p className="mt-3 text-sm leading-7">等待最新價格、均線、籌碼與 Fibonacci 快照完成後，才輸出可操作進場劇本。</p>
              </article>
              <article className="rounded-[2rem] border border-line bg-surface p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">籌碼面板</p>
                <div className="mt-4 space-y-3">
                  {[0, 1, 2].map((item) => (
                    <div key={`pending-chip-${item}`} className="h-20 animate-pulse rounded-[1.1rem] border border-line bg-surface-strong" />
                  ))}
                </div>
              </article>
            </aside>
          </section>
        </div>
      </main>
    );
  }

  const deepDive = lookup.data;
  const technical = deepDive.technicalSnapshot || null;
  const entrySignal = deepDive.technicalEntrySignal || null;
  const chipEntry = deepDive.chipEntryAssessment || null;
  const chip = deepDive.chipSnapshot || null;
  const missingReason = technical?.missingReason || deepDive.chartMissingReason || null;
  const fibonacci = technical?.fibonacci || null;
  const chartDepthLabel = deepDive.chart?.length ? `${deepDive.chart.length} 根日 K` : missingReason || '日 K 待補';

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`/stock/${deepDive.symbol}`} className="rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              回到深度分析
            </Link>
            <span className="rounded-full bg-accent-soft px-4 py-2 text-xs text-accent">
              Chart Room · 資料源採 StockInsider 台股管線
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">技術圖與籌碼</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                {deepDive.symbol}
                {deepDive.recommendation?.chineseName ? (
                  <span className="ml-2 text-2xl font-normal text-slate-600 dark:text-emerald-100/65">{deepDive.recommendation.chineseName}</span>
                ) : null}
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 dark:text-emerald-100/70">
                這一頁專門處理「看對之後何時進場」：日 K、均線、RSI、MACD、Fibonacci、量能與籌碼一起讀，不改基本面目標價。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-line bg-surface-strong p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">目前策略</p>
              <p className="mt-2 text-xl font-semibold">{chipEntry?.verdict || entrySignal?.verdict || '進場判讀待補'}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/65">市場資料：{formatDateTime(deepDive.dataHealth?.marketDataAsOf || deepDive.asOf)}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[270px_minmax(0,1fr)_360px]">
          <aside className="flex flex-col gap-4">
            <article className="rounded-[2rem] border border-line bg-slate-950 p-5 text-emerald-50 shadow-[0_18px_70px_rgba(8,18,26,0.22)] dark:bg-emerald-950/70">
              <p className="text-xs tracking-[0.22em] text-emerald-200/60">技術 Watchlist</p>
              <h2 className="mt-2 text-2xl font-semibold">{deepDive.symbol}</h2>
              <p className="mt-1 text-sm text-emerald-100/70">{deepDive.recommendation?.chineseName || deepDive.name || '台股標的'}</p>
              <div className="mt-5 space-y-3 text-sm leading-6">
                <div className="rounded-2xl border border-emerald-200/12 bg-white/5 p-3">
                  <p className="text-xs text-emerald-100/55">現價</p>
                  <p className="mt-1 text-2xl font-semibold">{formatPrice(deepDive.price)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/12 bg-white/5 p-3">
                  <p className="text-xs text-emerald-100/55">Base / 情境</p>
                  <p className="mt-1">{formatPrice(deepDive.targetSnapshot?.baseTarget)} / {formatPrice(deepDive.targetSnapshot?.upsideTarget)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/12 bg-white/5 p-3">
                  <p className="text-xs text-emerald-100/55">目前策略</p>
                  <p className="mt-1 font-semibold">{chipEntry?.verdict || entrySignal?.verdict || '等待確認'}</p>
                </div>
              </div>
              <Link
                href={`/stock/${deepDive.symbol}`}
                className="mt-5 block rounded-full bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                回深度報告
              </Link>
            </article>

            <article className="rounded-[2rem] border border-line bg-surface p-5">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Alert levels</p>
              <div className="mt-4 space-y-3 text-sm leading-6">
                <p className="rounded-2xl border border-line bg-surface-strong p-3">突破：{entrySignal?.entryPlan?.breakoutTrigger || formatPrice(fibonacci?.retracement236)}</p>
                <p className="rounded-2xl border border-line bg-surface-strong p-3">回測：{entrySignal?.entryPlan?.pullbackSupport || formatPrice(technical?.ma20)}</p>
                <p className="rounded-2xl border border-line bg-surface-strong p-3">失效：{entrySignal?.entryPlan?.invalidationLevel || chipEntry?.supportResistance?.summary || '待補'}</p>
                <p className="rounded-2xl border border-line bg-surface-strong p-3">量能：{entrySignal?.entryPlan?.volumeSignal || '等待突破或回測時量能配合'}</p>
              </div>
            </article>
          </aside>

          <article className="rounded-[2rem] border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">兩年日 K</p>
                <h2 className="mt-1 text-2xl font-semibold">K 線、成交量與均線</h2>
              </div>
              <p className="rounded-full border border-line px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
                {deepDive.chartSource || 'missing'} · {chartDepthLabel}
              </p>
            </div>
            <StockChart data={deepDive.chart} timeframeCharts={deepDive.timeframeCharts} missingReason={missingReason} height={560} />
          </article>

          <aside className="flex flex-col gap-4">
            <article className="rounded-[2rem] border border-accent/25 bg-accent-soft p-5">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">進場計畫</p>
              <h2 className="mt-2 text-2xl font-semibold">{entrySignal?.verdict || chipEntry?.verdict || '待補'}</h2>
              <p className="mt-3 text-sm leading-7">{entrySignal?.entryPlan?.strategy || chipEntry?.summary || '等待技術與籌碼資料補齊。'}</p>
              <div className="mt-4 space-y-2 text-xs leading-5 text-slate-700 dark:text-emerald-100/75">
                <p>分批區：{entrySignal?.entryPlan?.entryZone || '待 MA / Fib 支撐確認'}</p>
                <p>突破條件：{entrySignal?.entryPlan?.breakoutTrigger || '待量能突破確認'}</p>
                <p>避開區：{entrySignal?.entryPlan?.avoidZone || '若 RSI 過熱或靠近壓力不追價'}</p>
                <p>失效：{entrySignal?.entryPlan?.invalidationLevel || chipEntry?.supportResistance?.summary || '待補'}</p>
              </div>
            </article>

            <article className="rounded-[2rem] border border-line bg-surface p-5">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">籌碼面板</p>
              <div className="mt-4 space-y-3 text-sm leading-6">
                <div className="rounded-[1.1rem] border border-line bg-surface-strong p-3">
                  <p className="text-xs text-slate-500 dark:text-emerald-100/45">三大法人</p>
                  <p className="mt-1">外資：{formatNumber(chip?.institutionalFlows?.foreign?.net5d, 0)} 張，{trendLabel(chip?.institutionalFlows?.foreign?.trend)}</p>
                  <p>投信：{formatNumber(chip?.institutionalFlows?.investmentTrust?.net5d, 0)} 張，{trendLabel(chip?.institutionalFlows?.investmentTrust?.trend)}</p>
                  <p>自營商：{formatNumber(chip?.institutionalFlows?.dealer?.net5d, 0)} 張，{trendLabel(chip?.institutionalFlows?.dealer?.trend)}</p>
                </div>
                <div className="rounded-[1.1rem] border border-line bg-surface-strong p-3">
                  <p className="text-xs text-slate-500 dark:text-emerald-100/45">融資 / 融券 / 借券</p>
                  <p>融資：{formatNumber(chip?.marginFinancing?.balance, 0)}，變化 {formatNumber(chip?.marginFinancing?.change, 0)}</p>
                  <p>融券：{formatNumber(chip?.shortInterest?.balance, 0)}，變化 {formatNumber(chip?.shortInterest?.change, 0)}</p>
                  <p>借券：{formatNumber(chip?.shortInterest?.sblBalance, 0)}</p>
                </div>
                <div className="rounded-[1.1rem] border border-line bg-surface-strong p-3">
                  <p className="text-xs text-slate-500 dark:text-emerald-100/45">資料狀態</p>
                  <p>{chip?.dataStatus?.status || 'missing'} · {chip?.dataStatus?.source || '待補'}</p>
                  <p>as-of：{formatDateTime(chip?.dataStatus?.asOf)}</p>
                  {chip?.dataStatus?.missingReasons?.length ? <p>{chip.dataStatus.missingReasons[0]}</p> : null}
                </div>
              </div>
            </article>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-[2rem] border border-line bg-surface p-5">
            <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">技術指標</p>
            <div className="mt-4 space-y-2 text-sm leading-6">
              <p>MA20 / 60 / 120 / 240：{formatNumber(technical?.ma20)} / {formatNumber(technical?.ma60)} / {formatNumber(technical?.ma120)} / {formatNumber(technical?.ma240)}</p>
              <p>RSI：{formatNumber(technical?.rsi)}</p>
              <p>MACD / Signal：{formatNumber(technical?.macd)} / {formatNumber(technical?.macdSignal)}</p>
              <p>資料源：{technical?.dataSource || deepDive.chartSource || '待補'}</p>
            </div>
          </article>
          <article className="rounded-[2rem] border border-line bg-surface p-5">
            <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Fibonacci 關鍵價位</p>
            <div className="mt-4 space-y-2 text-sm leading-6">
              <p>高 / 低：{formatPrice(fibonacci?.swingHigh)} / {formatPrice(fibonacci?.swingLow)}</p>
              <p>38.2 / 50 / 61.8：{formatPrice(fibonacci?.retracement382)} / {formatPrice(fibonacci?.retracement5)} / {formatPrice(fibonacci?.retracement618)}</p>
              <p>區間判讀：{fibonacci?.bias || '待補'}</p>
            </div>
          </article>
          <article className="rounded-[2rem] border border-line bg-surface p-5">
            <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">必盯數字</p>
            <div className="mt-4 space-y-3">
              {(chipEntry?.watchNumbers || []).slice(0, 4).map((item, index) => (
                <div key={`watch-${index}`} className="rounded-[1rem] border border-line bg-surface-strong p-3 text-sm leading-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-accent">{item.value}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/65">{item.interpretation}</p>
                </div>
              ))}
              {chipEntry?.watchNumbers?.length ? null : <p className="text-sm leading-7 text-slate-600 dark:text-emerald-100/65">籌碼 watch list 待補。</p>}
            </div>
          </article>
        </section>

        {chipEntry?.nextSessionPlaybook?.length ? (
          <section className="rounded-[2rem] border border-line bg-surface p-5">
            <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">下一交易日三劇本</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {chipEntry.nextSessionPlaybook.map((item, index) => (
                <article key={`technical-playbook-${index}`} className="rounded-[1.4rem] border border-line bg-surface-strong p-4 text-sm leading-7">
                  <h3 className="text-lg font-semibold">{item.scenario}</h3>
                  <p className="mt-2">{item.condition}</p>
                  <p className="mt-2">{item.action}</p>
                  <p className="mt-3 text-xs text-slate-600 dark:text-emerald-100/62">{item.riskControl}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
