import Link from 'next/link';
import {launchDetailQuery,launchRankingEnabled,launchRankingMemberCurrent,readLaunchRankingSnapshot,type LaunchRankingRead} from '@/lib/vnext/launch-ranking-read';
import {launchAvailabilityText} from './LaunchTop10';
import LaunchCurrentStatus from './LaunchCurrentStatus';
import {readPublicLaunchOutcome} from '@/lib/vnext/launch-outcome-public';
import LaunchOutcomeSummary from './LaunchOutcomeSummary';
import StockChart from '@/components/StockChart';

const ruleNames:Record<string,string>={trend_close_above_ma50:'收盤高於 MA50',trend_ma50_above_ma200:'MA50 高於 MA200',trend_ma200_rising_5sessions:'MA200 較五個交易日前上升',
  trend_excess_return20_positive:'20 個交易日報酬高於同市場',trend_excess_return63_positive:'63 個交易日報酬高於同市場',consolidation_depth_within15pct:'前 25 日區間深度 ≤15%',
  consolidation_distance_within5pct:'距前 25 日高點 ≤5%',consolidation_prior_atr_ratio_within08:'先前 ATR5／ATR20 ≤0.8',consolidation_volume_ratio_within08:'近期與先前均量比 ≤0.8',
  breakout_or_fixed_closing_hold:'突破或固定原突破價的收盤守穩',chips_foreign5_positive:'外資近 5 日淨買超',chips_foreign20_positive:'外資近 20 日淨買超',
  chips_trust5_positive:'投信近 5 日淨買超',chips_trust20_positive:'投信近 20 日淨買超',market_close_above_ma50:'同市場指數高於 MA50',market_close_above_ma200:'同市場指數高於 MA200'};
export default async function LaunchDetail({symbol,query}:{symbol:string;query:Record<string,string|string[]|undefined>}) {
  const selection=launchDetailQuery(query);
  let read:LaunchRankingRead|null=null,invalid=selection.status==='invalid';
  const disabled=!launchRankingEnabled();
  if(!disabled&&!invalid){
    try{read=await readLaunchRankingSnapshot({symbol,...(selection.status==='bound'?{rankingRunId:selection.rankingRunId}:{})});}catch{read={availability:'unavailable',reason:null,readAt:new Date().toISOString(),snapshot:null,current:[],detail:null};}
  }
  const member=read?.snapshot?.members.find(item=>item.symbol===symbol),detail=read?.detail;
  if(selection.status==='bound'&&member&&(member.revisionId!==selection.revisionId||member.scoreRevision!==selection.scoreRevision))invalid=true;
  const outcome=!disabled&&!invalid&&read?.availability==='ready'&&read.snapshot&&member&&detail
    ?await readPublicLaunchOutcome({rankingRunId:read.snapshot.rankingRunId,symbol,signalSession:read.snapshot.session}):null;
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="launch-detail">
    <Link href="/" className="underline">返回強勢發動雷達</Link><h1 className="text-2xl font-semibold">{symbol} 強勢發動研究</h1>
    {disabled?<p role="status">強勢發動雷達尚未啟用。</p>:invalid?<p role="status">指定榜單與研究版本不存在或參數不一致。</p>:!member||!detail||!read?<p role="status">{read&&read.availability!=='ready'?launchAvailabilityText(read.availability):'指定研究尚無可讀取的已發布版本。'}</p>:<>
      <p data-testid="launch-ranking-binding">榜單原始時間：<time>{read!.snapshot!.cutoff}</time></p>
      <LaunchCurrentStatus key={`${member.launchQualificationRevision}:${read.current.find(row=>row.symbol===member.symbol)?.expiresAt}`} initialCurrent={launchRankingMemberCurrent(member,read.current,read.readAt)}
        readAt={read.readAt} expiresAt={read.current.find(row=>row.symbol===member.symbol)?.expiresAt??null}
        remainingMs={Math.max(0,Math.min(120000,Date.parse(read.current.find(row=>row.symbol===member.symbol)?.expiresAt??'')-Date.parse(read.readAt)))}/>
      <section aria-label="發動評分" className="rounded-xl border border-slate-300 p-4"><h2 className="font-semibold">已確認分數 {member.totalScore.toFixed(1)} / 100</h2>
        <p className="mt-2">技術 {member.technicalScore.toFixed(1)} / 70 · 籌碼 {member.components.chips.toFixed(1)} / 20 · 市場 {member.components.market.toFixed(1)} / 10。分數不是機率。</p>
        <p className="mt-2">基本面與估值：尚無可用資料，獨立於此分數呈現。</p>
      </section>
      <section aria-label="榜單價格圖表" className="min-w-0 rounded-xl border border-slate-300 p-4">
        <h2 className="font-semibold">價格走勢</h2>
        {detail.chart?<div className="mt-2 space-y-3">
          <p className="text-sm">顯示期間 {detail.chart.displayFrom} 至 {detail.chart.throughSession}。價格依榜單交易日調整。</p>
          <StockChart key={detail.chart.seriesRevision} data={detail.chart.candles}
            rankingWindow={{cutoff:detail.chart.cutoff,displayFrom:detail.chart.displayFrom}}/>
        </div>:<p className="mt-2">尚無經驗證的調整後圖表資料。</p>}
      </section>
      {outcome&&<LaunchOutcomeSummary outcome={outcome}/>}
      {detail.summary&&<section aria-label="公開研究摘要"><h2 className="font-semibold">研究摘要</h2><p className="mt-2 whitespace-pre-wrap break-words">{detail.summary}</p></section>}
      <section aria-label="固定評分比較"><h2 className="font-semibold">固定評分比較與原始數值</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">條件</th><th className="p-2">點數</th><th className="p-2">原始數值</th></tr></thead>
        <tbody>{detail.scoreEvidence.map(rule=><tr key={rule.id} className="border-t border-slate-300"><td className="min-w-40 p-2">{ruleNames[rule.id]}</td><td className="p-2">{rule.points} / {rule.weight}</td><td className="max-w-md break-words p-2">{Object.entries(rule.operands).map(([key,value])=><p key={key}>{key}：{value===null?'未知':typeof value==='boolean'?value?'成立':'未成立':String(value)}</p>)}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-label="公開來源"><h2 className="font-semibold">公開來源</h2><ul className="mt-2 space-y-2">{detail.citations.map(citation=><li key={citation.id}>
        <a className="break-words underline" href={citation.url} target="_blank" rel="noreferrer">{citation.id} · {new URL(citation.url).hostname}</a>
        <p className="text-sm">資料來源：{citation.publicRights.attribution}；<a className="underline" href={citation.publicRights.licenseUrl} target="_blank" rel="noreferrer">{citation.publicRights.license}</a>。</p>
      </li>)}</ul></section>
      <details className="text-sm"><summary>榜單與資料版本</summary><p className="mt-2 break-all">榜單：{read!.snapshot!.rankingRunId}</p><p>政策：{read!.snapshot!.policyVersion} · 規則：{read!.snapshot!.rulesVersion}</p><ul className="mt-2 space-y-1">{Object.entries(member.revisions).map(([key,value])=><li className="break-all" key={key}>{key}：{value}</li>)}</ul></details>
    </>}
  </main>;
}
