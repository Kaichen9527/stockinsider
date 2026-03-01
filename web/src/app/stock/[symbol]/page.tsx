import Link from 'next/link';
import { notFound } from 'next/navigation';
import StockChart from '@/components/StockChart';
import { getStockInsight } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export default async function StockDetail({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const insight = await getStockInsight(symbol.toUpperCase());

  if (!insight) {
    notFound();
  }

  const indicators = insight.indicators;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 font-sans">
      <header className="mb-8 border-b border-gray-800 pb-4">
        <Link href="/" className="text-blue-400 hover:text-blue-300 mb-4 inline-block">
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Stock Insight: <span className="text-emerald-400">{insight.symbol}</span>
        </h1>
        <p className="text-gray-400 mt-2">
          {insight.name} · {insight.market} · {new Date(insight.asOf).toLocaleString()} · freshness {insight.freshness}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-xl">
          <h2 className="text-xl font-bold mb-4 text-white">K-Line (derived from latest signals)</h2>
          <StockChart data={insight.chart} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">MA(5)</p>
              <p className="font-semibold">{indicators.maShort?.toFixed(2) ?? '-'}</p>
            </div>
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">MA(20)</p>
              <p className="font-semibold">{indicators.maMid?.toFixed(2) ?? '-'}</p>
            </div>
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">RSI(14)</p>
              <p className="font-semibold">{indicators.rsi?.toFixed(2) ?? '-'}</p>
            </div>
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">MACD</p>
              <p className="font-semibold">{indicators.macd?.toFixed(4) ?? '-'}</p>
            </div>
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">MACD Signal</p>
              <p className="font-semibold">{indicators.macdSignal?.toFixed(4) ?? '-'}</p>
            </div>
            <div className="p-3 rounded bg-gray-800/40 border border-gray-700">
              <p className="text-xs text-gray-400">Price</p>
              <p className="font-semibold text-emerald-400">{insight.price.toFixed(2)}</p>
            </div>
          </div>
        </section>

        <section className="col-span-1 space-y-8">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-blue-400">Strategy</h2>
            {insight.strategy ? (
              <div className="space-y-3">
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">State</span>
                  <span className="font-semibold">{insight.strategy.state}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Target Price</span>
                  <span className="text-emerald-400 font-bold">{insight.strategy.targetPrice?.toFixed(2) ?? '-'}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Stop Loss</span>
                  <span className="text-red-400 font-bold">{insight.strategy.stopLoss?.toFixed(2) ?? '-'}</span>
                </div>
                <div className="text-sm text-gray-300 pt-1">Entry: {insight.strategy.entryRule}</div>
                <div className="text-sm text-gray-300">Position: {insight.strategy.positionSizeRule}</div>
                <div className="text-sm text-gray-300">Review: {insight.strategy.reviewHorizon || '-'}</div>
              </div>
            ) : (
              <p className="text-gray-400">No active strategy.</p>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-fuchsia-400">Chip Metrics</h2>
            <div className="space-y-2 text-sm text-gray-300">
              {Object.entries(insight.chipMetrics).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-gray-800 py-1">
                  <span className="text-gray-400">{key}</span>
                  <span>{String(value ?? '-')}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <p className="mt-8 text-xs text-gray-500 border-t border-gray-800 pt-4">{insight.riskDisclosure}</p>
    </main>
  );
}
