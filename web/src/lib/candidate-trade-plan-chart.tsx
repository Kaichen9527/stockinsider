'use client';

import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type Time } from 'lightweight-charts';
import type { TwEntryPlanBundle } from './tw-entry-plan-contract';
import { tradeStrategyLabel } from './tw-entry-plan-display';

function verifiedBars(bundle: TwEntryPlanBundle) {
  if (!bundle.ohlcv.length || !bundle.plans.length || !bundle.plans.every((plan) => plan.priceBasis?.status === 'verified')) return false;
  return bundle.ohlcv.every((bar, index, rows) => /^\d{4}-\d{2}-\d{2}$/.test(bar.session)
    && (index === 0 || rows[index - 1].session < bar.session)
    && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
    && Number.isFinite(bar.volume) && bar.volume >= 0 && bar.high >= Math.max(bar.open, bar.close, bar.low)
    && bar.low <= Math.min(bar.open, bar.close));
}

export default function CandidateTradePlanChart({ bundle }: { bundle: TwEntryPlanBundle }) {
  const target = useRef<HTMLDivElement>(null);
  const [strategy, setStrategy] = useState<'breakout' | 'pullback'>('breakout');
  const [showMa, setShowMa] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showPlan, setShowPlan] = useState(true);
  const valid = verifiedBars(bundle);
  const selected = bundle.plans.find((plan) => plan.strategyId === strategy) ?? bundle.plans[0];

  useEffect(() => {
    if (!valid || !target.current || !selected) return;
    const chart = createChart(target.current, {
      height: 430, width: target.current.clientWidth,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#64748b' },
      grid: { vertLines: { color: 'rgba(148,163,184,.15)' }, horzLines: { color: 'rgba(148,163,184,.15)' } },
      rightPriceScale: { borderColor: '#cbd5e1' },
      timeScale: { borderColor: '#cbd5e1', rightOffset: 3 },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#dc2626', downColor: '#059669', wickUpColor: '#dc2626', wickDownColor: '#059669', borderVisible: false, lastValueVisible: false, priceLineVisible: false });
    const rows = bundle.ohlcv;
    candles.setData(rows.map((bar) => ({ time: bar.session as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    volume.setData(rows.map((bar) => ({ time: bar.session as Time, value: bar.volume, color: bar.close >= bar.open ? '#dc262680' : '#05966980' })));
    chart.panes()[1].setHeight(90);
    if (showMa) {
      for (const [key, color, title] of [['ma20', '#f59e0b', 'MA20'], ['ma60', '#2563eb', 'MA60']] as const) {
        const ma = chart.addSeries(LineSeries, { color, title, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        ma.setData(rows.filter((bar) => bar[key] != null && Number.isFinite(bar[key])).map((bar) => ({ time: bar.session as Time, value: bar[key]! })));
      }
    }
    if (showStructure) {
      for (const structure of bundle.structures.filter((item) => selected.structureIds.includes(item.structureId))) {
        const line = chart.addSeries(LineSeries, { color: structure.kind === 'prior20_resistance' ? '#7c3aed' : '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
        line.setData([{ time: structure.startSession as Time, value: structure.anchorValue }, ...(structure.endSession > structure.startSession ? [{ time: structure.endSession as Time, value: structure.anchorValue }] : [])]);
      }
    }
    if (showPlan && selected.signalSession && selected.validFromSession) {
      for (const [value, color] of [[selected.entryLower, '#0284c7'], [selected.entryUpper, '#0284c7'], [selected.invalidationPrice, '#be123c']] as const) {
        if (value == null || !Number.isFinite(value)) continue;
        const line = chart.addSeries(LineSeries, { color, lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
        line.setData([{ time: selected.signalSession as Time, value }, { time: selected.validFromSession as Time, value }]);
      }
    }
    if (selected.rawSignalState === 'confirmed' && selected.signalSession && rows.some((bar) => bar.session === selected.signalSession)) {
      createSeriesMarkers(candles, [{ time: selected.signalSession as Time, position: 'belowBar', color: '#0284c7', shape: 'arrowUp', text: '技術確認' }]);
    }
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(([entry]) => {
      const range = chart.timeScale().getVisibleLogicalRange();
      chart.applyOptions({ width: entry.contentRect.width });
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });
    observer.observe(target.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [bundle, selected, valid, showMa, showStructure, showPlan]);

  return <section aria-labelledby="trade-chart-title" data-testid="trade-plan-chart" className="min-w-0 overflow-hidden rounded-2xl border border-line bg-[var(--surface)] p-4 sm:p-5">
    <h3 id="trade-chart-title" className="text-base font-semibold">日 K 線與條件價格</h3>
    <p className="mt-2 text-xs leading-5 text-stone-500">同一研究版本的已驗證行情。紅漲綠跌；虛線為當時計算的條件邊界，不代表預測走勢或已成交。歷史計畫不延長有效期。</p>
    {!valid ? <p data-testid="trade-chart-missing" className="mt-4 rounded-xl border border-dashed border-amber-300 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200">這份研究版本缺少完整且尺度已驗證的 OHLCV，無法繪製 K 線或交易區間。既有收盤折線圖仍可作歷史參考。</p> : <>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="圖表策略">
        {bundle.plans.map((plan) => <button key={plan.strategyId} type="button" aria-pressed={strategy === plan.strategyId} onClick={() => setStrategy(plan.strategyId)} className={`min-h-11 rounded-full border px-4 text-sm ${strategy === plan.strategyId ? 'border-orange-500 bg-orange-500/10 font-semibold' : 'border-line'}`}>{tradeStrategyLabel[plan.strategyId]}</button>)}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs"><legend className="sr-only">圖層</legend>
        {([['均線', showMa, setShowMa], ['水平支撐壓力', showStructure, setShowStructure], ['計畫邊界', showPlan, setShowPlan]] as const).map(([label, checked, setChecked]) => <label key={label} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />{label}</label>)}
      </fieldset>
      <div ref={target} data-testid="trade-candlestick-canvas" role="img" aria-label={`${tradeStrategyLabel[selected.strategyId]}：日 K 線、成交量、均線與條件邊界；數值詳見上方計畫卡`} className="mt-2 min-w-0 w-full" />
      <ul aria-label="圖例" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600 dark:text-stone-400"><li>橙／藍：MA20／60</li><li>紫／灰：前 20 日壓力／支撐</li><li>淺藍虛線：進場區間上下限</li><li>紅虛線：初始失效線</li><li>箭頭：收盤技術確認</li></ul>
      <p className="mt-3 text-xs leading-5 text-stone-500">支撐壓力使用訊號日以前的 20 日高低點，於訊號收盤後才可知；不是已辨識的箱體。未畫未來 K 線。圖表由 <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="underline">TradingView Lightweight Charts™</a> 繪製。</p>
    </>}
  </section>;
}
