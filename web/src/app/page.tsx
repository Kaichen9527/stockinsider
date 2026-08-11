import { getDailyRadarData } from '@/lib/domain';
import Link from 'next/link';
import { HydrationSafeHome } from './components/HydrationSafeHome';
import { RadarTabs } from './components/RadarTabs';
import { ShadowOpportunityV3 } from './components/ShadowOpportunityV3';
import { loadOpportunityEngineV3 } from '@/lib/opportunity-v3/projection';
import { layerHomepageOpportunityV3, v3PublicEnabled } from '@/lib/opportunity-v3/deployment';
import { loadPublishedRadarProjection } from '@/lib/radar-projection-read';

export const dynamic = 'force-dynamic';

const connectorLabel: Record<string, string> = {
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  podcast: 'Podcast',
  youtube: 'YouTube',
  ptt: 'PTT Stock',
  bulltalk: '股市爆料同學會',
  googlenews: 'Google News',
  anue: '鉅亨網',
  udn: 'UDN',
  mobile01: 'Mobile01',
  twse_insider: '董監持股揭露',
};

function connectorStatusLabel(status: string) {
  if (status === 'success' || status === 'valid') return '正常';
  if (status === 'running') return '同步中';
  if (status === 'partial' || status === 'degraded') return '部分成功';
  if (status === 'timed_out') return '逾時待重試';
  if (status === 'failed' || status === 'invalid') return '失敗';
  return '待確認';
}

type SocialSourceDetail = NonNullable<Awaited<ReturnType<typeof getDailyRadarData>>['sourceHealthSummary']>['connectorDetails'][number];

function socialSourceState(item: SocialSourceDetail) {
  const reason = item.displayFailureReason || item.failureReason || item.degradedReason || '';
  const failureCode = item.normalizedFailureCode || '';
  const written = item.recordsWritten24h ?? item.recordsWritten ?? 0;
  const writtenThisRun = item.recordsWrittenThisRun ?? item.recordsWritten ?? 0;
  const terminalStatus = item.lastTerminalStatus || item.status;
  const ignoredServerless = Boolean(item.ignoredServerlessSkip || item.statusOwner === 'serverless_status');
  const failedChannels = item.channelBreakdown?.filter((channel) => channel.failureReason).length || 0;
  if (written > 0 && ['failed', 'timed_out', 'partial'].includes(String(terminalStatus))) {
    return { label: terminalStatus === 'timed_out' ? '上次成功，本輪逾時' : '上次成功，本輪待補', tone: 'text-amber-700 dark:text-amber-300' };
  }
  if (item.workerFreshnessStatus === 'stale') return { label: 'worker 逾時', tone: 'text-amber-700 dark:text-amber-300' };
  if (item.workerFreshnessStatus === 'degraded') return { label: /session|cookie|auth|login/i.test(reason) ? '來源需登入' : '抓取失敗', tone: 'text-amber-700 dark:text-amber-300' };
  if ((terminalStatus === 'success' || terminalStatus === 'valid') && writtenThisRun === 0) return { label: '已更新，暫無新增', tone: 'text-slate-600 dark:text-emerald-100/70' };
  if (written > 0 && item.connector === 'telegram' && failedChannels > 0) return { label: '有寫入，部分頻道待補', tone: 'text-amber-700 dark:text-amber-300' };
  if (written > 0 && /auth_degraded/i.test(failureCode)) return { label: '先前有寫入，本輪 auth degraded', tone: 'text-amber-700 dark:text-amber-300' };
  if (written > 0 && ignoredServerless) return { label: '本機 worker 有寫入', tone: 'text-emerald-700 dark:text-emerald-300' };
  if (written > 0 && ['partial', 'failed', 'timed_out', 'skipped'].includes(String(terminalStatus))) return { label: '有寫入，部分待補', tone: 'text-amber-700 dark:text-amber-300' };
  if (written > 0 && ['success', 'valid'].includes(String(terminalStatus))) return { label: '本機 worker 有寫入', tone: 'text-emerald-700 dark:text-emerald-300' };
  if (/session|cookie|auth|login|instagram_bridge/i.test(reason) || /auth_degraded/i.test(failureCode)) return { label: '來源需登入', tone: 'text-amber-700 dark:text-amber-300' };
  if (ignoredServerless || /playwright_runtime_unavailable/i.test(failureCode)) return { label: item.lastTerminalRunAt ? '已更新，暫無新增' : '尚未啟動', tone: 'text-slate-500 dark:text-emerald-100/55' };
  if (reason) return { label: '抓取失敗', tone: 'text-red-700 dark:text-red-300' };
  if (item.searched && !item.matched) return { label: '有搜尋無命中', tone: 'text-slate-600 dark:text-emerald-100/70' };
  return { label: '尚未啟動', tone: 'text-slate-500 dark:text-emerald-100/55' };
}

