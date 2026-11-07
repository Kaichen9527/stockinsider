'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickData, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { calendarStockCandles, selectStockChartSeries } from '../lib/stock-chart-calendar';

interface ChartProps {
  data: CandlestickData[];
  timeframeCharts?: {
    daily: CandlestickData[];
    weekly: CandlestickData[];
    monthly: CandlestickData[];
    quarterly: CandlestickData[];
    halfYear: CandlestickData[];
    yearly: CandlestickData[];
  };
  missingReason?: string | null;
  height?: number;
}

type TimeframeKey = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'halfYear' | 'yearly';

const timeframeLabel: Record<TimeframeKey, string> = {
  daily: '日線',
  weekly: '週線',
  monthly: '月線',
  quarterly: '季線',
  halfYear: '半年線',
  yearly: '年線',
};

function buildMaSeries(candles: CandlestickData[], period: number) {
  const output: Array<{ time: CandlestickData['time']; value: number }> = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const slice = candles.slice(index - period + 1, index + 1);
    const closes = slice.map((item) => Number(item.close)).filter((value) => Number.isFinite(value));
    if (closes.length !== period) continue;
    output.push({
      time: candles[index].time,
      value: closes.reduce((sum, value) => sum + value, 0) / period,
    });
  }
  return output;
}

export default function StockChart({ data, timeframeCharts, missingReason, height = 390 }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<TimeframeKey>('daily');
  const [calendarCutoff, setCalendarCutoff] = useState<string>();

  const normalizedDaily = useMemo(() => {
    return [...data]
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .reduce<Map<string, CandlestickData>>((acc, candle) => {
        acc.set(String(candle.time), candle);
        return acc;
      }, new Map<string, CandlestickData>());
  }, [data]);

  const dataset = useMemo(() => {
    if (timeframeCharts) return { charts: timeframeCharts, calendar: null, calendarError: false };
    try {
      const calendar = {
        weekly: calendarStockCandles(data, 'weekly', calendarCutoff),
        monthly: calendarStockCandles(data, 'monthly', calendarCutoff),
        quarterly: calendarStockCandles(data, 'quarterly', calendarCutoff),
        halfYear: calendarStockCandles(data, 'halfYear', calendarCutoff),
        yearly: calendarStockCandles(data, 'yearly', calendarCutoff),
      };
      return { charts: { daily: Array.from(normalizedDaily.values()), weekly: calendar.weekly.candles,
        monthly: calendar.monthly.candles, quarterly: calendar.quarterly.candles,
        halfYear: calendar.halfYear.candles, yearly: calendar.yearly.candles }, calendar, calendarError: false };
    } catch {
      return { charts: { daily: Array.from(normalizedDaily.values()), weekly: [], monthly: [], quarterly: [], halfYear: [], yearly: [] }, calendar: null, calendarError: true };
    }
  }, [data, normalizedDaily, timeframeCharts, calendarCutoff]);

  const selectedData = useMemo(() => selectStockChartSeries(dataset.charts, timeframe, Array.from(normalizedDaily.values())), [dataset, timeframe, normalizedDaily]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      width: chartContainerRef.current.clientWidth,
      height,
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' },
      },
      crosshair: {
        vertLine: { color: '#4B5563' },
        horzLine: { color: '#4B5563' },
      },
    });
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34D399',
      downColor: '#F87171',
      borderVisible: false,
      wickUpColor: '#34D399',
      wickDownColor: '#F87171',
    });

    series.setData(selectedData);
    const maConfig: Array<{ period: number; color: string }> = [
      { period: 5, color: '#22D3EE' },
      { period: 10, color: '#6366F1' },
      { period: 20, color: '#F59E0B' },
      { period: 60, color: '#10B981' },
      { period: 120, color: '#EF4444' },
      { period: 240, color: '#8B5CF6' },
    ];
    for (const item of maConfig) {
      const maSeries = chart.addSeries(LineSeries, {
        color: item.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      maSeries.setData(buildMaSeries(selectedData, item.period));
    }
    chart.timeScale().fitContent();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, selectedData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(timeframeLabel) as TimeframeKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setCalendarCutoff(new Date().toISOString()); setTimeframe(key); }}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              timeframe === key
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-slate-600 hover:bg-black/5 dark:text-emerald-100/70 dark:hover:bg-white/5'
            }`}
          >
            {timeframeLabel[key]}
          </button>
        ))}
      </div>

      {timeframeCharts && (timeframe === 'weekly' || timeframe === 'monthly') && <p className="text-xs text-slate-500" role="status">本期完成狀態與交易日覆蓋尚未提供，請以來源資料為準。</p>}
      {!timeframeCharts && (timeframe === 'weekly' || timeframe === 'monthly') && <p className="text-xs text-slate-500" role="status">
        {dataset.calendarError ? '期別資料有衝突或格式不完整，暫不繪製。' : <>
          依台灣曆{timeframe === 'weekly' ? '週' : '月'}聚合；只含已提供交易日，歷史期別不代表資料完整。
          {dataset.calendar?.[timeframe].periods.some(period => period.provisional === true) ? '本期尚未完成（暫定）。'
            : calendarCutoff === undefined ? '本期完成狀態待確認。' : ''}
        </>}
      </p>}
      {selectedData.length > 0 ? (
        <div ref={chartContainerRef} className="w-full overflow-hidden rounded-lg border border-gray-800" style={{ height }} />
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-gray-700 bg-black/5 px-6 text-center text-sm leading-7 text-slate-600 dark:text-emerald-100/60"
          style={{ height }}
        >
          {missingReason || `目前還沒有足夠的${timeframeLabel[timeframe]}資料可繪製 K 線圖。`}
        </div>
      )}
    </div>
  );
}
