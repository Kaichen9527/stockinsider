import Link from 'next/link';
import { getDailyDashboardData } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { marketFocus, recommendations, riskDisclosure } = await getDailyDashboardData();

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 font-sans">
      <header className="mb-12 border-b border-gray-800 pb-6">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          StockInsider
        </h1>
        <p className="text-gray-400 mt-2">TW primary + US secondary opportunity engine.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <section className="col-span-1 bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-xl">
          <h2 className="text-2xl font-bold mb-4 text-emerald-400">Market Focus</h2>
          <div className="space-y-4">
            {marketFocus.map((focus) => (
              <div key={focus.market} className="border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-white">{focus.market}</p>
                  <span className={`px-2 py-0.5 rounded text-xs ${focus.freshness === 'fresh' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>
                    {focus.freshness}
                  </span>
                </div>
                <p className="text-xs text-gray-500">as of {new Date(focus.asOf).toLocaleString()}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(focus.sectorFlows)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([sector, value]) => (
                      <span key={sector} className="px-2 py-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-800 rounded-full">
                        {sector} {Math.round(value * 100)}%
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-1 md:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-xl">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Recommended Strategies</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Target / Stop</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => (
                  <tr key={rec.recommendationId} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-mono font-bold">{rec.symbol}</p>
                      <p className="text-xs text-gray-500">{rec.name}</p>
                    </td>
                    <td className="py-4 px-4 uppercase text-sm">{rec.action}</td>
                    <td className="py-4 px-4 text-emerald-400">{rec.score.toFixed(2)}</td>
                    <td className="py-4 px-4 text-blue-300">{(rec.confidence * 100).toFixed(0)}%</td>
                    <td className="py-4 px-4 text-sm">
                      <p className="text-emerald-400">T {rec.targetPrice ? rec.targetPrice.toFixed(2) : '-'}</p>
                      <p className="text-red-400">S {rec.stopLoss ? rec.stopLoss.toFixed(2) : '-'}</p>
                    </td>
                    <td className="py-4 px-4 text-xs text-gray-300">{rec.strategyState || '-'}</td>
                    <td className="py-4 px-4">
                      <Link href={`/stock/${rec.symbol}`} className="text-blue-400 hover:text-blue-300 hover:underline">
                        View Insight
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="mt-8 text-xs text-gray-500 border-t border-gray-800 pt-4">{riskDisclosure}</p>
    </main>
  );
}
