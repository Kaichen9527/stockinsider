import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { rankingEnabled } from '@/lib/vnext/ranking-read';
import { candidateDetailHref, candidatePage, candidateQuery, candidateRankingRunId } from '@/lib/vnext/candidate-page';

export const dynamic = 'force-dynamic';
const statusLabels = { researching: '研究中', waiting: '等待', eligible: '條件符合', exited: '已退出' };
export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!rankingEnabled()) notFound();
  let data: ReturnType<typeof candidatePage> | null = null;
  let query: ReturnType<typeof candidateQuery> | null = null;
  let invalid = false;
  try { query = candidateQuery(await searchParams); candidateRankingRunId(query); } catch { invalid = true; }
  if (query && !invalid) {
    try {
      const result = await getSupabaseServerClient().rpc('vnext_ranking_read_v1', { p_ranking_run_id: candidateRankingRunId(query), p_symbol: null });
      if (result.error) throw new Error('vnext_candidates_unavailable');
      data = candidatePage(result.data, query);
    } catch { data = null; }
  }
  const next = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query.filters)) if (value) next.set(key, value);
    next.set('limit', String(query.limit));
  }
  if (data?.nextCursor) next.set('cursor', data.nextCursor);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="vnext-candidates">
    <Link href="/" className="underline">返回市場與榜單</Link>
    <h1 className="text-2xl font-semibold">候選研究紀錄</h1>
    <p>目前僅提供已保存榜單快照中的主動研究池。尚未涵蓋未入池候選、完整退出與歷史清單；來源及產業資料尚有缺口。瀏覽不會啟動研究。</p>
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">快照候選日期<input className="rounded border p-2" type="date" name="date" defaultValue={query?.filters.date || ''} /></label>
      <label className="grid gap-1">來源<input className="rounded border p-2" name="source" maxLength={40} defaultValue={query?.filters.source || ''} placeholder="目前尚無可篩選資料" /></label>
      <label className="grid gap-1">產業<input className="rounded border p-2" name="industry" maxLength={60} defaultValue={query?.filters.industry || ''} placeholder="目前尚無可篩選資料" /></label>
      <label className="grid gap-1">快照狀態<select className="rounded border p-2" name="status" defaultValue={query?.filters.status || ''}><option value="">全部</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="rounded border px-4 py-2" type="submit">篩選</button>
    </form>
    {invalid ? <p role="alert">篩選或分頁參數無效，請重新篩選。</p> : !data ? <p role="status">候選快照暫時無法讀取，或尚未發布；不以草稿或舊資料補齊。</p> : <>
      <p>榜單時間：<time>{data.cutoff}</time></p><p className="break-all text-sm">榜單版本：{data.rankingRunId}</p>
      {(query?.filters.source || query?.filters.industry) && <p role="status">來源／產業資料尚未提供，無法確認符合篩選的候選。</p>}
      {!data.rows.length ? <p>此快照範圍內沒有符合條件的候選。</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">股票</th><th className="p-2">快照狀態</th><th className="p-2">日期</th><th className="p-2">條件</th></tr></thead><tbody>{data.rows.map(row => <tr className="border-t" key={row.symbol}><td className="p-2"><Link className="underline" href={candidateDetailHref(row)}>{row.symbol}</Link>{!row.revisionId && <p className="text-sm">尚無已發布研究</p>}</td><td className="p-2">{statusLabels[row.state]}</td><td className="p-2">{row.date || '日期缺口'}</td><td className="p-2">{row.entryEligible ? '快照當時符合；仍須重核當前有效性' : '等待條件'}</td></tr>)}</tbody></table></div>}
      {data.nextCursor && <Link className="inline-block underline" href={`/candidates?${next.toString()}`}>下一頁</Link>}
    </>}
  </main>;
}
