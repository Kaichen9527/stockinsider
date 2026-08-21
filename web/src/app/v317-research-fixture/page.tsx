import { notFound } from 'next/navigation';
import { RadarTabs } from '@/app/components/RadarTabs';
import type { RadarDailyPayload } from '@/lib/types';
import { v317ResearchDataNeededFixture, v317ResearchOnlyFixture } from '../v313-decision-fixture/fixture-data';

export const dynamic='force-dynamic';

const radar={asOf:'2026-08-20T10:20:00Z',opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],
  hotTracking:[],hotThemes:[],discoveredStocks:[],reports:[],sourceSignals:[v317ResearchOnlyFixture,v317ResearchDataNeededFixture],
  sourceLedCorrectness:{schema:'legacy-radar-v3.17.0',window:'home',asOf:'2026-08-20T10:20:00Z'},
  projectionHealth:{status:'stale_readonly',integrityStatus:'valid',freshnessStatus:'stale_readonly',
    researchVisibility:'last_good_readonly',actionAuthority:'disabled',actionsEnabled:false,missedExpectedRuns:1,
    actionBlockers:['projection_stale','frozen_acquisition_authority_unavailable']},
  riskDisclosure:'fixture'} as unknown as RadarDailyPayload;

export default function V317ResearchFixturePage(){
  if(process.env.OPPORTUNITY_V3_UI_FIXTURE!=='enabled')notFound();
  return <main className="min-h-screen bg-background px-4 py-6 text-foreground" aria-label="V3.17 source-led research fixture">
    <h1 className="text-xl font-semibold">V3.17 來源導向研究快照</h1><RadarTabs radar={radar}/>
  </main>;
}
