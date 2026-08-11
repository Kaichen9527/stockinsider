import { notFound } from 'next/navigation';
import { RadarTabs } from '@/app/components/RadarTabs';
import type { RadarDailyPayload } from '@/lib/types';
import { v314StaleDecisionFixture } from '../v313-decision-fixture/fixture-data';

export const dynamic='force-dynamic';

const radar={asOf:'2026-08-08T11:09:55Z',opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],
  hotTracking:[],hotThemes:[],discoveredStocks:[],reports:[],sourceSignals:[v314StaleDecisionFixture],
  sourceLedCorrectness:{schema:'legacy-radar-v3.14.0',window:'home',asOf:'2026-08-08T11:09:55Z'},
  projectionHealth:{status:'stale_readonly',integrityStatus:'valid',freshnessStatus:'stale_readonly',
    researchVisibility:'last_good_readonly',actionAuthority:'disabled',actionsEnabled:false,missedExpectedRuns:1},
  riskDisclosure:'fixture'} as unknown as RadarDailyPayload;

export default function V314StaleDecisionFixturePage(){
  if(process.env.OPPORTUNITY_V3_UI_FIXTURE!=='enabled')notFound();
  return <main className="min-h-screen bg-background px-4 py-6 text-foreground"
    aria-label="V3.14 exact revision stale compatibility fixture">
    <h1 className="text-xl font-semibold">V3.14 過期決策唯讀詳情</h1><RadarTabs radar={radar}/>
  </main>;
}
