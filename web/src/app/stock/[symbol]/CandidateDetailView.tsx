import Link from "next/link";
import type { CandidateDetailPayload } from "@/lib/candidate-detail";
import { sanitizePublicSourceUrl } from "@/lib/public-source-url.ts";
import CandidateHistoryChart from "@/lib/candidate-history-chart";
import LocalResearchWorkspace from "./LocalResearchWorkspace";
import CandidateTradePlanView from "./CandidateTradePlanView";

type AnyRecord = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readableText(value: unknown, fallback = "尚待確認") {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !UUID_RE.test(text) ? text : fallback;
}

function hideIdentifiers(value: unknown, fallback = "尚待確認") {
  const text = typeof value === "string" ? value : "";
  return text ? text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, fallback) : fallback;
}

function validHttpUrl(value: unknown) {
  return sanitizePublicSourceUrl(value);
}

const sectionGroups: Record<string, string> = {
  viewpoint: "先看結論",
  mix: "基本面脈絡",
  demand: "產業與需求",
  customers: "基本面脈絡",
  operations: "基本面脈絡",
  bridge: "獲利橋接",
  valuation: "估值與情境",
  risk: "風險與執行",
  technical: "風險與執行",
  sources: "證據索引",
  gaps: "尚待確認",
};
const conditionLabels: Record<string, string> = {
  research_score_below_55: "研究證據仍不足",
  data_confidence_below_55: "資料信心仍不足",
  bear_base_bull_missing: "Bear／Base／Bull 情境尚未完整",
  base_upside_below_8: "Base 上行空間不足 8%",
  reward_risk_below_1: "報酬風險比不足 1",
  research_score_below_70: "研究分數尚未達 70",
  actionability_below_65: "行動分數尚未達 65",
  data_confidence_below_75: "資料信心尚未達 75",
  base_upside_below_12: "Base 上行空間不足 12%",
  reward_risk_below_1_5: "報酬風險比不足 1.5",
  requires_two_consecutive_closes: "需要兩個連續收盤日確認",
  technical_hard_gate_failed: "技術條件尚未通過",
  stale_or_fallback_data: "資料已過期或仍為備援資料",
  price_history_uses_finmind_fallback: "價格歷史含 FinMind 備援資料，暫停升級",
  price_history_provider_conflict: "交易所與備援價格不一致，暫停升級",
  price_history_provenance_unverified: "價格來源尚未驗證，暫停升級",
  price_history_stale: "價格歷史未到最新正式交易日，暫停升級",
  market_risk_off_blocks_new_actionable: "大盤風險狀態暫停新增行動",
  market_breakdown_forces_downgrade: "大盤轉弱會使階段降級",
  negative_overseas_peer_catchdown: "海外同業補跌風險尚未解除",
  market_regime_missing: "大盤狀態待補",
};
const riskLabels: Record<string, string> = {
  initial_2atr_stop: "跌破訊號建立時凍結的 2ATR 失效價",
  two_closes_below_ma60: "連續兩個相鄰交易日跌破季線",
  material_official_counter_evidence: "出現重大官方反證",
  market_breakdown_and_below_ma20: "大盤 breakdown 且個股跌破月線",
  base_target_reached: "已達 Base 合理價，停止追價",
  rsi_overheated: "RSI 過熱，停止追價",
  price_above_ma20_plus_2atr: "價格高於月線加 2ATR，不追價",
  trend_support_weakened: "月線／季線支撐轉弱",
  valuation_margin_not_available: "估值安全邊際待補",
  risk_action_inputs_incomplete: "進退場資料尚未完整",
};

function value(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "資料待補";
}
function percent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
    : "資料待補";
}
function dateLabel(date: string | null | undefined) {
  if (!date) return "日期待補";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "尚待確認"
    : parsed.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
}
function readableFactKey(key: string) {
  return (
    (
      {
        eps_ttm: "近四季 EPS",
        forward_base_eps: "未來四季 Base EPS",
        close: "收盤價",
        pe_ratio: "本益比",
        pb_ratio: "股價淨值比",
        quarterly_revenue: "近四季營收",
        quarterly_gross_profit: "近四季毛利",
        quarterly_operating_income: "近四季營業利益",
        quarterly_net_income_attributable_to_common: "近四季歸屬淨利",
        quarterly_diluted_eps: "近季稀釋 EPS",
      } as Record<string, string>
    )[key] || "官方數據"
  );
}
function getNumber(record: AnyRecord, ...keys: string[]) {
  for (const key of keys) {
    const current = record[key];
    if (typeof current === "number" && Number.isFinite(current)) return current;
  }
  return null;
}

