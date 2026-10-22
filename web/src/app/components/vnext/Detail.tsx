import Link from 'next/link';
import { readPublished } from '@/lib/vnext/store';
import { publicCitation } from '@/lib/vnext/citations';
import { REQUIRED_SECTIONS } from '@/lib/vnext/research';
const sectionTitles = { conclusion: '研究結論', productsRevenue: '產品與收益模式', competitionDemand: '需求、競爭與市占證據', profitBridge: '獲利推估', cashflows: '現金流', valuation: '估值情境', catalysts: '催化劑', falsifiers: '反證與失效條件', technical: '技術與籌碼條件', history: '更新紀錄' };
const claimKinds: Record<string, string> = { fact: '已確認事實', assumption: '情境假設', guidance: '公司指引', derived: '衍生計算' };
type Row = Record<string, unknown>;
export default async function VnextDetail({ symbol, revision }: { symbol: string; revision?: string | string[] }) {
  let data: Row | null = null; let error = false;
  try { data = await readPublished(symbol); } catch { error = true; }
  const history = (Array.isArray(data?.history) ? data.history : []) as Row[];
  const invalid = Array.isArray(revision) || Boolean(revision && !/^[a-f0-9-]{36}$/iu.test(revision));
  const chosen = invalid ? null : revision ? history.find((item) => item.revisionId === revision) : history[0];
  const membership = data?.membership as Row | undefined;
  const current = chosen && membership?.state !== 'exited' && membership?.contraindication !== true && membership?.inputHash === chosen.inputHash && (chosen.sourceRights as Row|undefined)?.current===true;
  const content = chosen?.content as Row | undefined; const sections = content?.sections as Record<string, { text: string; evidenceIds: string[] }> | undefined;
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100" data-testid="vnext-detail">
    <Link className="underline" href="/">返回市場與主動研究</Link><h1 className="text-2xl font-semibold">{symbol} 研究紀錄</h1>
    <p>{membership?.state === 'exited' ? '已退出主動研究' : current ? '已發布研究；進場仍須符合當前市場與個股條件' : '保留歷史研究，目前不具新進場條件'}</p>
    {error ? <p role="alert">研究資料暫時無法讀取。</p> : !chosen ? <p role="status">{invalid || revision ? '指定研究版本不存在或尚未發布。' : '尚無通過獨立審查的研究。'}</p> : <>
      {(chosen.sourceRights as Row|undefined)?.current!==true && <p className="text-amber-700">原始來源權利目前無法驗證；內容保留為歷史紀錄，不具新進場條件。</p>}
      <p>原始發布時間：<time>{String(chosen.publishedAt)}</time></p>
      <p>估值日期：{String(content?.valuationDate || '缺口')} · 股價日期：{String(content?.quoteDate || '缺口')}</p>
      {Array.isArray(content?.gaps) && content.gaps.length > 0 && <p className="text-amber-700">資料缺口：{content.gaps.map(String).join('、')}</p>}
      {sections && REQUIRED_SECTIONS.flatMap((key) => { const section = sections[key]; return section ? [<section key={key} className="rounded-xl border border-slate-300 p-4"><h2 className="font-semibold">{sectionTitles[key]}</h2><p className="mt-2 whitespace-pre-wrap break-words leading-7">{section.text}</p><p className="mt-2 break-words text-sm text-slate-500">證據：{section.evidenceIds.join('、')}</p></section>] : []; })}
      {Array.isArray(content?.claims) && <section aria-label="重要論點與計算"><h2 className="font-semibold">重要論點與計算</h2><p className="mt-2 text-sm">情境與推導值不是上漲機率或保證報酬。</p><div className="mt-3 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">分類與論點</th><th className="p-2">數值／單位</th><th className="p-2">期間／證據</th></tr></thead><tbody>{(content.claims as Row[]).map((claim) => { const numeric = claim.numeric as Row | undefined; return <tr key={String(claim.id)} className="border-t border-slate-300"><td className="min-w-40 p-2">{claimKinds[String(claim.kind)] || '待核實'}<p>{String(claim.text)}</p></td><td className="p-2">{numeric ? <>{typeof numeric.value === 'number' && Number.isFinite(numeric.value) ? numeric.value : '缺值'} {String(numeric.unit || '')}</> : '非數值論點'}</td><td className="p-2">{String(numeric?.period || '不適用')}<p>{Array.isArray(claim.evidenceIds) ? claim.evidenceIds.map(String).join('、') : '來源缺口'}</p></td></tr>; })}</tbody></table></div></section>}
      <section aria-label="原始來源"><h2 className="font-semibold">原始來源</h2><ul className="mt-2 space-y-2">{(Array.isArray(chosen.citations) ? chosen.citations as Row[] : []).flatMap((citation) => {
        const url = publicCitation(citation.url); return url ? <li key={String(citation.id)}><a className="break-words underline" href={url} target="_blank" rel="noreferrer">{String(citation.id)} · {new URL(url).hostname}</a></li> : [];
      })}</ul></section>
    </>}
    <section aria-label="研究歷史"><h2 className="font-semibold">歷史版本</h2>{history.length ? <ul className="mt-2 space-y-2">{history.map((item) => <li key={String(item.revisionId)}><Link className="break-words underline" href={`/stock/${symbol}?vnextRevision=${encodeURIComponent(String(item.revisionId))}`}>{String(item.publishedAt)}</Link></li>)}</ul> : <p>尚無已發布版本。</p>}</section>
  </main>;
}
