'use client';

import { useEffect, useRef } from 'react';
import { ColorType, createChart, LineSeries, type Time } from 'lightweight-charts';
import type { CandidateDetailPayload } from './candidate-detail';

type Point = { time: Time; value: number };

function date(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) as Time : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function series(points: Point[], key: string, rows: CandidateDetailPayload['valuation']['historicalPrices']) {
  for (const row of rows || []) {
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
      const line = chart.addSeries(LineSeries, { color: item.color, lineWidth: item.label === '收盤價' ? 2 : 1, title: item.label });
      line.setData(item.points.sort((a, b) => String(a.time).localeCompare(String(b.time))));
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
  const close: Point[] = []; const ma5: Point[] = []; const ma20: Point[] = []; const ma60: Point[] = []; const ma120: Point[] = []; const ma240: Point[] = [];
  series(close, 'close', prices); series(ma5, 'ma5', prices); series(ma20, 'ma20', prices); series(ma60, 'ma60', prices); series(ma120, 'ma120', prices); series(ma240, 'ma240', prices);
  const pe: Point[] = []; const pb: Point[] = [];
  for (const row of multiples) { const time = date(row.date); if (time && finite(row.peRatio)) pe.push({ time, value: row.peRatio }); if (time && finite(row.pbRatio)) pb.push({ time, value: row.pbRatio }); }
  const priceCoverage = close.length >= 60 ? `${close.length} 個月（五年覆蓋）` : `${close.length} 個月（未達五年）`;
  const multipleCoverage = multiples.length >= 48 ? `${multiples.length}/60 個月` : `${multiples.length}/60 個月，未宣稱完整五年比較`;
  return <section className="mt-8 space-y-4"><div><h2 className="text-xl font-semibold">歷史價格與技術圖表</h2><p className="mt-1 text-sm text-slate-500">價格覆蓋：{priceCoverage}；PE/PB 覆蓋：{multipleCoverage}。均線只繪製資料中已驗證的序列，資料不足不補造。</p></div>
    <Chart id="candidate-price-history" title="價格與均線" datasets={[{ label: '收盤價', color: '#0f766e', points: close }, { label: 'MA5', color: '#f59e0b', points: ma5 }, { label: 'MA20', color: '#3b82f6', points: ma20 }, { label: 'MA60', color: '#8b5cf6', points: ma60 }, { label: 'MA120', color: '#ec4899', points: ma120 }, { label: 'MA240', color: '#64748b', points: ma240 }]} empty="五年價格／均線序列仍待補入此 revision。" />
    <Chart id="candidate-multiple-history" title="PE／PB 區間" datasets={[{ label: 'PE', color: '#2563eb', points: pe }, { label: 'PB', color: '#9333ea', points: pb }]} empty="歷史 PE／PB 序列仍待補入此 revision。" />
  </section>;
}
