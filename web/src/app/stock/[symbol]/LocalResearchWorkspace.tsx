'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LOCAL_RESEARCH_STORAGE_KEY,
  calculatePosition,
  decodeLocalResearchState,
  emptyLocalResearchState,
  parseLocalResearchState,
  type LocalResearchDecision,
  type LocalResearchState,
} from '@/lib/local-research-state';

type Props = {
  symbol: string;
  revisionId: string;
  currentPrice: number | null;
  atr14: number | null;
  baseTarget: number | null;
};

function shownNumber(value: number | null, digits = 0) {
  return value == null || !Number.isFinite(value) ? '未評估' : value.toLocaleString('zh-TW', { maximumFractionDigits: digits });
}

export default function LocalResearchWorkspace({ symbol, revisionId, currentPrice, atr14, baseTarget }: Props) {
  const [state, setState] = useState<LocalResearchState>(() => emptyLocalResearchState());
  const [ready, setReady] = useState(false);
  const [revisionChanged, setRevisionChanged] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const key = `${symbol}:${revisionId}`;
  const simulation = state.simulations[key];
  const decision = state.decisions[key];
  const isWatched = state.watchlist.includes(symbol);

  useEffect(() => {
    const loaded = decodeLocalResearchState(window.localStorage.getItem(LOCAL_RESEARCH_STORAGE_KEY) || '');
    setRevisionChanged(Boolean(loaded.lastSeenRevisionBySymbol[symbol] && loaded.lastSeenRevisionBySymbol[symbol] !== revisionId));
    setState({ ...loaded, lastSeenRevisionBySymbol: { ...loaded.lastSeenRevisionBySymbol, [symbol]: revisionId } });
    setReady(true);
  }, [revisionId, symbol]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(LOCAL_RESEARCH_STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const defaults = {
    entryPrice: simulation?.entryPrice ?? currentPrice,
    stopPrice: simulation?.stopPrice ?? (currentPrice && atr14 ? Math.max(0.01, currentPrice - atr14 * 2) : null),
    capital: simulation?.capital ?? null,
    maxLoss: simulation?.maxLoss ?? null,
  };
  const position = calculatePosition({ ...defaults, baseTarget });

  const updateSimulation = (field: 'entryPrice' | 'stopPrice' | 'capital' | 'maxLoss', raw: string) => {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    setState((current) => ({ ...current, simulations: { ...current.simulations, [key]: {
      symbol, revisionId, entryPrice: defaults.entryPrice, stopPrice: defaults.stopPrice,
      capital: defaults.capital, maxLoss: defaults.maxLoss, [field]: next, updatedAt: new Date().toISOString(),
    } } }));
  };
  const updateDecision = (next: LocalResearchDecision, note = decision?.note || '') => setState((current) => ({
    ...current, decisions: { ...current.decisions, [key]: { symbol, revisionId, decision: next, note, updatedAt: new Date().toISOString() } },
  }));
  const exportState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `stockinsider-personal-research-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
  };
  const importState = async (file: File | undefined) => {
    if (!file) return;
    try { setState(parseLocalResearchState(JSON.parse(await file.text()))); }
    catch { window.alert('匯入失敗：檔案不是有效的 StockInsider 個人研究資料。'); }
  };
  const clearState = () => {
    if (!window.confirm('確定清除這個瀏覽器中的全部自選、試算與個人決定？此動作無法復原。')) return;
    setState(emptyLocalResearchState());
  };

  return (
    <section aria-labelledby="personal-research-title" className="decision-panel mt-6 overflow-hidden">
      <div className="border-b border-line bg-stone-950 px-5 py-5 text-stone-50 sm:px-7">
        <p className="research-kicker text-orange-300">LOCAL RESEARCH DESK</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="personal-research-title" className="text-xl font-semibold">進場條件與個人試算</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-300">資料只保存在這個瀏覽器，不會寫入共用研究資料庫，也不會改變系統分類或代你下單。</p>
          </div>
          <button type="button" onClick={() => setState((current) => ({ ...current, watchlist: isWatched ? current.watchlist.filter((item) => item !== symbol) : [...new Set([...current.watchlist, symbol])] }))} className="min-h-11 rounded-full border border-stone-600 px-4 text-sm font-semibold hover:border-orange-300">
            {isWatched ? '★ 已加入自選' : '☆ 加入自選'}
          </button>
        </div>
        {revisionChanged ? <p role="status" className="mt-3 rounded-xl border border-orange-300/40 bg-orange-300/10 px-3 py-2 text-xs text-orange-100">這檔股票有新的研究版本；下方試算仍綁定目前 revision，請重新檢查假設。</p> : null}
      </div>
      <div className="grid gap-px bg-line lg:grid-cols-[1.25fr_.75fr]">
        <div className="bg-[var(--surface-strong)] p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['entryPrice', '假設進場價', defaults.entryPrice], ['stopPrice', '假設停損價', defaults.stopPrice],
              ['capital', '可用資金', defaults.capital], ['maxLoss', '可承受損失', defaults.maxLoss],
            ] as const).map(([field, label, fieldValue]) => <label key={field} className="min-w-0 text-xs font-medium text-stone-600 dark:text-stone-300">{label}
              <input inputMode="decimal" type="number" min="0" step="any" value={fieldValue ?? ''} placeholder="自行輸入" onChange={(event) => updateSimulation(field, event.target.value)} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-line bg-[var(--surface)] px-3 text-base text-[var(--foreground)] outline-none focus:border-orange-500" />
            </label>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">進場價預填最近官方收盤；停損距離有 ATR 時預填 2×ATR14。兩者都是可修改假設，不是系統指示。</p>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            <div className="bg-[var(--surface)] p-3"><dt className="text-xs text-stone-500">試算股數</dt><dd className="mt-1 font-semibold">{shownNumber(position?.shares ?? null)} 股</dd></div>
            <div className="bg-[var(--surface)] p-3"><dt className="text-xs text-stone-500">組合曝險</dt><dd className="mt-1 font-semibold">NT${shownNumber(position?.exposure ?? null)}</dd></div>
            <div className="bg-[var(--surface)] p-3"><dt className="text-xs text-stone-500">停損風險</dt><dd className="mt-1 font-semibold">NT${shownNumber(position?.riskAmount ?? null)}</dd></div>
            <div className="bg-[var(--surface)] p-3"><dt className="text-xs text-stone-500">交易報酬風險比</dt><dd className="mt-1 font-semibold">{shownNumber(position?.tradeRewardRisk ?? null, 2)}</dd></div>
          </dl>
        </div>
        <div className="bg-[var(--surface)] p-5 sm:p-7">
          <h3 className="text-sm font-semibold">最後由你決定</h3>
          <div className="mt-3 grid gap-2" role="group" aria-label="個人決定">
            {([['watch', '觀察'], ['consider', '考慮行動'], ['skip', '略過']] as const).map(([next, label]) => <button key={next} type="button" aria-pressed={decision?.decision === next} onClick={() => updateDecision(next)} className={`min-h-11 rounded-xl border px-3 text-left text-sm font-semibold ${decision?.decision === next ? 'border-orange-500 bg-orange-500/10 text-orange-800 dark:text-orange-200' : 'border-line hover:border-orange-400'}`}>{label}</button>)}
          </div>
          <label className="mt-3 block text-xs text-stone-500">個人備註
            <textarea value={decision?.note || ''} onChange={(event) => updateDecision(decision?.decision || 'watch', event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-line bg-[var(--surface-strong)] p-3 text-sm text-[var(--foreground)] outline-none focus:border-orange-500" />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line bg-[var(--surface)] px-5 py-3 text-xs">
        <button type="button" onClick={exportState} className="min-h-10 rounded-full border border-line px-4 hover:border-orange-500">匯出個人資料</button>
        <button type="button" onClick={() => importRef.current?.click()} className="min-h-10 rounded-full border border-line px-4 hover:border-orange-500">匯入</button>
        <input ref={importRef} type="file" accept="application/json" className="sr-only" onChange={(event) => void importState(event.target.files?.[0])} />
        <button type="button" onClick={clearState} className="min-h-10 rounded-full border border-rose-300 px-4 text-rose-700 hover:bg-rose-50 dark:text-rose-300">清除本機資料</button>
        <span className="self-center text-stone-500">研究版本 {revisionId.slice(0, 8)}…</span>
      </div>
    </section>
  );
}
