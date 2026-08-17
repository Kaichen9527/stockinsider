import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RadarTabs } from '@/app/components/RadarTabs';
import { v314ReadonlyRadar } from './fixture-data';

export const dynamic = 'force-dynamic';

export default function V314ReadonlyFixturePage() {
  if(process.env.OPPORTUNITY_V3_UI_FIXTURE!=='enabled')notFound();
  return <main className="min-h-screen bg-background px-4 py-6 text-foreground" aria-label="V3.14 readonly compatibility fixture">
    <h1 className="text-xl font-semibold">V3.14 last-good 唯讀相容性</h1>
    <RadarTabs radar={v314ReadonlyRadar}/>
    <section aria-label="研究報告"><Link data-testid="readonly-report-link" href="/stock/9000">[9000] 唯讀研究報告</Link></section>
  </main>;
}