function socialSourceSummary(item: SocialSourceDetail) {
  if (item.connector === 'ptt') {
    const articles = item.articlesFetched ?? Number(item.metadata?.articles_fetched || item.metadata?.articlesFetched || 0);
    const comments = item.pushCommentsParsed ?? Number(item.metadata?.push_comments_parsed || item.metadata?.pushCommentsParsed || 0);
    const matched = item.matchedSymbols?.length || (Array.isArray(item.metadata?.matched_symbols) ? item.metadata.matched_symbols.length : 0);
    return `articles ${articles} · pushes ${comments} · symbols ${matched || (item.matched ? 'Y' : 'N')} · written ${item.recordsWritten24h ?? item.recordsWritten}`;
  }
  if (item.connector === 'telegram' && item.channelBreakdown?.length) {
    const fetched = item.channelBreakdown.reduce((sum, channel) => sum + (channel.fetchedPosts || 0), 0);
    const symbols = new Set(item.channelBreakdown.flatMap((channel) => channel.matchedSymbols || []));
    const excluded = item.channelBreakdown.reduce((sum, channel) => sum + (channel.excludedFalsePositives || 0), 0);
    return `searched ${item.channelBreakdown.length} 個公開頻道 · fetched ${fetched} · valid symbols ${symbols.size || (item.matched ? 'Y' : 'N')} · excluded ${excluded} · written ${item.recordsWritten24h ?? item.recordsWritten}`;
  }
  return `searched ${item.searchedTargets?.length ? item.searchedTargets.slice(0, 2).join('、') : item.searched ? 'Y' : 'N'} · matched ${
    item.matchedSymbols?.length ? item.matchedSymbols.length : item.matched ? 'Y' : 'N'
  } · written ${item.recordsWritten24h ?? item.recordsWritten}`;
}

function socialSourceAuthHint(item: SocialSourceDetail) {
  if (item.connector !== 'threads' && item.connector !== 'instagram') return null;
  const missing = item.missingRecommendedCookieNames || [];
  if (missing.length > 0) return `Cookie 待補欄位：${missing.join('、')}`;
  if (item.fallbackCookieSource) return `Cookie 來源：${item.fallbackCookieSource}`;
  return null;
}

const reportKindLabel: Record<string, string> = {
  daily_radar: '每日雷達',
  hot_theme: '主題快報',
  weekly_conviction: '每週高信念',
  deep_dive: '深度分析',
};

function formatTaipeiDateTime(value: string | null | undefined, mode: 'full' | 'short' = 'full') {
  if (!value) return '尚無';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (input: number) => String(input).padStart(2, '0');
  const dateText = `${taipei.getUTCFullYear()}-${pad(taipei.getUTCMonth() + 1)}-${pad(taipei.getUTCDate())}`;
  const timeText = `${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}${mode === 'full' ? `:${pad(taipei.getUTCSeconds())}` : ''}`;
  return `${dateText} ${timeText}`;
}

