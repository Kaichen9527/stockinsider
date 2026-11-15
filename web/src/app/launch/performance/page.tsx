import Link from 'next/link';
import {getSupabaseServerClient} from '@/lib/supabase-server';
import {readLaunchOutcomeCohorts,type LaunchOutcomeCohorts} from '@/lib/vnext/launch-outcome-cohorts';
import {launchRankingEnabled} from '@/lib/vnext/launch-ranking-read';
import LaunchPerformance from '@/app/components/vnext/LaunchPerformance';

export const dynamic='force-dynamic';

export default async function LaunchPerformancePage(){
  const enabled=launchRankingEnabled();
  let summary:LaunchOutcomeCohorts={status:'unavailable'};
  if(enabled){
    try{summary=await readLaunchOutcomeCohorts(getSupabaseServerClient());}
    catch{summary={status:'unavailable'};}
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100">
    <Link href="/" className="underline">返回強勢發動雷達</Link>
    <h1 className="text-2xl font-semibold">上榜成效統計</h1>
    {enabled?<LaunchPerformance summary={summary}/>:<p role="status">強勢發動雷達尚未啟用。</p>}
  </main>;
}
