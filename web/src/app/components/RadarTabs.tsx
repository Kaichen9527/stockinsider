'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DiscoveredStockCard, RadarDailyPayload, RecommendationCard, ThemeHeatCard } from '@/lib/types';

type Props = {
  radar: RadarDailyPayload;
};

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
  'live-unavailable': '資料來源異常',
};

const valuationSourceLabel: Record<string, string> = {
  valuation_cases: '估值情境',
  broker_report: '券商/投顧目標價',
  thesis_model: 'thesis 推估',
  missing: '估值不足',
  demo_seed: '示範 seed',
};

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `+${value.toFixed(1)}%`;
}

function stockDisplayName(rec: RecommendationCard) {
  return rec.chineseName ? `${rec.symbol} ${rec.chineseName}` : rec.name ?? rec.symbol;
}

type TabKey = 'stocks' | 'themes' | 'discovery';

function StockCard({ rec, isPrimary }: { rec: RecommendationCard; isPrimary: boolean }) {
  const stateBadge =
    rec.recommendationState === 'actionable_setup'
      ? { label: '可進場', cls: 'bg-[var(--accent)] text-white' }
      : rec.recommendationState === 'validated_thesis'
        ? { label: '高信念', cls: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' }
        : rec.recommendationState === 'partially_verified'
          ? { label: '驗證中', cls: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' }
          : { label: '早期觀察', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' };

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-semibold truncate">{stockDisplayName(rec)}</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${stateBadge.cls}`}>{stateBadge.label}</span>
        </div>
        {pct(rec.expectedUpsidePct) ? (
          <span className="shrink-0 text-xl font-bold text-emerald-600 dark:text-emerald-400">{pct(rec.expectedUpsidePct)}</span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">估值待補強</span>
        )}
      </div>

      {rec.targetPrice && (
        <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
          目標價 {rec.targetPrice.toFixed(0)}
          {rec.estimatedCatalystDate && <> &nbsp;·&nbsp; 催化劑 {rec.estimatedCatalystDate}</>}
        </p>
      )}

      <p className="mt-2 text-sm font-medium leading-snug">{rec.thesisTitle || rec.rationale}</p>
      <p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-emerald-50/88 line-clamp-3">
        {rec.thesisSummary || rec.catalystSummary || rec.rationale}
      </p>

      {rec.catalystSummary && rec.thesisSummary && (
        <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-emerald-100/72 line-clamp-2">
          催化劑：{rec.catalystSummary}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:text-emerald-50/88">
            估值來源 {valuationSourceLabel[rec.valuationSource || 'missing']}
          </span>
          {rec.storyType && (
            <span className="rounded-full bg-violet-600/10 px-2.5 py-0.5 text-violet-700 dark:text-violet-300">
              {rec.storyType.replace(/_/g, ' ')}
            </span>
          )}
          {rec.stopLoss && (
            <span className="rounded-full bg-red-500/8 px-2.5 py-0.5 text-red-600 dark:text-red-400">
              停損 {rec.stopLoss.toFixed(0)}
            </span>
          )}
        </div>
        <Link
          href={`/stock/${rec.symbol}`}
          data-testid={isPrimary ? 'view-insight-link' : undefined}
          className="shrink-0 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm text-white transition hover:opacity-85"
        >
          深度分析 →
        </Link>
      </div>
      {rec.isFallbackValuation ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">估值資料不足，暫不給目標上行%。</p>
      ) : null}
    </article>
  );
}

function StocksTab({ radar }: { radar: RadarDailyPayload }) {
  const actionable = radar.opportunities.filter((r) => r.recommendationState === 'actionable_setup');
  const validated = radar.opportunities.filter((r) => r.recommendationState === 'validated_thesis');
  const partial = radar.opportunities.filter((r) => r.recommendationState === 'partially_verified');
  const signal = radar.opportunities.filter((r) => r.recommendationState === 'signal_candidate');
  const earlyWatchlist = radar.earlyWatchlist ?? [];
  const primaryTheme = radar.hotThemes[0];

  const groups: { label: string; emoji: string; items: RecommendationCard[]; desc: string }[] = [
    { label: '可執行進場', emoji: '🔥', items: actionable, desc: '已通過驗證與技術面確認，可依規則執行' },
    { label: '高信念名單', emoji: '✅', items: validated, desc: '論點已充分驗證，等待技術面進場訊號' },
    { label: '驗證進行中', emoji: '🔍', items: partial, desc: '部分來源已確認，持續追蹤中' },
    { label: '早期觀察', emoji: '👀', items: signal, desc: '社群早期訊號，尚待官方資料交叉驗證' },
  ];
  const primaryRecommendationId = groups.find((group) => group.items.length > 0)?.items[0]?.recommendationId;

  return (
    <div className="space-y-0">
      <p className="mb-8 text-sm text-slate-500 dark:text-emerald-100/50">
        正式推薦 {radar.opportunities.length} 支，早期可關注 {earlyWatchlist.length} 支。若缺估值證據，系統會標示「估值不足」並不顯示上行百分比。
      </p>
      <details data-testid="theme-source-panel" className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
        <summary className="cursor-pointer text-sm font-medium">
          主題來源概覽：{primaryTheme?.themeName || '尚無主題資料'}
        </summary>
        <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-emerald-100/72">
          <p>
            來源：
            {primaryTheme
              ? primaryTheme.sourceCoverage.slice(0, 4).map((item) => sourceTypeLabel[item.sourceType] || item.sourceType).join('、') || '無'
              : '目前資料不可用'}
          </p>
          <p>缺漏來源：{primaryTheme ? primaryTheme.missingSources.join('、') || '目前主要來源已覆蓋' : 'PTT Stock、Threads、股市爆料同學會'}</p>
        </div>
      </details>

      {groups.map(({ label, emoji, items, desc }, groupIndex) =>
        items.length === 0 ? null : (
          <section key={label} className={groupIndex > 0 ? 'border-t border-[var(--line)] pt-8 mt-8' : ''}>
            <div className="mb-6 flex items-center gap-4">
              <span className="text-2xl">{emoji}</span>
              <div>
                <h3 className="text-lg font-semibold">{label}</h3>
                <p className="text-xs text-slate-500 dark:text-emerald-100/45">{desc}</p>
              </div>
              <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
                {items.length} 支
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((rec) => (
                <StockCard key={rec.recommendationId} rec={rec} isPrimary={rec.recommendationId === primaryRecommendationId} />
              ))}
            </div>
          </section>
        ),
      )}

      {radar.opportunities.length === 0 && (
        <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] p-10 text-center text-slate-500 dark:text-emerald-100/45">
          目前尚無正向預估上行空間的推薦股票。資料將在每日 01:15 TW 自動更新。
        </div>
      )}

      {earlyWatchlist.length > 0 && (
        <section className="mt-10 border-t border-[var(--line)] pt-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="text-2xl">🧭</span>
            <div>
              <h3 className="text-lg font-semibold">早期可關注</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">故事已浮現但尚未滿足正式推薦條件，適合提早追蹤。</p>
            </div>
            <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              {earlyWatchlist.length} 支
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {earlyWatchlist.map((rec) => (
              <StockCard key={`early-${rec.recommendationId}`} rec={rec} isPrimary={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ThemeCard({ theme, index }: { theme: ThemeHeatCard; index: number }) {
  return (
    <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">主題 {index + 1}</p>
          <Link href={`/themes/${theme.themeKey}`} className="mt-2 block text-xl font-semibold hover:text-[var(--accent)]">
            {theme.themeName}
          </Link>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
            {(theme.marketRegime && marketRegimeLabel[theme.marketRegime]) || theme.marketRegime || '未標記'}
            {' · '}
            <span className="text-[var(--accent)] font-medium">{theme.relatedSymbols.join(', ')}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-right text-white shrink-0">
          <p className="text-[11px] tracking-[0.2em]">熱度</p>
          <p className="text-2xl font-semibold">{theme.heatScore.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-teal-600/12 px-3 py-1 text-teal-700 dark:text-teal-300">{theme.verificationStatus}</span>
        <span className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:text-emerald-100/72">證據 {theme.evidenceCount}</span>
        <span className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:text-emerald-100/72">
          最新來源 {theme.latestSourceAt ? new Date(theme.latestSourceAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未記錄'}
        </span>
      </div>

      <details data-testid="theme-source-panel" className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium">查看來源與覆蓋狀態</summary>
        <div className="mt-4 space-y-3">
          {theme.sourceCoverage.map((source, sourceIndex) => (
            <article key={`${theme.themeKey}-${source.sourceName}-${sourceIndex}`} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{source.sourceName}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/50">
                    {sourceTypeLabel[source.sourceType] || source.sourceType} · {source.verificationStatus} · 權重 {source.weight.toFixed(2)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-emerald-100/50">
                  <p>{source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleString('zh-TW') : '未標記時間'}</p>
                  <p>{source.symbols.join(', ') || '未綁定股票'}</p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{source.summary || '尚無摘要。'}</p>
              {source.sourceUrl ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline">
                  開啟來源
                </a>
              ) : null}
            </article>
          ))}
          <div className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-slate-700 dark:text-emerald-100/72">
            缺漏來源：{theme.missingSources.length > 0 ? theme.missingSources.join('、') : '目前主要來源已覆蓋'}
          </div>
        </div>
      </details>
    </article>
  );
}

function ThemesTab({ radar }: { radar: RadarDailyPayload }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-emerald-100/50">
        主題代表市場正在討論的故事與敘事。點擊主題名稱查看相關股票。
      </p>
      {radar.hotThemes.map((theme, index) => (
        <ThemeCard key={`${theme.themeKey}-${theme.windowType}`} theme={theme} index={index} />
      ))}
    </div>
  );
}

const discoverySourceLabel: Record<string, string> = {
  PTT: 'PTT Stock',
  BullTalk: '股市爆料同學會',
  Threads: 'Threads',
  KOL: '台股 KOL',
  Telegram: 'Telegram',
  Instagram: 'Instagram',
  broker_report: '投顧報告',
  earnings_call: '法說會',
  mops: 'MOPS 重大訊息',
  podcast: 'Podcast',
};

function DiscoveredCard({ stock }: { stock: DiscoveredStockCard }) {
  const stateBadge =
    stock.recommendationState === 'validated_thesis'
      ? { label: '已證實 thesis', cls: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' }
      : stock.recommendationState === 'partially_verified'
        ? { label: '部分證實', cls: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' }
        : { label: '未證實題材', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' };

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{stock.symbol}</span>
            {stock.name && <span className="truncate text-sm text-slate-600 dark:text-emerald-100/75">{stock.name}</span>}
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${stateBadge.cls}`}>{stateBadge.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
            近 14 天提及 {stock.mentionCount} 次 · 最新 {new Date(stock.latestMentionAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          {stock.expectedUpsidePct != null && stock.expectedUpsidePct > 0 ? (
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">+{stock.expectedUpsidePct.toFixed(1)}%</p>
          ) : (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">尚未形成估值</p>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
            {stock.currentPrice != null ? `現價 NT$${stock.currentPrice.toFixed(1)}` : '現價待補'}{stock.targetPrice != null ? ` · 目標價 NT$${stock.targetPrice.toFixed(1)}` : ''}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium leading-snug">{stock.thesisTitle || `${stock.symbol} 社群故事正在成形`}</p>
      <p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-emerald-50/88 line-clamp-3">
        {stock.storySummary || '目前已出現多來源討論，但尚待更多官方、財務或法說資料完成驗證。'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {stock.sourceCoverage.map((item) => (
          <span key={item.label} className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-50/88">
            {(discoverySourceLabel[item.label] || sourceTypeLabel[item.label] || item.label)}({item.count})
          </span>
        ))}
        <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-50/88">
          估值來源 {valuationSourceLabel[stock.valuationSource]}
        </span>
      </div>

      {stock.whyNotRecommended ? (
        <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {stock.whyNotRecommended}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-emerald-100/70">
          這是社群早期題材卡，代表故事已被市場發現，但還沒全部升級成正式推薦。
        </div>
        <Link href={`/stock/${stock.symbol}`} className="shrink-0 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm text-white transition hover:opacity-85">
          深度分析 →
        </Link>
      </div>
    </article>
  );
}

function DiscoveryTab({ radar }: { radar: RadarDailyPayload }) {
  const stocks = radar.discoveredStocks ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-emerald-100/70">
        社群發現不是雜訊列表，而是從 PTT、股市爆料同學會、Threads、定錨投筆、Podcast 等來源抓到的早期候選池。這些股票已經有故事，但還在驗證與估值補強階段。
      </p>
      {stocks.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {stocks.map((stock) => (
            <DiscoveredCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] p-10 text-center text-slate-500 dark:text-emerald-100/65">
          目前尚未從社群或投資報告中發現新的潛力股票。資料將在每日凌晨自動更新。
        </div>
      )}
    </div>
  );
}

export function RadarTabs({ radar }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('stocks');

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'stocks', label: '推薦股票', count: radar.opportunities.length },
    { key: 'themes', label: '主題分析', count: radar.hotThemes.length },
    { key: 'discovery', label: '社群發現', count: radar.discoveredStocks?.length ?? 0 },
  ];

  return (
    <div>
      {/* Tab bar — full-width underline style */}
      <div className="mb-8 flex items-center border-b border-[var(--line)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-6 py-3 text-base font-medium transition -mb-px ${
              activeTab === tab.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-slate-500 dark:text-emerald-100/55 hover:text-slate-800 dark:hover:text-emerald-100/80'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.key ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-slate-950/8 text-slate-500 dark:bg-emerald-100/10 dark:text-emerald-100/60'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'stocks' && <StocksTab radar={radar} />}
      {activeTab === 'themes' && <ThemesTab radar={radar} />}
      {activeTab === 'discovery' && <DiscoveryTab radar={radar} />}
    </div>
  );
}
