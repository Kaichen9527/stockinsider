'use client';

import { useEffect, useRef } from 'react';
import { ColorType, createChart, LineSeries, type Time } from 'lightweight-charts';
import type { CandidateDetailPayload } from './candidate-detail';
import { isHistoryDate } from './candidate-price-history';

type Point = { time: Time; value: number };

function date(value: string | undefined) {
  return isHistoryDate(value) ? value as Time : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function series(points: Point[], key: string, rows: CandidateDetailPayload['valuation']['historicalPrices'], frequency?: 'daily' | 'monthly') {
  for (const row of rows || []) {
    if (frequency && row.frequency !== frequency) continue;
    if (key !== 'close' && row.frequency !== 'daily') continue;
    const time = date(row.date || row.month);
    const value = row[key as keyof typeof row];
    if (time && finite(value)) points.push({ time, value });
  }
}

function Chart({ id, title, datasets, empty }: { id: string; title: string; datasets: Array<{ label: string; color: string; points: Point[] }>; empty: string }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target.current || !datasets.some((item) => item.points.length)) return;
    const chart = createChart(target.current, {
      height: 260, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#64748b' },
      grid: { vertLines: { color: 'rgba(148,163,184,.16)' }, horzLines: { color: 'rgba(148,163,184,.16)' } },
      rightPriceScale: { borderColor: 'rgba(148,163,184,.3)' }, timeScale: { borderColor: 'rgba(148,163,184,.3)' },
    });
    for (const item of datasets) {
      if (!item.points.length) continue;
      const line = chart.addSeries(LineSeries, { color: item.color, lineWidth: item.label.includes('收盤') ? 2 : 1, title: item.label });
      const unique = [...new Map(item.points.map((point) => [String(point.time), point])).values()];
      line.setData(unique.sort((a, b) => String(a.time).localeCompare(String(b.time))));
    }
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width }));
    observer.observe(target.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [datasets]);
  return <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
    <h3 id={id} className="text-base font-semibold">{title}</h3>
    {datasets.some((item) => item.points.length) ? <><div ref={target} className="mt-3 w-full" />
      <p className="mt-2 text-xs text-slate-500">圖表由 <a className="underline" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> 繪製。</p></> : <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{empty}</p>}
  </section>;
}

export default function CandidateHistoryChart({ detail }: { detail: CandidateDetailPayload }) {
  const prices = detail.valuation.historicalPrices || [];
  const multiples = detail.valuation.historicalMultiples || [];
  const dailyClose: Point[] = []; const monthlyClose: Point[] = []; const ma5: Point[] = []; const ma20: Point[] = []; const ma60: Point[] = []; const ma120: Point[] = []; const ma240: Point[] = [];
  series(dailyClose, 'close', prices, 'daily'); series(monthlyClose, 'close', prices, 'monthly');
  series(ma5, 'ma5', prices, 'daily'); series(ma20, 'ma20', prices, 'daily'); series(ma60, 'ma60', prices, 'daily'); series(ma120, 'ma120', prices, 'daily'); series(ma240, 'ma240', prices, 'daily');
  const pe: Point[] = []; const pb: Point[] = [];
  for (const row of multiples) { const time = date(row.date); if (time && finite(row.peRatio)) pe.push({ time, value: row.peRatio }); if (time && finite(row.pbRatio)) pb.push({ time, value: row.pbRatio }); }
  const priceMonths = new Set([...dailyClose, ...monthlyClose].map((point) => String(point.time).slice(0, 7))).size;
  const priceCoverage = `${priceMonths} 個月份有資料（不代表交易日完整）`;
  const peMonths = new Set(pe.map((point) => String(point.time).slice(0, 7))).size;
  const pbMonths = new Set(pb.map((point) => String(point.time).slice(0, 7))).size;
  const multipleCoverage = `PE ${peMonths}/60、PB ${pbMonths}/60 個月；各自不足 48 月不作歷史分位比較`;
  return <section className="mt-8 space-y-4"><div><p className="research-kicker">HISTORICAL EVIDENCE</p><h2 className="mt-2 text-xl font-semibold">歷史價格與技術圖表</h2><p className="mt-1 text-sm text-slate-500">價格覆蓋：{priceCoverage}；PE/PB 覆蓋：{multipleCoverage}。日線、月線與均線分開呈現；只使用真實交易日，資料不足不補造。</p></div>
    <Chart id="candidate-price-history" title="日線收盤與均線" datasets={[{ label: '日收盤', color: '#1c1917', points: dailyClose }, { label: 'MA5', color: '#f59e0b', points: ma5 }, { label: 'MA20', color: '#c4531b', points: ma20 }, { label: 'MA60', color: '#2563eb', points: ma60 }, { label: 'MA120', color: '#7c3aed', points: ma120 }, { label: 'MA240', color: '#64748b', points: ma240 }]} empty="此 revision 尚無可驗證的日線／均線序列。" />
    <Chart id="candidate-monthly-price-history" title="月末交易日收盤" datasets={[{ label: '月收盤', color: '#c4531b', points: monthlyClose }]} empty="此 revision 尚無真實月末交易日序列。" />
    <Chart id="candidate-multiple-history" title="PE／PB 區間" datasets={[{ label: 'PE', color: '#2563eb', points: pe }, { label: 'PB', color: '#9333ea', points: pb }]} empty="歷史 PE／PB 序列仍待補入此 revision。" />
  </section>;
}
