import priceHistory from '@/data/auo-price-history-v1.json';
import {
  AUO_AS_OF,
  AUO_COMMON_EQUITY_MILLION,
  AUO_DILUTED_SHARES_MILLION,
  AUO_ENDING_COMMON_SHARES_MILLION,
  AUO_PRICE,
  AUO_RESEARCH_VERSION,
  auoArticleSections,
  auoAssumptions,
  auoForecastBaseQuarters,
  auoGrowthDrivers,
  auoMonitoringChecklist,
  auoMonthlyRevenue,
  auoPeerComparison,
  auoQuarterlyActuals,
  auoScenarioAdjustments,
  auoSources,
} from '@/lib/auo-deep-dive-v1';
import {
  buildEntryPlan,
  buildForecastScenario,
  calculateForwardPe,
  calculateTechnicalSnapshot,
  combineActualAndForecastYear,
  requiredEarningsAtMultiple,
  type EntryPlan,
  type PriceBar,
  type TechnicalSnapshot,
} from '@/lib/auo-deep-dive-model';

const nf = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmt(value: number | null, suffix = '') {
  return value === null || !Number.isFinite(value) ? '不適用' : `${one.format(value)}${suffix}`;
}

const scenarios = (Object.entries(auoScenarioAdjustments) as Array<[keyof typeof auoScenarioAdjustments, typeof auoScenarioAdjustments.base]>).map(([id, adjustment]) => buildForecastScenario({
  id,
  baseQuarters: auoForecastBaseQuarters,
  adjustment,
  dilutedSharesMillion: AUO_DILUTED_SHARES_MILLION,
  startingCommonEquityMillion: AUO_COMMON_EQUITY_MILLION,
  endingCommonSharesMillion: AUO_ENDING_COMMON_SHARES_MILLION,
  forwardQuarterCount: 5,
  valuationYear: 2027,
}));

const baseScenario = scenarios.find((scenario) => scenario.id === 'base')!;
const reverse20 = requiredEarningsAtMultiple(AUO_PRICE, 20, AUO_DILUTED_SHARES_MILLION, 283_000);
const sourceById = new Map(auoSources.map((source) => [source.id, source]));

function SourceLinks({ ids }: { ids: readonly string[] }) {
  return (
    <span className="source-links" aria-label="本段來源">
      {ids.map((id) => {
        const source = sourceById.get(id as typeof auoSources[number]['id']);
        return source ? <a href={source.url} target="_blank" rel="noreferrer" key={id}>{id}</a> : null;
      })}
    </span>
  );
}

function RevenueChart() {
  const width = 900;
  const height = 270;
  const padding = { top: 24, right: 18, bottom: 48, left: 54 };
  const values = auoMonthlyRevenue.map(([, value]) => value);
  const max = Math.max(...values) * 1.08;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const barWidth = plotWidth / values.length;
  return (
    <figure className="chart-shell">
      <figcaption><strong>24 個月營收</strong><span>新台幣百萬元；最近四個月以公司公告交叉核對</span></figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="友達二十四個月月營收長條圖">
        {[20_000, 24_000, 28_000].map((tick) => {
          const y = padding.top + plotHeight - tick / max * plotHeight;
          return <g key={tick}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grid"/><text x={padding.left - 8} y={y + 4} textAnchor="end">{tick / 1000}B</text></g>;
        })}
        {auoMonthlyRevenue.map(([period, value], index) => {
          const x = padding.left + index * barWidth + 2;
          const h = value / max * plotHeight;
          return <g key={period}><rect x={x} y={padding.top + plotHeight - h} width={Math.max(3, barWidth - 5)} height={h} className={index >= 20 ? 'bar hot' : 'bar'}/>{index % 4 === 0 || index === auoMonthlyRevenue.length - 1 ? <text x={x + barWidth / 2} y={height - 20} textAnchor="middle">{period.slice(2)}</text> : null}</g>;
        })}
      </svg>
      <p className="chart-note">2026 年 7 月降至 203.7 億元，8 月回升到 231.0 億元；前八月累計仍年減 1.8%。反彈尚未構成成長趨勢。</p>
    </figure>
  );
}

