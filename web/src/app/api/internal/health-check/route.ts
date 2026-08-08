import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveDataMode } from '@/lib/data-mode';
import { summarizeMetaEnvConfig } from '@/lib/source-auth';
import { assessTrackedRuntimeHealth } from '@/lib/opportunity-v3/runtime-health';
import type { RuntimeHealthObservation } from '@/lib/opportunity-v3/runtime-health';
import { sha256Canonical } from '@/lib/opportunity-v3/canonical';
import { requireInternalAuth } from '@/lib/internal-auth';

type Row = Record<string, unknown>;

export async function GET(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, {
      status: auth.status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  const dataMode = resolveDataMode();
  const fallbackUsed = dataMode === 'demo';
  const metaEnvConfig = summarizeMetaEnvConfig();
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
    metaCookieConfig: metaEnvConfig,
  };

  let connectors: Array<{ platform: string; status: string; lastCheckedAt: string | null; errorMessage: string | null }> = [];
  let lastCronRuns: Array<{ connector: string; lastSuccessAt: string | null; lastStatus: string; lastRunAt: string | null; lastRecordsWritten: number; lastErrorSummary: string | null }> = [];
  let connectorStatus: Array<{
    connector: string;
    credentialStatus: string;
    lastCheckedAt: string | null;
    lastRunStatus: string;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastRecordsWritten: number;
    lastErrorSummary: string | null;
  }> = [];
  let marketRegimeUpdatedAt: string | null = null;
  let themeHeatUpdatedAt: string | null = null;
  let dataCollectLastSuccessAt: string | null = null;
  let researchPipelineLastSuccessAt: string | null = null;
  let sourceLedRuntime = assessTrackedRuntimeHealth({
    manifestPresent: false, manifestCanonical: false, reviewBindingValid: false,
    workerHashMatches: false, configHashMatches: false,
    schedulerRollbackPackagePresent: false, schedulerRollbackHashMatches: false,
    activationJournalComplete: false, activePointerValid: false, schedulerPlistMatches: false,
    schedulerOwner: null, competingOwners: [], leaseStatus: 'absent', stateSchema: null,
    stuckRunCount: 0, projectionFreshness: 'missing', consumerCompatibility: 'unknown',
    consumerCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });

  try {
    const supabase = getSupabaseServerClient();

    const { data: runtimeProjectionRows } = await supabase
      .from('legacy_radar_projections_v3_11')
      .select('payload_json,payload_sha256,as_of')
      .eq('window', 'daily')
      .order('as_of', { ascending: false })
      .limit(1);
    const runtimeProjection = runtimeProjectionRows?.[0] as Row | undefined;
    const runtimePayload = runtimeProjection?.payload_json as Row | undefined;
    const sourceCorrectness = runtimePayload?.sourceLedCorrectness as Row | undefined;
    const producerIdentity = sourceCorrectness?.producerIdentity as Row | undefined;
    const recordedObservation = producerIdentity?.runtimeHealthObservation as Partial<RuntimeHealthObservation> | undefined;
    const projectionAsOf = typeof runtimeProjection?.as_of === 'string' ? runtimeProjection.as_of : null;
    const projectionChecksum = typeof runtimeProjection?.payload_sha256 === 'string' ? runtimeProjection.payload_sha256 : null;
    const checksumMatches = Boolean(runtimePayload && projectionChecksum && sha256Canonical(runtimePayload) === projectionChecksum);
    const projectionAgeMs = projectionAsOf ? Date.now() - new Date(projectionAsOf).getTime() : Number.POSITIVE_INFINITY;
    if (recordedObservation && typeof recordedObservation === 'object') {
      sourceLedRuntime = assessTrackedRuntimeHealth({
        manifestPresent: recordedObservation.manifestPresent === true,
        manifestCanonical: recordedObservation.manifestCanonical === true,
        reviewBindingValid: recordedObservation.reviewBindingValid === true,
        workerHashMatches: recordedObservation.workerHashMatches === true,
        configHashMatches: recordedObservation.configHashMatches === true,
        schedulerRollbackPackagePresent: recordedObservation.schedulerRollbackPackagePresent === true,
        schedulerRollbackHashMatches: recordedObservation.schedulerRollbackHashMatches === true,
        activationJournalComplete: recordedObservation.activationJournalComplete === true,
        activePointerValid: recordedObservation.activePointerValid === true,
        schedulerPlistMatches: recordedObservation.schedulerPlistMatches === true,
        schedulerOwner: recordedObservation.schedulerOwner === 'com.stockinsider.auth-source-worker' ? recordedObservation.schedulerOwner : null,
        ownerPlistSha256: recordedObservation.ownerPlistSha256 ?? null,
        competingOwners: Array.isArray(recordedObservation.competingOwners) ? recordedObservation.competingOwners.filter((item): item is string => typeof item === 'string') : [],
        leaseStatus: recordedObservation.leaseStatus ?? 'invalid',
        stateSchema: recordedObservation.stateSchema === 'stockinsider-producer-state-v1' ? recordedObservation.stateSchema : null,
        lastTerminalRunAt: recordedObservation.lastTerminalRunAt ?? null,
        lastTerminalStatus: recordedObservation.lastTerminalStatus ?? null,
        lastRunNonterminal: recordedObservation.lastRunNonterminal,
        negativeRunDuration: recordedObservation.negativeRunDuration,
        stuckRunCount: recordedObservation.stuckRunCount,
        projectionAsOf, projectionChecksum,
        projectionFreshness: !checksumMatches ? 'invalid' : projectionAgeMs <= 36 * 60 * 60 * 1000 ? 'fresh' : 'stale',
        consumerCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        consumerCompatibility: recordedObservation.producerCommitSha && process.env.VERCEL_GIT_COMMIT_SHA === recordedObservation.producerCommitSha ? 'compatible' : 'unknown',
        producerCommitSha: recordedObservation.producerCommitSha ?? null,
        reviewedTreeSha: recordedObservation.reviewedTreeSha ?? null,
        workerSha256: recordedObservation.workerSha256 ?? null,
        schedulerConfigSha256: recordedObservation.schedulerConfigSha256 ?? null,
        schedulerRollbackPackageSha256: recordedObservation.schedulerRollbackPackageSha256 ?? null,
        manifestSha256: recordedObservation.manifestSha256 ?? null,
      });
    }

    // Credential status per platform
    const { data: creds } = await supabase
      .from('source_credentials_registry')
      .select('platform,status,updated_at,error_message')
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
          errorMessage: c.error_message ? String(c.error_message) : null,
        }));
    }

    // Last successful cron run per connector
    const { data: runs } = await supabase
      .from('connector_runs')
      .select('connector_name,platform,status,records_written,error_summary,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(200);

    if (runs) {
      const validConnectors = new Set(['investanchors', 'threads', 'instagram', 'telegram', 'podcast', 'youtube', 'ptt', 'bulltalk', 'googlenews', 'anue', 'udn', 'mobile01', 'twse_insider']);
      const byConnector = new Map<string, { lastStatus: string; lastRunAt: string | null; lastRecordsWritten: number; lastErrorSummary: string | null }>();
      const successByConnector = new Map<string, string | null>();
      const nowMs = Date.now();
      const staleRunningThresholdMs = 25 * 60 * 1000;
      for (const r of runs as Row[]) {
        const rawPlatform = String(r.platform || '');
        const rawName = String(r.connector_name || '');
        const name = validConnectors.has(rawPlatform) ? rawPlatform : validConnectors.has(rawName) ? rawName : '';
        if (!name) continue;
        if (!byConnector.has(name)) {
          const startedAt = r.started_at ? String(r.started_at) : null;
          const startedMs = startedAt ? new Date(startedAt).getTime() : 0;
          const statusRaw = String(r.status || 'unknown');
          const normalizedStatus = statusRaw === 'running' && startedMs > 0 && nowMs - startedMs > staleRunningThresholdMs ? 'timed_out' : statusRaw;
          byConnector.set(name, {
            lastStatus: normalizedStatus,
            lastRunAt: startedAt,
            lastRecordsWritten: Number(r.records_written || 0),
            lastErrorSummary: r.error_summary ? String(r.error_summary) : null,
          });
        }
        if (String(r.status || '') === 'success' && !successByConnector.has(name)) {
          successByConnector.set(name, r.finished_at ? String(r.finished_at) : null);
        }
      }
      lastCronRuns = Array.from(byConnector.entries()).map(([connector, info]) => ({
        connector,
        lastStatus: info.lastStatus,
        lastRunAt: info.lastRunAt,
        lastRecordsWritten: info.lastRecordsWritten,
        lastErrorSummary: info.lastErrorSummary,
        lastSuccessAt: successByConnector.get(connector) || null,
      }));
    }

    const connectorNames = Array.from(
      new Set<string>([
        ...connectors.map((item) => item.platform),
        ...lastCronRuns.map((item) => item.connector),
        'investanchors',
        'threads',
        'instagram',
        'telegram',
        'podcast',
        'youtube',
        'ptt',
        'bulltalk',
        'googlenews',
        'anue',
        'udn',
        'mobile01',
        'twse_insider',
      ]),
    );

    connectorStatus = connectorNames.map((name) => {
      const credential = connectors.find((item) => item.platform === name);
      const run = lastCronRuns.find((item) => item.connector === name);
      return {
        connector: name,
        credentialStatus: credential?.status || 'unknown',
        lastCheckedAt: credential?.lastCheckedAt || null,
        lastRunStatus: run?.lastStatus || 'idle',
        lastRunAt: run?.lastRunAt || null,
        lastSuccessAt: run?.lastSuccessAt || null,
        lastRecordsWritten: run?.lastRecordsWritten || 0,
        lastErrorSummary: run?.lastErrorSummary || credential?.errorMessage || null,
      };
    });

    const [{ data: marketData }, { data: themeHeatData }, { data: dataCollectData }, { data: pipelineData }] = await Promise.all([
      supabase.from('market_snapshots').select('as_of').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      supabase.from('theme_heat').select('as_of_date,updated_at').order('as_of_date', { ascending: false }).order('updated_at', { ascending: false }).limit(1),
      supabase
        .from('pipeline_runs')
        .select('finished_at')
        .in('run_type', ['ingestion', 'pipeline'])
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1),
      supabase
        .from('pipeline_runs')
        .select('finished_at')
        .in('run_type', ['recommendation', 'pipeline'])
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1),
    ]);
    marketRegimeUpdatedAt = marketData?.[0]?.as_of ? String(marketData[0].as_of) : null;
    themeHeatUpdatedAt = themeHeatData?.[0]?.as_of_date
      ? `${String(themeHeatData[0].as_of_date)}T00:00:00+08:00`
      : themeHeatData?.[0]?.updated_at
        ? String(themeHeatData[0].updated_at)
        : null;
    dataCollectLastSuccessAt = dataCollectData?.[0]?.finished_at ? String(dataCollectData[0].finished_at) : null;
    researchPipelineLastSuccessAt = pipelineData?.[0]?.finished_at ? String(pipelineData[0].finished_at) : null;
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
    connectorStatus,
    marketRegimeUpdatedAt,
    themeHeatUpdatedAt,
    dataCollectLastSuccessAt,
    researchPipelineLastSuccessAt,
    sourceLedRuntime,
    checkedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
