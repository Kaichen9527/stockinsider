import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runSourceSync } from '@/lib/research-v2';
import { activeSourceConnectorKeys, sourceExecutionPolicy } from '@/lib/source-policy';
import {
  nextExpectedAt,
  recordSourceRunLedger,
  type SourceTerminalReason,
} from '@/lib/source-run-ledger';
import type { SourceSyncResult } from '@/lib/types';

const PARSER_VERSION = 'source-sync-v2.0.0';

type SourceResult = SourceSyncResult & {
  terminalReason: SourceTerminalReason;
  licenseBasis: string;
  authStatus: 'authorized' | 'missing' | 'rejected' | 'not_applicable';
};

function authStatus(result: SourceSyncResult) {
  const reason = `${result.errorCode || ''} ${result.degradedReason || ''}`;
  if (/missing|oauth|credential/iu.test(reason)) return 'missing' as const;
  if (/auth|login|rejected/iu.test(reason)) return 'rejected' as const;
  return result.sessionMode === 'not_applicable' ? 'not_applicable' as const : 'authorized' as const;
}

function terminalReason(result: SourceSyncResult): SourceTerminalReason {
  const fetched = Number(result.fetchedPosts || 0);
  const written = Number(result.recordsWritten || 0);
  const duplicates = Number(result.duplicatesSkipped || 0);
  const matched = Number(result.matchedDirectHits || 0) + Number(result.matchedIndustryHits || 0);
  const reason = `${result.errorCode || ''} ${result.degradedReason || ''}`;
  if (/auth|oauth|credential|login/iu.test(reason)) return 'auth_failed';
  if (result.timedOut) return 'failed';
  if (written > 0 && reason.trim()) return 'partial';
  if (written > 0) return 'success';
  if (matched > 0 && duplicates >= matched) return 'duplicate_only';
  if (matched > 0) return 'parser_failed';
  if (fetched > 0) return 'successful_empty';
  if (reason.trim()) return 'failed';
  return 'successful_empty';
}

function publicResult(raw: Partial<SourceSyncResult> & Pick<SourceSyncResult, 'runId' | 'dryRun' | 'connector' | 'recordsWritten' | 'entityId'>, licenseBasis: string): SourceResult {
  const result: SourceSyncResult = {
    ...raw,
    watermarkBefore: raw.watermarkBefore ?? null,
    watermarkAfter: raw.watermarkAfter ?? null,
    duplicatesSkipped: Number(raw.duplicatesSkipped || 0),
    sessionRefreshed: Boolean(raw.sessionRefreshed),
  };
  return {
    ...result,
    terminalReason: terminalReason(result),
    licenseBasis,
    authStatus: authStatus(result),
  };
}

async function recordPolicyBlock(connector: string, attemptedAt: string) {
  const policy = sourceExecutionPolicy(connector);
  const terminalReason: SourceTerminalReason = policy.disposition === 'retired'
    ? 'retired'
    : policy.disposition === 'manual_only'
      ? 'manual_only'
      : policy.disposition === 'blocked_auth'
        ? 'auth_failed'
        : 'license_blocked';
  await recordSourceRunLedger({
    externalRunId: null,
    connector,
    expectedAt: attemptedAt,
    attemptedAt,
    succeededAt: null,
    fetched: 0,
    matched: 0,
    written: 0,
    duplicate: 0,
    authStatus: policy.disposition === 'blocked_auth' ? 'missing' : 'not_applicable',
    terminalReason,
    terminalDetail: policy.terminalReason,
    parserVersion: PARSER_VERSION,
    policy,
    nextExpectedAt: nextExpectedAt(attemptedAt, policy.cadenceHours),
  });
  return { policy, terminalReason };
}

