import { getDailyRadarData } from '@/lib/domain';
import { RadarTabs } from './components/RadarTabs';

export const dynamic = 'force-dynamic';

const connectorLabel: Record<string, string> = {
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
};

function connectorStatusLabel(status: string) {
  if (status === 'success' || status === 'valid') return '正常';
  if (status === 'running') return '同步中';
  if (status === 'timed_out') return '逾時待重試';
  if (status === 'failed' || status === 'invalid') return '失敗';
  return '待確認';
}

export default async function Home() {
  const radar = await getDailyRadarData();

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_20px_80px_rgba(8,18,26,0.12)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.3fr_0.7fr] md:px-10">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">
                台股故事型機會雷達
              </div>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
                  找出還沒反映在股價上的
                  <span className="block text-[var(--accent)]">台股故事型機會</span>
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-700 dark:text-emerald-100/78 md:text-base">
                  StockInsider 以台股為核心，把主題熱度、社群線索、官方驗證、財務影響、技術面與研究 memo 收斂成同一個工作台，專注於未來
                  1-3 個月可能上漲但尚未被市場充分定價的股票。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">資料日期</p>
                  <p className="mt-2 text-xl font-semibold">{radar.asOf}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">市場狀態</p>
                  <p className="mt-2 text-xl font-semibold">{radar.marketRegime}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">24 小時 Agent 執行次數</p>
                  <p className="mt-2 text-xl font-semibold">{radar.agentStatus.runCount24h}</p>
                </div>
              </div>

              <p className="max-w-3xl text-sm leading-7 text-slate-700 dark:text-emerald-100/78">{radar.focusSummary}</p>
            </div>

            <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(8,24,33,0.88),rgba(11,33,43,0.94))] p-6 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Agent 控制台</h2>
                <span className="rounded-full bg-emerald-500/16 px-3 py-1 text-xs text-emerald-300">{radar.agentStatus.activeRunType || '待命中'}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-emerald-50/84">
                最近成功執行時間：{radar.agentStatus.lastSuccessfulRunAt ? new Date(radar.agentStatus.lastSuccessfulRunAt).toLocaleString() : '尚未執行'}
              </p>

              <div className="mt-5">
                <p className="text-xs tracking-[0.24em] text-emerald-100/65">已啟動角色</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {radar.agentStatus.startedRoles.length > 0 ? (
                    radar.agentStatus.startedRoles.map((role) => (
                      <span key={role} className="rounded-full border border-emerald-300/20 bg-emerald-400/8 px-3 py-1 text-xs text-emerald-50/92">
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-emerald-50/75">目前尚無執行紀錄。</span>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs tracking-[0.24em] text-emerald-100/65">已允許 Agent 模板</p>
                <p className="mt-3 text-sm leading-6 text-emerald-50/84">
                  目前已綁定 {radar.agentStatus.allowlistedProfiles.length} 個 `agency-agents` 角色模板，所有輸出都仍需經過 hybrid judge 才能進入推薦層。
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs tracking-[0.24em] text-emerald-100/65">來源同步狀態</p>
                <div className="mt-3 grid gap-2">
                  {radar.connectorStatus.map((item) => (
                    <div key={item.connector} className="rounded-2xl border border-emerald-300/12 bg-emerald-400/6 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-emerald-50/92">{connectorLabel[item.connector] || item.connector}</span>
                        <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs text-emerald-50/88">
                          {connectorStatusLabel(item.lastRunStatus || item.credentialStatus)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-emerald-50/72">
                        憑證 {item.credentialStatus} · 最近成功 {item.lastSuccessAt ? new Date(item.lastSuccessAt).toLocaleString('zh-TW') : '尚無成功紀錄'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
          <RadarTabs radar={radar} />
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 backdrop-blur">
          <div>
            <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/50">研究報告</p>
            <h2 className="mt-2 text-2xl font-semibold">研究 memo 與發佈內容</h2>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {radar.reports.map((memo) => (
              <article key={memo.slug} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">{memo.reportKind}</p>
                <h3 className="mt-3 text-xl font-semibold">{memo.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{memo.summary}</p>
                <p className="mt-4 text-xs text-slate-500 dark:text-emerald-100/45">相關股票：{memo.relatedSymbols.join(', ') || '無'}</p>
              </article>
            ))}
          </div>
        </section>

        <p className="border-t border-[var(--line)] pt-4 text-xs text-slate-500 dark:text-emerald-100/45">{radar.riskDisclosure}</p>
      </div>
    </main>
  );
}
