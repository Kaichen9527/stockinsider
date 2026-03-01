'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickData, CandlestickSeries } from 'lightweight-charts';

interface ChartProps {
    data: CandlestickData[];
}

export default function StockChart({ data }: ChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9CA3AF',
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            grid: {
                vertLines: { color: '#1F2937' },
                horzLines: { color: '#1F2937' },
            },
        });
        chart.timeScale().fitContent();

        const handleResize = () => {
            if (!chartContainerRef.current) return;
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        };

        const newSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#34D399',
            downColor: '#F87171',
            borderVisible: false,
            wickUpColor: '#34D399',
            wickDownColor: '#F87171',
        });

        // Sort data by time ascending just in case
        newSeries.setData(data);

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data]);

    return (
        <div
            ref={chartContainerRef}
            className="w-full h-[400px] border border-gray-800 rounded-lg overflow-hidden"
        />
    );
}