async function executeConnector(connector: string, dryRun: boolean, symbol: string): Promise<SourceResult> {
  const policy = sourceExecutionPolicy(connector);
  const attemptedAt = new Date().toISOString();
  if (policy.disposition !== 'active') {
    const blocked = dryRun
      ? { policy, terminalReason: policy.disposition === 'retired' ? 'retired' as const : policy.disposition === 'manual_only' ? 'manual_only' as const : policy.disposition === 'blocked_auth' ? 'auth_failed' as const : 'license_blocked' as const }
      : await recordPolicyBlock(connector, attemptedAt);
    const error = new Error(policy.terminalReason || policy.disposition) as Error & { status?: number; result?: Record<string, unknown> };
    error.status = policy.disposition === 'retired' ? 410 : 409;
    error.result = { connector, terminalReason: blocked.terminalReason, licenseBasis: policy.licenseBasis, authStatus: policy.disposition === 'blocked_auth' ? 'missing' : 'not_applicable' };
    throw error;
  }

  try {
    const raw = await runSourceSync({ connector, dryRun, ...(symbol ? { symbol } : {}) });
    const result = publicResult(raw, policy.licenseBasis);
    if (!dryRun) {
      await recordSourceRunLedger({
        externalRunId: result.runId,
        connector,
        expectedAt: attemptedAt,
        attemptedAt,
        succeededAt: ['success', 'successful_empty', 'duplicate_only'].includes(result.terminalReason) ? new Date().toISOString() : null,
        fetched: Number(result.fetchedPosts || 0),
        matched: Number(result.matchedDirectHits || 0) + Number(result.matchedIndustryHits || 0),
        written: Number(result.recordsWritten || 0),
        duplicate: Number(result.duplicatesSkipped || 0),
        authStatus: result.authStatus,
        terminalReason: result.terminalReason,
        terminalDetail: result.errorCode || result.degradedReason || null,
        parserVersion: PARSER_VERSION,
        policy,
        nextExpectedAt: nextExpectedAt(attemptedAt, policy.cadenceHours),
        metadata: { symbol: symbol || null, dryRun },
      });
    }
    return result;
  } catch (caught) {
    const error = caught as Error & { status?: number; result?: Record<string, unknown> };
    if (!error.result && !dryRun) {
      await recordSourceRunLedger({
        externalRunId: null,
        connector,
        expectedAt: attemptedAt,
        attemptedAt,
        succeededAt: null,
        fetched: 0,
        matched: 0,
        written: 0,
        duplicate: 0,
        authStatus: /auth|oauth|credential/iu.test(error.message) ? 'rejected' : 'not_applicable',
        terminalReason: /auth|oauth|credential/iu.test(error.message) ? 'auth_failed' : 'failed',
        terminalDetail: error.message.slice(0, 500),
        parserVersion: PARSER_VERSION,
        policy,
        nextExpectedAt: nextExpectedAt(attemptedAt, policy.cadenceHours),
      });
    }
    throw error;
  }
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    if (Boolean(body?.statusOnly) || searchParams.get('statusOnly') === '1') {
      return NextResponse.json({ ok: false, error: 'status_only_sync_retired', terminalReason: 'failed' }, { status: 400 });
    }
    const connector = body?.connector ? String(body.connector) : (searchParams.get('connector') || 'telegram');
    const dryRun = Boolean(body?.dryRun);
    const symbol = (body?.symbol ? String(body.symbol) : (searchParams.get('symbol') || '')).toUpperCase();

    if (connector === 'all') {
      const results: SourceResult[] = [];
      for (const item of activeSourceConnectorKeys()) results.push(await executeConnector(item, dryRun, symbol));
      return NextResponse.json({
        ok: true,
        result: {
          connector: 'all',
          recordsWritten: results.reduce((sum, row) => sum + row.recordsWritten, 0),
          fetchedPosts: results.reduce((sum, row) => sum + Number(row.fetchedPosts || 0), 0),
          duplicatesSkipped: results.reduce((sum, row) => sum + Number(row.duplicatesSkipped || 0), 0),
          results,
        },
        meta: { dryRun, connector: 'all', symbol: symbol || null, authSource: auth.authSource },
      });
    }

    const result = await executeConnector(connector, dryRun, symbol);
    const accepted = ['success', 'successful_empty', 'duplicate_only'].includes(result.terminalReason);
    return NextResponse.json({
      ok: accepted || dryRun,
      result,
      meta: { runId: result.runId, dryRun, connector, symbol: symbol || null, authSource: auth.authSource },
    }, { status: accepted || dryRun ? 200 : 502 });
  } catch (caught) {
    const error = caught as Error & { status?: number; result?: Record<string, unknown> };
    return NextResponse.json({ ok: false, error: error.message, result: error.result ?? null }, { status: error.status ?? 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
