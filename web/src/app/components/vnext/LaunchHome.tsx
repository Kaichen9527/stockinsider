import Link from 'next/link';
import {readLaunchRankingSnapshot,type LaunchRankingRead} from '@/lib/vnext/launch-ranking-read';
import LaunchTop10 from './LaunchTop10';

export function LaunchHomeView({read}:{read:LaunchRankingRead}) {
  const market=read.snapshot?.market;
  const labels={risk_on:'依個股證據評估',selective:'選擇性評估',risk_off:'等待市場風險緩和',breakdown:'等待市場條件修復',unknown:'無法判定'};
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="launch-home" data-policy-version="stockinsider-launch-radar-v1">
    <header><Link href="/" className="text-2xl font-semibold">StockInsider</Link><p className="mt-2 text-sm">強勢發動雷達 · 有證據才有判斷</p></header>
    <section aria-label="原榜單市場判斷" className="rounded-2xl border border-slate-300 p-5" data-testid="launch-market">
      <h1 className="text-xl font-semibold">原榜單市場判斷</h1><p className="mt-3 text-2xl font-semibold">{market?labels[market.risk]:'無法判定'}</p>
      <p className="mt-2">台股交易日：{market?.session||'尚無已發布資料'} · 資料信心：{market?.confidence==='complete'?'完整':market?.confidence==='limited'?'有限':'不足'}</p>
      {market&&<p className="mt-2 text-sm">原始市場資料時間：<time>{market.sourceAt}</time> · 原核對有效至 <time>{market.expiresAt}</time>。此為原榜單的歷史判斷。</p>}
      {market?.reasons.length?<ul className="mt-3 list-disc pl-5">{market.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>:<p className="mt-3">等待可核對的市場與個股證據。</p>}
      {market?.conditions.length?<details className="mt-3"><summary>等待與轉換條件</summary><ul className="mt-2 list-disc pl-5">{market.conditions.map((reason,index)=><li key={index}>{reason}</li>)}</ul></details>:null}
    </section>
    <section aria-label="強勢發動研究標的" aria-labelledby="launch-research-title" className="rounded-2xl border border-slate-300 p-5"><LaunchTop10 read={read}/></section>
  </main>;
}
export default async function LaunchHome(){
  let read:LaunchRankingRead;
  try{read=await readLaunchRankingSnapshot();}catch{read={availability:'unavailable',reason:'launch_ranking_read_unavailable',readAt:new Date().toISOString(),snapshot:null,current:[],detail:null};}
  return <LaunchHomeView read={read}/>;
}
