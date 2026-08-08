import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import type {
  OpportunityEngineV3,
  VerifiedChangeKindV3,
  VerifiedChangeLaneKeyV3,
} from '@/lib/opportunity-v3/contracts';
import { v3PublicEnabled } from '@/lib/opportunity-v3/deployment';
import { loadOpportunityEngineV3 } from '@/lib/opportunity-v3/projection';
import { OpportunityV3AccessibilityMatrix } from './OpportunityV3AccessibilityMatrix';

export const dynamic = 'force-dynamic';

const laneLabel: Record<VerifiedChangeLaneKeyV3, string> = {
  new_verified_change: '已驗證的新變化',
  strengthened_thesis: '等待觸發',
  contradiction_or_review: '估值／證據待覆核',
};

const kindLabel: Record<VerifiedChangeKindV3, string> = {
  official_event: '官方事件',
  fundamental_update: '基本面更新',
  valuation_update: '估值更新',
  source_corroboration: '來源佐證',
  contradiction: '待覆核矛盾',
};

const unavailableCopy: Record<
  Extract<OpportunityEngineV3, { availability: 'unavailable' }>['engineHealth']['reason'],
  { eyebrow: string; title: string; body: string }
> = {
  cold_start: {
    eyebrow: '尚未建立',
    title: 'verified-change workspace 正在等待第一個成功 run',
    body: '目前沒有可安全顯示的不可變投影；既有推薦與排序不受影響。',
  },
  no_matching_success: {
    eyebrow: '尚無相符版本',
    title: '目前版本尚未產生可用投影',
    body: '系統不會用舊版、其他 run 或 legacy 資料補出內容。',
  },
  matching_run_in_progress: {
    eyebrow: '計算中',
    title: '新的 verified-change 投影正在計算',
    body: '完成前不顯示部分結果，也不會以舊 run 冒充本次結果。',
  },
  latest_matching_failed: {
    eyebrow: '本次失敗',
    title: '最新相符 run 未通過完整性檢查',
    body: '沒有發布部分結果；請等待下一次經驗證的成功投影。',
  },
};

function wholeSecondNow(): string {
  return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export async function OpportunityV3Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  if (!v3PublicEnabled()) notFound();
  if (Object.keys(await searchParams).length > 0) notFound();
  const engine = await loadOpportunityEngineV3(wholeSecondNow()).catch(() => null);
  if (!engine) {
    return <WorkspaceFailure />;
  }
  if (engine.availability === 'unavailable') {
    const copy = unavailableCopy[engine.engineHealth.reason];
    return (
      <WorkspaceShell asOf={engine.asOf}>
        <StateCard eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
      </WorkspaceShell>
    );
  }
  const workspace = engine.verifiedChangeWorkspace;
  return (
    <WorkspaceShell asOf={engine.asOf} degraded={engine.engineHealth.status === 'degraded'}>
      {workspace.status === 'empty' ? (
        <StateCard
          eyebrow="目前沒有符合項目"
          title="此 cutoff 沒有新的 verified change"
          body="空集合是有效結果：候選仍保留在不可變投影中，但沒有項目通過本次 lane 規則。"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {workspace.lanes.map((lane) => (
            <section key={lane.key} className="rounded-[1.75rem] border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{laneLabel[lane.key]}</h2>
                <span className="rounded-full bg-slate-950/5 px-2.5 py-1 text-xs dark:bg-white/10">
                  {lane.items.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {lane.items.map((item) => (
                  <Link
                    key={item.symbol}
                    href={item.brief.detailPath}
                    className="block min-h-11 rounded-2xl border border-line bg-surface-strong p-4 transition hover:border-amber-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {item.chineseName ?? item.symbol}
                          <span className="ml-2 text-xs font-normal text-slate-500">{item.symbol}</span>
                        </p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {kindLabel[item.brief.changeKind]}
                        </p>
                      </div>
                      <time dateTime={item.brief.verifiedAt} className="break-all text-[11px] text-slate-500">
                        {item.brief.verifiedAt}
                      </time>
                    </div>
                    <h3 className="mt-3 text-sm font-medium">{item.brief.headline}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-emerald-100/65">
                      {item.brief.whatChanged}
                    </p>
                    {item.brief.contradictions.length ? (
                      <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">
                        {item.brief.contradictions.length} 項證據需要覆核
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <OpportunityV3AccessibilityMatrix
                        card={item.card}
                      />
                    </div>
                  </Link>
                ))}
                {!lane.items.length ? (
                  <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-slate-500">
                    此 lane 目前沒有項目。
                  </p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </WorkspaceShell>
  );
}

export default OpportunityV3Page;

function WorkspaceShell({
  asOf,
  degraded = false,
  children,
}: {
  asOf: string;
  degraded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-5 py-8 text-slate-950 dark:text-emerald-50">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">
              V3 影子研究 · 非投資建議
            </p>
            <h1 className="mt-2 text-3xl font-semibold md:text-5xl">Verified-change workspace</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-emerald-100/65">
              聚焦「發生了什麼變化、證據是否足夠、哪裡仍有矛盾」。本頁不顯示部位比例，也不改動既有推薦。
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>資料截止 <time dateTime={asOf} className="break-all">{asOf}</time></p>
            {degraded ? <p className="mt-1 text-amber-700 dark:text-amber-300">部分來源或市場證據待補</p> : null}
          </div>
        </div>
        {children}
        <p className="mt-8 text-xs text-slate-500">V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE</p>
      </div>
    </main>
  );
}

function StateCard({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="rounded-[2rem] border border-dashed border-amber-500/35 bg-amber-500/5 p-7">
      <p className="text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-emerald-100/65">{body}</p>
    </section>
  );
}

function WorkspaceFailure() {
  return (
    <WorkspaceShell asOf={wholeSecondNow()}>
      <StateCard
        eyebrow="暫時無法讀取"
        title="verified-change workspace 未通過讀取驗證"
        body="系統沒有顯示部分或替代資料；稍後可重新整理再試。"
      />
    </WorkspaceShell>
  );
}
