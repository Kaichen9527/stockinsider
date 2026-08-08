import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runSourceSync } from '@/lib/research-v2';

const ALL_CONNECTORS = ['investanchors', 'threads', 'instagram', 'telegram', 'ptt', 'bulltalk', 'googlenews', 'anue', 'udn', 'mobile01', 'twse_insider'] as const;

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    // Support connector via body OR URL query string (for Vercel cron which can't send body)
    const connector = body?.connector ? String(body.connector) : (searchParams.get('connector') || 'investanchors');
    const dryRun = Boolean(body?.dryRun);
    const statusOnly = Boolean(body?.statusOnly) || searchParams.get('statusOnly') === '1';
    const symbol = body?.symbol ? String(body.symbol).toUpperCase() : (searchParams.get('symbol') || '').toUpperCase();
    if (statusOnly) {
      const statusResult = (item: string) => ({
        connector: item,
        runId: `status-only-${Date.now()}`,
        recordsWritten: 0,
        fetchedPosts: 0,
        watermarkBefore: null,
        watermarkAfter: null,
        duplicatesSkipped: 0,
        sessionRefreshed: false,
        errorCode: null,
        matchedDirectHits: 0,
        matchedIndustryHits: 0,
        timedOut: false,
        degradedReason: 'status_only_skip: canonical source writes are handled by local launchd worker',
        sessionMode: null,
      });
      const results = connector === 'all' ? ALL_CONNECTORS.map((item) => statusResult(item)) : [statusResult(connector)];
      return NextResponse.json({
        ok: true,
        result:
          connector === 'all'
            ? {
                connector: 'all',
                recordsWritten: 0,
                fetchedPosts: 0,
                watermarkBefore: null,
                watermarkAfter: null,
                duplicatesSkipped: 0,
                sessionRefreshed: false,
                errorCode: null,
                matchedDirectHits: 0,
                matchedIndustryHits: 0,
                timedOut: false,
                degradedReason: 'status_only_skip',
                sessionMode: null,
                results,
              }
            : results[0],
        meta: { runId: `status-only-${Date.now()}`, dryRun, statusOnly: true, connector, symbol: symbol || null },
      });
    }
    if (connector === 'all') {
      const results = [] as Array<{
        connector: string;
        runId: string;
        recordsWritten: number;
        fetchedPosts: number;
        watermarkBefore: string | null;
        watermarkAfter: string | null;
        duplicatesSkipped: number;
        sessionRefreshed: boolean;
        errorCode: string | null;
        matchedDirectHits: number;
        matchedIndustryHits: number;
        timedOut: boolean;
        degradedReason: string | null;
        sessionMode: string | null;
      }>;
      for (const item of ALL_CONNECTORS) {
        const result = await runSourceSync({ connector: item, dryRun, ...(symbol ? { symbol } : {}) });
        results.push({
          connector: item,
          runId: String(result.runId || ''),
          recordsWritten: Number(result.recordsWritten || 0),
          fetchedPosts: Number(result.fetchedPosts ?? result.recordsWritten ?? 0),
          watermarkBefore: result.watermarkBefore ?? null,
          watermarkAfter: result.watermarkAfter ?? null,
          duplicatesSkipped: Number(result.duplicatesSkipped || 0),
          sessionRefreshed: Boolean(result.sessionRefreshed),
          errorCode: result.errorCode ?? null,
          matchedDirectHits: Number(result.matchedDirectHits || 0),
          matchedIndustryHits: Number(result.matchedIndustryHits || 0),
          timedOut: Boolean(result.timedOut),
          degradedReason: result.degradedReason ?? null,
          sessionMode: result.sessionMode ?? null,
        });
      }
      return NextResponse.json({
        ok: true,
        result: {
          connector: 'all',
          recordsWritten: results.reduce((sum, row) => sum + row.recordsWritten, 0),
          fetchedPosts: results.reduce((sum, row) => sum + row.fetchedPosts, 0),
          watermarkBefore: null,
          watermarkAfter: null,
        duplicatesSkipped: results.reduce((sum, row) => sum + row.duplicatesSkipped, 0),
        sessionRefreshed: false,
        errorCode: null,
        matchedDirectHits: results.reduce((sum, row) => sum + row.matchedDirectHits, 0),
        matchedIndustryHits: results.reduce((sum, row) => sum + row.matchedIndustryHits, 0),
        timedOut: results.some((row) => row.timedOut),
        degradedReason: results.some((row) => row.degradedReason) ? 'see_results' : null,
        sessionMode: null,
        results,
      },
        meta: { runId: `batch-${Date.now()}`, dryRun, connector: 'all', symbol: symbol || null },
      });
    }
    const result = await runSourceSync({ connector, dryRun, ...(symbol ? { symbol } : {}) });
    return NextResponse.json({
      ok: true,
      result: {
        connector: result.connector,
        recordsWritten: result.recordsWritten,
        fetchedPosts: result.fetchedPosts ?? result.recordsWritten ?? 0,
        entityId: result.entityId,
        watermarkBefore: result.watermarkBefore ?? null,
        watermarkAfter: result.watermarkAfter ?? null,
        duplicatesSkipped: result.duplicatesSkipped ?? 0,
        sessionRefreshed: Boolean(result.sessionRefreshed),
        errorCode: result.errorCode ?? null,
        matchedDirectHits: Number(result.matchedDirectHits || 0),
        matchedIndustryHits: Number(result.matchedIndustryHits || 0),
        timedOut: Boolean(result.timedOut),
        degradedReason: result.degradedReason ?? null,
        sessionMode: result.sessionMode ?? null,
      },
      meta: { runId: result.runId, dryRun, connector, symbol: symbol || null },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message, errorCode: 'source_sync_failed' }, { status: 500 });
  }
}

// Vercel cron triggers via GET; mirror POST logic
export async function GET(req: Request) {
  return POST(req);
}
