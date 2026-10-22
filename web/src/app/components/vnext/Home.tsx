import Link from 'next/link';
import { readPublished } from '@/lib/vnext/store';
import { publicHome } from '@/lib/vnext/public-contract';

const actionLabels = { evaluate: '可評估', selective: '選擇性評估', wait: '等待', cannot_determine: '無法判定' };
const confidenceLabels = { complete: '完整', limited: '有限', insufficient: '不足' };
export function VnextHomeView({ data, error = false, loading = false }: { data: ReturnType<typeof publicHome>; error?: boolean; loading?: boolean }) {
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="vnext-home" data-contract-version={data?.version || 'unavailable'}>
    <header><Link href="/" className="text-2xl font-semibold">StockInsider</Link><p className="mt-2 text-sm text-slate-500">台股研究 · 有證據才有判斷</p></header>
    <section aria-label="大盤判斷" aria-labelledby="vnext-market-title" data-testid="vnext-market" className="rounded-2xl border border-slate-300 p-5">
      <h1 id="vnext-market-title" className="text-xl font-semibold">市場判斷</h1>
      <p className="mt-3 text-2xl font-semibold">{loading ? '市場資料載入中' : data ? actionLabels[data.market.action as keyof typeof actionLabels] : '無法判定'}</p>
      <p className="mt-2">資料信心：{data ? confidenceLabels[data.market.confidence as keyof typeof confidenceLabels] : '不足'} · 台股交易日：{data?.market.session || '尚無已發布資料'}</p>
      {data?.market.sourceAt && <p className="mt-1 text-sm">原始資料時間：<time>{data.market.sourceAt}</time></p>}
      <p className="mt-2 text-sm">{data?.market.entryBlocked === false ? '依個股證據評估研究條件。' : '目前資料或市場風險阻擋新進場條件。'}</p>
      <div className="mt-4 space-y-3 text-sm">
        <div><h2 className="font-semibold">主要依據</h2>{data?.market.reasons?.length ? <ul className="mt-1 list-disc pl-5">{data.market.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>尚無可讀取的量化依據。</p>}</div>
        <div><h2 className="font-semibold">近三個月背景</h2>{data?.market.background?.status === 'observed' ? <p>{data.market.background.from} 至 {data.market.background.to}，60 個交易日：加權 {((data.market.background.taiexReturn || 0) * 100).toFixed(1)}%、櫃買 {((data.market.background.tpexReturn || 0) * 100).toFixed(1)}%。此為歷史觀察。</p> : <p>連續交易日背景資料有缺口。</p>}</div>
        <div><h2 className="font-semibold">轉換與等待條件</h2>{data?.market.conditions?.length ? <ul className="mt-1 list-disc pl-5">{data.market.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : <p>等待最新完整市場資料與個股研究條件驗證。</p>}</div>
        <p>AI 事件解讀：{data?.market.aiInterpretation?.reason || '尚無經驗證的凍結模型結果。'}</p>
      </div>
      {error && <p role="alert" className="mt-3 text-amber-700">已發布資料暫時無法讀取，請稍後再試。</p>}
      {data?.market.gaps.length ? <details className="mt-3"><summary>資料缺口與風險</summary><ul className="mt-2 list-disc pl-5">{data.market.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details> : null}
      {data?.market.overseas.length ? <div className="mt-3 flex flex-wrap gap-3">{data.market.overseas.map((item) => <p key={item.name} className="text-sm">{item.name}：{item.value ?? '資料缺口'}{item.provenance && <a className="ml-1 underline" href={item.provenance} rel="noreferrer" target="_blank">來源</a>}</p>)}</div> : null}
    </section>
    <section aria-label="研究標的" aria-labelledby="vnext-research-title" data-testid="vnext-research" className="rounded-2xl border border-slate-300 p-5">
      <div className="flex flex-wrap justify-between gap-2"><h2 id="vnext-research-title" className="text-xl font-semibold">主動研究</h2><p>{data?.members.length || 0} / 20</p></div>
      <p className="mt-2 text-sm text-slate-500">初選與深度研究分數分開列示，均為已確認點數／可用權重；缺值不補分，分數不是機率。已有當期深度評估的標的依深度分數排列，其餘依初選分數排列。</p>
      {loading ? <p role="status" className="mt-5">研究資料載入中</p> : !data?.members.length ? <p data-testid="vnext-empty" className="mt-5">目前沒有已納入的研究標的。資料與研究條件完整後才會加入。</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">{data.members.map((member) => <article key={member.symbol} className="min-w-0 rounded-xl bg-slate-100 p-4 dark:bg-slate-900" data-testid="vnext-member">
        <div className="flex justify-between gap-2"><h3 className="font-semibold"><Link className="underline" href={`/stock/${member.symbol}${member.revisionId ? `?vnextRevision=${encodeURIComponent(member.revisionId)}` : ''}`}>{member.symbol}</Link></h3><span>{member.entryEligible ? '研究條件符合' : member.state === 'researching' ? '研究中' : '等待條件'}</span></div>
        {(member.initialScore || member.score) && <p className="mt-2">初選：{(member.initialScore || member.score)!.confirmedPoints.toFixed(1)} / {(member.initialScore || member.score)!.availableWeight.toFixed(1)}</p>}
        <p className="mt-1">深度研究：{member.deepScore && member.deepScore.availableWeight>0 ? `${member.deepScore.confirmedPoints.toFixed(1)} / ${member.deepScore.availableWeight.toFixed(1)}` : '證據尚不足，暫無當期分數'}</p>
        {member.deepScoreAt && <p className="text-sm">深度評估時間：<time>{member.deepScoreAt}</time></p>}
        {member.revisionId && member.sourceRights?.current!==true && <p className="mt-2 text-sm text-amber-700">原始來源權利或版本驗證有缺口；保留歷史研究，目前不具新進場條件。</p>}
        <p className="mt-2 text-sm">{member.revisionId ? `研究發布：${member.publishedAt}` : '尚未有通過獨立審查的研究'}</p>
        {member.statusReason && <p className="mt-2 text-sm text-amber-700">研究狀態：{member.statusReason === 'review_rejected_retry_available' ? '獨立審查未通過，等待新的研究重試。' : member.statusReason === 'research_failed_retry_available' ? '研究執行失敗，等待重試。' : member.statusReason === 'research_timed_out_retry_available' ? '執行逾時，等待重試。' : member.statusReason}</p>}
        {member.retained && <p className="mt-2 text-amber-700">保留前次研究，最新輸入仍在審查。</p>}
        {member.reasons?.length ? <ul className="mt-2 list-disc pl-5 text-sm">{member.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
        {member.gaps?.length ? <p className="mt-2 break-words text-sm text-amber-700">資料缺口：{member.gaps.join('、')}</p> : null}
      </article>)}</div>}
    </section>
  </main>;
}
export default async function VnextHome() {
  let data: ReturnType<typeof publicHome> = null;
  let error = false;
  try { data = publicHome(await readPublished(), new Date().toISOString()); }
  catch { error = true; }
  return <VnextHomeView data={data} error={error} />;
}
