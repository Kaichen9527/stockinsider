import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runPodcastSync, runSourceSync } from '@/lib/research-v2';
import { scheduledSourceConnectorKeys, SOURCE_CONNECTOR_KEYS, sourceExecutionPolicy } from '@/lib/source-policy';
import {
  nextExpectedAt,
  recordSourceRunLedger,
  syncSourceConnectorRegistry,
  type SourceTerminalReason,
} from '@/lib/source-run-ledger';
import type { SourceSyncResult } from '@/lib/types';
import { runIsolatedSourceBatch } from '@/lib/source-batch';
import { classifySourceSyncTerminal } from '@/lib/source-health';
import { assertThreadsTokenAvailable } from '@/lib/threads-token';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease';

const PARSER_VERSION = 'source-ranking-v2.2.0';

type SourceResult = SourceSyncResult & {
  fetched: number;
  matched: number;
  new: number;
  duplicate: number;
  written: number;
  terminalReason: SourceTerminalReason;
  licenseBasis: string;
  authStatus: 'authorized' | 'missing' | 'rejected' | 'not_applicable';
  indexUpdated: boolean;
  contentAnalyzable: boolean;
  validMatches: number;
  newCount: number;
};

function authStatus(result: SourceSyncResult) {
  const reason = `${result.errorCode || ''} ${result.degradedReason || ''}`;
  if (/missing|oauth|credential|vault|token/iu.test(reason)) return 'missing' as const;
  if (/auth|login|rejected/iu.test(reason)) return 'rejected' as const;
  return result.sessionMode === 'not_applicable' ? 'not_applicable' as const : 'authorized' as const;
}

function terminalReason(result: SourceSyncResult): SourceTerminalReason {
  return classifySourceSyncTerminal(result);
}

function publicResult(raw: Partial<SourceSyncResult> & Pick<SourceSyncResult, 'runId' | 'dryRun' | 'connector' | 'recordsWritten' | 'entityId'>, licenseBasis: string): SourceResult {
  const result: SourceSyncResult = {
    ...raw,
    watermarkBefore: raw.watermarkBefore ?? null,
    watermarkAfter: raw.watermarkAfter ?? null,
    duplicatesSkipped: Number(raw.duplicatesSkipped || 0),
    sessionRefreshed: Boolean(raw.sessionRefreshed),
  };
  const fetched = Number(result.fetchedPosts || 0);
  const matched = Number(result.matchedDirectHits || 0) + Number(result.matchedIndustryHits || 0);
  const duplicate = Number(result.duplicatesSkipped || 0);
  const written = Number(result.recordsWritten || 0);
  const status = raw as typeof raw & { metadata?: Record<string, unknown>; indexUpdated?: boolean; contentAnalyzable?: boolean; validMatches?: number };
  const metadata = status.metadata || {};
  return {
    ...result,
    fetched,
    matched,
    new: written,
    duplicate,
    written,
    terminalReason: terminalReason(result),
    licenseBasis,
    authStatus: authStatus(result),
    indexUpdated: status.indexUpdated ?? (metadata.index_updated === true || fetched > 0),
    contentAnalyzable: status.contentAnalyzable ?? (metadata.content_analyzable === true || !['podcast', 'gdelt'].includes(result.connector)),
    validMatches: Math.max(0, Number(status.validMatches ?? metadata.valid_matches ?? matched)),
    newCount: written,
  };
}

