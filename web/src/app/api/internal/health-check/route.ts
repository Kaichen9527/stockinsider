import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveDataMode } from '@/lib/data-mode';

type Row = Record<string, unknown>;

export async function GET() {
  const dataMode = resolveDataMode();
  const fallbackUsed = dataMode === 'demo';
  const env = {
    INTERNAL_API_KEY: !!process.env.INTERNAL_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    SUPABASE_URL: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    SUPABASE_SERVICE_KEY: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
    meta_cookies: !!process.env.sessionid,
    TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
    YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
  };

  let connectors: Array<{ platform: string; status: string; lastCheckedAt: string | null }> = [];
  let lastCronRuns: Array<{ connector: string; lastSuccessAt: string | null; lastStatus: string }> = [];

  try {
    const supabase = getSupabaseServerClient();

    // Credential status per platform
    const { data: creds } = await supabase
      .from('source_credentials_registry')
      .select('platform,status,updated_at')
      .order('updated_at', { ascending: false });

    if (creds) {
      const seen = new Set<string>();
      connectors = (creds as Row[])
        .filter((c) => {
          const p = String(c.platform || '');
          if (seen.has(p)) return false;
          seen.add(p);
          return true;
        })
        .map((c) => ({
          platform: String(c.platform || ''),
          status: String(c.status || 'unknown'),
          lastCheckedAt: c.updated_at ? String(c.updated_at) : null,
        }));
    }

    // Last successful cron run per connector
    const { data: runs } = await supabase
      .from('connector_runs')
      .select('connector_name,platform,status,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(200);

    if (runs) {
      const byConnector = new Map<string, { lastSuccessAt: string | null; lastStatus: string }>();
      const successByConnector = new Map<string, string | null>();
      for (const r of runs as Row[]) {
        const name = String(r.platform || r.connector_name || '');
        if (!name) continue;
        if (!byConnector.has(name)) {
          byConnector.set(name, {
            lastSuccessAt: null,
            lastStatus: String(r.status || ''),
          });
        }
        if (String(r.status || '') === 'success' && !successByConnector.has(name)) {
          successByConnector.set(name, r.finished_at ? String(r.finished_at) : null);
        }
      }
      lastCronRuns = Array.from(byConnector.entries()).map(([connector, info]) => ({
        connector,
        lastStatus: info.lastStatus,
        lastSuccessAt: successByConnector.get(connector) || null,
      }));
    }
  } catch {
    // Supabase not configured — return env section only
  }

  return NextResponse.json({
    ok: true,
    dataMode,
    fallbackUsed,
    env,
    connectors,
    lastCronRuns,
    checkedAt: new Date().toISOString(),
  });
}
