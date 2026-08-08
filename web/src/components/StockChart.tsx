'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickData, CandlestickSeries, LineSeries } from 'lightweight-charts';

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

function aggregateCandles(data: CandlestickData[], chunkSize: number) {
  if (chunkSize <= 1) return data;
  const output: CandlestickData[] = [];
  for (let index = 0; index < data.length; index += chunkSize) {
    const chunk = data.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    output.push({
      time: last.time,
      open: Number(first.open),
      high: Math.max(...chunk.map((item) => Number(item.high))),
      low: Math.min(...chunk.map((item) => Number(item.low))),
      close: Number(last.close),
    });
  }
  return output;
}

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

  const normalizedDaily = useMemo(() => {
    return [...data]
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .reduce<Map<string, CandlestickData>>((acc, candle) => {
        acc.set(String(candle.time), candle);
        return acc;
      }, new Map<string, CandlestickData>());
  }, [data]);

  const dataset = useMemo(() => {
    const fallbackCharts = {
      daily: Array.from(normalizedDaily.values()),
      weekly: aggregateCandles(Array.from(normalizedDaily.values()), 5),
      monthly: aggregateCandles(Array.from(normalizedDaily.values()), 21),
      quarterly: aggregateCandles(Array.from(normalizedDaily.values()), 63),
      halfYear: aggregateCandles(Array.from(normalizedDaily.values()), 126),
      yearly: aggregateCandles(Array.from(normalizedDaily.values()), 252),
    };
    return timeframeCharts || fallbackCharts;
  }, [normalizedDaily, timeframeCharts]);

  const selectedData = useMemo(() => {
    const rows = dataset[timeframe];
    if (rows && rows.length > 0) return rows;
    return Array.from(normalizedDaily.values());
  }, [dataset, timeframe, normalizedDaily]);

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
            onClick={() => setTimeframe(key)}
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

      {selectedData.length > 0 ? (
        <div ref={chartContainerRef} className="w-full overflow-hidden rounded-lg border border-gray-800" style={{ height }} />
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-gray-700 bg-black/5 px-6 text-center text-sm leading-7 text-slate-600 dark:text-emerald-100/60"
          style={{ height }}
        >
          {missingReason || '目前還沒有足夠的日線資料可繪製 K 線圖。'}
        </div>
      )}
    </div>
  );
}