function ValuationSummary({ detail }: { detail: CandidateDetailPayload }) {
  const valuation = detail.valuation as CandidateDetailPayload["valuation"] &
    AnyRecord;
  const factValue = (key: string) =>
    detail.facts.find((fact) => fact.factKey === key)?.value ?? null;
  const current = valuation.currentPrice ?? factValue("close");
  const ttmEps =
    getNumber(valuation, "epsTtm", "ttmEps") ?? factValue("eps_ttm");
  const forwardEps =
    getNumber(valuation, "forwardEps", "ntmEps") ??
    factValue("forward_base_eps");
  const ttmPe =
    getNumber(valuation, "currentPe", "ttmPe") ??
    (current != null && ttmEps ? current / ttmEps : null);
  const forwardPe =
    getNumber(valuation, "forwardPe", "currentForwardPe") ??
    (current != null && forwardEps ? current / forwardEps : null);
  const fairMultiple = getNumber(
    valuation,
    "fairMultiple",
    "baseMultiple",
    "targetMultiple",
  );
  const method = String(valuation.method || valuation.basis || "");
  const usesPb = method.includes("pb");
  const usesForwardBvps = method.includes("forward_bvps");
  const usesNormalizedEarnings = method.includes("normalized");
  const bookValuePerShare = getNumber(valuation, "bookValuePerShare");
  const forwardBvps = valuation.forwardBvps && typeof valuation.forwardBvps === "object"
    ? getNumber(valuation.forwardBvps as AnyRecord, "base")
    : null;
  const currentPb =
    getNumber(valuation, "currentPb") ??
    (current != null && bookValuePerShare ? current / bookValuePerShare : null);
  const normalizedEps = getNumber(valuation, "normalizedEps");
  const metrics: Array<[string, string]> = [
    ["現價", current == null ? "資料待補" : `NT$${value(current)}`],
    ["TTM EPS", value(ttmEps)],
    ["TTM PE", value(ttmPe, 1)],
    [usesForwardBvps ? "未來 BVPS" : usesPb ? "每股淨值" : usesNormalizedEarnings ? "正常化 EPS" : "NTM EPS", value(usesForwardBvps ? forwardBvps : usesPb ? bookValuePerShare : usesNormalizedEarnings ? normalizedEps : forwardEps)],
    [usesPb ? "目前 PB" : usesNormalizedEarnings ? "正常化 PE" : "目前 forward PE", value(usesPb ? currentPb : usesNormalizedEarnings && current != null && normalizedEps ? current / normalizedEps : forwardPe, 1)],
    [
      usesPb ? "合理 PB／Base" : "合理倍數／Base",
      fairMultiple == null ? "資料待補" : `${value(fairMultiple, 1)}x`,
    ],
    ["Base 空間", percent(valuation.baseUpsidePct)],
    ["報酬風險比", value(valuation.rewardRiskRatio, 2)],
  ];
  const methodLabel = ({
    forward_bvps_pb: "未來 12 個月 BVPS × 歷史 P/B",
    forward_12m: "未來 12 個月 EPS × 歷史 P/E",
    normalized_cycle: "正常化獲利 × 歷史 P/E",
    financial_pb_roe: "P/B 與 ROE",
  } as Record<string, string>)[method] || method || "待補";
  return (
    <section
      aria-labelledby="valuation-summary-title"
      className="mt-6 rounded-[1.75rem] border border-emerald-200/70 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            先看估值
          </p>
          <h2
            id="valuation-summary-title"
            className="mt-1 text-xl font-semibold"
          >
            價格、獲利與情境
          </h2>
        </div>
        <span className="rounded-full border border-amber-400/50 bg-amber-100/70 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          個股研究階段
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {metrics.map(([label, shown]) => (
          <div
            key={label}
            className="rounded-xl bg-white/75 p-3 dark:bg-slate-950/50"
          >
            <span className="text-xs text-slate-500 dark:text-emerald-100/55">
              {label}
            </span>
            <strong className="mt-1 block text-base">{shown}</strong>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200/70 bg-white/60 dark:border-emerald-900/60 dark:bg-slate-950/30">
        <div className="grid grid-cols-3 divide-x divide-emerald-200/70 text-center dark:divide-emerald-900/60">
          {[
            ["Bear", valuation.bearTarget],
            ["Base", valuation.baseTarget],
            ["Bull", valuation.bullTarget],
          ].map(([label, target]) => (
            <div key={label} className="p-3">
              <span className="text-xs text-slate-500">{label}</span>
              <strong className="mt-1 block">
                {target == null ? "待補" : `NT$${value(target)}`}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">
        下行風險 {percent(valuation.bearDownsidePct)} · 估值方法{" "}
        {methodLabel} · 估值終點 {dateLabel(valuation.targetPeriodEnd)} · 歷史倍數覆蓋{" "}
        {valuation.monthsCovered == null
          ? "資料待補"
          : `${valuation.monthsCovered}/60 個月`}
        。缺少必要橋接時，不建立正式目標價。
      </p>
    </section>
  );
}

function EvidenceSources({ detail }: { detail: CandidateDetailPayload }) {
  const sourceRecords = [
    ...detail.sources,
    ...detail.sourceLinks.map((source) => ({ ...source, referenceNumber: null })),
  ];
  const sources = sourceRecords.map((source) => {
    const raw = source as AnyRecord;
    return {
      referenceNumber: typeof raw.referenceNumber === "number" ? raw.referenceNumber : null,
      label: readableText(raw.label ?? raw.name, "來源名稱待確認"),
      url: validHttpUrl(raw.url ?? raw.link),
      publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
      locator: readableText(raw.locator ?? raw.page ?? raw.pageNumber, ""),
      status: readableText(raw.status ?? raw.verificationStatus, "尚待確認"),
    };
  });
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      <h2 className="text-lg font-semibold">可追溯來源</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/60">
        原文先於模型結論；點擊可開啟來源頁面。
      </p>
      {sources.length ? (
        <ol className="mt-4 space-y-3">
          {sources.map((source) => (
            <li
              key={`${source.referenceNumber ?? "link"}-${source.label}`}
              className="flex gap-3 text-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {source.referenceNumber ?? "—"}
              </span>
              <div className="min-w-0">
                {source.url ? (
                  <a
                    className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 dark:text-emerald-300"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.label}
                  </a>
                ) : (
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {source.label}（連結尚待確認）
                  </span>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  日期：{dateLabel(source.publishedAt)}
                  {source.locator ? ` · 頁碼／位置：${source.locator}` : " · 頁碼／位置：尚待確認"}
                  {` · 狀態：${source.status}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          目前尚無可公開的原文連結。
        </p>
      )}
    </section>
  );
}

export default function CandidateDetailView({
  detail,
}: {
  detail: CandidateDetailPayload;
}) {
  const valuation = detail.valuation as CandidateDetailPayload["valuation"] &
    AnyRecord;
  const scores = detail.scores as unknown as AnyRecord;
  const coveredWeight = getNumber(valuation, "coveredWeight", "coverageWeight");
  const scoreMetrics: Array<[string, number | null]> = [
    ["發現", getNumber(scores, "discovery")],
    ["研究", getNumber(scores, "research")],
    ["行動", getNumber(scores, "actionability")],
    ["資料信心", getNumber(scores, "dataConfidence")],
  ];
  const grouped = detail.sections.filter((section) => section.key !== "sources").reduce<
    Record<string, CandidateDetailPayload["sections"]>
  >((acc, section) => {
    const group = sectionGroups[section.key] || "研究筆記";
    (acc[group] ||= []).push(section);
    return acc;
  }, {});
  const detailRecord = detail as unknown as AnyRecord;
  const datasetMissingComponents = Array.isArray(detailRecord.datasetMissingComponents)
    ? detailRecord.datasetMissingComponents.map(String).filter(Boolean)
    : [];
  const gaps = [
    ...detail.unmetConditions,
    ...((valuation.missing as string[] | undefined) || []),
  ].filter(Boolean);
  const publicationStatus = detailRecord.publicationStatus ?? detailRecord.status;
  const finalPublicationStatus = String(detailRecord.finalPublicationStatus || "preliminary");
  const datasetCompletenessPct = getNumber(detailRecord, "datasetCompletenessPct");
  const isFinalConfirmed = publicationStatus === "final"
    && finalPublicationStatus === "confirmed"
    && datasetCompletenessPct === 100
    && datasetMissingComponents.length === 0;
  const isStaleReadonly = finalPublicationStatus === "stale_readonly" || detailRecord.freshnessStatus === "stale_readonly";
  const publicationLabel = isFinalConfirmed
    ? "終版（已確認）"
    : isStaleReadonly
      ? "舊版唯讀（終版資料未完整）"
      : "初步研究版（終版資料尚未完整）";
  const asOf = dateLabel(detail.asOf);
  const availableAt = dateLabel(detail.availableAt);
  const researchCoverage = valuation.researchCoverage && typeof valuation.researchCoverage === "object"
    ? valuation.researchCoverage
    : null;
  const completeness = researchCoverage
    ? `${Math.max(0, Math.min(100, researchCoverage.completenessPct)).toFixed(researchCoverage.completenessPct % 1 === 0 ? 0 : 2)}%`
    : "尚待確認";
  const hasUnresolvedSources = [...detail.sources, ...detail.sourceLinks].some((source) => {
    const raw = source as AnyRecord;
    return !validHttpUrl(raw.url ?? raw.link)
      || !readableText(raw.label ?? raw.name, "");
  });
  return (
    <main className="mx-auto min-h-screen max-w-6xl overflow-x-hidden px-4 py-6 text-stone-950 dark:text-stone-100 sm:px-6 sm:py-10">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-orange-500 hover:text-orange-700 dark:hover:text-orange-300">
        ← 回到研究雷達
      </Link>
      <header className="decision-panel mt-5 overflow-hidden p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/10">
            {detail.lifecycleStage === "actionable"
              ? "現在可行動"
              : detail.lifecycleStage === "waiting"
                ? "等待條件"
                : "來源命中"}
          </span>
          <span>{dateLabel(detail.sessionDate)} 研究快照</span>
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {publicationLabel}
          </span>
        </div>
        <p className="research-kicker mt-6">REVISION-BOUND RESEARCH</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
          {detail.chineseName}{" "}
          <span className="text-slate-400">{detail.symbol}</span>
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-stone-700 dark:text-stone-300">
          {hideIdentifiers(detail.summary)}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          {detail.narrativeKind === "codex_enriched"
            ? "已通過來源驗證的敘事補充"
            : "官方事實版研究；缺資料處保留為待補"}
        </p>
        <dl className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <div><dt>資料截止時間</dt><dd className="mt-1 font-medium text-slate-700 dark:text-slate-300">{asOf}</dd></div>
          <div><dt>資料可用時間</dt><dd className="mt-1 font-medium text-slate-700 dark:text-slate-300">{availableAt}</dd></div>
          <div><dt>本估值方法資料完整度</dt><dd className="mt-1 font-medium text-slate-700 dark:text-slate-300">{completeness}{researchCoverage ? `（${researchCoverage.verifiedFieldPeriods}/${researchCoverage.requiredFieldPeriods} 欄位期別）` : "（尚未建立方法檢核）"}</dd></div>
        </dl>
        {hasUnresolvedSources ? <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">部分來源名稱、日期、頁碼或連結尚待確認；未確認內容不作為正式結論。</p> : null}
      </header>
      <section aria-labelledby="decision-summary-title" className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-[1.15fr_.85fr]">
        <div className="bg-stone-950 p-5 text-stone-50 sm:p-7">
          <p className="research-kicker text-orange-300">DECISION SUMMARY</p>
          <h2 id="decision-summary-title" className="mt-2 text-2xl font-semibold">{detail.lifecycleStage === 'actionable' ? '條件成立，仍由使用者決定' : detail.lifecycleStage === 'waiting' ? '估值有潛力，等待條件' : '來源命中，研究仍在補齊'}</h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">這是依同一研究 revision 彙整的估值、技術與證據狀態，不是上漲機率，也不是即時行情或個人化投資建議。</p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line text-sm">
          <div className="bg-[var(--surface)] p-4"><dt className="text-xs text-stone-500">研究狀態</dt><dd className="mt-1 font-semibold">{detail.detailKind === 'full' ? '完整研究版' : '事實研究版'}</dd></div>
          <div className="bg-[var(--surface)] p-4"><dt className="text-xs text-stone-500">兩日確認</dt><dd className="mt-1 font-semibold">{detail.lifecycleStage === 'actionable' ? '已由分類門檻確認' : '尚未完成或不適用'}</dd></div>
          <div className="bg-[var(--surface)] p-4"><dt className="text-xs text-stone-500">估值資料覆蓋</dt><dd className="mt-1 font-semibold">{completeness}</dd></div>
          <div className="bg-[var(--surface)] p-4"><dt className="text-xs text-stone-500">個人曝險</dt><dd className="mt-1 font-semibold">未評估</dd></div>
        </dl>
      </section>
      <ValuationSummary detail={detail} />
      <section
        className="mt-6 grid gap-4 sm:grid-cols-2"
        aria-label="研究品質與執行條件"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold">研究分數與覆蓋</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {scoreMetrics.map(([label, score]) => (
              <div key={label}>
                <dt className="text-slate-500">{label}</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {value(score, 1)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            估值必要欄位覆蓋{" "}
            {researchCoverage
              ? `${researchCoverage.verifiedFieldPeriods}/${researchCoverage.requiredFieldPeriods} 個欄位期別`
              : "待補"}
            {coveredWeight == null
              ? ""
              : ` · 權重 ${coveredWeight.toFixed(0)}%`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold">進場與退出條件</h2>
          <p className="mt-3 text-sm leading-6">
            進場：
            {detail.lifecycleStage === "actionable"
              ? "階段條件已通過，仍須按現價與技術訊號執行。"
              : "等待研究、估值或技術條件完成。"}
          </p>
          <p className="mt-2 text-sm leading-6">
            退出：
            {detail.riskAction?.reasons?.length
              ? detail.riskAction.reasons
                  .map(
                    (reason) =>
                      riskLabels[reason] || reason.replaceAll("_", " "),
                  )
                  .join("、")
              : "重大官方反證、估值失效或技術硬門檻失效。"}
          </p>
          <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            個股條件驗證：供研究參考，不是自動買進
          </span>
        </div>
      </section>
      {gaps.length ? (
        <section className="mt-6 rounded-2xl border border-amber-300/70 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            目前證據缺口
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900/80 dark:text-amber-100/80">
            {gaps.map((gap) => (
              <li key={gap}>
                {conditionLabels[gap] || hideIdentifiers(gap.replaceAll("_", " "))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mt-8 space-y-8">
        {Object.entries(grouped).map(([group, sections]) => (
          <section key={group}>
            <h2 className="mb-3 text-xl font-semibold">{group}</h2>
            <div className="space-y-3">
              {sections.map((section) => (
                <article
                  key={section.key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:p-6"
                >
                  <h3 className="text-base font-semibold">{hideIdentifiers(section.title)}</h3>
                  <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700 dark:text-slate-300">
                    {hideIdentifiers(section.body)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <CandidateTradePlanView bundle={detail.tradePlan} revisionId={detail.revisionId} publicationState={isStaleReadonly ? 'stale_readonly' : isFinalConfirmed ? 'confirmed' : 'preliminary'} />
      <CandidateHistoryChart detail={detail} />
      <details className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer text-base font-semibold">研究依據與原始資料</summary>
        <p className="mt-2 text-sm text-slate-500">需要查核模型時再展開；估值與進場判斷已整理在上方。</p>
        {detail.facts.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {detail.facts.slice(0, 100).map((fact) => (
              <li key={`${fact.factKey}-${fact.periodEnd}`} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                <span className="font-medium">{readableFactKey(fact.factKey)}</span>
                <span className="ml-2 text-slate-500">{dateLabel(fact.periodEnd)} · {fact.value == null ? "資料待補" : `${fact.value}${fact.unit ? ` ${fact.unit}` : ""}`}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">官方資料仍在回填。</p>}
        <EvidenceSources detail={detail} />
      </details>
      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer text-base font-semibold">個人研究工具</summary>
        <LocalResearchWorkspace
          symbol={detail.symbol}
          revisionId={detail.revisionId}
          currentPrice={detail.valuation.currentPrice ?? detail.technical.close ?? null}
          atr14={detail.technical.atr14 ?? null}
          baseTarget={detail.valuation.baseTarget ?? null}
        />
      </details>
    </main>
  );
}
