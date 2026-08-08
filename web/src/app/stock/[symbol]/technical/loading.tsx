export default function StockTechnicalLoading() {
  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1480px] animate-pulse flex-col gap-6">
        <header className="rounded-[2rem] border border-line bg-surface p-7">
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">Chart Room</p>
          <div className="mt-6 h-11 w-80 rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
          <p className="mt-4 text-sm text-slate-500 dark:text-emerald-100/55">技術圖與籌碼載入中，正在整理兩年日 K、籌碼與 alert levels...</p>
        </header>
        <section className="grid gap-6 xl:grid-cols-[270px_minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="h-72 rounded-[2rem] border border-line bg-slate-200 p-5 dark:bg-emerald-100/10">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">技術 Watchlist 載入中</p>
            </div>
            <div className="h-64 rounded-[2rem] border border-line bg-slate-200 p-5 dark:bg-emerald-100/10">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">Alert levels</p>
            </div>
          </div>
          <div className="h-[620px] rounded-[2rem] border border-line bg-slate-200 dark:bg-emerald-100/10" />
          <div className="space-y-4">
            <div className="h-72 rounded-[2rem] border border-line bg-slate-200 p-5 dark:bg-emerald-100/10">
              <p className="text-xs tracking-[0.2em] text-slate-500 dark:text-emerald-100/45">籌碼面板</p>
            </div>
            <div className="h-72 rounded-[2rem] border border-line bg-slate-200 dark:bg-emerald-100/10" />
          </div>
        </section>
      </div>
    </main>
  );
}