async function recordPolicyBlock(connector: string, attemptedAt: string) {
  const policy = sourceExecutionPolicy(connector);
  await syncSourceConnectorRegistry(policy, PARSER_VERSION);
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
    newCount: 0,
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
    if (dryRun && connector === 'threads') await assertThreadsTokenAvailable();
    if (!dryRun) await syncSourceConnectorRegistry(policy, PARSER_VERSION);
    const raw = connector === 'podcast'
      ? await runPodcastSync({ dryRun }).then((result) => ({
          ...result, connector: 'podcast', fetchedPosts: result.episodesFound,
          duplicatesSkipped: 0, matchedDirectHits: Number(result.weakSignalsWritten || 0),
          matchedIndustryHits: 0, entityId: null, errorCode: null, degradedReason: null,
          sessionMode: 'not_applicable' as const, watermarkBefore: null, watermarkAfter: null,
          sessionRefreshed: false,
          metadata: {
            index_updated: result.indexUpdated === true,
            content_analyzable: result.contentAnalyzable === true,
            valid_matches: Number(result.validMatches || 0),
          },
        }))
      : await runSourceSync({ connector, dryRun, ...(symbol ? { symbol } : {}) });
    const result = publicResult(raw, policy.licenseBasis);
    if (!dryRun) {
      await recordSourceRunLedger({
        externalRunId: result.runId,
        connector,
        expectedAt: attemptedAt,
        attemptedAt,
        succeededAt: ['success', 'successful_empty', 'duplicate_only'].includes(result.terminalReason) ? new Date().toISOString() : null,
        fetched: result.fetched,
        matched: result.matched,
        newCount: result.new,
        written: result.written,
        duplicate: result.duplicate,
        authStatus: result.authStatus,
        terminalReason: result.terminalReason,
        terminalDetail: result.errorCode || result.degradedReason || null,
        parserVersion: PARSER_VERSION,
        policy,
        nextExpectedAt: nextExpectedAt(attemptedAt, policy.cadenceHours),
        metadata: {
          ...(((raw as typeof raw & { metadata?: Record<string, unknown> }).metadata) || {}),
          symbol: symbol || null,
          dryRun,
        },
        indexUpdated: result.indexUpdated,
        contentAnalyzable: result.contentAnalyzable,
        validMatches: result.validMatches,
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
        newCount: 0,
        written: 0,
        duplicate: 0,
        authStatus: /auth|oauth|credential|vault|token/iu.test(error.message) ? 'rejected' : 'not_applicable',
        terminalReason: /auth|oauth|credential|vault|token/iu.test(error.message) ? 'auth_failed' : 'failed',
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
  let leaseOwner: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    if (Boolean(body?.statusOnly) || searchParams.get('statusOnly') === '1') {
      return NextResponse.json({ ok: false, error: 'status_only_sync_retired', terminalReason: 'failed' }, { status: 400 });
    }
    const connector = body?.connector ? String(body.connector) : (searchParams.get('connector') || 'telegram');
    const dryRun = Boolean(body?.dryRun);
    const symbol = (body?.symbol ? String(body.symbol) : (searchParams.get('symbol') || '')).toUpperCase();
    if (!dryRun) {
      leaseOwner = await acquireProductionWriteLease(3_600);
      if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
    }

    if (connector === 'all') {
      if (!dryRun) {
        await Promise.all(SOURCE_CONNECTOR_KEYS.map((item) =>
          syncSourceConnectorRegistry(sourceExecutionPolicy(item), PARSER_VERSION)));
      }
      const results = await runIsolatedSourceBatch(
        scheduledSourceConnectorKeys(),
        (item) => executeConnector(item, dryRun, symbol),
        (item, caught) => {
          const error = caught as Error & { result?: Record<string, unknown> };
          const policy = sourceExecutionPolicy(item);
          const failed = publicResult({
            runId: `batch-failed-${item}-${Date.now()}`,
            dryRun,
            connector: item,
            recordsWritten: 0,
            fetchedPosts: 0,
            entityId: null,
            errorCode: error.message,
            degradedReason: error.message,
            sessionMode: 'not_applicable',
          }, policy.licenseBasis);
          if (typeof error.result?.terminalReason === 'string') {
            failed.terminalReason = error.result.terminalReason as SourceTerminalReason;
          }
          return failed;
        },
      );
      const acceptedReasons = new Set<SourceTerminalReason>(['success', 'successful_empty', 'duplicate_only']);
      const failures = results.filter((row) => !acceptedReasons.has(row.terminalReason));
      let publication: Record<string, unknown> | null = null;
      let publicationError: string | null = null;
      if (!dryRun) {
        try {
          const [{ getDailyRadarData, getPersistedRadarStages }, { publishRadarPublicSnapshots }] = await Promise.all([
            import('@/lib/domain'), import('@/lib/radar-public-snapshot'),
          ]);
          const [payload, stages] = await Promise.all([getDailyRadarData(), getPersistedRadarStages()]);
          publication = await publishRadarPublicSnapshots({ payload, stages });
        } catch (error) {
          publicationError = (error as Error).message.slice(0, 500);
        }
      }
      const ok = failures.length === 0 && publicationError == null;
      return NextResponse.json({
        ok,
        result: {
          connector: 'all',
          recordsWritten: results.reduce((sum, row) => sum + row.recordsWritten, 0),
          fetchedPosts: results.reduce((sum, row) => sum + Number(row.fetchedPosts || 0), 0),
          duplicatesSkipped: results.reduce((sum, row) => sum + Number(row.duplicatesSkipped || 0), 0),
          failureCount: failures.length,
          results,
          publication,
          publicationError,
        },
        meta: { dryRun, connector: 'all', symbol: symbol || null, authSource: auth.authSource, writerIdentity: process.env.STOCKINSIDER_WRITER_RELEASE_ID || null },
      }, { status: ok ? 200 : 502 });
    }

    const result = await executeConnector(connector, dryRun, symbol);
    const accepted = ['success', 'successful_empty', 'duplicate_only'].includes(result.terminalReason);
    return NextResponse.json({
      ok: accepted,
      result,
      meta: { runId: result.runId, dryRun, connector, symbol: symbol || null, authSource: auth.authSource, writerIdentity: process.env.STOCKINSIDER_WRITER_RELEASE_ID || null },
    }, { status: accepted ? 200 : 502 });
  } catch (caught) {
    const error = caught as Error & { status?: number; result?: Record<string, unknown> };
    return NextResponse.json({ ok: false, error: error.message, result: error.result ?? null }, { status: error.status ?? 500 });
  } finally {
    if (leaseOwner) await releaseProductionWriteLease(leaseOwner).catch(() => undefined);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
