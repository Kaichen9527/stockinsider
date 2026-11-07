import Link from 'next/link';
import { notFound } from 'next/navigation';
import { rankingEnabled } from '@/lib/vnext/ranking-read';
import { candidateDetailHref, candidateQuery, candidateRankingRunId } from '@/lib/vnext/candidate-page';
import { readCandidateHistory } from '@/lib/vnext/candidate-history-read';

export const dynamic = 'force-dynamic';
const statusLabels = { researching: '研究中', waiting: '等待', eligible: '條件符合', exited: '已離開快照研究池' };
export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!rankingEnabled()) notFound();
  let data: Awaited<ReturnType<typeof readCandidateHistory>> | null = null;
  let query: ReturnType<typeof candidateQuery> | null = null;
  let invalid = false;
  try { query = candidateQuery(await searchParams); candidateRankingRunId(query); } catch { invalid = true; }
  if (query && !invalid) {
    try { data = await readCandidateHistory(query); } catch { data = null; }
  }
  const base = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query.filters)) if (value) base.set(key, value);
    base.set('limit', String(query.limit));
  }
  const versionHref = (rankingRunId: string, cursor?: string) => {
    const params = new URLSearchParams(base); params.set('rankingRunId', rankingRunId);
    if (cursor) params.set('cursor', cursor);
    return `/candidates?${params.toString()}`;
  };
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="vnext-candidates">
    <Link href="/" className="underline">返回市場與榜單</Link>
    <h1 className="text-2xl font-semibold">候選研究紀錄</h1>
    <p>可逐版瀏覽已保存榜單的研究池，以及相鄰版本間離開研究池的候選。離開狀態只表示前一版存在、本版未出現，無法還原確切退出時間、原因或兩次快照間的變動。尚未涵蓋未入池候選；來源及產業資料尚有缺口。瀏覽不會啟動研究。</p>
    <form method="get" className="flex flex-wrap items-end gap-3">
      {(data?.rankingRunId || query?.rankingRunId) && <input type="hidden" name="rankingRunId" value={data?.rankingRunId || query?.rankingRunId || ''} />}
      <label className="grid gap-1">原始事件日期<input className="rounded border p-2" type="date" name="date" defaultValue={query?.filters.date || ''} /></label>
      <label className="grid gap-1">來源<input className="rounded border p-2" name="source" maxLength={40} defaultValue={query?.filters.source || ''} placeholder="目前尚無可篩選資料" /></label>
      <label className="grid gap-1">產業<input className="rounded border p-2" name="industry" maxLength={60} defaultValue={query?.filters.industry || ''} placeholder="目前尚無可篩選資料" /></label>
      <label className="grid gap-1">快照狀態<select className="rounded border p-2" name="status" defaultValue={query?.filters.status || ''}><option value="">全部</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="rounded border px-4 py-2" type="submit">篩選</button>
    </form>
    {invalid ? <p role="alert">篩選或分頁參數無效，請重新篩選。</p> : !data ? <p role="status">候選快照暫時無法讀取，或尚未發布；不以草稿或舊資料補齊。</p> : <>
      <p>榜單時間：<time>{data.cutoff}</time></p><p className="break-all text-sm">榜單版本：{data.rankingRunId}</p>
      <nav aria-label="已保存榜單版本" className="flex flex-wrap gap-4">
        {data.previousSnapshot && <Link className="underline" href={versionHref(data.previousSnapshot.rankingRunId)}>較早版本（{data.previousSnapshot.cutoff}）</Link>}
        {data.nextSnapshot && <Link className="underline" href={versionHref(data.nextSnapshot.rankingRunId)}>較新版本（{data.nextSnapshot.cutoff}）</Link>}
        <Link className="underline" href="/candidates">最新已保存版本</Link>
      </nav>
      {(query?.filters.source || query?.filters.industry) && <p role="status">來源／產業資料尚未提供，無法確認符合篩選的候選。</p>}
      {!data.rows.length ? <p>此快照範圍內沒有符合條件的候選。</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">股票</th><th className="p-2">快照狀態</th><th className="p-2">原始事件日期</th><th className="p-2">條件</th></tr></thead><tbody>{data.rows.map(row => <tr className="border-t" key={row.symbol}><td className="p-2"><Link className="underline" href={candidateDetailHref(row)}>{row.symbol}</Link>{!row.revisionId && <p className="text-sm">尚無已發布研究</p>}</td><td className="p-2">{statusLabels[row.state]}{row.stateBasis === 'absent_from_successor' && <p className="text-sm">最後出現：<time>{row.lastObservedAt}</time>；本版未出現，確切退出時間／原因未保存</p>}</td><td className="p-2">{row.date || '日期缺口'}</td><td className="p-2">{row.stateBasis === 'absent_from_successor' ? '歷史紀錄，不具本版進場資格' : row.entryEligible ? '快照當時符合；仍須重核當前有效性' : '等待條件'}</td></tr>)}</tbody></table></div>}
      {data.nextCursor && <Link className="inline-block underline" href={versionHref(data.rankingRunId, data.nextCursor)}>下一頁</Link>}
    </>}
  </main>;
}
