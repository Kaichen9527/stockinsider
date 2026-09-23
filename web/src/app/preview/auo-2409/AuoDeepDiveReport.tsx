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
  auoMarketEvents,
  auoMonitoringChecklist,
  auoMonthlyRevenue,
  auoPeerComparison,
  auoQuarterlyActuals,
  auoScenarioAdjustments,
  auoSources,
  auoTransformationMilestones,
} from '@/lib/auo-deep-dive-v1';
import {
  buildEntryPlan,
  buildForecastScenario,
  calculateForwardPe,
  calculateTechnicalSnapshot,
  combineActualAndForecastYear,
  discountedFutureValue,
  evaluateFrozenBreakoutSetup,
  requiredEarningsAtMultiple,
  requiredFutureEps,
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
const bullScenario = scenarios.find((scenario) => scenario.id === 'bull')!;
const reverse20 = requiredEarningsAtMultiple(AUO_PRICE, 20, AUO_DILUTED_SHARES_MILLION, 283_000);
const reverse24 = requiredEarningsAtMultiple(AUO_PRICE, 24, AUO_DILUTED_SHARES_MILLION, 283_000);
const sourceById = new Map(auoSources.map((source) => [source.id, source]));
const priceBars = priceHistory as PriceBar[];
const originalBars = priceBars.filter((bar) => bar.date <= '115/09/18');
const originalSnapshot = calculateTechnicalSnapshot(originalBars, new Date('2026-09-18T12:00:00Z'));
const originalPlan = buildEntryPlan(originalSnapshot);
const frozenBreakout = evaluateFrozenBreakoutSetup(priceBars, {
  publishedAt: '115/09/18',
  trigger: originalPlan.breakout.trigger ?? 32.2,
  minimumVolume: originalPlan.breakout.minimumVolume ?? 0,
  invalidation: originalPlan.breakout.invalidation ?? 28.4,
  target: originalPlan.breakout.secondTarget ?? 36.6,
  expiresAfterTradingSessions: 20,
});
const setupStatusLabel = {
  waiting: '等待', triggered: '已觸發', confirmed: '已確認', failed: '已失效', expired: '已到期', target_reached: '目標已到達',
} as const;

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
  const maxVolume = Math.max(...rows.map((row) => row.volume));
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
        {rows.map((row, index) => <rect key={`v-${row.date}`} x={x(index) - 2} y={height - pad.bottom - (row.volume / maxVolume) * 52} width="4" height={(row.volume / maxVolume) * 52} className="volume-bar"/>)}
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
        <thead><tr><th>期間</th><th>Mobility</th><th>Vertical</th><th>Display</th><th>其他</th><th>合併營收</th><th>營業利益</th><th>正常化淨利</th><th>正常化 EPS</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.period}><th>{row.period}</th><td>{nf.format(row.segments.mobility.revenue)}</td><td>{nf.format(row.segments.vertical.revenue)}</td><td>{nf.format(row.segments.display.revenue)}</td><td>{nf.format(row.segments.other.revenue)}</td><td>{nf.format(row.revenue)}</td><td className={row.operatingIncome < 0 ? 'negative' : ''}>{nf.format(row.operatingIncome)}</td><td className={row.normalizedNetIncome < 0 ? 'negative' : ''}>{nf.format(row.normalizedNetIncome)}</td><td>{row.normalizedEps.toFixed(2)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ValuationTable() {
  return (
    <div className="table-scroll">
      <table>
        <caption>2027 傳統營運情境｜P/E 主估、P/B 作資產交叉檢查</caption>
        <thead><tr><th>情境</th><th>營收</th><th>營益率</th><th>正常化 EPS</th><th>{AUO_PRICE.toFixed(2)} 元 P/E</th><th>P/E 情境值</th><th>Forward BVPS</th><th>P/B 分位錨點</th><th>P/B 交叉值</th></tr></thead>
        <tbody>{scenarios.map((scenario) => {
          const annual = scenario.annual.find((row) => row.year === 2027)!;
          return <tr key={scenario.id}><th>{scenario.label}</th><td>{nf.format(annual.revenue)}</td><td>{fmt(annual.operatingIncome / annual.revenue * 100, '%')}</td><td>{annual.normalizedEps.toFixed(2)}</td><td>{fmt(calculateForwardPe(AUO_PRICE, annual.normalizedEps), 'x')}</td><td className="value-cell">{scenario.valuation.peValue === null ? '不適用' : `$${scenario.valuation.peValue.toFixed(1)}`}</td><td>${scenario.valuation.forwardBvps.toFixed(2)}</td><td>{scenario.valuation.fairPb.toFixed(2)}x</td><td>${scenario.valuation.pbValue.toFixed(1)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function EventTimeline() {
  return <div className="event-timeline">{auoMarketEvents.map((event) => <article key={`${event.date}-${event.title}`}><time>{event.date}</time><div><span>{event.label}</span><h3>{event.title}</h3><p>{event.detail}</p><strong>{event.impact}</strong><SourceLinks ids={event.sources}/></div></article>)}</div>;
}

function TransformationTable() {
  const epsRows = [1.5, 2, 2.5];
  const multiples = [16, 20, 24];
  const implied2029Eps = requiredFutureEps(AUO_PRICE, 20, 2.25, 0.12);
  return <><div className="table-scroll"><table><caption>轉型證據階梯｜每跨一級才允許增加模型內容</caption><thead><tr><th>階段</th><th>目前狀態</th><th>必須看到</th><th>估值處理</th><th>反證</th></tr></thead><tbody>{auoTransformationMilestones.map((row) => <tr key={row.stage}><th>{row.stage}</th><td>{row.state}</td><td>{row.evidence}</td><td>{row.valuation}</td><td>{row.falsifier}</td></tr>)}</tbody></table></div><div className="table-scroll"><table><caption>2029 正常化 EPS 敏感度｜折現率 12%、約 2.25 年折回；單位：元</caption><thead><tr><th>2029 EPS</th>{multiples.map((multiple) => <th key={multiple}>{multiple}x</th>)}</tr></thead><tbody>{epsRows.map((eps) => <tr key={eps}><th>{eps.toFixed(1)}</th>{multiples.map((multiple) => <td key={multiple}>{fmt(discountedFutureValue(eps, multiple, 2.25, 0.12))}</td>)}</tr>)}</tbody></table><p className="table-note">這是條件敏感度，不是目標價。{AUO_PRICE.toFixed(2)} 元若以 2029 年 20 倍、12%折現反推，需要 2029 EPS 約 {fmt(implied2029Eps)} 元；後續必須由客戶、產能、良率與毛利證據填入收入橋接。</p></div></>;
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

function SectionExtras({ id, technical }: {
  id: string;
  technical: TechnicalSnapshot | null;
}) {
  if (id === 'history') return <ActualTable/>;
  if (id === 'business') return <RevenueChart/>;
  if (id === 'industry') return <div className="peer-grid">{auoPeerComparison.map((peer) => <article key={peer.company}><span>{peer.role}</span><h3>{peer.company}</h3><p className="peer-signal">{peer.signal}</p><p>{peer.implication}</p></article>)}</div>;
  if (id === 'growth') return <><EventTimeline/><div className="driver-list">{auoGrowthDrivers.map((driver, index) => <article key={driver.title}><div className="driver-index">{String(index + 1).padStart(2, '0')}</div><div><h3>{driver.title}</h3><dl><dt>證據</dt><dd>{driver.evidence}</dd><dt>財務傳導</dt><dd>{driver.transmission}</dd><dt>何時反映</dt><dd>{driver.timing}</dd><dt>模型假設</dt><dd>{driver.financial}</dd><dt>反證</dt><dd>{driver.falsifier}</dd></dl><SourceLinks ids={driver.sources}/></div></article>)}</div></>;
  if (id === 'valuation') return <><ForecastTable/><AnnualOutlookTable/><ValuationTable/><TransformationTable/><div className="reverse-box"><p className="eyebrow">現價反推</p><strong>2027 EPS 需 {reverse20.eps.toFixed(2)} 元（20x）／{reverse24.eps.toFixed(2)} 元（24x）</strong><span>20 倍情境相當於歸屬普通股淨利約 {nf.format(reverse20.netIncome)} 百萬元、淨利率 {fmt(reverse20.netMargin * 100, '%')}。市場目前支付的是傳統營運改善加轉型選擇權。</span></div></>;
  if (id === 'entry' && technical) return <><PriceChart technical={technical}/><div className="indicator-strip">{[
    ['MA5', technical.ma5], ['MA20', technical.ma20], ['MA60', technical.ma60], ['MA120', technical.ma120], ['MA240', technical.ma240], ['MACD', technical.macd], ['RSI14', technical.rsi14], ['ATR14', technical.atr14],
  ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{typeof value === 'number' ? value.toFixed(2) : '—'}</strong></div>)}</div>{technical.stale ? <div className="reverse-box"><p className="eyebrow">技術資料已過期</p><strong>所有新進場價位暫停使用</strong><span>最後完整交易日為 {technical.asOf}；補齊資料前不產生新劇本。</span></div> : <div className="scenario-cards"><article className="completed-card"><span>9/19 原放量突破劇本</span><h3>{setupStatusLabel[frozenBreakout.status]}</h3><p>固定門檻 {fmt(frozenBreakout.trigger)} 元、最低量 {nf.format(frozenBreakout.minimumVolume / 1_000)} 張；{frozenBreakout.triggerDate ? `${frozenBreakout.triggerDate} 觸發` : '尚未觸發'}，{frozenBreakout.terminalDate ? `${frozenBreakout.terminalDate} 到達 ${fmt(frozenBreakout.target)} 元` : '尚未終止'}。</p></article><article><span>新部位｜等待整理</span><h3>第一天回檔，不急著接</h3><p>9/23 收 34.70 元、成交 9.49 億股，仍高於 32.2 元原突破區，但尚未完成量縮整理與重新轉強。形成新價格結構後再計算報酬風險比。</p></article><article className="danger-card"><span>事件失效條件</span><h3>證據沒有跟上價格</h3><p>合作否認、驗證延後、跌回原突破區，或只有同源轉載而無新增獨立證據，均降低事件交易的勝率。</p></article></div>}</>;
  if (id === 'monitor') return <div className="table-scroll"><table><caption>研究更新條件</caption><thead><tr><th>頻率</th><th>追蹤項目</th><th>上修信號</th><th>下修信號</th></tr></thead><tbody>{auoMonitoringChecklist.map((row) => <tr key={row.metric}><th>{row.cadence}</th><td>{row.metric}</td><td>{row.upgrade}</td><td>{row.downgrade}</td></tr>)}</tbody></table></div>;
  return null;
}

export default function AuoDeepDiveReport() {
  const technical = calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date());
  const technicalUnavailable = !technical || technical.stale;
  const base2027 = baseScenario.annual.find((row) => row.year === 2027)!;
  return (
    <main className="report-page">
      <header className="hero" id="top">
        <div className="hero-rule"><span>STOCKINSIDER / DEEP RESEARCH</span><span>研究版本 {AUO_RESEARCH_VERSION}</span></div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">友達光電 2409 · 6–18 個月基本面／數週至三個月技術條件</p>
            <h1>36.65 元後回落<br/>證據仍沒增加。</h1>
            <p className="deck">9/23 收 34.70 元、成交 9.49 億股，從 36.65 元高點回落 5.32%。友達 8/31 已公開 CPO／GCS 進展，Intel 合作仍屬傳聞；價格先換手，客戶與量產證據仍待驗證。</p>
          </div>
          <div className="price-stamp"><span>最新完整交易日</span><strong>NT$ {AUO_PRICE.toFixed(2)}</strong><small>{AUO_AS_OF} · TWSE</small></div>
        </div>
        <div className="verdict-grid">
          <article><span>中期判斷</span><strong className="caution">轉型待驗證</strong><p>傳統營運樂觀情境約 ${bullScenario.valuation.peValue?.toFixed(1)}；34.70 元仍包含尚未量化的商業化期待。</p></article>
          <article><span>短期波段</span><strong className="watch">{technicalUnavailable ? '資料過期' : setupStatusLabel[frozenBreakout.status]}</strong><p>{technicalUnavailable ? `最後完整交易日 ${technical?.asOf ?? '待確認'}。` : `原 32.2 元突破已觸發、36.6 元量度目標已到；9/23 回檔但未跌破突破區，新部位等整理確認。`}</p></article>
          <article><span>現價反映</span><strong>2027E P/E {fmt(calculateForwardPe(AUO_PRICE, base2027.normalizedEps), 'x')}</strong><p>基本 EPS {base2027.normalizedEps.toFixed(2)}；20x／24x 分別需要 EPS {reverse20.eps.toFixed(2)}／{reverse24.eps.toFixed(2)} 元。</p></article>
        </div>
        <p className="hero-footnote">研究用途，不構成個人化投資建議。事實、公司指引、研究估計與情境已分開標示。</p>
      </header>

      <div className="report-layout">
        <aside className="toc"><p>章節</p>{auoArticleSections.map((section) => <a href={`#${section.id}`} key={section.id}><span>{section.number}</span>{section.title.split('：')[0]}</a>)}<a href="#appendix"><span>09</span>來源與假設</a></aside>
        <article className="article-body">
          <section className="opening-note"><p className="eyebrow">本次重估</p><h2>34.70 元仍高於傳統營運樂觀值</h2><p>市場正在交易面板循環、車用與垂直場域，再加上 CPO／玻璃核心基板的技術選擇權。9/23 高檔回落並未帶來新的客戶或量產證據；本文保存原突破劇本，同時把最新價格、估值反推與後續等待條件更新到同一版本。</p></section>
          {auoArticleSections.map((section) => <section className="report-section" id={section.id} key={section.id}><div className="section-heading"><span>{section.number}</span><h2>{section.title}</h2></div>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}{index === section.paragraphs.length - 1 ? <SourceLinks ids={section.sources}/> : null}</p>)}<SectionExtras id={section.id} technical={technical}/></section>)}

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
