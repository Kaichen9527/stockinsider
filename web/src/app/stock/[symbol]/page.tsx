import Link from 'next/link';
import { notFound } from 'next/navigation';
import StockChart from '@/components/StockChart';
import { getStockDeepDiveLookup, runStockResearchRefresh } from '@/lib/domain';
import AutoRefreshDeepDive from './AutoRefreshDeepDive';
import PendingDeepDive from './PendingDeepDive';

export const dynamic = 'force-dynamic';

const sourceTypeLabel: Record<string, string> = {
  official: '官方資料',
  financial: '財務數據',
  broker_report: '外資 / 券商',
  public_research: '公開研究',
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  bulltalk: '股市爆料同學會',
  ptt: 'PTT Stock',
  kol: '台股 KOL',
  news: '新聞',
  industry: '產業資料',
  podcast: 'Podcast',
  youtube: 'YouTube',
  twse_insider: '董監持股揭露',
  company_event: '公司事件',
  valuation: '估值',
  system: '系統',
  broker: '券商',
  imported_pdf: '匯入報告',
  news_summary: '新聞摘要',
  social: '社群',
  internal_estimate: '研究推估',
};

const connectorLabel: Record<string, string> = {
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  ptt: 'PTT Stock',
  bulltalk: '股市爆料同學會',
  googlenews: 'Google News',
  anue: '鉅亨網',
  udn: 'UDN',
  mobile01: 'Mobile01',
  twse_insider: '董監持股揭露',
};

