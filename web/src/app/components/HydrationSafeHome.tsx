'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function HydrationSafeHome({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-line bg-surface shadow-[0_20px_80px_rgba(8,18,26,0.12)] backdrop-blur">
          <div className="px-6 py-8 md:px-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs tracking-[0.24em] text-amber-700 dark:text-amber-300">
              台股故事型機會雷達
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
              找出還沒反映在股價上的
              <span className="block text-accent">台股故事型機會</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700 dark:text-emerald-100/78 md:text-base">
              正在載入最新市場資料、社群來源、估值與進場條件…
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-2xl border border-line bg-slate-950/5 dark:bg-emerald-100/8" />
              ))}
            </div>
          </div>
        </section>
        <section className="rounded-[2rem] border border-line bg-surface p-6 backdrop-blur">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-950/5 dark:bg-emerald-100/8" />
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
