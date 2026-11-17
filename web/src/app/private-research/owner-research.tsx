'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OwnerResearchNote } from '../../lib/vnext/owner-research-notes.ts';

type View = 'loading' | 'unconfigured' | 'signed_out' | 'authenticated' | 'unavailable';
export default function OwnerResearch() {
  const [view, setView] = useState<View>('loading');
  const [notes, setNotes] = useState<OwnerResearchNote[] | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const status = await fetch('/api/owner/session', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
        const session = await status.json();
        if (abort.signal.aborted) return;
        if (session.configured === false) { setView('unconfigured'); return; }
        if (!status.ok || session.authenticated !== true) { setView('signed_out'); setExpiresAt(null); return; }
        const research = await fetch('/api/owner/research', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
        if (abort.signal.aborted) return;
        if (research.status === 401) { setView('signed_out'); setExpiresAt(null); return; }
        if (!research.ok) { setView('unavailable'); return; }
        const result = await research.json();
        if (abort.signal.aborted) return;
        if (!['missing_data', 'available'].includes(result.research?.status) || !Array.isArray(result.research.rows)) {
          setView('unavailable'); return;
        }
        setNotes(result.research.status === 'available' ? result.research.rows : null);
        setView('authenticated'); setExpiresAt(typeof session.expiresAt === 'string' ? session.expiresAt : null);
        const expiry = Date.parse(session.expiresAt);
        if (Number.isFinite(expiry)) timer = setTimeout(() => {
          setNotes(null); setExpiresAt(null); setView('signed_out');
        }, Math.max(0, expiry - Date.now()));
      } catch { if (!abort.signal.aborted) setView('unavailable'); }
    }
    void load();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, []);
  const messages: Record<View, string> = {
    loading: '正在確認登入狀態…',
    unconfigured: '私人研究登入尚未開放。帳號設定完成後才能登入。',
    signed_out: '請使用獲授權的帳號登入，查看私人研究。',
    authenticated: '已登入。',
    unavailable: '目前無法確認私人研究狀態，請稍後重新整理。',
  };
  return <main data-testid="owner-private-page" className="mx-auto min-h-screen max-w-3xl px-5 py-12 text-slate-900 dark:text-slate-100">
    <Link href="/" className="text-sm text-sky-700 dark:text-sky-300">← 返回公開雷達</Link>
    <h1 className="mt-8 text-3xl font-semibold">私人研究</h1>
    <p className="mt-3 text-slate-600 dark:text-slate-300">僅限獲授權帳號。公開雷達與私人研究分開顯示。</p>
    <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
      <p data-testid="owner-private-state" data-state={view} role="status" aria-live="polite">{messages[view]}</p>
      {view === 'signed_out' && <form method="post" action="/api/owner/login" className="mt-6">
        <button data-testid="owner-login-submit" type="submit" className="rounded-lg bg-sky-400 px-5 py-3 font-semibold text-slate-950">使用 Google 登入</button>
      </form>}
      {view === 'authenticated' && <>
        <h2 className="mt-6 font-semibold">{notes === null ? '研究資料缺口' : '研究筆記'}</h2>
        {notes === null ? <p className="mt-2 text-sm text-slate-300">尚未取得可供此帳號查閱的研究資料與來源授權。</p>
          : notes.length === 0 ? <p className="mt-2 text-sm text-slate-300">目前沒有授權仍有效的研究筆記。</p>
            : <ul className="mt-3 divide-y divide-slate-700">
              {notes.map((note, index) => <li key={index} className="py-3">
                <p className="text-sm text-slate-300">
                  {note.source === 'investanchors' ? '定錨' : 'Telegram'} · <time dateTime={note.publishedAt}>
                    {new Date(note.publishedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
                  </time>
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words">{note.statement}</p>
              </li>)}
            </ul>}
        {expiresAt && <p className="mt-4 text-sm text-slate-300">本次登入將在五分鐘內到期。到期後需重新登入。</p>}
        <form method="post" action="/api/owner/logout" className="mt-6">
          <button data-testid="owner-logout-submit" type="submit" className="rounded-lg border border-slate-500 px-5 py-3">登出</button>
        </form>
      </>}
    </section>
  </main>;
}