const ratingFromState: Record<string, { label: string; color: string }> = {
  actionable_setup: { label: '買進', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  validated_thesis: { label: '增持', color: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' },
  partially_verified: { label: '觀察', color: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  signal_candidate: { label: '追蹤', color: 'bg-slate-950/8 text-slate-700 dark:text-emerald-100/72' },
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '未知';
  return value.toFixed(digits);
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '未知';
  return `NT$${value.toFixed(2)}`;
}

function formatTaiwanLargeNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '未知';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(1)} 億`;
  if (abs >= 10000) return `${(value / 10000).toFixed(1)} 萬`;
  return value.toLocaleString('zh-TW');
}

function formatRevenueDisplay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return '待補';
  return formatTaiwanLargeNumber(value);
}

function formatEpsDisplay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return '待補';
  return formatNumber(value);
}

function formatPeDisplay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return '待補';
  if (value <= 0 || value > 120) return '不具參考性';
  return `${formatNumber(value)}x`;
}

function formatPbDisplay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return '待補';
  return `${formatNumber(value)}x`;
}

function isWeakEvidenceText(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return false;
  return (
    /目前以.+作為主要依據/.test(text) ||
    text.includes('若缺直接客戶公告') ||
    text.includes('不直接視為已公告訂單') ||
    text.includes('對應的產品線、既有營收結構與公開產業追蹤') ||
    text.includes('本報告把共同基底') ||
    text.includes('Base 財務推導與情境差分')
  );
}

function evidenceDisplay(value: string | null | undefined, pending: string) {
  if (!value || isWeakEvidenceText(value)) return pending;
  return value;
}

function formatTargetOrState(value: number | null | undefined, fallbackLabel: string) {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallbackLabel;
  return `NT$${value.toFixed(2)}`;
}

function formatSignedPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '未知';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

function formatDate(value: string | null | undefined) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

function freshnessLabel(freshness: string | null | undefined) {
  if (freshness === 'fresh') return '資料新';
  if (freshness === 'stale') return '資料偏舊';
  return '資料待補';
}

function dataHealthTone(status: string | null | undefined) {
  if (status === 'healthy') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (status === 'research_stale') return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
  if (status === 'market_stale') return 'bg-orange-500/12 text-orange-700 dark:text-orange-300';
  return 'bg-slate-950/8 text-slate-700 dark:text-emerald-100/70';
}

function dataHealthLabel(status: string | null | undefined) {
  if (status === 'healthy') return '資料健康';
  if (status === 'research_stale') return '研究證據偏舊';
  if (status === 'market_stale') return '市場資料偏舊';
  return '資料待補';
}

function valuationSanityLabel(status: string | null | undefined) {
  if (!status || status === 'normal') return 'Base 可正式採用';
  if (status === 'over_target') return '估值已反映';
  if (status === 'stale_multiple') return '倍數需覆核';
  if (status === 'unit_mismatch') return '公式需覆核';
  return '估值覆核中';
}

function valuationSanityTone(status: string | null | undefined) {
  if (!status || status === 'normal') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (status === 'over_target') return 'bg-slate-950/8 text-slate-700 dark:text-emerald-100/70';
  return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
}

function connectorStatusLabel(status: string) {
  if (status === 'success' || status === 'valid') return '正常';
  if (status === 'running') return '同步中';
  if (status === 'timed_out') return '逾時待重試';
  if (status === 'failed' || status === 'invalid') return '失敗';
  return '待確認';
}

function formatMaybePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '研究推估';
  return `${value.toFixed(1)}%`;
}

function formatMaybeMultiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '研究推估';
  return `${value.toFixed(1)}x`;
}

function formatCurrentMultiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '研究推估';
  if (value <= 0 || value > 120) return '不具參考性';
  return `${value.toFixed(1)}x`;
}

type CitationRef = {
  id: string;
  label: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  asOf: string | null;
  evidenceClass: string;
};

function renderCitationRefs(refs: CitationRef[] | undefined, emptyLabel: string | null = '來源待補') {
  if (!refs || refs.length === 0) {
    if (emptyLabel == null) return null;
    return <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">{emptyLabel}</p>;
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {refs.slice(0, 4).map((ref) =>
        ref.sourceUrl ? (
          <a
            key={ref.id}
            href={ref.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-accent underline-offset-2 hover:underline"
          >
            [{ref.id}] {ref.sourceName}
          </a>
        ) : (
          <span key={ref.id} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-slate-600 dark:text-emerald-100/65">
            [{ref.id}] {ref.sourceName}
          </span>
        ),
      )}
    </div>
  );
}

function renderValuationCaseDetail(
  heading: string,
  detail:
    | {
        driver?: string | null;
        deltaAssumptions?: string[];
        hasIndependentDelta?: boolean;
        marketSizingBridge?: string | null;
        revenueBridge?: string | null;
        marginBridge?: string | null;
        earningsBridge?: string | null;
        multipleBridge?: string | null;
        priceBridge?: string | null;
        benchmarkRange?: string | null;
        currentPeRatio?: number | null;
        currentPbRatio?: number | null;
        targetPeRatio?: number | null;
        targetPbRatio?: number | null;
        projectedRevenueAnnual?: number | null;
        projectedGrossMarginPct?: number | null;
        projectedOperatingMarginPct?: number | null;
        projectedEps?: number | null;
        targetPrice?: number | null;
        expectedReturnPct?: number | null;
        evidenceRefs?: string[];
        evidenceBasis?: string[];
        sourceRefs?: CitationRef[];
        achievementChecklist?: Array<{
          label: string;
          status: '已達成' | '部分達成' | '尚待驗證' | '資料過期';
          summary: string;
          currentValue?: string | null;
          threshold?: string | null;
          updatedAt?: string | null;
          sourceRefs?: string[];
        }>;
        customerExposure?: string | null;
        transcriptEvidence?: string | null;
        monthlyRevenueEvidence?: string | null;
        productMixEvidence?: string | null;
        marketShareEvidence?: string | null;
        isEstimated?: boolean;
        bridgeCompleteness?: 'complete' | 'insufficient';
        insufficientBridgeReason?: string | null;
        estimatedFields?: string[];
      }
    | null
    | undefined,
) {
  const isInsufficient = detail?.bridgeCompleteness === 'insufficient';
  const insufficiencyReason = detail?.insufficientBridgeReason || '目前研究推估不足，暫不產出正式目標價。';
  const detailBlocks = [
    {
      label: '市場份額 / TAM',
      value: evidenceDisplay(detail?.marketSizingBridge, insufficiencyReason),
    },
    {
      label: '營收橋接',
      value: evidenceDisplay(detail?.revenueBridge, insufficiencyReason),
    },
    {
      label: '毛利率 / 營益率',
      value: evidenceDisplay(detail?.marginBridge, insufficiencyReason),
    },
    {
      label: 'EPS 推導',
      value: evidenceDisplay(detail?.earningsBridge, insufficiencyReason),
    },
    {
      label: '估值倍數',
      value: evidenceDisplay(detail?.multipleBridge, insufficiencyReason),
    },
    {
      label: '價格推導',
      value: evidenceDisplay(detail?.priceBridge, insufficiencyReason),
    },
  ];

  return (
    <article className="rounded-[1.4rem] border border-line bg-surface-strong p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">{heading}</p>
          <h4 className="mt-2 text-lg font-semibold">{detail?.driver || '等待更完整的股別估值橋接'}</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail?.isEstimated ? (
              <p className="inline-flex rounded-full border border-line px-2 py-1 text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/55">
                研究推估
              </p>
            ) : null}
            {isInsufficient ? (
              <p className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] tracking-[0.16em] text-amber-700 dark:text-amber-300">
                推估不足
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">推導目標價</p>
          <p className="mt-1 text-xl font-semibold">{isInsufficient ? '暫不產出' : formatTargetOrState(detail?.targetPrice, '研究推估')}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">
            對現價 {isInsufficient ? '待橋接' : detail?.expectedReturnPct != null ? formatSignedPct(detail.expectedReturnPct) : '研究推估'}
          </p>
        </div>
      </div>
      {isInsufficient ? (
        <p className="mt-3 rounded-[1rem] border border-amber-400/35 bg-amber-500/8 px-3 py-2 text-sm leading-6 text-amber-800 dark:text-amber-200">
          {insufficiencyReason}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1rem] border border-line bg-surface p-3 text-sm leading-6">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">預估營收</p>
          <p className="mt-1 font-semibold">{formatRevenueDisplay(detail?.projectedRevenueAnnual)}</p>
        </div>
        <div className="rounded-[1rem] border border-line bg-surface p-3 text-sm leading-6">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">毛利率 / 營益率</p>
          <p className="mt-1 font-semibold">
            {formatMaybePercent(detail?.projectedGrossMarginPct)} / {formatMaybePercent(detail?.projectedOperatingMarginPct)}
          </p>
        </div>
        <div className="rounded-[1rem] border border-line bg-surface p-3 text-sm leading-6">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">預估 EPS</p>
          <p className="mt-1 font-semibold">{detail?.projectedEps != null ? formatEpsDisplay(detail.projectedEps) : '研究推估'}</p>
        </div>
        <div className="rounded-[1rem] border border-line bg-surface p-3 text-sm leading-6">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">目前 / 採用 PE(PB)</p>
          <p className="mt-1 font-semibold">
            {formatCurrentMultiple(detail?.currentPeRatio)} ({formatCurrentMultiple(detail?.currentPbRatio)}) → {formatMaybeMultiple(detail?.targetPeRatio)} ({formatMaybeMultiple(detail?.targetPbRatio)})
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {detailBlocks.map((block, index) => (
          <article key={`${heading}-detail-${index}`} className="rounded-[1rem] border border-line bg-surface p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
            <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">{block.label}</p>
            <p className="mt-2">{block.value}</p>
          </article>
        ))}
      </div>

      {detail?.deltaAssumptions && detail.deltaAssumptions.length > 0 ? (
        <div className="mt-4 rounded-[1rem] border border-line bg-surface p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">比 Base 多出的待驗證上行假設</p>
          <ul className="mt-2 space-y-2">
            {detail.deltaAssumptions.map((item, index) => (
              <li key={`${heading}-delta-${index}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail?.achievementChecklist && detail.achievementChecklist.length > 0 ? (
        <div className="mt-4 rounded-[1rem] border border-accent/20 bg-accent-soft p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">情境達成清單</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {detail.achievementChecklist.map((item, index) => (
              <article key={`${heading}-achievement-${index}`} className="rounded-[0.9rem] border border-line bg-surface px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{item.label}</p>
                  <span className="rounded-full bg-slate-950/8 px-2.5 py-1 text-[11px] text-slate-700 dark:text-emerald-100/70">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">{item.summary}</p>
                <div className="mt-3 grid gap-2 text-[11px] leading-5 text-slate-600 dark:text-emerald-100/60 sm:grid-cols-2">
                  <p className="rounded-lg bg-slate-950/5 px-2 py-1 dark:bg-emerald-100/8">目前：{item.currentValue || '待補'}</p>
                  <p className="rounded-lg bg-slate-950/5 px-2 py-1 dark:bg-emerald-100/8">門檻：{item.threshold || '待補'}</p>
                </div>
                {item.updatedAt ? (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-emerald-100/50">更新：{formatDate(item.updatedAt)}</p>
                ) : null}
                {item.sourceRefs && item.sourceRefs.length > 0 ? (
                  <p className="mt-2 text-[11px] tracking-[0.12em] text-slate-500 dark:text-emerald-100/50">
                    {item.sourceRefs.slice(0, 3).map((id) => `[${id}]`).join(' ')}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-[1rem] border border-line bg-surface p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
        <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">同業比較與研究註記</p>
        <p className="mt-2">同業區間：{detail?.benchmarkRange || '研究推估'}</p>
        {detail?.currentPeRatio != null && (!Number.isFinite(detail.currentPeRatio) || detail.currentPeRatio <= 0 || detail.currentPeRatio > 120) ? (
          <p className="mt-1">目前 TTM PE 不具參考性，較適合改看 normalized / forward PE 與同業區間。</p>
        ) : null}
        <p className="mt-1">{detail?.isEstimated ? '這個情境含研究推估欄位，請配合最新法說與財務資料動態調整。' : '此情境主要根據目前可驗證的財務與產業資料推導。'}</p>
        {detail?.estimatedFields && detail.estimatedFields.length > 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
            研究推估欄位：{detail.estimatedFields.join('、')}
          </p>
        ) : null}
        {renderCitationRefs(detail?.sourceRefs, '這個估值框架目前缺少可外連來源，請以 appendix 的完整來源為準。')}
      </div>
    </article>
  );
}

function renderSharedVerifiedBasis(
  basis:
    | {
        summary?: string | null;
        customerExposure?: string | null;
        transcriptEvidence?: string | null;
        monthlyRevenueEvidence?: string | null;
        productMixEvidence?: string | null;
        marketShareEvidence?: string | null;
        currentFinancialBaseline?: string | null;
        evidenceBasis?: string[];
        sourceRefs?: CitationRef[];
        supplyChainMap?: {
          upstream: string[];
          downstream: string[];
          potentialCustomers: string[];
          evidenceStatus: '具名官方/法說證據' | '供應鏈映射推估' | '未取得可引用來源';
          summary: string;
          sourceRefs?: string[];
        } | null;
        customerEvidenceStatus?: '具名官方/法說證據' | '供應鏈映射推估' | '未取得可引用來源';
      }
    | null
    | undefined,
) {
  if (!basis) return null;
  const customerStatus = basis.customerEvidenceStatus || basis.supplyChainMap?.evidenceStatus || '未取得可引用來源';
  const customerValue =
    customerStatus === '具名官方/法說證據'
      ? evidenceDisplay(basis.customerExposure, '已取得客戶 / 訂單來源，但摘要待補。')
      : customerStatus === '供應鏈映射推估'
        ? basis.supplyChainMap?.summary || '供應鏈映射推估：未具名或未公告部分不納入 Base，只列為情境待驗證。'
        : '未納入 Base；僅列為情境待驗證條件。';
  const basisBlocks = [
    {
      label: '客戶 / 訂單依據',
      badge: customerStatus,
      value: customerValue,
    },
    { label: '法說 / 官方依據', badge: null, value: evidenceDisplay(basis.transcriptEvidence, '法說 / 官方依據待補；請以已引用的財報、月營收與來源附錄為準。') },
    { label: '月營收 / run-rate', badge: null, value: evidenceDisplay(basis.monthlyRevenueEvidence, '月營收 run-rate 待補；不以空泛研究推估取代官方月營收。') },
    {
      label: '產品 mix / 市場份額',
      badge: null,
      value:
        evidenceDisplay(
          [basis.productMixEvidence, basis.marketShareEvidence].filter((item): item is string => Boolean(item)).join(' '),
          '產品 mix / 市場份額直接來源待補；只能作情境追蹤，不視為已驗證 Base。',
        ),
    },
  ];
  return (
    <article className="rounded-[1.4rem] border border-line bg-surface-strong p-5 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">共同基底與來源</p>
          <h4 className="mt-2 text-lg font-semibold">只放 Base 與情境共用的已驗證事實</h4>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {basisBlocks.map((block, index) => (
          <article key={`shared-basis-${index}`} className="rounded-[1rem] border border-line bg-surface p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">{block.label}</p>
              {block.badge ? (
                <span className="rounded-full bg-slate-950/8 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-white/10 dark:text-emerald-100/65">
                  {block.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-2">{block.value}</p>
          </article>
        ))}
      </div>
      {basis.supplyChainMap ? (
        <div className="mt-4 grid gap-3 rounded-[1rem] border border-line bg-surface p-4 text-xs leading-6 text-slate-600 dark:text-emerald-100/65 md:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-800 dark:text-emerald-100">上游</p>
            <p className="mt-1">{basis.supplyChainMap.upstream.join('、')}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-emerald-100">下游</p>
            <p className="mt-1">{basis.supplyChainMap.downstream.join('、')}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-emerald-100">潛在客戶群</p>
            <p className="mt-1">{basis.supplyChainMap.potentialCustomers.join('、')}</p>
          </div>
        </div>
      ) : null}
      {basis.currentFinancialBaseline ? (
        <div className="mt-4 rounded-[1rem] border border-line bg-surface p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">目前有效財務基底</p>
          <p className="mt-2">{basis.currentFinancialBaseline}</p>
        </div>
      ) : null}
      {basis.evidenceBasis && basis.evidenceBasis.length > 0 ? (
        <div className="mt-4 rounded-[1rem] border border-line bg-surface p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">依據與驗證</p>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
            {basis.evidenceBasis.filter((item) => !isWeakEvidenceText(item)).slice(0, 4).map((item, index) => (
              <li key={`shared-basis-evidence-${index}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {renderCitationRefs(basis.sourceRefs, '共同基底來源待補，請先參考完整來源附錄。')}
    </article>
  );
}

export default async function StockDetail({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { symbol } = await params;
  const query = await searchParams;
  const normalizedSymbol = symbol.toUpperCase();
  const refresh = Array.isArray(query.refresh) ? query.refresh[0] : query.refresh;
  const caseParam = Array.isArray(query.case) ? query.case[0] : query.case;

  if (refresh === '1') {
    void runStockResearchRefresh({ symbol: normalizedSymbol, reason: 'manual_page_refresh' }).catch(() => undefined);
  }

  const deepDiveLookup = await getStockDeepDiveLookup(normalizedSymbol);

  if (deepDiveLookup.status === 'not_found') {
    notFound();
  }

  if (deepDiveLookup.status === 'pending') {
    const pendingData = deepDiveLookup.data;
    return (
      <main className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
            <Link href="/" className="inline-flex rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              回到雷達首頁
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">{pendingData.symbol} 深度分析準備中</h1>
            <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-emerald-50/85">
              系統已自動觸發：{pendingData.triggeredJobs.join('、')}。資料建模完成後，頁面會自動刷新，不需要手動重跑。
            </p>
            <div className="mt-4">
              <PendingDeepDive symbol={pendingData.symbol} retryAfterSec={pendingData.retryAfterSec} />
            </div>
          </header>
        </div>
      </main>
    );
  }

  const deepDive = deepDiveLookup.data;
  const rating = ratingFromState[deepDive.thesisState] || ratingFromState.signal_candidate;
  const recommendationStance = deepDive.recommendationStance || null;
  const dataHealth = deepDive.dataHealth || null;
  const stanceTone = recommendationStance
    ? recommendationStance.entryStance === '可小量分批'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
	      : recommendationStance.entryStance === '突破確認再追' || recommendationStance.entryStance === '突破後小量追蹤' || recommendationStance.entryStance === '等回測'
        ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
        : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
    : rating.color;
  const summaryCard = deepDive.summaryCard;
  const freshSources = deepDive.freshSourceHighlights || [];
  const reportSections = deepDive.reportSnapshot?.sections || [];
  const targetSnapshot = deepDive.targetSnapshot;
  const valuationPanel = deepDive.valuationPanel;
  const appendixEmptyState = deepDive.appendix?.emptyState;
  const currentPrice = targetSnapshot?.currentPrice ?? summaryCard?.currentPrice ?? deepDive.price ?? null;
  const baseTarget = targetSnapshot?.baseTarget ?? null;
  const scenarioTarget = targetSnapshot?.upsideTarget ?? null;
  const baseUpsidePct = targetSnapshot?.displayBaseUpsidePct ?? null;
  const scenarioUpsidePct = targetSnapshot?.displayScenarioUpsidePct ?? null;
  const reportSummaryBullets =
    deepDive.reportSnapshot?.summaryBullets && deepDive.reportSnapshot.summaryBullets.length > 0
      ? deepDive.reportSnapshot.summaryBullets.filter((item) => !isWeakEvidenceText(item)).slice(0, 3)
      : [
          valuationPanel?.sharedVerifiedBasis?.summary,
          valuationPanel?.baseCaseDetail?.driver ? `Base 主軸：${valuationPanel.baseCaseDetail.driver}` : null,
          recommendationStance?.displayLabel || deepDive.investmentConclusion,
        ].filter((item): item is string => Boolean(item && !isWeakEvidenceText(item))).slice(0, 3);
  const reportSectionPriority = ['investment', 'analysis', 'latest_evidence', 'capital_flow', 'risk'];
  const reportBodySections = reportSections
    .filter((section) => !['base_case', 'scenario_case'].includes(section.id))
    .map((section) => ({
      ...section,
      paragraphs: section.paragraphs.filter((paragraph) => !isWeakEvidenceText(paragraph)),
      bullets: section.bullets?.filter((bullet) => !isWeakEvidenceText(bullet)),
    }))
    .filter((section) => section.paragraphs.length > 0 || (section.bullets?.length || 0) > 0)
    .sort((a, b) => {
      const aIndex = reportSectionPriority.indexOf(a.id);
      const bIndex = reportSectionPriority.indexOf(b.id);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
	  const heroConclusion =
	    recommendationStance?.summary ||
    (targetSnapshot?.verdict === 'formal'
      ? '正式目標價仍高於現價，基準情境尚有上行空間。'
      : targetSnapshot?.verdict === 'scenario'
	        ? '正式目標價已接近反映，但情境目標價仍保留上行空間。'
	        : '目前更接近已反映區間，除非後續數字上修，否則不宜把它視為新的追價標的。');
  const revaluationNotice =
	    targetSnapshot?.staleReason === 'target_stale_due_price_crossed_base' ||
	    targetSnapshot?.staleReason === 'target_stale_due_price_crossed_scenario'
	      ? `${targetSnapshot.staleReason === 'target_stale_due_price_crossed_base' ? '現價已達 Base，外部改追情境價差' : '現價已達情境區間，改列熱股追蹤'}；系統已排重估，需要 ${(
	          targetSnapshot.missingRepricingEvidence || targetSnapshot.repricingRequiredEvidence || ['EPS、Forward PE、券商或官方證據上修']
	        )
	          .slice(0, 3)
	          .join('、')} 才會上修目標價。`
	      : null;
  const marketValuationAdjustment = targetSnapshot?.marketValuationAdjustment || null;
  const technicalEntrySignal = deepDive.technicalEntrySignal || null;
  const chipEntryAssessment = deepDive.chipEntryAssessment || null;
  const entryDecision = chipEntryAssessment?.entryDecision || technicalEntrySignal?.entryDecision || null;
  const tradeDecision = deepDive.tradeDecision || null;
  const activeDecisionAction = tradeDecision?.action || entryDecision?.action || recommendationStance?.displayLabel || chipEntryAssessment?.verdict || '等待進場判讀';
  const activeDecisionPosition = tradeDecision?.positionSize || entryDecision?.positionSize || chipEntryAssessment?.summary || '等待籌碼、技術與資料健康補齊。';
  const activeDecisionEntryZone = tradeDecision?.entryZone || entryDecision?.buyZone || chipEntryAssessment?.supportResistance.summary || technicalEntrySignal?.entryPlan?.entryZone || '等待支撐 / 壓力計算。';
  const activeDecisionAddCondition =
    tradeDecision?.addCondition ||
    entryDecision?.addCondition ||
    (chipEntryAssessment?.watchNumbers?.[0]
      ? `${chipEntryAssessment.watchNumbers[0].label}：${chipEntryAssessment.watchNumbers[0].value}。${chipEntryAssessment.watchNumbers[0].interpretation}`
      : valuationPanel?.nextValidationPoint || '等待下一輪月營收、法人與技術資料刷新。');
  const activeDecisionStopLoss = tradeDecision?.stopLoss || entryDecision?.stopLoss || technicalEntrySignal?.entryPlan?.invalidationLevel || '等待停損/失效價計算。';
  const activeDecisionExit = tradeDecision?.exitCondition || tradeDecision?.takeProfit || deepDive.entryExitPlan?.exit || '達到目標價、跌破停損或大盤 Gate 轉弱時重新評估。';
  const activeDecisionConfidence = tradeDecision?.confidence ?? entryDecision?.confidence ?? null;
  const activeDecisionReasons = tradeDecision?.reasons || entryDecision?.reasons || [];
  const activeEntryTriggers = tradeDecision?.entryTriggers || entryDecision?.entryTriggers || [];
  const activeExitTriggers = tradeDecision?.exitTriggers || [];
  const promotionGate = valuationPanel?.scenarioCaseDetail?.promotionGate || null;
  const revaluationJob = targetSnapshot?.revaluationJobStatus || null;
  const technicalMissingReason =
    deepDive.technicalSnapshot?.missingReason || deepDive.chartMissingReason || appendixEmptyState?.technical || null;
  const technicalFibonacci = deepDive.technicalSnapshot?.fibonacci || null;
  const hasScenarioDelta = Boolean(valuationPanel?.scenarioCaseDetail?.hasIndependentDelta);
  const selectedCase = caseParam === 'scenario' && hasScenarioDelta ? 'scenario' : 'base';
  const selectedCaseDetail = selectedCase === 'scenario' ? valuationPanel?.scenarioCaseDetail : valuationPanel?.baseCaseDetail;
  const caseHref = (nextCase: 'base' | 'scenario') => {
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', refresh);
    if (nextCase === 'scenario') params.set('case', 'scenario');
    const suffix = params.toString();
    return `/stock/${normalizedSymbol}${suffix ? `?${suffix}` : ''}#valuation-case-mode`;
  };

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
        <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="inline-flex rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              回到雷達首頁
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sources?symbol=${deepDive.symbol}`}
                className="rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                查看全部來源
              </Link>
              <Link
                href={`/stock/${deepDive.symbol}?refresh=1`}
                className="rounded-full bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
              >
                更新這檔
              </Link>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-[-0.04em]">
                  {deepDive.symbol}
                  {deepDive.recommendation?.chineseName ? (
                    <span className="ml-2 text-2xl font-normal text-slate-600 dark:text-emerald-100/65">
                      {deepDive.recommendation.chineseName}
                    </span>
                  ) : null}
                </h1>
                <span className={`rounded-full px-4 py-1 text-sm font-medium ${stanceTone}`}>{recommendationStance?.displayLabel || rating.label}</span>
                <span className={`rounded-full px-3 py-1 text-xs ${dataHealthTone(dataHealth?.freshnessStatus || summaryCard?.freshness || deepDive.freshness)}`}>
                  {dataHealth ? dataHealthLabel(dataHealth.freshnessStatus) : freshnessLabel(summaryCard?.freshness || deepDive.freshness)}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs ${valuationSanityTone(targetSnapshot?.valuationSanityStatus)}`}>
                  {valuationSanityLabel(targetSnapshot?.valuationSanityStatus)}
                </span>
                <span className="rounded-full bg-teal-600/12 px-3 py-1 text-xs text-teal-700 dark:text-teal-300">
                  {deepDive.verificationStatus}
                </span>
                {deepDive.marketIndexSignal ? (
                  <span className="rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-100/78">
                    大盤：{deepDive.marketIndexSignal.label}
                  </span>
                ) : null}
              </div>

              <p className="text-lg text-slate-700 dark:text-emerald-50/88">{deepDive.name}</p>
              <h2 className="max-w-4xl text-2xl font-medium">
                {deepDive.reportSnapshot?.title || deepDive.investmentConclusion || deepDive.thesisTitle || '正在整理這檔股票目前的核心結論。'}
              </h2>
	              <p className="max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-50/85">
	                {deepDive.reportSnapshot?.subtitle || deepDive.thesisSummary || deepDive.thesisSnapshot?.story || '目前還沒有足夠的新資料寫出穩定結論。'}
	              </p>
	              {revaluationNotice ? (
	                <p className="max-w-4xl rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-300/20 dark:bg-amber-950/20 dark:text-amber-200">
	                  {revaluationNotice}
	                </p>
	              ) : null}
	            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">目前股價</p>
                <p className="mt-2 break-words text-xl font-semibold leading-tight">{formatPrice(currentPrice)}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">{formatDateTime(deepDive.asOf)}</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">Base 目標價</p>
                <p className="mt-2 break-words text-xl font-semibold leading-tight">{formatTargetOrState(baseTarget, '待重估')}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">正式推薦採用的基準情境</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">情境目標價</p>
                <p className="mt-2 break-words text-xl font-semibold leading-tight">{formatTargetOrState(scenarioTarget, targetSnapshot?.verdict === 'reflected' ? '已接近反映' : '待重估')}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">樂觀情境保留的上行區間</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-emerald-400/30 bg-emerald-50 p-3.5 dark:bg-emerald-950/20">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">Base 空間</p>
                <p className="mt-2 break-words text-xl font-semibold leading-tight text-emerald-600 dark:text-emerald-400">
                  {baseUpsidePct != null ? formatSignedPct(baseUpsidePct) : '已接近反映'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">首頁正式推薦應與這裡完全一致</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-sky-400/30 bg-sky-50 p-3.5 dark:bg-sky-950/20">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">情境空間</p>
                <p className="mt-2 break-words text-xl font-semibold leading-tight text-sky-600 dark:text-sky-300">
                  {scenarioUpsidePct != null ? formatSignedPct(scenarioUpsidePct) : '已接近反映'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">首頁情境候選應與這裡完全一致</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">一句結論</p>
                <p className="mt-2 text-base font-semibold">{activeDecisionAction}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">{tradeDecision?.marketGateReason || heroConclusion}</p>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">資料健康</p>
                    <p className="mt-2 text-base font-semibold">{dataHealth ? dataHealthLabel(dataHealth.freshnessStatus) : freshnessLabel(summaryCard?.freshness || deepDive.freshness)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${dataHealthTone(dataHealth?.freshnessStatus || summaryCard?.freshness || deepDive.freshness)}`}>
                    {dataHealth?.refreshQueued || deepDive.autoRefreshTriggered ? '已排程更新' : '目前可用'}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">
                  <p>現價日期：{formatDate(dataHealth?.marketDataAsOf || targetSnapshot?.priceAsOf || deepDive.asOf)}</p>
                  <p>研究：{formatDate(dataHealth?.researchSourceAsOf || targetSnapshot?.latestSourceAt || summaryCard?.latestSourceAt)}</p>
                  <p>報告：{formatDate(dataHealth?.reportBuiltAt || targetSnapshot?.reportUpdatedAt || summaryCard?.lastUpdatedAt)}</p>
                </div>
                {dataHealth?.staleReasons?.length ? (
                  <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{dataHealth.staleReasons[0]}</p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">價格、研究來源與報告時間分開追蹤。</p>
                )}
                <div className="mt-2">
                  {deepDive.autoRefreshTriggered || dataHealth?.refreshQueued ? (
                    <AutoRefreshDeepDive symbol={deepDive.symbol} initialUpdatedAt={targetSnapshot?.reportUpdatedAt || summaryCard?.lastUpdatedAt || null} />
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-emerald-100/55">目前先顯示最新可用資料；若來源有新命中，報告會重建。</p>
                  )}
                </div>
              </article>
              <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface-strong p-3.5 xl:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">估值安全</p>
                    <p className="mt-2 text-base font-semibold">{valuationSanityLabel(targetSnapshot?.valuationSanityStatus)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${valuationSanityTone(targetSnapshot?.valuationSanityStatus)}`}>
                    {targetSnapshot?.valuationSanityStatus || 'normal'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">
                  {targetSnapshot?.valuationSanityReason ||
                    'Base 估值目前通過 safety gate；若現價、倍數或外部證據變動，系統會重新判斷是否仍可正式採用。'}
                </p>
                {marketValuationAdjustment ? (
                  <div className="mt-3 rounded-[1rem] border border-violet-400/25 bg-violet-500/8 px-3 py-3 text-xs leading-5 text-slate-700 dark:text-emerald-100/75">
                    <p className="font-semibold text-violet-700 dark:text-violet-300">
                      市場重估訊號：{marketValuationAdjustment.repricingTriggerStrength} · {marketValuationAdjustment.marketReratingStatus}
                    </p>
                    <p className="mt-1">{marketValuationAdjustment.summary}</p>
                    {marketValuationAdjustment.requiredEvidence.length > 0 ? (
                      <p className="mt-1 text-slate-500 dark:text-emerald-100/55">
                        需要補強：{marketValuationAdjustment.requiredEvidence.slice(0, 3).join('、')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-accent/25 bg-accent-soft p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/55">投資建議與買點</p>
              <h3 className="mt-2 text-2xl font-semibold">{activeDecisionAction}</h3>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-100/78">
                {tradeDecision
                  ? `${activeDecisionPosition}；${tradeDecision.marketGateReason} ${activeDecisionAddCondition}`
                  : entryDecision
                    ? `${activeDecisionPosition}；${activeDecisionAddCondition}`
                    : recommendationStance?.summary || chipEntryAssessment?.summary || '基本面與進場 timing 會分開判斷；資料不足時不把故事直接轉成買進。'}
              </p>
            </div>
            {activeDecisionConfidence != null ? (
              <span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">信心 {activeDecisionConfidence}/100</span>
            ) : chipEntryAssessment ? (
              <span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">{chipEntryAssessment.verdict}</span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">現在策略</p>
              <p className="mt-2">{activeDecisionPosition}</p>
            </article>
            <article className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">買進區 / 回測區</p>
              <p className="mt-2">{activeDecisionEntryZone}</p>
            </article>
            <article className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">加碼條件</p>
              <p className="mt-2">{activeDecisionAddCondition}</p>
            </article>
            <article className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">停損 / 失效</p>
              <p className="mt-2">{activeDecisionStopLoss}</p>
            </article>
            <article className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6">
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">停利 / 出場</p>
              <p className="mt-2">{activeDecisionExit}</p>
            </article>
          </div>
          {activeDecisionReasons.length ? (
            <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-emerald-100/65">
              判斷依據：{activeDecisionReasons.slice(0, 3).join('；')}
            </p>
          ) : null}
          {marketValuationAdjustment ? (
            <p className="mt-2 text-xs leading-6 text-slate-600 dark:text-emerald-100/65">
              大盤/族群估值 Gate：{marketValuationAdjustment.marketReratingReason} {marketValuationAdjustment.targetPeAdjustmentHint}
            </p>
          ) : null}
          {activeEntryTriggers.length ? (
            <div className="mt-4 rounded-[1.25rem] border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">買點觸發清單</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {activeEntryTriggers.slice(0, 3).map((trigger) => (
                  <article key={`${trigger.label}-${trigger.triggerType}`} className="rounded-2xl border border-line bg-surface p-4 text-sm leading-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{trigger.label}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          trigger.status === 'active'
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                            : trigger.status === 'blocked'
                              ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {trigger.status === 'active' ? '可執行' : trigger.status === 'blocked' ? '封鎖' : '等待'}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-700 dark:text-emerald-100/78">{trigger.condition}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/58">
                      動作：{trigger.action} · {trigger.positionSize}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {activeExitTriggers.length ? (
            <div className="mt-4 rounded-[1.25rem] border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">出場觸發清單</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {activeExitTriggers.map((trigger) => (
                  <article key={`${trigger.label}-${trigger.action}`} className="rounded-2xl border border-line bg-surface p-4 text-sm leading-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{trigger.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        trigger.status === 'active'
                          ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65'
                      }`}>
                        {trigger.status === 'active' ? '已觸發' : '等待'}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-700 dark:text-emerald-100/78">{trigger.condition}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/58">動作：{trigger.action}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {(revaluationJob || promotionGate) && (
          <section className="grid gap-3 md:grid-cols-2">
            {revaluationJob ? (
              <article className="rounded-[1.5rem] border border-line bg-surface p-5 text-sm leading-7">
                <p className="text-xs tracking-[0.22em] text-slate-500 dark:text-emerald-100/45">重估閉環</p>
                <h3 className="mt-2 text-xl font-semibold">{revaluationJob.status}</h3>
                <p className="mt-2 text-slate-700 dark:text-emerald-100/75">{revaluationJob.lastResult}</p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-emerald-100/62 sm:grid-cols-2">
                  <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">排入：{formatDate(revaluationJob.queuedAt)}</p>
                  <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">最近嘗試：{formatDate(revaluationJob.lastAttemptAt)}</p>
                  {revaluationJob.slaStatus ? (
                    <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">SLA：{revaluationJob.slaStatus}</p>
                  ) : null}
                  {revaluationJob.nextAttemptAt ? (
                    <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">下次補抓：{formatDate(revaluationJob.nextAttemptAt)}</p>
                  ) : null}
                  {revaluationJob.brokerSearchSummary ? (
                    <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">券商雷達：{revaluationJob.brokerSearchSummary}</p>
                  ) : null}
                  {revaluationJob.brokerEvidenceSearchStatus ? (
                    <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">
                      券商狀態：{revaluationJob.brokerEvidenceSearchStatus.status} · {revaluationJob.brokerEvidenceSearchStatus.summary}
                    </p>
                  ) : null}
                </div>
                {revaluationJob.triggerReason ? (
                  <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-emerald-100/62">
                    觸發原因：{revaluationJob.triggerReason}
                  </p>
                ) : null}
                {(revaluationJob.missingEvidence || revaluationJob.requiredEvidence).length ? (
                  <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-emerald-100/62">
                    上修目標價需要：{(revaluationJob.missingEvidence || revaluationJob.requiredEvidence).slice(0, 3).join('、')}
                  </p>
                ) : null}
              </article>
            ) : null}
            {promotionGate ? (
              <article className="rounded-[1.5rem] border border-line bg-surface p-5 text-sm leading-7">
                <p className="text-xs tracking-[0.22em] text-slate-500 dark:text-emerald-100/45">情境升 Base 判斷</p>
                <h3 className="mt-2 text-xl font-semibold">{promotionGate.canPromoteToBase ? '可排升 Base 覆核' : '尚不能升 Base'}</h3>
                <p className="mt-2 text-slate-700 dark:text-emerald-100/75">{promotionGate.summary}</p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-emerald-100/62 sm:grid-cols-2">
                  <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">達成率：{promotionGate.score == null ? '待補' : `${promotionGate.score}%`} / {promotionGate.requiredScore}%</p>
                  <p className="rounded-xl bg-slate-950/5 px-3 py-2 dark:bg-emerald-100/8">外部證據：{promotionGate.achievedEvidenceCount} / {promotionGate.requiredEvidenceCount}</p>
                </div>
              </article>
            ) : null}
          </section>
        )}

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">技術面</p>
              <h3 className="mt-2 text-2xl font-semibold">K 線與量價節奏</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-emerald-100/60">
              <span>成交量：{deepDive.volume?.toLocaleString('zh-TW') || '未知'}</span>
              <Link
                href={`/stock/${deepDive.symbol}/technical`}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
              >
                打開完整技術圖
              </Link>
            </div>
          </div>
          <div className="mt-5">
            <StockChart data={deepDive.chart} timeframeCharts={deepDive.timeframeCharts} missingReason={technicalMissingReason} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="flex h-full flex-col rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3 text-sm leading-7 text-slate-800 dark:text-emerald-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">進場計畫</p>
                {technicalEntrySignal ? (
                  <span className="rounded-full bg-accent px-3 py-1 text-xs text-white">{technicalEntrySignal.verdict}</span>
                ) : null}
              </div>
              <p className="mt-2">{technicalEntrySignal?.entryPlan?.strategy || technicalEntrySignal?.summary || '技術面進場判讀整理中。'}</p>
            </article>
            <article className="flex h-full flex-col rounded-2xl border border-line bg-surface-strong px-4 py-3 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">回測區 / 支撐</p>
              <p className="mt-2">{technicalEntrySignal?.entryPlan?.entryZone || technicalEntrySignal?.entryPlan?.pullbackSupport || '等待 MA / Fibonacci 支撐與量縮止穩。'}</p>
              <p className="mt-auto pt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                MA20 / MA60：{deepDive.technicalSnapshot?.ma20 != null ? formatNumber(deepDive.technicalSnapshot.ma20) : '待補'} / {deepDive.technicalSnapshot?.ma60 != null ? formatNumber(deepDive.technicalSnapshot.ma60) : '待補'}
              </p>
            </article>
            <article className="flex h-full flex-col rounded-2xl border border-line bg-surface-strong px-4 py-3 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">突破條件 / 壓力</p>
              <p className="mt-2">{technicalEntrySignal?.entryPlan?.breakoutTrigger || '若帶量突破近期壓力，再評估是否提高部位。'}</p>
              <p className="mt-auto pt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                Fib 38.2 / 61.8：{technicalFibonacci ? `${formatPrice(technicalFibonacci.retracement382)} / ${formatPrice(technicalFibonacci.retracement618)}` : '待補'}
              </p>
            </article>
            <article className="flex h-full flex-col rounded-2xl border border-line bg-surface-strong px-4 py-3 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">停損 / 失效</p>
              <p className="mt-2">{technicalEntrySignal?.entryPlan?.invalidationLevel || technicalMissingReason || '跌破關鍵均線且 MACD 轉弱時，先把追價劇本失效。'}</p>
              <p className="mt-auto pt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                RSI / MACD：{deepDive.technicalSnapshot?.rsi != null ? formatNumber(deepDive.technicalSnapshot.rsi) : '待補'} / {deepDive.technicalSnapshot?.macd != null ? formatNumber(deepDive.technicalSnapshot.macd) : '待補'}
              </p>
            </article>
          </div>
        </section>

        <details className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">籌碼與技術補充</p>
                <h3 className="mt-2 text-2xl font-semibold">展開看完整買點劇本</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-emerald-100/65">
                  主要結論已放在上方；這裡保留法人、融資融券、借券、技術與三劇本的細節。
                </p>
              </div>
              {chipEntryAssessment ? (
                <span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
                  {chipEntryAssessment.verdict}
                </span>
              ) : null}
            </div>
          </summary>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">籌碼面</p>
              <h3 className="mt-2 text-2xl font-semibold">籌碼與買點劇本</h3>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-emerald-100/65">
                目標價仍由基本面橋接決定；這裡只判斷現在是否適合進場、該等回測還是避免追價。
              </p>
            </div>
            {chipEntryAssessment ? (
              <span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
                {chipEntryAssessment.verdict}
              </span>
            ) : null}
          </div>

          {chipEntryAssessment ? (
            <div className="mt-5 space-y-4">
              <article className="rounded-[1.4rem] border border-accent/25 bg-accent-soft p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">現在策略</p>
                <p className="mt-2 text-lg font-semibold leading-8 text-slate-900 dark:text-emerald-50">
                  {chipEntryAssessment.summary}
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/80">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">籌碼拆解</p>
                    <p className="mt-2">{chipEntryAssessment.chipRead}</p>
                  </div>
                  <div className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/80">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">技術搭配</p>
                    <p className="mt-2">{chipEntryAssessment.technicalRead}</p>
                  </div>
                  <div className="rounded-[1.1rem] border border-line bg-surface p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/80">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">支撐 / 壓力 / 失效</p>
                    <p className="mt-2">{chipEntryAssessment.supportResistance.summary}</p>
                  </div>
                </div>
              </article>

              <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                <article className="rounded-[1.4rem] border border-line bg-surface-strong p-5">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">必盯數字</p>
                  <div className="mt-4 space-y-3">
                    {chipEntryAssessment.watchNumbers.map((item, index) => (
                      <div key={`watch-number-${index}`} className="rounded-[1rem] border border-line bg-surface p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold">{item.label}</p>
                          <p className="text-sm text-accent">{item.value}</p>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">{item.interpretation}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[1.4rem] border border-line bg-surface-strong p-5">
                  <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">下一交易日劇本</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {chipEntryAssessment.nextSessionPlaybook.map((item, index) => (
                      <div key={`playbook-${index}`} className="flex h-full flex-col rounded-[1rem] border border-line bg-surface p-4 text-sm leading-6">
                        <p className="font-semibold">{item.scenario}</p>
                        <p className="mt-2 text-slate-700 dark:text-emerald-100/78">{item.condition}</p>
                        <p className="mt-2 text-slate-700 dark:text-emerald-100/78">{item.action}</p>
                        <p className="mt-auto pt-3 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">{item.riskControl}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-[1.4rem] border border-line bg-surface-strong p-5 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
              籌碼與買點劇本整理中；資料補齊前不建議把基本面故事直接轉成進場動作。
            </p>
          )}
        </details>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">深度分析報告</p>
          <h3 className="mt-2 text-2xl font-semibold">{deepDive.reportSnapshot?.title || deepDive.thesisTitle || '單股研究報告'}</h3>
          {deepDive.reportSnapshot?.subtitle ? (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
              {deepDive.reportSnapshot.subtitle}
            </p>
          ) : null}
          {reportSummaryBullets.length > 0 ? (
            <div className="mt-5 rounded-[1.4rem] border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">焦點內容</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/78">
                {reportSummaryBullets.map((item, index) => (
                  <li key={`summary-bullet-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">估值推導</p>
              <h4 className="mt-2 text-xl font-semibold">主要財務數據及估值</h4>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-emerald-100/65">
              先看共同基底，再切換 Base 與情境推導；情境只呈現 Base 之外的待驗證上行條件。
            </p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 min-w-0">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">最新月營收</p>
              <p className="mt-2 break-words text-2xl font-semibold">
                {formatRevenueDisplay(valuationPanel?.monthlyRevenue)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/60">
                YoY {valuationPanel?.yoyGrowth != null ? formatSignedPct(valuationPanel.yoyGrowth) : '未知'} · MoM{' '}
                {valuationPanel?.momGrowth != null ? formatSignedPct(valuationPanel.momGrowth) : '未知'}
              </p>
            </article>
            <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 min-w-0">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">目前估值水位</p>
              <div className="mt-3 space-y-2 break-words text-sm leading-6">
                <p>EPS (TTM)：<span className="font-semibold">{formatEpsDisplay(valuationPanel?.epsTtm)}</span></p>
                <p>PE：<span className="font-semibold">{formatPeDisplay(valuationPanel?.peRatio)}</span></p>
                <p>PB：<span className="font-semibold">{formatPbDisplay(valuationPanel?.pbRatio)}</span></p>
              </div>
            </article>
            <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 min-w-0">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Base / 情境 / Bear</p>
              <div className="mt-3 space-y-2 break-words text-sm leading-6">
                <p>Base：<span className="font-semibold">{formatTargetOrState(valuationPanel?.baseTarget, '未知')}</span></p>
                <p>情境：<span className="font-semibold">{formatTargetOrState(valuationPanel?.upsideTarget, '未知')}</span></p>
                <p>Bear：<span className="font-semibold">{formatTargetOrState(valuationPanel?.bearTarget, '未知')}</span></p>
              </div>
            </article>
            <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 min-w-0">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">下一個關鍵驗證點</p>
              <p className="mt-2 break-words text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                {valuationPanel?.nextValidationPoint || deepDive.chaseAssessment?.trigger || '等待最新法說、月營收或高品質產業資料補強。'}
              </p>
              {valuationPanel?.peerComparison ? (
                <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                  {valuationPanel.peerComparison}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/55">
                資料版本：{formatDateTime(valuationPanel?.dataAsOf || targetSnapshot?.reportUpdatedAt)}
              </p>
            </article>
          </div>

          <div id="valuation-case-mode" className="mt-5 space-y-4">
            {renderSharedVerifiedBasis(valuationPanel?.sharedVerifiedBasis)}
            <div className="rounded-[1.4rem] border border-line bg-surface-strong p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={caseHref('base')}
                    className={`rounded-full border px-4 py-2 text-sm ${selectedCase === 'base' ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-slate-700 dark:text-emerald-100/72'}`}
                  >
                    Base 財務推導
                  </Link>
                  <Link
                    href={caseHref('scenario')}
                    aria-disabled={!hasScenarioDelta}
                    className={`rounded-full border px-4 py-2 text-sm ${selectedCase === 'scenario' ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-slate-700 dark:text-emerald-100/72'} ${!hasScenarioDelta ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    情境差分推導
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-line bg-surface px-3 py-1">Base {formatTargetOrState(valuationPanel?.baseTarget, '待補')}</span>
                  <span className="rounded-full border border-line bg-surface px-3 py-1">情境 {formatTargetOrState(valuationPanel?.upsideTarget, '待補')}</span>
                  <span className="rounded-full border border-line bg-surface px-3 py-1">目前 {formatPrice(currentPrice)}</span>
                </div>
              </div>
            </div>
            {selectedCase === 'scenario' && !hasScenarioDelta ? (
              <article className="rounded-[1.4rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">情境差分推導</p>
                <h4 className="mt-2 text-lg font-semibold">目前尚無獨立上行情境</h4>
                <p className="mt-3 rounded-[1rem] border border-line bg-surface p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  {valuationPanel?.scenarioNote || 'Base 已涵蓋主要已知故事；在出現新的上行驗證點前，不另外拆出獨立情境欄。'}
                </p>
              </article>
            ) : (
              renderValuationCaseDetail(selectedCase === 'scenario' ? '情境差分推導' : 'Base 財務推導', selectedCaseDetail)
            )}
            {!hasScenarioDelta ? (
              <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">情境狀態</p>
                <p className="mt-2">{valuationPanel?.scenarioNote || '目前尚無獨立上行情境；Base 已涵蓋主要已知故事，後續需等新增客戶、產品 mix 或月營收證據再拆出情境。'}</p>
              </article>
            ) : null}
          </div>

          {(valuationPanel?.valuationConfidenceGate || valuationPanel?.brokerConsensus || valuationPanel?.forwardPeBridge || valuationPanel?.peerValuationRange) ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {valuationPanel?.valuationConfidenceGate ? (
                <article className={`rounded-[1.2rem] border p-4 text-sm leading-6 ${valuationPanel.valuationConfidenceGate.baseTargetFormal ? 'border-emerald-400/35 bg-emerald-500/8 text-emerald-900 dark:text-emerald-100' : 'border-amber-400/35 bg-amber-500/8 text-amber-900 dark:text-amber-100'}`}>
                  <p className="text-xs tracking-[0.18em] opacity-70">Base 目標價驗證 Gate</p>
                  <h4 className="mt-2 text-base font-semibold">
                    {valuationPanel.valuationConfidenceGate.baseTargetFormal ? 'Base 可作正式目標價' : 'Base 暫列研究推估，不作正式目標價'}
                  </h4>
                  <p className="mt-2">
                    {valuationPanel.valuationConfidenceGate.reason || 'Base 假設已具外部佐證與完整財務橋接。'}
                  </p>
                  <p className="mt-2 text-xs opacity-75">
                    外部註腳 {valuationPanel.valuationConfidenceGate.externalCitationCount} · 券商/匯入 {valuationPanel.valuationConfidenceGate.brokerCitationCount} · 官方/財務 {valuationPanel.valuationConfidenceGate.officialCitationCount}
                  </p>
                </article>
              ) : null}
              {valuationPanel?.brokerConsensus ? (
                <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                  <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">外資 / 券商 Consensus</p>
                  <h4 className="mt-2 text-base font-semibold">{valuationPanel.brokerConsensus.stale ? '券商資料偏舊，僅作輔助' : '券商資料可作估值交叉檢查'}</h4>
                  <p className="mt-2">{valuationPanel.brokerConsensus.summary}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/55">
                    來源數 {valuationPanel.brokerConsensus.sourceCount} · 最近 {valuationPanel.brokerConsensus.latestReportDate || '待補'} · 評等 {Object.entries(valuationPanel.brokerConsensus.ratingDistribution || {}).map(([label, count]) => `${label} ${count}`).join('、') || '待補'}
                  </p>
                </article>
              ) : null}
              {valuationPanel?.forwardPeBridge ? (
                <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                  <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">Forward P/E 推導</p>
                  <h4 className="mt-2 text-base font-semibold">{valuationPanel.forwardPeBridge.status === 'verified' ? 'Forward EPS / PE 來源可追蹤' : 'Forward PE 仍需來源補強'}</h4>
                  <p className="mt-2">{valuationPanel.forwardPeBridge.summary}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/55">
                    現價 Forward PE {valuationPanel.forwardPeBridge.currentForwardPe == null ? '待補' : `${valuationPanel.forwardPeBridge.currentForwardPe}x`} ·
                    目標 Forward PE {valuationPanel.forwardPeBridge.targetForwardPe == null ? '待補' : `${valuationPanel.forwardPeBridge.targetForwardPe}x`}
                  </p>
                  {valuationPanel.forwardPeBridge.targetPriceFormula ? (
                    <p className="mt-2 text-xs text-slate-600 dark:text-emerald-100/62">{valuationPanel.forwardPeBridge.targetPriceFormula}</p>
                  ) : null}
                </article>
              ) : null}
              {valuationPanel?.peerValuationRange ? (
                <article className="rounded-[1.2rem] border border-line bg-surface-strong p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                  <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">同業估值區間</p>
                  <h4 className="mt-2 text-base font-semibold">{valuationPanel.peerValuationRange.inRange === false ? '採用倍數超出同業區間，需覆核' : '採用倍數與同業區間交叉檢查'}</h4>
                  <p className="mt-2">{valuationPanel.peerValuationRange.summary}</p>
                </article>
              ) : null}
            </div>
          ) : null}

          {valuationPanel?.mlForecastBand ? (
            <div className="mt-5 rounded-[1.2rem] border border-line bg-surface-strong p-4 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">公式估值 vs ML 預測區間</p>
                  <h4 className="mt-2 text-base font-semibold">
                    {valuationPanel.valuationModelDivergence?.status === 'valuation_model_divergence_review'
                      ? '公式與模型差距過大，需覆核'
                      : '模型只作輔助覆核，不產生正式目標價'}
                  </h4>
                </div>
                <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs">
                  {valuationPanel.mlForecastBand.modelVersion}
                </span>
              </div>
              <p className="mt-3">{valuationPanel.mlForecastBand.summary}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {valuationPanel.mlForecastBand.horizons.map((item) => (
                  <article key={`ml-forecast-${item.days}`} className="rounded-[0.95rem] border border-line bg-surface p-3">
                    <p className="text-xs tracking-[0.14em] text-slate-500 dark:text-emerald-100/45">{item.days} 日區間</p>
                    <p className="mt-2 font-semibold">
                      {formatPrice(item.lowerPrice)} – {formatPrice(item.upperPrice)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">
                      中位 {formatPrice(item.medianPrice)} · 上行機率 {item.upsideProbability == null ? '待補' : `${Math.round(item.upsideProbability * 100)}%`}
                    </p>
                  </article>
                ))}
              </div>
              {valuationPanel.valuationModelDivergence ? (
                <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                  valuationPanel.valuationModelDivergence.status === 'valuation_model_divergence_review'
                    ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                }`}>
                  {valuationPanel.valuationModelDivergence.summary}
                </p>
              ) : null}
              {valuationPanel.modelSignalSummary ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-emerald-100/55">{valuationPanel.modelSignalSummary}</p>
              ) : null}
            </div>
          ) : null}

          {valuationPanel?.valuationReviewFlags && valuationPanel.valuationReviewFlags.length > 0 ? (
            <div className="mt-4 rounded-[1.2rem] border border-amber-400/30 bg-amber-500/8 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
              <p className="text-xs tracking-[0.18em] opacity-70">估值覆核 Flags</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {valuationPanel.valuationReviewFlags.map((flag) => (
                  <p key={flag.code} className="rounded-xl bg-white/45 px-3 py-2 dark:bg-slate-950/20">
                    {flag.severity === 'blocker' ? '阻擋' : flag.severity === 'warning' ? '警示' : '提示'}：{flag.summary}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {valuationPanel?.assumptionLedger && valuationPanel.assumptionLedger.length > 0 ? (
            <div className="mt-5 rounded-[1.2rem] border border-line bg-surface-strong p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">估值假設表</p>
                  <h4 className="mt-2 text-base font-semibold">每個目標價假設的來源與信任等級</h4>
                </div>
                <p className="max-w-xl text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                  Base 若只有內部推估或缺外部註腳，會自動降級為研究推估，不會進正式推薦 Gate。
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {valuationPanel.assumptionLedger.slice(0, 12).map((item, index) => (
                  <article key={`valuation-ledger-${item.caseLabel}-${item.key}-${index}`} className="rounded-[0.95rem] border border-line bg-surface p-3 text-xs leading-5 text-slate-700 dark:text-emerald-100/76">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{item.caseLabel} · {item.label}</p>
                      <span className={`rounded-full px-2 py-0.5 ${item.trustLevel === 'verified' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : item.trustLevel === 'mixed' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/60'}`}>
                        {item.trustLevel === 'verified' ? '已驗證' : item.trustLevel === 'mixed' ? '混合推估' : '內部推估'}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold">{item.value || '待補'}</p>
                    {item.formula ? <p className="mt-1 text-slate-600 dark:text-emerald-100/62">{item.formula}</p> : null}
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-emerald-100/50">
                      來源：{(item.sourceTypes || []).map((type) => sourceTypeLabel[type] || type).join('、') || '待補'}
                      {item.sourceRefs && item.sourceRefs.length > 0 ? ` · ${item.sourceRefs.slice(0, 3).map((id) => `[${id}]`).join(' ')}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {valuationPanel?.priceTargetRationale ? (
            <div className="mt-4 rounded-[1.2rem] border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">價格推導總結</p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                {valuationPanel.priceTargetRationale}
              </p>
            </div>
          ) : null}

          <div className="mt-8 space-y-8">
            {reportBodySections.length > 0 ? (
              reportBodySections.map((section) => (
                <section key={section.id} className="border-t border-line pt-6 first:border-t-0 first:pt-0">
                  <h4 className="text-xl font-semibold">{section.heading}</h4>
                  <div className="mt-4 space-y-4">
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={`${section.id}-paragraph-${index}`} className="text-[15px] leading-8 text-slate-700 dark:text-emerald-100/82">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && section.bullets.length > 0 ? (
                      <ul className="space-y-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/78">
                        {section.bullets.map((item, index) => (
                          <li key={`${section.id}-bullet-${index}`}>• {item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {section.sourceRefs
                      ? renderCitationRefs(
                          (valuationPanel?.sourceCitationMap || []).filter((ref) => (section.sourceRefs || []).includes(ref.id)),
                          null,
                        )
                      : null}
                  </div>
                </section>
              ))
            ) : (
              <section>
                <h4 className="text-xl font-semibold">市場故事</h4>
                <p className="mt-4 text-[15px] leading-8 text-slate-700 dark:text-emerald-100/82">
                  {deepDive.thesisSnapshot?.story || deepDive.storyNarrative || '市場主故事還在形成中。'}
                </p>
              </section>
            )}
          </div>
        </section>

        <details className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <summary className="cursor-pointer list-none">
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">Appendix</p>
            <h3 className="mt-2 text-2xl font-semibold">技術面、完整來源與研究附錄</h3>
          </summary>

          <div className="mt-6 space-y-6">
            <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">技術面附錄</p>
              {deepDive.technicalSnapshot?.ma5 != null ||
              deepDive.technicalSnapshot?.ma20 != null ||
              deepDive.technicalSnapshot?.rsi != null ||
              deepDive.technicalSnapshot?.macd != null ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-[1.1rem] border border-line bg-surface p-4">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">移動均線</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                      MA5 {deepDive.technicalSnapshot?.ma5 != null ? formatNumber(deepDive.technicalSnapshot.ma5) : '未知'} / MA20{' '}
                      {deepDive.technicalSnapshot?.ma20 != null ? formatNumber(deepDive.technicalSnapshot.ma20) : '未知'} / MA60{' '}
                      {deepDive.technicalSnapshot?.ma60 != null ? formatNumber(deepDive.technicalSnapshot.ma60) : '未知'}
                    </p>
                  </article>
                  <article className="rounded-[1.1rem] border border-line bg-surface p-4">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">RSI / MACD</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                      RSI {deepDive.technicalSnapshot?.rsi != null ? formatNumber(deepDive.technicalSnapshot.rsi) : '未知'} / MACD{' '}
                      {deepDive.technicalSnapshot?.macd != null ? formatNumber(deepDive.technicalSnapshot.macd) : '未知'} / Signal{' '}
                      {deepDive.technicalSnapshot?.macdSignal != null ? formatNumber(deepDive.technicalSnapshot.macdSignal) : '未知'}
                    </p>
                  </article>
                  <article className="rounded-[1.1rem] border border-line bg-surface p-4">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">Fibonacci</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                      {technicalFibonacci
                        ? `38.2% ${formatPrice(technicalFibonacci.retracement382)} / 61.8% ${formatPrice(technicalFibonacci.retracement618)}`
                        : '目前缺少足夠高低點資料'}
                    </p>
                  </article>
                  <article className="rounded-[1.1rem] border border-line bg-surface p-4 md:col-span-2">
                    <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">技術資料來源</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                      {deepDive.technicalSnapshot?.dataSource || deepDive.chartSource || '技術資料來源待補'}
                    </p>
                    {technicalMissingReason ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">{technicalMissingReason}</p>
                    ) : null}
                  </article>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  {appendixEmptyState?.technical || '目前缺少足夠的技術面資料。'}
                </p>
              )}
            </section>

            {deepDive.appendix?.coverageStatus && deepDive.appendix.coverageStatus.length > 0 ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">資料源覆蓋狀態</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {deepDive.appendix.coverageStatus.map((item) => (
                    <article key={item.id} className="rounded-[1.1rem] border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <span className="rounded-full bg-slate-950/8 px-2.5 py-1 text-xs text-slate-700 dark:text-emerald-100/70">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{item.summary}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">
                        {item.sourceTypes.join('、')}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {chipEntryAssessment?.microstructureStatus?.length ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">待接資料源：盤中微結構</p>
                <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  內外盤比、分價量表與分點進出尚未接上可靠來源，因此不放在主買點卡，也不作為本版買進判斷核心。
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {chipEntryAssessment.microstructureStatus.map((item) => (
                    <article key={item.key} className="rounded-[1.1rem] border border-line bg-surface p-4">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{item.summary}</p>
                      {item.missingReason ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">{item.missingReason}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {deepDive.scenarioNarratives && deepDive.scenarioNarratives.length > 0 ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">完整估值情境</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {deepDive.scenarioNarratives.map((scenario) => (
                    <article key={scenario.key} className="rounded-[1.2rem] border border-line bg-surface p-4">
                      <p className="text-sm font-semibold">{scenario.label}</p>
                      <p className="mt-2 text-xl font-semibold">
                        {scenario.bridgeCompleteness === 'insufficient' ? '暫不產出' : formatPrice(scenario.targetPrice)}
                      </p>
                      {scenario.bridgeCompleteness === 'insufficient' && scenario.insufficientBridgeReason ? (
                        <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{scenario.insufficientBridgeReason}</p>
                      ) : null}
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{scenario.narrative}</p>
                      {scenario.operatingAssumptions && scenario.operatingAssumptions.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">
                          {scenario.operatingAssumptions.slice(0, 4).map((item, index) => (
                            <li key={`${scenario.key}-assumption-${index}`}>• {item.label}{item.isEstimated ? '約' : ''}{item.value}</li>
                          ))}
                        </ul>
                      ) : null}
                      {scenario.multipleBridge ? (
                        <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-emerald-100/62">{scenario.multipleBridge}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {freshSources.length > 0 ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">最新直接命中來源</p>
                <div className="mt-4 space-y-3">
                  {freshSources.map((source) => (
                    <article key={`${source.sourceName}-${source.sourceTimestamp || 'na'}`} className="rounded-[1.2rem] border border-line bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{source.sourceName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">
                            {sourceTypeLabel[source.sourceType] || source.sourceType} · {formatDate(source.sourceTimestamp)}
                          </p>
                        </div>
                        {source.sourceUrl ? (
                          <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent underline-offset-2 hover:underline">
                            開啟來源
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{source.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">最新直接命中來源</p>
                <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  {appendixEmptyState?.sources || '目前沒有可展示的高品質 direct-hit 來源。'}
                </p>
              </section>
            )}

            {deepDive.evidenceMatrix.length > 0 ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">證據矩陣</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {deepDive.evidenceMatrix.map((item, index) => (
                    <article key={`${item.sourceLabel}-${index}`} className="rounded-[1.2rem] border border-line bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{item.sourceLabel}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">
                            {item.evidenceType} · {item.stance}
                          </p>
                        </div>
                        <span className="rounded-full bg-accent px-3 py-1 text-xs text-white">{formatNumber(item.strength)}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{item.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">證據矩陣</p>
                <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  {appendixEmptyState?.evidence || '目前沒有可展示的證據矩陣。'}
                </p>
              </section>
            )}

            {deepDive.sourceAppendix && deepDive.sourceAppendix.length > 0 ? (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">完整來源</p>
                <div className="mt-4 space-y-5">
                  {deepDive.sourceAppendix.map((group) => (
                    <div key={group.label}>
                      <p className="text-sm font-semibold">{group.label}</p>
                      {group.items.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {group.items.map((source, index) => (
                            <article key={`${group.label}-${source.sourceName}-${index}`} className="rounded-[1.1rem] border border-line bg-surface p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">{source.sourceName}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/55">
                                    {sourceTypeLabel[source.sourceType] || source.sourceType} · {formatDate(source.sourceTimestamp)}
                                    {source.directHit === false ? ' · indirect-hit' : ''}
                                  </p>
                                </div>
                                {source.sourceUrl ? (
                                  <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent underline-offset-2 hover:underline">
                                    開啟來源
                                  </a>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">{source.summary}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                          {appendixEmptyState?.sources || '這個來源群組目前沒有高品質資料。'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
                <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">完整來源</p>
                <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-emerald-100/82">
                  {appendixEmptyState?.sources || '目前沒有可展示的高品質來源分組。'}
                </p>
              </section>
            )}

            <section className="rounded-[1.6rem] border border-line bg-surface-strong p-5">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Connector 與研究 memo</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  {deepDive.connectorStatus.map((item) => (
                    <article key={item.connector} className="rounded-[1.1rem] border border-line bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{connectorLabel[item.connector] || item.connector}</p>
                        <span className="rounded-full bg-slate-950/8 px-2.5 py-1 text-xs text-slate-700 dark:text-emerald-100/70">
                          {connectorStatusLabel(item.lastRunStatus || item.credentialStatus)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-emerald-100/55">
                        最近成功：{formatDateTime(item.lastSuccessAt)}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="rounded-[1.1rem] border border-line bg-surface p-4">
                  <p className="text-sm font-semibold">{deepDive.memo?.title || '研究 memo 尚未生成'}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/82">
                    {deepDive.memo?.summary || '目前沒有新的 memo，但深度分析與來源附錄已可先用來追蹤故事。'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </details>

        <p className="border-t border-line pt-4 text-xs text-slate-500 dark:text-emerald-100/45">{deepDive.riskDisclosure}</p>
      </div>
    </main>
  );
}
