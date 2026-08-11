import { notFound } from 'next/navigation';
import { RadarTabs } from '@/app/components/RadarTabs';
import type { RadarDailyPayload } from '@/lib/types';
import { v313FixtureSignals } from './fixture-data';

export const dynamic = 'force-dynamic';

const radar = {
  asOf: '2026-08-07T06:30:00Z',
  opportunities: [], scenarioUpsideCandidates: [], earlyWatchlist: [], hotTracking: [], hotThemes: [], discoveredStocks: [],
  sourceSignals: v313FixtureSignals,
  sourceLedCorrectness: { schema:'legacy-radar-v3.13.0',window:'home',asOf:'2026-08-07T06:30:00Z' },
  projectionHealth: { status: 'fresh', missedExpectedRuns: 0 },
} as unknown as RadarDailyPayload;

export default function V313DecisionFixturePage() {
  if (process.env.OPPORTUNITY_V3_UI_FIXTURE !== 'enabled') notFound();
  return (
    <main className="min-h-screen min-w-0 bg-background px-4 py-6 text-foreground" aria-label="V3.13 decision integrity fixture">
      <h1 className="text-xl font-semibold">V3.13 決策資訊架構測試</h1>
      <RadarTabs radar={radar} />
    </main>
  );
}
