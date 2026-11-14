import Link from 'next/link';
import { launchRankingMemberCurrent, type LaunchRankingRead } from '@/lib/vnext/launch-ranking-read';
import LaunchCurrentStatus from './LaunchCurrentStatus';

export const launchAvailabilityText = (availability: LaunchRankingRead['availability']) => ({
  ready:'',not_published:'尚無已發布的強勢發動榜單。',producer_unavailable:'必要來源資料尚未完成驗證，這次尚未發布新榜單。',
  not_found:'指定的強勢發動榜單版本不存在。',schema_unavailable:'強勢發動雷達的資料服務尚未就緒。',unavailable:'已發布雷達暫時無法讀取，請稍後再試。'
}[availability]);

export default function LaunchTop10({read}:{read:LaunchRankingRead}) {
  const snapshot=read.snapshot;
  return <div data-testid="launch-top10" data-ranking-run-id={snapshot?.rankingRunId||''}>
    <div className="flex flex-wrap justify-between gap-2"><h2 id="launch-research-title" className="text-xl font-semibold">強勢發動 Top 10</h2><p>{snapshot?.members.length||0} / 10</p></div>
    <p className="mt-2 text-sm">技術 70、籌碼 20、市場 10。分數不是機率；必要資料缺值不補分。基本面與估值獨立呈現。</p>
    {read.availability!=='ready'&&<p role="status" className="mt-3">{launchAvailabilityText(read.availability)}</p>}
    {snapshot&&<p className="mt-2 text-sm">原榜單時間：<time>{snapshot.cutoff}</time> · 台股交易日：{snapshot.session}{read.availability!=='ready'?' · 保留原版本':''}</p>}
    {snapshot&&snapshot.members.length===0&&<p data-testid="launch-empty" className="mt-3">本版沒有符合完整證據與審查條件的標的。</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">{snapshot?.members.map(member=><article key={member.symbol} className="min-w-0 rounded-xl bg-slate-100 p-4 dark:bg-slate-900" data-testid="launch-ranked-member">
      <h3 className="font-semibold">{member.rank}. <Link className="underline" href={`/stock/${member.symbol}?launchRunId=${snapshot.rankingRunId}&launchResearchRevision=${member.revisionId}&launchScoreRevision=${member.scoreRevision}`}>{member.symbol}</Link></h3>
      <p className="mt-2">已確認分數：{member.totalScore.toFixed(1)} / 100</p>
      <p className="text-sm">技術 {member.technicalScore.toFixed(1)} / 70 · 籌碼 {member.components.chips.toFixed(1)} / 20 · 市場 {member.components.market.toFixed(1)} / 10</p>
      <LaunchCurrentStatus key={`${member.launchQualificationRevision}:${read.current.find(row=>row.symbol===member.symbol)?.expiresAt}`} initialCurrent={launchRankingMemberCurrent(member,read.current,read.readAt)}
        readAt={read.readAt} expiresAt={read.current.find(row=>row.symbol===member.symbol)?.expiresAt??null}
        remainingMs={Math.max(0,Math.min(120000,Date.parse(read.current.find(row=>row.symbol===member.symbol)?.expiresAt??'')-Date.parse(read.readAt)))}/>
      <p className="mt-2 text-sm">基本面與估值：尚無可用資料，不參與此分數。</p>
    </article>)}</div>
    {snapshot&&<p className="mt-4 text-sm">本版候選 {snapshot.candidates.length} 檔；必要資料與審查完整後才列入 Top 10。</p>}
    {snapshot&&snapshot.changes.length>0&&<details className="mt-3 text-sm"><summary>本版進出與維持</summary><ul className="mt-2 list-disc pl-5">{snapshot.changes.map((change,index)=><li key={`${change.symbol}-${index}`}>{change.symbol}：{change.kind==='entered'?'加入':change.kind==='maintained'?'維持':'退出'}本版</li>)}</ul></details>}
  </div>;
}
