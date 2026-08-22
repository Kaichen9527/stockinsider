import Link from 'next/link';
import { searchSourceDocuments } from '@/lib/domain';
import type { VerificationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const platformLabel: Record<string, string> = {
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
  podcast: 'Podcast',
  broker_report: '券商/投顧報告',
  twse_insider: '董監持股揭露',
};

function verificationBadge(status: VerificationStatus) {
  if (status === '已證實') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (status === '部分證實') return 'bg-sky-600/12 text-sky-700 dark:text-sky-300';
  return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
}

function formatTaipeiDateTime(value: string | null | undefined, fallback = '尚無') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = taipei.getUTCFullYear();
  const mm = String(taipei.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(taipei.getUTCDate()).padStart(2, '0');
  const hh = String(taipei.getUTCHours()).padStart(2, '0');
  const min = String(taipei.getUTCMinutes()).padStart(2, '0');
  const ss = String(taipei.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const q = get('q') || '';
  const symbol = (get('symbol') || '').toUpperCase();
  const platform = get('platform') || '';
  const verificationStatus = (get('verificationStatus') as VerificationStatus | undefined) || '';
  const themeKey = get('themeKey') || '';
  const runId = get('runId') || '';
  const evidenceLevel = (get('evidenceLevel') as '傳言層' | '佐證層' | '估值層' | undefined) || '';
  const from = get('from') || '';
  const to = get('to') || '';
  const page = Number(get('page') || '1');

  const sourceSearch = await searchSourceDocuments({
    q: q || null,
    symbol: symbol || null,
    platform: platform || null,
    verificationStatus: (verificationStatus as VerificationStatus) || null,
    themeKey: themeKey || null,
    runId: runId || null,
    evidenceLevel: (evidenceLevel as '傳言層' | '佐證層' | '估值層') || null,
    from: from || null,
    to: to || null,
    page,
    pageSize: 25,
  })
    .then((result) => ({ result, error: null as string | null }))
    .catch((error) => ({
      error: error instanceof Error ? error.message : '來源查詢暫時失敗',
      result: {
        page,
        pageSize: 25,
        total: 0,
        query: { q: q || null, symbol: symbol || null, platform: platform || null, verificationStatus: (verificationStatus as VerificationStatus) || null, themeKey: themeKey || null, runId: runId || null, evidenceLevel: (evidenceLevel as '傳言層' | '佐證層' | '估值層') || null, from: from || null, to: to || null },
        latestSourceAt: null,
        coverage: [],
        items: [],
        connectorStatus: [],
        recentRuns: [],
        recentAudits: [],
      },
    }));
  const result = sourceSearch.result;
  const sourceSearchError = sourceSearch.error;
  const latestMs = result.latestSourceAt ? new Date(result.latestSourceAt).getTime() : null;
  const threadsQuickFrom =
    latestMs && Number.isFinite(latestMs)
      ? new Date(latestMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : '';
  const investanchorsQuickFrom =
    latestMs && Number.isFinite(latestMs)
      ? new Date(latestMs - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : '';

  const prevPage = Math.max(1, page - 1);
  const nextPage = page + 1;
  const hasPrev = page > 1;
  const hasNext = page * result.pageSize < result.total;
  const qsBase = new URLSearchParams();
  if (q) qsBase.set('q', q);
  if (symbol) qsBase.set('symbol', symbol);
  if (platform) qsBase.set('platform', platform);
  if (verificationStatus) qsBase.set('verificationStatus', verificationStatus);
  if (themeKey) qsBase.set('themeKey', themeKey);
  if (runId) qsBase.set('runId', runId);
  if (evidenceLevel) qsBase.set('evidenceLevel', evidenceLevel);
  if (from) qsBase.set('from', from);
  if (to) qsBase.set('to', to);

  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        <header className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/55">Sources Explorer</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">全量來源檢索中心</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-emerald-100/70">
                可按平台、股票、關鍵字、日期、驗證狀態查詢所有已收集來源。
              </p>
            </div>
            <Link href="/" className="rounded-full border border-line px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              回到雷達首頁
            </Link>
          </div>

          <form method="get" className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-9">
            <input name="q" defaultValue={q} placeholder="關鍵字" className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <input name="symbol" defaultValue={symbol} placeholder="股票代號 (2330)" className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <input name="platform" defaultValue={platform} placeholder="平台 (threads)" className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <input name="themeKey" defaultValue={themeKey} placeholder="題材 key (ai_servers)" className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <input name="runId" defaultValue={runId} placeholder="run id" className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <select name="verificationStatus" defaultValue={verificationStatus} className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm">
              <option value="">驗證狀態(全部)</option>
              <option value="未證實">未證實</option>
              <option value="部分證實">部分證實</option>
              <option value="已證實">已證實</option>
            </select>
            <select name="evidenceLevel" defaultValue={evidenceLevel} className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm">
              <option value="">證據層級(全部)</option>
              <option value="傳言層">傳言層</option>
              <option value="佐證層">佐證層</option>
              <option value="估值層">估值層</option>
            </select>
            <input type="date" name="from" defaultValue={from} className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <input type="date" name="to" defaultValue={to} className="rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm" />
            <button type="submit" className="cta-primary rounded-xl px-4 py-2 text-sm font-medium">搜尋</button>
          </form>

          <div className="mt-4 text-sm text-slate-600 dark:text-emerald-100/70">
            共 {result.total} 筆，最新資料時間：{formatTaipeiDateTime(result.latestSourceAt, '無')}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Link
              href={`/sources?${new URLSearchParams({ platform: 'threads', ...(threadsQuickFrom ? { from: threadsQuickFrom } : {}) }).toString()}`}
              className="rounded-full border border-line px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
            >
              Threads 最新 24h
            </Link>
            <Link
              href={`/sources?${new URLSearchParams({ platform: 'investanchors', ...(investanchorsQuickFrom ? { from: investanchorsQuickFrom } : {}) }).toString()}`}
              className="rounded-full border border-line px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
            >
              定錨近 7 日
            </Link>
          </div>
        </header>

        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          {sourceSearchError ? (
            <div className="mb-4 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200">
              錯誤：{sourceSearchError}。目前先顯示空狀態，請稍後重試或檢查 Supabase 查詢 timeout。
            </div>
          ) : null}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">Connector 狀態</p>
              <div className="mt-3 grid gap-2">
                {result.connectorStatus.map((item) => (
                  <div key={`connector-${item.connector}`} className="rounded-xl border border-line bg-surface p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{platformLabel[item.connector] || item.connector}</span>
                      <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:text-emerald-100/80">{item.lastRunStatus}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
                      最近成功：{formatTaipeiDateTime(item.lastSuccessAt, '尚無')}
                      {' · '}
                      最近筆數：{item.lastRecordsWritten}
                    </p>
                    {item.lastErrorSummary ? (
                      <p className="mt-1 text-amber-700 dark:text-amber-300">錯誤：{item.lastErrorSummary}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-line bg-surface-strong p-4">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">最近 Connector Runs</p>
              <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                {result.recentRuns.slice(0, 20).map((run) => (
                  <div key={run.id} className="rounded-xl border border-line bg-surface p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{platformLabel[run.connector] || run.connector}</span>
                      <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:text-emerald-100/80">{run.status}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
                      started: {formatTaipeiDateTime(run.startedAt, '-')}
                      {' · '}
                      records: {run.recordsWritten}
                    </p>
                    {run.errorSummary ? (
                      <p className="mt-1 text-amber-700 dark:text-amber-300">錯誤：{run.errorSummary}</p>
                    ) : null}
                  </div>
                ))}
                {result.recentRuns.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-emerald-100/65">目前沒有 connector run 紀錄。</p>
                ) : null}
              </div>
            </article>
          </div>

          <article className="mb-6 rounded-2xl border border-line bg-surface-strong p-4">
            <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/55">抓取稽核證據（Source Audits）</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {result.recentAudits.slice(0, 20).map((audit) => (
                <div key={audit.id} className="rounded-xl border border-line bg-surface p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{platformLabel[audit.platform] || audit.platform}</span>
                    <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:text-emerald-100/80">{audit.status}</span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
                    {formatTaipeiDateTime(audit.createdAt, '-')}
                    {audit.connectorRunId ? ` · run ${audit.connectorRunId.slice(0, 8)}` : ''}
                  </p>
                  {audit.targetUrl ? (
                    <a href={audit.targetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-accent underline-offset-2 hover:underline">
                      查看稽核目標
                    </a>
                  ) : null}
                  {audit.notes ? <p className="mt-1 text-slate-600 dark:text-emerald-100/70">{audit.notes}</p> : null}
                </div>
              ))}
              {result.recentAudits.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-emerald-100/65">目前沒有 source audit 證據。</p>
              ) : null}
            </div>
          </article>

          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            {result.coverage.map((item) => (
              <span key={item.platform} className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:text-emerald-50/88">
                {platformLabel[item.platform] || item.platform} ({item.count})
              </span>
            ))}
          </div>

          <div className="space-y-3">
            {result.items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-line bg-surface-strong p-4">
                {(() => {
                  const researchSymbol = symbol && item.symbols.includes(symbol) ? symbol : item.symbols[0];
                  return (
                    <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/65">
                      {platformLabel[item.platform] || item.platform}
                      {item.sourceEntityName ? ` · ${item.sourceEntityName}` : ''}
                      {item.symbols.length > 0 ? ` · ${item.symbols.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.directHit ? (
                      <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                        direct-hit
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${verificationBadge(item.verificationStatus)}`}>
                      {item.verificationStatus}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/80">{item.summary || '無摘要'}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-emerald-100/65">
                  <span>收集時間：{formatTaipeiDateTime(item.collectedAt, '未提供')}</span>
                  <span>發布時間：{formatTaipeiDateTime(item.publishedAt, '未提供')}</span>
                  <span>信心：{item.confidence == null ? '未標記' : item.confidence.toFixed(2)}</span>
                  {item.directHit && researchSymbol ? (
                    <Link
                      href={`/stock/${researchSymbol}?refresh=1`}
                      className="rounded-full border border-line px-3 py-1 text-xs text-slate-700 hover:bg-black/5 dark:text-emerald-100/80 dark:hover:bg-white/5"
                    >
                      研究這檔
                    </Link>
                  ) : null}
                  <a href={item.documentUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                    開啟來源
                  </a>
                </div>
                    </>
                  );
                })()}
              </article>
            ))}
            {result.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-slate-500 dark:text-emerald-100/60">
                查無符合條件的來源資料。
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-emerald-100/65">第 {result.page} 頁，每頁 {result.pageSize} 筆</div>
            <div className="flex gap-2">
              {hasPrev ? (
                <Link href={`/sources?${new URLSearchParams({ ...Object.fromEntries(qsBase.entries()), page: String(prevPage) }).toString()}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  上一頁
                </Link>
              ) : null}
              {hasNext ? (
                <Link href={`/sources?${new URLSearchParams({ ...Object.fromEntries(qsBase.entries()), page: String(nextPage) }).toString()}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  下一頁
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