function PriceChart({ technical }: { technical: TechnicalSnapshot }) {
  const rows = (priceHistory as PriceBar[]).slice(-120);
  const width = 900;
  const height = 300;
  const pad = { top: 24, right: 26, bottom: 40, left: 50 };
  const min = Math.min(...rows.map((row) => row.low)) * 0.94;
  const max = Math.max(...rows.map((row) => row.high)) * 1.04;
  const x = (index: number) => pad.left + index / (rows.length - 1) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
  const line = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const rolling = (periods: number) => rows.map((_, index) => {
    const absolute = (priceHistory as PriceBar[]).length - rows.length + index;
    const slice = (priceHistory as PriceBar[]).slice(Math.max(0, absolute - periods + 1), absolute + 1);
    return slice.reduce((sum, row) => sum + row.close, 0) / slice.length;
  });
  return (
    <figure className="chart-shell price-chart">
      <figcaption><strong>近 120 個交易日價格結構</strong><span>收盤價、MA20、MA60；資料至 {technical?.asOf}</span></figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="友達股價與二十日六十日均線圖">
        {[20, 25, 30, 35].filter((tick) => tick > min && tick < max).map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="grid"/><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <path d={line(rolling(60))} className="price-line ma60"/>
        <path d={line(rolling(20))} className="price-line ma20"/>
        <path d={line(rows.map((row) => row.close))} className="price-line close"/>
        <circle cx={x(rows.length - 1)} cy={y(rows.at(-1)!.close)} r="5" className="last-dot"/>
        <text x={width - pad.right} y={y(rows.at(-1)!.close) - 10} textAnchor="end" className="last-label">{rows.at(-1)!.close.toFixed(2)}</text>
      </svg>
      <div className="legend"><span className="legend-close">收盤</span><span className="legend-ma20">MA20</span><span className="legend-ma60">MA60</span></div>
    </figure>
  );
}

function ForecastTable() {
  const rows = baseScenario.quarters.slice(0, 4);
  return (
    <div className="table-scroll">
      <table>
        <caption>未來四個未公布季度｜基本情境（新台幣百萬元，EPS 為元）</caption>
        <thead><tr><th>期間</th><th>Mobility</th><th>Vertical</th><th>Display</th><th>合併營收</th><th>營業利益</th><th>正常化淨利</th><th>正常化 EPS</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.period}><th>{row.period}</th><td>{nf.format(row.segments.mobility.revenue)}</td><td>{nf.format(row.segments.vertical.revenue)}</td><td>{nf.format(row.segments.display.revenue)}</td><td>{nf.format(row.revenue)}</td><td className={row.operatingIncome < 0 ? 'negative' : ''}>{nf.format(row.operatingIncome)}</td><td className={row.normalizedNetIncome < 0 ? 'negative' : ''}>{nf.format(row.normalizedNetIncome)}</td><td>{row.normalizedEps.toFixed(2)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ValuationTable() {
  return (
    <div className="table-scroll">
      <table>
        <caption>2027 情境估值｜P/B 為主、P/E 為交叉檢查</caption>
        <thead><tr><th>情境</th><th>營收</th><th>營益率</th><th>正常化 EPS</th><th>現價 Forward P/E</th><th>合理 P/E 值</th><th>Forward BVPS</th><th>歷史 P/B 錨點</th><th>主要參考價</th></tr></thead>
        <tbody>{scenarios.map((scenario) => {
          const annual = scenario.annual.find((row) => row.year === 2027)!;
          return <tr key={scenario.id}><th>{scenario.label}</th><td>{nf.format(annual.revenue)}</td><td>{fmt(annual.operatingIncome / annual.revenue * 100, '%')}</td><td>{annual.normalizedEps.toFixed(2)}</td><td>{fmt(calculateForwardPe(AUO_PRICE, annual.normalizedEps), 'x')}</td><td>{scenario.valuation.peValue === null ? '不適用' : `$${scenario.valuation.peValue.toFixed(1)}`}</td><td>${scenario.valuation.forwardBvps.toFixed(2)}</td><td>{scenario.valuation.fairPb.toFixed(2)}x</td><td className="value-cell">${scenario.valuation.referenceValue.toFixed(1)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function AnnualOutlookTable() {
  return (
    <div className="table-scroll">
      <table>
        <caption>2026–2027 年財務推估｜2026H1 已公告、其餘為情境估計</caption>
        <thead><tr><th>情境／年度</th><th>營收</th><th>營業利益</th><th>正常化淨利</th><th>正常化 EPS</th><th>報表 EPS</th></tr></thead>
        <tbody>{scenarios.flatMap((scenario) => {
          const h2 = scenario.annual.find((row) => row.year === 2026)!;
          const year2026 = combineActualAndForecastYear({
            actual: { revenue: 139_922, operatingIncome: -418, normalizedNetIncome: -450, reportedNetIncome: 199 },
            forecast: {
              revenue: h2.revenue,
              operatingIncome: h2.operatingIncome,
              normalizedNetIncome: h2.normalizedNetIncome,
              reportedNetIncome: h2.normalizedNetIncome,
            },
            dilutedSharesMillion: AUO_DILUTED_SHARES_MILLION,
          });
          const year2027 = scenario.annual.find((row) => row.year === 2027)!;
          return [
            <tr key={`${scenario.id}-2026`}><th>{scenario.label} 2026E</th><td>{nf.format(year2026.revenue)}</td><td className={year2026.operatingIncome < 0 ? 'negative' : ''}>{nf.format(year2026.operatingIncome)}</td><td className={year2026.normalizedNetIncome < 0 ? 'negative' : ''}>{nf.format(year2026.normalizedNetIncome)}</td><td>{year2026.normalizedEps.toFixed(2)}</td><td>{year2026.reportedEps.toFixed(2)}</td></tr>,
            <tr key={`${scenario.id}-2027`}><th>{scenario.label} 2027E</th><td>{nf.format(year2027.revenue)}</td><td className={year2027.operatingIncome < 0 ? 'negative' : ''}>{nf.format(year2027.operatingIncome)}</td><td className={year2027.normalizedNetIncome < 0 ? 'negative' : ''}>{nf.format(year2027.normalizedNetIncome)}</td><td>{year2027.normalizedEps.toFixed(2)}</td><td>{year2027.reportedEps.toFixed(2)}</td></tr>,
          ];
        })}</tbody>
      </table>
      <p className="table-note">2026H1 報表 EPS 約 0.03 元；正常化以營業利益、可重複業外、稅與非控制權益重建，估計約 -0.06 元。兩者差額不乘倍數。</p>
    </div>
  );
}

function ActualTable() {
  return (
    <div className="table-scroll">
      <table>
        <caption>最近八季合併實績｜新台幣百萬元</caption>
        <thead><tr><th>期間</th><th>營收</th><th>毛利率</th><th>營業利益</th><th>歸屬母公司淨利</th><th>報表 EPS</th></tr></thead>
        <tbody>{auoQuarterlyActuals.map((row) => <tr key={row.period}><th>{row.period}</th><td>{nf.format(row.revenue)}</td><td>{row.grossMargin.toFixed(1)}%</td><td className={row.operatingIncome < 0 ? 'negative' : ''}>{nf.format(row.operatingIncome)}</td><td className={row.commonNetIncome < 0 ? 'negative' : ''}>{nf.format(row.commonNetIncome)}</td><td>{row.reportedEps.toFixed(2)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function SectionExtras({ id, technical, entryPlan }: {
  id: string;
  technical: TechnicalSnapshot | null;
  entryPlan: EntryPlan;
}) {
  if (id === 'history') return <ActualTable/>;
  if (id === 'business') return <RevenueChart/>;
  if (id === 'industry') return <div className="peer-grid">{auoPeerComparison.map((peer) => <article key={peer.company}><span>{peer.role}</span><h3>{peer.company}</h3><p className="peer-signal">{peer.signal}</p><p>{peer.implication}</p></article>)}</div>;
  if (id === 'growth') return <div className="driver-list">{auoGrowthDrivers.map((driver, index) => <article key={driver.title}><div className="driver-index">{String(index + 1).padStart(2, '0')}</div><div><h3>{driver.title}</h3><dl><dt>證據</dt><dd>{driver.evidence}</dd><dt>財務傳導</dt><dd>{driver.transmission}</dd><dt>何時反映</dt><dd>{driver.timing}</dd><dt>模型假設</dt><dd>{driver.financial}</dd><dt>反證</dt><dd>{driver.falsifier}</dd></dl><SourceLinks ids={driver.sources}/></div></article>)}</div>;
  if (id === 'valuation') return <><ForecastTable/><AnnualOutlookTable/><ValuationTable/><div className="reverse-box"><p className="eyebrow">現價反推</p><strong>20x P/E 需要 EPS {reverse20.eps.toFixed(2)} 元</strong><span>相當於歸屬普通股淨利約 {nf.format(reverse20.netIncome)} 百萬元、淨利率 {fmt(reverse20.netMargin * 100, '%')}。這比 2026H1 的獲利基礎高出一大段。</span></div></>;
  if (id === 'entry' && technical) return <><PriceChart technical={technical}/><div className="indicator-strip">{[
    ['MA5', technical.ma5], ['MA20', technical.ma20], ['MA60', technical.ma60], ['MA120', technical.ma120], ['MA240', technical.ma240], ['MACD', technical.macd], ['RSI14', technical.rsi14], ['ATR14', technical.atr14],
  ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{typeof value === 'number' ? value.toFixed(2) : '—'}</strong></div>)}</div>{technical.stale ? <div className="reverse-box"><p className="eyebrow">技術資料已過期</p><strong>所有進場、目標與失效價暫停使用</strong><span>最後完整交易日為 {technical.asOf}；取得新資料並重算前，不顯示可執行價格。</span></div> : <div className="scenario-cards"><article><span>劇本 A｜回測承接</span><h3>{fmt(entryPlan.pullback.lower)}–{fmt(entryPlan.pullback.upper)} 元</h3><p>量縮回測、守住區間並重新轉強才觸發。日收盤低於 {fmt(entryPlan.pullback.invalidation)} 元失效；目標 {fmt(entryPlan.pullback.firstTarget)}／{fmt(entryPlan.pullback.secondTarget)} 元，估算報酬風險比 {fmt(entryPlan.pullback.rewardRisk)}。</p></article><article><span>劇本 B｜放量突破</span><h3>收盤 &gt; {fmt(entryPlan.breakout.trigger)} 元</h3><p>成交量至少 {nf.format((entryPlan.breakout.minimumVolume ?? 0) / 1_000)} 張，且隔日不跌回。低於 {fmt(entryPlan.breakout.invalidation)} 元失效；量度目標 {fmt(entryPlan.breakout.secondTarget)} 元，報酬風險比 {fmt(entryPlan.breakout.rewardRisk)}。</p></article><article className="danger-card"><span>劇本 C｜條件失敗</span><h3>跌破 {fmt(entryPlan.pullback.invalidation)} 元</h3><p>或突破後兩日內跌回壓力下方，取消波段假設。期限二十個交易日，逾期用新資料重算。</p></article></div>}</>;
  if (id === 'monitor') return <div className="table-scroll"><table><caption>研究更新條件</caption><thead><tr><th>頻率</th><th>追蹤項目</th><th>上修信號</th><th>下修信號</th></tr></thead><tbody>{auoMonitoringChecklist.map((row) => <tr key={row.metric}><th>{row.cadence}</th><td>{row.metric}</td><td>{row.upgrade}</td><td>{row.downgrade}</td></tr>)}</tbody></table></div>;
  return null;
}

export default function AuoDeepDiveReport() {
  const technical = calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date());
  const entryPlan = buildEntryPlan(technical);
  const technicalUnavailable = !technical || technical.stale;
  const base2027 = baseScenario.annual.find((row) => row.year === 2027)!;
  return (
    <main className="report-page">
      <header className="hero" id="top">
        <div className="hero-rule"><span>STOCKINSIDER / DEEP RESEARCH</span><span>研究版本 {AUO_RESEARCH_VERSION}</span></div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">友達光電 2409 · 6–18 個月基本面／數週至三個月技術條件</p>
            <h1>轉型已進財報，<br/>估值卻先跑到前面。</h1>
            <p className="deck">Mobility 與 Vertical 已經獲利，但 Display 仍吞掉多數成果。30.35 元反映的不只是面板回溫，而是 2027 年三支柱同時改善。短線多頭結構成立，中期安全邊際尚未出現。</p>
          </div>
          <div className="price-stamp"><span>最新完整交易日</span><strong>NT$ {AUO_PRICE.toFixed(2)}</strong><small>{AUO_AS_OF} · TWSE</small></div>
        </div>
        <div className="verdict-grid">
          <article><span>中期投資吸引力</span><strong className="caution">偏低</strong><p>基本情境參考價 ${baseScenario.valuation.referenceValue.toFixed(1)}；現價高於歷史 P/B 上緣推得的樂觀情境。</p></article>
          <article><span>短期波段條件</span><strong className="watch">{technicalUnavailable ? '資料過期，停用價位' : '偏多，等待'}</strong><p>{technicalUnavailable ? `最後完整交易日 ${technical?.asOf ?? '待確認'}；取得新資料並重算前不提供進場價格。` : `均線多頭、動能為正；等回測承接或 ${fmt(entryPlan.breakout.trigger)} 元放量突破。`}</p></article>
          <article><span>2027 基本情境</span><strong>EPS {base2027.normalizedEps.toFixed(2)}</strong><p>Forward P/E {fmt(calculateForwardPe(AUO_PRICE, base2027.normalizedEps), 'x')}；接近損平時倍數敏感。</p></article>
        </div>
        <p className="hero-footnote">研究用途，不構成個人化投資建議。事實、公司指引、研究估計與情境已分開標示。</p>
      </header>

      <div className="report-layout">
        <aside className="toc"><p>章節</p>{auoArticleSections.map((section) => <a href={`#${section.id}`} key={section.id}><span>{section.number}</span>{section.title.split('：')[0]}</a>)}<a href="#appendix"><span>09</span>來源與假設</a></aside>
        <article className="article-body">
          <section className="opening-note"><p className="eyebrow">焦點內容</p><h2>這不是「面板會不會漲」的一題研究</h2><p>友達的估值分母仍是重資產面板，估值分子卻開始加入車用系統與垂直場域。正確的方法不是替整家公司挑一個漂亮的 P/E，而是分業務推演收入與利潤，再問市場價格要求哪一組假設同時成真。</p></section>
          {auoArticleSections.map((section) => <section className="report-section" id={section.id} key={section.id}><div className="section-heading"><span>{section.number}</span><h2>{section.title}</h2></div>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}{index === section.paragraphs.length - 1 ? <SourceLinks ids={section.sources}/> : null}</p>)}<SectionExtras id={section.id} technical={technical} entryPlan={entryPlan}/></section>)}

          <section className="report-section appendix" id="appendix">
            <div className="section-heading"><span>09</span><h2>來源、假設與可重算邊界</h2></div>
            <p>重要數字優先回到友達法說、財報與交易所；產業研究與同業資料用來調整假設。月營收完整序列來自公開資料鏡像，最近月份已用公司公告交叉核對。研究沒有宣稱搜盡所有文章，也不把無法核對的說法寫成事實。</p>
            <div className="assumption-list">{auoAssumptions.map((item) => <article key={item.id}><span>{item.id}</span><div><strong>{item.label}｜{item.value}</strong><p>{item.basis}</p></div></article>)}</div>
            <h3 className="appendix-title">完整來源明細</h3>
            <ol className="source-list">{auoSources.map((source) => <li key={source.id} id={`source-${source.id}`}><span>{source.id}</span><div><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p>{source.type} · {source.date} · {source.supports}</p></div></li>)}</ol>
            <div className="method-note"><strong>旺宏格式說明</strong><p>本頁依已找回的「焦點內容／投資判斷／財務數據及估值」要求編排，並加入定錨式因果鏈與反證。原旺宏 PDF 仍是 iCloud 佔位檔，本版尚未重新逐頁核對其本文；沒有用舊 seed 數字冒充原報告內容。</p></div>
          </section>
        </article>
      </div>
      <footer><a href="#top">回到頁首 ↑</a><span>{AUO_RESEARCH_VERSION} · built from one versioned research artifact</span></footer>
    </main>
  );
}
