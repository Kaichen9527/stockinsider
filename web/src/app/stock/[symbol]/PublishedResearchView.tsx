import type { ArticleParagraphV2, ArticleSourceV2 } from '@/lib/research-business-article';
import type { ResearchPublicationView } from '@/lib/research-publication-view';

const stages: Record<string,string> = {rumor:'市場傳聞',discussion:'洽談／討論',customer_validation:'客戶驗證',pilot:'試產',reported_order:'公開訂單證據',production:'量產'};
const kinds: Record<string,string> = {reported:'來源陳述',rumor:'未確認傳聞',inference:'研究推論',scenario:'條件情境',gap:'資料缺口'};
const scenarios: Record<string,string> = {bear:'保守',base:'基本',bull:'樂觀'};
const number = (v: number) => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(v);
const date = (v: string) => new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));

function PublishedParagraph({paragraph,sources}: {paragraph: ArticleParagraphV2;sources:Map<string,ArticleSourceV2 & {number:number}>}) {
    return <div className="my-5"><p className="mb-1 text-xs font-medium text-slate-500">{kinds[paragraph.kind]}</p>
      <p className="whitespace-pre-line leading-8 text-slate-800">{paragraph.text}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="段落依據">
        {paragraph.references.map((r,i) => <li key={i}>{r.kind === 'source' ? (() => {
          const source = sources.get(r.documentId)!;
          return <a className="underline underline-offset-2" href={source.url} target="_blank" rel="noopener noreferrer">來源 {source.number}：{r.locator}</a>;
        })() : r.kind === 'gap' ? `待補證據：${r.reason}` : r.kind === 'calculation' ? '依發布財測計算' : r.kind === 'assumption' ? '研究假設' : '已公告財務觀察'}</li>)}
      </ul></div>;
  }

