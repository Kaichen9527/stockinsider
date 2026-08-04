import Link from 'next/link';
import type { FactorKeyV3, HorizonV3 } from '@/lib/opportunity-v3/contracts';
import { loadOpportunityDetailV3 } from '@/lib/opportunity-v3/detail';

export const dynamic = 'force-dynamic';

const formalLabel: Record<string, string> = {
  not_evaluated: '尚未評估',
  insufficient_evidence: '證據不足',
  valuation_review: '估值待覆核',
  formal_watch: '正式觀察',
  formal_candidate: '正式候選',
};

const actionLabel: Record<string, string> = {
  avoid: '暫不納入',
  valuation_review: '估值待覆核',
  wait_trigger: '等待條件確認',
  event_starter: '事件觀察',
  starter_now: '條件已通過',
};

const horizonLabel: Record<HorizonV3, string> = {
  momentum_5_20d: '動能 5–20 日',
  swing_20_60d: '波段 20–60 日',
  thesis_120_250d: '論點 120–250 日',
};

const factorLabel: Record<FactorKeyV3, string> = {
  priceVolume: '價量',
  chip: '籌碼',
  catalyst: '催化事件',
  marketSector: '市場／產業',
  fundamental: '基本面',
  valuation: '估值',
};

const evidenceStatusLabel = {
  available: '可用',
  missing: '缺漏',
  stale: '過期',
} as const;

const sourceClassLabel = {
  official: '官方',
  public_research: '公開研究',
  curated_thesis: '策展論點',
  community: '社群',
} as const;

