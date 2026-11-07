import Link from 'next/link';
import { rankingMemberCurrent, type RankingSnapshot } from '@/lib/vnext/ranking-read';
import type { publicHome } from '@/lib/vnext/public-contract';
export default function Top10({ snapshot, current }: { snapshot: RankingSnapshot|null; current: ReturnType<typeof publicHome> }) {
  return <div data-testid="vnext-top10" data-ranking-run-id={snapshot?.rankingRunId || ''}>
    <div className="flex flex-wrap justify-between gap-2"><h2 id="vnext-research-title" className="text-xl font-semibold">Top 10</h2><p>{snapshot?.members.length || 0} / 10</p></div>
    <p className="mt-2 text-sm">基本面 70、技術與籌碼 20、市場 10；分數不是機率，缺資料不補名額。</p>
    {snapshot ? <p className="mt-2 text-sm">榜單原始時間：<time>{snapshot.cutoff}</time></p> : <p role="status" className="mt-3">尚無可讀取的正式榜單，等待完整資料與審查。</p>}
    {snapshot && !snapshot.members.length && <p data-testid="vnext-empty" className="mt-3">本版沒有符合完整證據門檻的標的。</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">{snapshot?.members.map(m => <article key={m.symbol} className="rounded-xl bg-slate-100 p-4 dark:bg-slate-900" data-testid="vnext-ranked-member">
      <h3 className="font-semibold">{m.rank}. <Link className="underline" href={`/stock/${m.symbol}?vnextRevision=${m.revisionId}&rankingRunId=${snapshot.rankingRunId}`}>{m.symbol}</Link></h3>
      <p>已確認分數：{m.confirmedPoints.toFixed(1)} / 100</p>
      <p>{m.entryEligible && rankingMemberCurrent(m, current) ? '研究條件符合，仍須另行評估' : '目前等待或已失效；原榜單與研究版本保留'}</p>
      {m.reasons.length > 0 && <ul className="list-disc pl-5">{m.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
    </article>)}</div>
    <Link className="mt-4 inline-block underline" href="/candidates">查看候選與等待原因</Link>
  </div>;
}