/** Server-rendered text only. This view grants no investment/trading eligibility. */
export function PublishedResearchView({ publication: p }: {publication: ResearchPublicationView}) {
  const sources = new Map(p.sources.map((s,i) => [s.id,{...s,number:i+1}]));
  return <article aria-labelledby="published-research-title" className="mx-auto max-w-4xl text-slate-900">
    <header className="border-b border-slate-200 pb-6">
      <p role="status" className={`mb-4 rounded-lg border p-3 text-sm ${p.researchState === 'withdrawn' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
        {p.researchState === 'withdrawn' ? '來源已撤回・需要重新審查' : '已發布研究・未取得投資資格'}
      </p>
      <h1 id="published-research-title" className="text-2xl font-bold sm:text-3xl">{p.symbol}：成長假說、估值與進場條件</h1>
      <PublishedParagraph paragraph={p.article.summary} sources={sources}/>
      <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div><dt className="inline">文章撰寫：</dt><dd className="inline">{date(p.article.authoredAt)}</dd></div>
        <div><dt className="inline">發布時間：</dt><dd className="inline">{date(p.publishedAt)}</dd></div>
        <div><dt className="inline">財測基準：</dt><dd className="inline">{date(p.originalModelCutoff)}</dd></div>
        <div><dt className="inline">消息查核截止：</dt><dd className="inline">{date(p.researchCutoff)}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-slate-600">此版本未附最新完整交易日行情與技術快照，無法判定現在的價格或進場訊號。以下倍數尚未校準，只供條件敏感度比較。</p>
    </header>
    <nav aria-label="研究章節" className="my-6 flex flex-wrap gap-3 text-sm">
      {p.article.sections.map(s => <a key={s.key} href={`#published-${s.key}`} className="underline underline-offset-4">{s.title}</a>)}
    </nav>
    <section aria-labelledby="published-valuation-title" className="my-8">
      <h2 id="published-valuation-title" className="mb-3 text-xl font-semibold">情境估值敏感度</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200" tabIndex={0} role="region" aria-label="估值敏感度表，可水平捲動">
        <table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">條件式 EPS 與未校準倍數，並非合理價或目標價</caption>
          <thead className="bg-slate-50"><tr>{['情境／期間','條件式 EPS','假設 P/E','遠期價格敏感度','折現敏感度'].map(t => <th key={t} scope="col" className="p-3">{t}</th>)}</tr></thead>
          <tbody>{p.valuations.map(v => <tr key={v.scenarioId} className="border-t border-slate-200">
            <th scope="row" className="p-3 font-medium">{scenarios[v.scenarioId]}<span className="mt-1 block text-xs font-normal">{v.period === 'next_four_unreported' ? '未來四個未公布季度' : `${v.fiscalYear} 全年度`}<br/>{v.periods.join('、')}</span></th>
            <td className="p-3">{number(v.epsConditional)} 元</td><td className="p-3">{v.peApplicable ? `${number(v.peMultiple!)} 倍` : '不適用'}</td>
            <td className="p-3">{v.futurePriceSensitivity === null ? '不適用' : `${number(v.futurePriceSensitivity)} 元`}</td>
            <td className="p-3">{v.presentValueSensitivity === null ? '不適用' : `${number(v.presentValueSensitivity)} 元`}<span className="block text-xs">{number(v.yearsToValue)} 年／折現率 {number(v.discountRate*100)}%</span></td>
          </tr>)}</tbody></table>
      </div>
      {p.valuations.map(v => <p key={v.scenarioId} className="mt-3 text-sm leading-7"><strong>{scenarios[v.scenarioId]}：</strong>{v.rationale}</p>)}
    </section>
    {p.article.sections.map(s => <section key={s.key} id={`published-${s.key}`} className="scroll-mt-6 border-t border-slate-200 py-6">
      <h2 className="text-xl font-semibold">{s.title}</h2>{s.paragraphs.map(paragraph => <PublishedParagraph key={paragraph.id} paragraph={paragraph} sources={sources}/>)}</section>)}
    {p.article.catalysts.length > 0 && <section className="border-t border-slate-200 py-6" aria-labelledby="published-catalysts"><h2 id="published-catalysts" className="text-xl font-semibold">催化劑與反證</h2>
      {p.article.catalysts.map((c,i) => <div key={i} className="mt-5 border-l-2 border-slate-300 pl-4"><h3 className="font-semibold">{c.name} · {stages[c.stage]}</h3>
        <p className="mt-2 leading-7">影響 {c.affectedBusiness}；最早財務期間 {c.earliestFinancialPeriod}。{c.financialTransmission}</p>
        <p className="mt-2 leading-7"><strong>最強反證：</strong>{c.strongestCounterEvidence}</p><p className="mt-2 leading-7"><strong>失效條件：</strong>{c.falsifier}</p>
        <p className="mt-2 text-xs">論述依據：{c.paragraphIds.map(id => p.article.sections.find(s => s.paragraphs.some(r => r.id === id))?.title || '研究摘要').join('、')}</p>
      </div>)}</section>}
    {p.article.companyBackground && <details className="my-5 rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">了解公司</summary><p className="mt-4 whitespace-pre-line leading-8">{p.article.companyBackground}</p></details>}
    <details className="my-5 rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">財務與假設明細</summary>
      {p.tables.length === 0 && <p className="mt-4 text-sm">此版本未提供附表。</p>}
      {p.tables.map(t => <div key={t.id} className="mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label={t.title}>
        <table className="w-full min-w-[540px] text-left text-sm"><caption className="mb-2 text-left font-semibold">{t.title}</caption><thead><tr>{['項目','數值／單位','期間','性質'].map(label => <th key={label} className="p-2" scope="col">{label}</th>)}</tr></thead>
          <tbody>{t.rows.map((r,i) => <tr key={i} className="border-t border-slate-200"><th className="p-2 font-normal" scope="row">{r.label}</th><td className="p-2">{number(r.value)} {({TWD_per_share:'元／股',TWD_million:'百萬元',million_shares:'百萬股',fraction:'比例'})[r.unit]}</td><td className="p-2">{r.periods.join('、') || '未指定期間'}</td><td className="p-2">{r.valueStatus === 'calculation' ? '計算結果' : r.valueStatus === 'assumption' ? '研究假設' : '公告觀察'}</td></tr>)}</tbody>
        </table></div>)}
    </details>
    <details className="my-5 rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">來源與研究限制</summary>
      <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">{p.sources.map(s => <li key={s.id}><a className="break-all underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a><span className="block text-xs text-slate-600">{s.scope === 'industry_context' ? '產業背景' : '公司相關'} · 發布：{s.publication.raw || '未提供'} · 首次觀測：{date(s.observedAt)}{s.retracted || s.superseded ? ' · 原來源已撤回或被修訂' : ''}</span></li>)}</ol>
      <ul className="mt-5 list-inside list-disc space-y-2 text-xs text-slate-600">{p.limitations.map((x,i) => <li key={i}>{x}</li>)}</ul>
    </details>
  </article>;
}