function time(value: string) {
  return (
    <time dateTime={value} className="break-all">
      {new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))}
    </time>
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ runId: string; symbol: string }>;
}) {
  const { runId, symbol } = await params;
  const detail = await loadOpportunityDetailV3(runId, symbol).catch(() => null);
  if (!detail) return <DetailUnavailable />;

  return (
    <main className="min-h-screen px-4 py-6 text-slate-950 sm:px-5 sm:py-8 dark:text-emerald-50">
      <article className="mx-auto max-w-5xl space-y-6 rounded-[1.5rem] border border-line bg-surface p-5 shadow-xl sm:rounded-[2rem] md:p-10">
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          V3 影子研究 — 僅供研究，不是正式推薦或投資建議
        </div>

        <header>
          <Link
            href="/opportunity-v3"
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            返回 verified-change workspace
          </Link>
          <p className="mt-6 text-xs tracking-[0.2em] text-slate-500">SOURCE-LED OPPORTUNITY V3</p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl">
            {detail.chineseName ?? detail.symbol}
            <span className="ml-2 text-lg text-slate-500 sm:text-xl">{detail.symbol}</span>
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-emerald-100/65">
            資料截止 {time(detail.sourceCutoff)}
          </p>
        </header>

        {detail.verifiedChangeBrief ? (
          <section aria-labelledby="verified-change-title" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <p className="text-xs tracking-[0.2em] text-amber-700 dark:text-amber-300">已驗證的新變化</p>
            <h2 id="verified-change-title" className="mt-2 text-xl font-semibold">
              {detail.verifiedChangeBrief.headline}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/75">
              {detail.verifiedChangeBrief.whatChanged}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-emerald-100/65">
              {detail.verifiedChangeBrief.whyItMatters}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              驗證時間 {time(detail.verifiedChangeBrief.verifiedAt)}
            </p>
            {detail.verifiedChangeBrief.contradictions.length ? (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
                尚有 {detail.verifiedChangeBrief.contradictions.length} 項矛盾或缺漏證據，請先覆核。
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="research-state-title" className="grid gap-4 md:grid-cols-2">
          <h2 id="research-state-title" className="sr-only">研究狀態</h2>
          <Metric label="正式研究狀態" value={formalLabel[detail.card.formalResearchStatus] ?? '未識別狀態'} />
          <Metric label="研究動作" value={actionLabel[detail.card.actionDecision.newPositionAction] ?? '未識別狀態'} />
          <Metric label="主要週期" value={horizonLabel[detail.card.primaryHorizon]} />
          <Metric
            label="研究分數／可用權重"
            value={`${detail.card.score.toFixed(1)}／${detail.card.availableWeight.toFixed(1)}%`}
          />
        </section>

        <section aria-labelledby="trigger-title" className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 id="trigger-title" className="font-semibold">等待的觸發條件</h2>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600 dark:text-emerald-100/70">
              {detail.card.actionDecision.entryTrigger ?? '目前沒有可公開的進場觸發條件。'}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-5">
            <h2 className="font-semibold">失效條件與阻擋原因</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-emerald-100/70">
              {detail.card.actionDecision.invalidation.code === 'data_integrity_review'
                ? '資料完整性需覆核'
                : detail.card.actionDecision.invalidation.code === 'evidence_expiry_only'
                  ? '證據到期即需重評'
                  : '價格停損或證據到期即需重評'}
            </p>
            {detail.decisionEvidence.blockReasons.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700 dark:text-rose-300">
                {detail.decisionEvidence.blockReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">沒有額外阻擋原因。</p>
            )}
          </div>
        </section>

        <section aria-labelledby="valuation-title" className="rounded-2xl border border-line p-5">
          <h2 id="valuation-title" className="text-lg font-semibold">估值與產業週期</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="估值狀態" value={detail.card.valuation.status} />
            <Metric label="方法" value={detail.card.valuation.method ?? '無可用方法'} />
            <Metric
              label="P10／P50／P90"
              value={[detail.card.valuation.p10, detail.card.valuation.p50, detail.card.valuation.p90]
                .map((value) => value === null ? '—' : value.toFixed(2))
                .join('／')}
            />
            <Metric label="產業週期" value={detail.card.sectorCycle.state} />
          </div>
          {detail.card.valuation.reasons.length ? (
            <p className="mt-4 break-words text-sm text-slate-600 dark:text-emerald-100/70">
              {detail.card.valuation.reasons.join('、')}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="evidence-title" className="rounded-2xl border border-line p-5">
          <h2 id="evidence-title" className="text-lg font-semibold">來源證據</h2>
          <div className="mt-4 divide-y divide-line">
            {detail.sourceEvidence.map((row) => (
              <div key={row.ref} className="grid gap-2 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="break-words font-medium">{row.sourceKey}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{row.ref}</p>
                </div>
                <div className="text-left text-xs text-slate-500 sm:text-right">
                  <p>{sourceClassLabel[row.sourceClass]} · {row.stance === 'supports' ? '支持' : '反證'}</p>
                  <p className="mt-1">{time(row.effectiveAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="factor-title" className="rounded-2xl border border-line p-5">
          <h2 id="factor-title" className="text-lg font-semibold">各週期因子</h2>
          <div className="mt-4 space-y-4">
            {detail.horizonDetails.map((horizon) => (
              <details key={horizon.horizon} className="rounded-xl border border-line p-4" open={horizon.horizon === detail.card.primaryHorizon}>
                <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                  {horizonLabel[horizon.horizon]} · {horizon.score.toFixed(1)} 分 · 信心 {(horizon.scoreConfidence * 100).toFixed(0)}%
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {horizon.factors.map((factor) => (
                    <div key={factor.key} className="rounded-lg bg-slate-950/5 p-3 text-sm dark:bg-white/5">
                      <div className="flex items-center justify-between gap-3">
                        <span>{factorLabel[factor.key]}</span>
                        <span>{evidenceStatusLabel[factor.status]}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        值 {factor.value === null ? '無資料' : factor.value.toFixed(2)} · 貢獻 {factor.contribution.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <details className="rounded-2xl border border-line p-5 text-xs text-slate-500">
          <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            方法與不可變識別資料
          </summary>
          <dl className="mt-3 grid gap-2 break-all">
            <div><dt className="font-medium">Run</dt><dd>{detail.runId}</dd></div>
            <div><dt className="font-medium">市場脈絡</dt><dd>{detail.decisionEvidence.marketContextRef}</dd></div>
            <div><dt className="font-medium">產業週期</dt><dd>{detail.decisionEvidence.sectorCycleRef}</dd></div>
            <div><dt className="font-medium">評分 manifest</dt><dd>{detail.decisionEvidence.scoringManifestRef}</dd></div>
          </dl>
        </details>

        <p className="text-xs text-slate-500">V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE</p>
      </article>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold">{value}</p>
    </div>
  );
}

function DetailUnavailable() {
  return (
    <main className="min-h-screen px-4 py-8 text-slate-950 dark:text-emerald-50">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-dashed border-amber-500/35 bg-amber-500/5 p-7">
        <p className="text-xs tracking-[0.2em] text-amber-700 dark:text-amber-300">DETAIL NOT AVAILABLE</p>
        <h1 className="mt-2 text-2xl font-semibold">這筆 verified-change 詳情目前無法安全顯示</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-emerald-100/65">
          可能是 run、股票代號或不可變 payload 未通過同一 run 的完整性驗證。系統不會使用 legacy 或其他 run 補出內容。
        </p>
        <Link
          href="/opportunity-v3"
          className="mt-5 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          返回 workspace
        </Link>
      </section>
    </main>
  );
}
