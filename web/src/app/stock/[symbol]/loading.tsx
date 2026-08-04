export default function StockDeepDiveLoading() {
  return (
    <main className="min-h-screen px-5 py-6 text-slate-950 dark:text-emerald-50 md:px-10 lg:px-14">
      <div className="mx-auto flex max-w-[1400px] animate-pulse flex-col gap-6">
        <section className="rounded-[2rem] border border-line bg-surface p-6">
          <div className="h-5 w-40 rounded-full bg-slate-200 dark:bg-emerald-100/10" />
          <div className="mt-6 h-10 w-72 rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
          <div className="mt-5 grid gap-3 md:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`deep-dive-loading-card-${index}`} className="h-24 rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
            ))}
          </div>
        </section>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-[420px] rounded-[2rem] border border-line bg-slate-200 dark:bg-emerald-100/10" />
          <div className="space-y-4">
            <div className="h-40 rounded-[2rem] border border-line bg-slate-200 dark:bg-emerald-100/10" />
            <div className="h-40 rounded-[2rem] border border-line bg-slate-200 dark:bg-emerald-100/10" />
          </div>
        </section>
        <section className="rounded-[2rem] border border-line bg-surface p-6">
          <div className="h-7 w-48 rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`deep-dive-loading-report-${index}`} className="h-36 rounded-2xl bg-slate-200 dark:bg-emerald-100/10" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