function wholeSecondUtcOrNow(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  const selected = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Date(Math.floor(selected.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export default async function Home() {
  const publishedRadar = await loadPublishedRadarProjection('home');
  const legacyRadar = (publishedRadar ?? await getDailyRadarData()) as Awaited<ReturnType<typeof getDailyRadarData>>;
  const v3ProjectionCutoff = wholeSecondUtcOrNow(legacyRadar.asOf);
  const { radar, opportunityEngineV3 } = await layerHomepageOpportunityV3({
    legacyRadar,
    loadShadowEngine: () => loadOpportunityEngineV3(v3ProjectionCutoff).catch(() => null),
    shadowEnabled: v3PublicEnabled(),
  });
  const symbolNameMap = new Map<string, string>();
  const allCards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.hotTracking || []),
    ...(radar.fallbackOpportunities90d || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.sourceSignals || []),
  ];
  for (const item of allCards) {
    if (!item.symbol) continue;
    const zh = item.chineseName || ('name' in item ? item.name : null) || item.symbol;
    symbolNameMap.set(item.symbol, zh);
  }
  for (const item of radar.discoveredStocks || []) {
    const zh = item.chineseName || item.name || item.symbol;
    symbolNameMap.set(item.symbol, zh);
  }
  const visibleReports = (radar.reports || []).filter((memo) => {
    const relatedSymbol = memo.relatedSymbols[0] || null;
    if (!relatedSymbol) return false;
    return Boolean(symbolNameMap.get(relatedSymbol));
  });
  const marketHighlight = radar.marketHighlightSummary;
  const sourceHealth = radar.sourceHealthSummary;
  const priceHealth = radar.dataHealth;
  const underreactionMarket = radar.underreactionMarket;
  const socialSourceDetails =
    (sourceHealth?.connectorDetails || []).filter((item) => ['threads', 'investanchors', 'instagram', 'telegram', 'podcast', 'youtube', 'ptt', 'bulltalk'].includes(item.connector));

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <HydrationSafeHome>
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-line bg-surface shadow-[0_20px_80px_rgba(8,18,26,0.12)] backdrop-blur">
          <div className="grid gap-6 px-6 py-8 md:grid-cols-1 md:px-10">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">
                台股故事型機會雷達
              </div>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
                  找出還沒反映在股價上的
                  <span className="block text-accent">台股故事型機會</span>
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-700 dark:text-emerald-100/78 md:text-base">
                  StockInsider 以台股為核心，把主題熱度、社群線索、官方驗證、財務影響、技術面與研究 memo 收斂成同一個工作台，專注於未來
                  1-3 個月可能上漲但尚未被市場充分定價的股票。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-line bg-surface-strong p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">收盤價更新</p>
                  <p className="mt-2 text-xl font-semibold">
                    {priceHealth?.priceRefreshStatus === 'fresh'
                      ? '今日股價已寫入'
                      : priceHealth?.priceRefreshStatus === 'pending'
                        ? '等待 15:00 更新'
                        : priceHealth?.priceRefreshStatus === 'stale'
                          ? '股價偏舊'
                          : '股價待補'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                    最近成功 {formatTaipeiDateTime(priceHealth?.priceRefreshLastSuccessAt, 'short')} · 下一輪 {formatTaipeiDateTime(priceHealth?.priceRefreshScheduledAt, 'short')}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface-strong p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">市場資金狀態</p>
                  <p className="mt-2 text-xl font-semibold">{marketHighlight?.regimeLabel || '市場資料待補'}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                    {marketHighlight?.regimeExplanation || '等待 market regime 刷新，不直接用內部 enum 當判斷。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface-strong p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">台股大盤分析</p>
                  <p className="mt-2 text-xl font-semibold">
                    {underreactionMarket?.status === 'risk_on' ? '趨勢與廣度支持'
                      : underreactionMarket?.status === 'selective_or_defensive' ? '選股／防守優先'
                        : '大盤證據未完整'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                    {underreactionMarket?.summary || '等待加權、櫃買、市場廣度與外資資料。'}
                    {underreactionMarket ? ` · 完整度 ${Math.round(underreactionMarket.completeness * 100)}%` : ''}
                  </p>
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{underreactionMarket?.riskBudget || '資料未完整，不提供部位預算。'}</p>
                </div>
                <div className="rounded-2xl border border-line bg-surface-strong p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">資料刷新健康度</p>
                  <p className="mt-2 text-xl font-semibold">
                    {sourceHealth ? `${sourceHealth.successfulSources} 正常 / ${sourceHealth.degradedSources} 待補` : '待補'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                    寫入 {sourceHealth?.recordsWritten24h ?? 0} 筆 · 最近成功 {formatTaipeiDateTime(sourceHealth?.lastSuccessfulRunAt || radar.agentStatus.lastSuccessfulRunAt, 'short')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a href="/sources" className="rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  查看全量來源檢索
                </a>
                <details className="relative">
                  <summary title="來源同步摘要" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-line text-sm hover:bg-black/5 dark:hover:bg-white/5">
                    ⌁
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-2xl border border-line bg-surface p-3 shadow-xl">
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/55">來源同步摘要</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/70">
                      最近成功：{formatTaipeiDateTime(radar.agentStatus.lastSuccessfulRunAt)}
                    </p>
                    <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                      {radar.connectorStatus.map((item) => (
                        <div key={item.connector} className="rounded-xl border border-line bg-surface-strong px-2 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span>{connectorLabel[item.connector] || item.connector}</span>
                            <span className="rounded-full bg-slate-950/8 px-2 py-0.5 dark:bg-emerald-100/10">{connectorStatusLabel(item.lastRunStatus || item.credentialStatus)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/60">筆數 {item.lastRecordsWritten}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </div>

              <div className="rounded-[1.5rem] border border-line bg-surface-strong p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">今日台股 Highlight</p>
                    <h2 className="mt-2 text-xl font-semibold">{marketHighlight?.headline || radar.focusSummary}</h2>
                  </div>
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs text-slate-700 dark:text-emerald-100/80">
                    {radar.marketFreshnessStatus === 'fresh' ? '市場資料新' : '市場資料待補'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <p className="rounded-2xl border border-line bg-surface p-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/75">
                    {marketHighlight?.capitalFlow || radar.focusSummary}
                  </p>
                  <p className="rounded-2xl border border-line bg-surface p-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/75">
                    熱門主題：{marketHighlight?.topThemes?.join('、') || radar.hotThemes.slice(0, 3).map((theme) => theme.themeName).join('、') || '待補'}
                  </p>
                  <p className="rounded-2xl border border-line bg-surface p-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/75">
                    {marketHighlight?.riskNote || '主題熱度只代表資金方向，仍需回到個股驗證與進場 gate。'}
                  </p>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-emerald-100/55">
                  最後更新：{formatTaipeiDateTime(radar.lastUpdatedAt)}{radar.evidenceAgeHours != null ? ` · 證據時效 ${radar.evidenceAgeHours} 小時` : ''}
                </p>
              </div>
              {radar.discoveryFreshnessSummary ? (
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <article className="rounded-[1.5rem] border border-line bg-surface-strong p-5">
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">推薦池更新證明</p>
                    <h2 className="mt-2 text-xl font-semibold">{radar.discoveryFreshnessSummary.candidateSummary}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                      {radar.discoveryFreshnessSummary.sourceSummary}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">
                      名單未大幅變動原因：{radar.discoveryFreshnessSummary.unchangedReason}
                    </p>
                  </article>
                  <article className="rounded-[1.5rem] border border-line bg-surface-strong p-5">
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">海外 Lead-Lag 雷達</p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {radar.globalLeadLagSummary ? `${radar.globalLeadLagSummary.activeThemes} 個主題監控中` : '等待海外同族群資料'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
                      {radar.globalLeadLagSummary?.summary || '海外同族群領漲只作候選與情境追蹤，不直接升正式推薦。'}
                    </p>
                  </article>
                </div>
              ) : null}
              {socialSourceDetails.length > 0 ? (
                <div className="rounded-[1.5rem] border border-line bg-surface-strong p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">社群來源狀態</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                    {socialSourceDetails.map((item) => (
                      <div key={`social-source-${item.connector}`} className="rounded-2xl border border-line bg-surface p-3 text-xs leading-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{item.label}</span>
                          <span className={socialSourceState(item).tone}>{socialSourceState(item).label}</span>
                        </div>
                        <p className="mt-1 text-slate-500 dark:text-emerald-100/55">
                          {socialSourceSummary(item)}
                        </p>
                        {item.displayFailureReason || item.failureReason || item.degradedReason ? (
                          <p className="mt-1 text-amber-700 dark:text-amber-300">{item.displayFailureReason || item.failureReason || item.degradedReason}</p>
                        ) : null}
                        {socialSourceAuthHint(item) ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/50">{socialSourceAuthHint(item)}</p>
                        ) : null}
                        {item.connector === 'telegram' && item.channelBreakdown?.length ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/50">
                            頻道：{item.channelBreakdown.slice(0, 3).map((channel) => channel.channel).join('、')}
                            {item.channelBreakdown.length > 3 ? ` 等 ${item.channelBreakdown.length} 個` : ''}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {radar.themeHypotheses && radar.themeHypotheses.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {radar.themeHypotheses.slice(0, 4).map((hypothesis) => (
                    <article key={hypothesis.themeKey} className="rounded-2xl border border-line bg-surface-strong p-4">
                      <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">{hypothesis.evidenceLevel}</p>
                      <h3 className="mt-2 text-sm font-semibold">{hypothesis.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/72">{hypothesis.summary}</p>
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-emerald-100/55">
                        假設：{hypothesis.assumptions.slice(0, 2).join('；')}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          {opportunityEngineV3 ? <ShadowOpportunityV3 engine={opportunityEngineV3} /> : null}
          <RadarTabs radar={radar} />
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <div>
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">研究報告</p>
            <h2 className="mt-2 text-2xl font-semibold">研究 memo 與發佈內容</h2>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {visibleReports.map((memo) => {
              const relatedSymbol = memo.relatedSymbols[0] || null;
              if (!relatedSymbol) return null;
              const relatedName = symbolNameMap.get(relatedSymbol) || null;
              if (!relatedName) return null;
              const href = relatedSymbol ? `/stock/${relatedSymbol}` : '/sources';
              const relatedLabel = `[${relatedSymbol}] ${relatedName}`;
              return (
                <Link key={memo.slug} href={href} className="block rounded-[1.5rem] border border-line bg-surface-strong p-5 transition hover:border-accent">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{reportKindLabel[memo.reportKind] || memo.reportKind}</p>
                  <h3 className="mt-3 text-xl font-semibold">{`${relatedLabel}｜${memo.title}`}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{memo.summary}</p>
                  <p className="mt-4 text-xs text-slate-500 dark:text-emerald-100/45">
                    相關股票：{memo.relatedSymbols.length > 0 ? memo.relatedSymbols.map((sym) => `[${sym}] ${symbolNameMap.get(sym) || sym}`).join('、') : '無'}
                  </p>
                </Link>
              );
            })}
          </div>
          {visibleReports.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500 dark:text-emerald-100/65">
              目前尚無符合「代碼 + 中文名」格式的研究 memo。
            </div>
          ) : null}
        </section>

        <p className="border-t border-line pt-4 text-xs text-slate-500 dark:text-emerald-100/45">{radar.riskDisclosure}</p>
        </div>
      </HydrationSafeHome>
    </main>
  );
}
