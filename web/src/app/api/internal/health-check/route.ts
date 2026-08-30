import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveDataMode } from '@/lib/data-mode';
import { SOURCE_CONNECTOR_KEYS, sourceExecutionPolicy } from '@/lib/source-policy';
import { assessTrackedRuntimeHealth, runtimeObservationMatchesProducer } from '@/lib/opportunity-v3/runtime-health';
import type { RuntimeHealthObservation } from '@/lib/opportunity-v3/runtime-health';
import { sha256Canonical } from '@/lib/opportunity-v3/canonical';
import { requireInternalAuth } from '@/lib/internal-auth';
import { assessProjectionFreshness, type ProjectionHealth } from '@/lib/opportunity-v3/projection-freshness';
import { resolveReviewedConsumerCommitSha } from '@/lib/opportunity-v3/reviewed-release-identity';
import { deriveEffectiveProjectionHealth } from '@/lib/opportunity-v3/effective-health';
import { activeSourceHealthFailures as evaluateActiveSourceHealth, type SourceHealthRun } from '@/lib/source-health';

type Row = Record<string, unknown>;

export async function GET(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, {
      status: auth.status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  const consumerCommitSha = resolveReviewedConsumerCommitSha();
  const consumerCheck = request.headers.get('x-stockinsider-runtime-consumer-check');
  if (consumerCheck !== null) {
    if (consumerCheck !== 'v1') {
      return NextResponse.json({ ok: false, error: 'invalid_runtime_consumer_check' }, {
        status: 400,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    return NextResponse.json({
      ok: true,
      sourceLedRuntime: { consumer: { commitSha: consumerCommitSha } },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const dataMode = resolveDataMode();
  const fallbackUsed = dataMode === 'demo';
  const env = {
    INTERNAL_API_KEY: !!process.env.INTERNAL_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    SUPABASE_URL: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    SUPABASE_SERVICE_KEY: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
    THREADS_OFFICIAL_API_ENABLED: process.env.THREADS_OFFICIAL_API_ENABLED === 'true',
    YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
  };

  let connectors: Array<{ platform: string; status: string; lastCheckedAt: string | null; errorMessage: string | null; metadata: Record<string, unknown> | null }> = [];
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
    disposition: ReturnType<typeof sourceExecutionPolicy>['disposition'];
    licenseBasis: string;
    terminalReason: string | null;
    credentialExpiresAt: string | null;
    credentialExpiryWarning: boolean;
  }> = [];
  let marketRegimeUpdatedAt: string | null = null;
  let themeHeatUpdatedAt: string | null = null;
  let dataCollectLastSuccessAt: string | null = null;
  let researchPipelineLastSuccessAt: string | null = null;
  let sourceHealthRuns: SourceHealthRun[] = [];
  let databaseHealthy = true;
  let sourceLedRuntime = assessTrackedRuntimeHealth({
    manifestPresent: false, manifestCanonical: false, reviewBindingValid: false,
    workerHashMatches: false, configHashMatches: false,
    schedulerRollbackPackagePresent: false, schedulerRollbackHashMatches: false,
    activationJournalComplete: false, activePointerValid: false, schedulerPlistMatches: false,
    schedulerOwner: null, competingOwners: [], leaseStatus: 'absent', stateSchema: null,
    stuckRunCount: 0, projectionFreshness: 'missing', consumerCompatibility: 'unknown',
    consumerCommitSha,
  });
  let projectionHealth: ProjectionHealth | null = null;

  try {
    const supabase = getSupabaseServerClient();

    const { data: runtimeProjectionRows } = await supabase
      .from('legacy_radar_projections_v3_11')
      .select('payload_json,payload_sha256,as_of,producer_commit_sha,worker_sha256')
      .eq('window', 'daily')
      .order('as_of', { ascending: false })
      .limit(1);
    const [{ data: runtimeRunRows }, { count: stuckRunCount }, { data: runtimeObservationRows }] = await Promise.all([
      supabase.from('legacy_producer_runs_v3_11')
        .select('owner_label,producer_commit_sha,worker_sha256,scheduler_config_sha256,status,started_at,terminal_at,lease_expires_at')
        .order('started_at', { ascending: false })
        .limit(1),
      supabase.from('legacy_producer_runs_v3_11')
        .select('run_id', { count: 'exact', head: true })
        .eq('status', 'running')
        .lt('lease_expires_at', new Date().toISOString()),
      supabase.from('legacy_runtime_health_observations_v3_11')
        .select('observation_json,recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(1),
    ]);
    const runtimeProjection = runtimeProjectionRows?.[0] as Row | undefined;
    const runtimeRun = runtimeRunRows?.[0] as Row | undefined;
    const runtimePayload = runtimeProjection?.payload_json as Row | undefined;
    const sourceCorrectness = runtimePayload?.sourceLedCorrectness as Row | undefined;
    const producerIdentity = sourceCorrectness?.producerIdentity as Row | undefined;
    const durableObservation = (runtimeObservationRows?.[0] as Row | undefined)?.observation_json;
    const recordedObservation = (durableObservation && typeof durableObservation === 'object'
      ? durableObservation : producerIdentity?.runtimeHealthObservation) as Partial<RuntimeHealthObservation> | undefined;
    const projectionAsOf = typeof runtimeProjection?.as_of === 'string' ? runtimeProjection.as_of : null;
    const projectionChecksum = typeof runtimeProjection?.payload_sha256 === 'string' ? runtimeProjection.payload_sha256 : null;
    const checksumMatches = Boolean(runtimePayload && projectionChecksum && sha256Canonical(runtimePayload) === projectionChecksum);
    projectionHealth = assessProjectionFreshness({
      contentAsOf: typeof sourceCorrectness?.contentAsOf === 'string' ? sourceCorrectness.contentAsOf : projectionAsOf,
      evaluatedAt: typeof sourceCorrectness?.evaluatedAt === 'string' ? sourceCorrectness.evaluatedAt : projectionAsOf,
      publishedAt: typeof sourceCorrectness?.publishedAt === 'string' ? sourceCorrectness.publishedAt : projectionAsOf,
      tradingSessions: Array.isArray(sourceCorrectness?.freshnessSchedule)
        ? sourceCorrectness.freshnessSchedule as Array<{ session_id?: string; close_at?: string; status?: string }>
        : [],
    });
    const sharedProjectionFreshness = projectionHealth.status === 'fresh' ? 'fresh' : 'stale';
    const directProducerCommit = typeof runtimeRun?.producer_commit_sha === 'string'
      ? runtimeRun.producer_commit_sha
      : typeof runtimeProjection?.producer_commit_sha === 'string' ? runtimeProjection.producer_commit_sha : null;
    const directWorkerSha = typeof runtimeRun?.worker_sha256 === 'string'
      ? runtimeRun.worker_sha256
      : typeof runtimeProjection?.worker_sha256 === 'string' ? runtimeProjection.worker_sha256 : null;
    const directConfigSha = typeof runtimeRun?.scheduler_config_sha256 === 'string'
      ? runtimeRun.scheduler_config_sha256
      : typeof producerIdentity?.configSha256 === 'string' ? producerIdentity.configSha256 : null;
    const rawDirectStatus = runtimeRun?.status;
    const directStatus = typeof rawDirectStatus === 'string'
      && (rawDirectStatus === 'success' || rawDirectStatus === 'failed' || rawDirectStatus === 'cancelled')
      ? rawDirectStatus : null;
    const directCompatibility = directProducerCommit && consumerCommitSha === directProducerCommit
      ? 'compatible' as const : 'unknown' as const;
    const observationMatchesProducer = runtimeObservationMatchesProducer(recordedObservation, {
      commitSha: directProducerCommit, workerSha256: directWorkerSha, schedulerConfigSha256: directConfigSha,
    });
    if (recordedObservation && observationMatchesProducer) {
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
        lastTerminalRunAt: directStatus ? String(runtimeRun?.terminal_at ?? recordedObservation.lastTerminalRunAt ?? '') || null
          : recordedObservation.lastTerminalRunAt ?? null,
        lastTerminalStatus: directStatus ?? (typeof recordedObservation.lastTerminalStatus === 'string'
          && (recordedObservation.lastTerminalStatus === 'success'
            || recordedObservation.lastTerminalStatus === 'failed'
            || recordedObservation.lastTerminalStatus === 'cancelled')
          ? recordedObservation.lastTerminalStatus : null),
        lastRunNonterminal: runtimeRun?.status === 'running' || recordedObservation.lastRunNonterminal,
        negativeRunDuration: recordedObservation.negativeRunDuration,
        stuckRunCount: stuckRunCount ?? recordedObservation.stuckRunCount,
        projectionAsOf, projectionChecksum,
        projectionFreshness: !checksumMatches ? 'invalid' : sharedProjectionFreshness,
        consumerCommitSha,
        consumerCompatibility: directCompatibility,
        producerCommitSha: directProducerCommit ?? recordedObservation.producerCommitSha ?? null,
        reviewedTreeSha: recordedObservation.reviewedTreeSha ?? null,
        workerSha256: directWorkerSha ?? recordedObservation.workerSha256 ?? null,
        schedulerConfigSha256: directConfigSha ?? recordedObservation.schedulerConfigSha256 ?? null,
        schedulerRollbackPackageSha256: recordedObservation.schedulerRollbackPackageSha256 ?? null,
        manifestSha256: recordedObservation.manifestSha256 ?? null,
      });
    } else if (directProducerCommit) {
      sourceLedRuntime = assessTrackedRuntimeHealth({
        manifestPresent: false, manifestCanonical: false, reviewBindingValid: false,
        workerHashMatches: false, configHashMatches: false,
        schedulerRollbackPackagePresent: false, schedulerRollbackHashMatches: false,
        activationJournalComplete: false, activePointerValid: false, schedulerPlistMatches: false,
        schedulerOwner: runtimeRun?.owner_label === 'com.stockinsider.auth-source-worker'
          ? 'com.stockinsider.auth-source-worker' : null,
        competingOwners: [], leaseStatus: runtimeRun?.status === 'running'
          ? (Date.parse(String(runtimeRun?.lease_expires_at ?? '')) >= Date.now() ? 'active' : 'expired') : 'absent',
        stateSchema: 'stockinsider-producer-state-v1',
        lastTerminalRunAt: directStatus ? String(runtimeRun?.terminal_at ?? '') || null : null,
        lastTerminalStatus: directStatus,
        lastRunNonterminal: runtimeRun?.status === 'running', negativeRunDuration: false,
        stuckRunCount: stuckRunCount ?? 0,
        projectionAsOf, projectionChecksum,
        projectionFreshness: !checksumMatches ? 'invalid' : sharedProjectionFreshness,
        consumerCommitSha,
        consumerCompatibility: directCompatibility,
        producerCommitSha: directProducerCommit, reviewedTreeSha: null,
        workerSha256: directWorkerSha, schedulerConfigSha256: directConfigSha,
        schedulerRollbackPackageSha256: null, manifestSha256: null,
      });
    }
    const releaseIdentity=runtimePayload?.releaseIdentity as Row|undefined;
    const sourceAcquisitionHealth=runtimePayload?.sourceAcquisitionHealth as Row|undefined;
    const expectedManifest=process.env.STOCKINSIDER_RUNTIME_MANIFEST_SHA256;
    projectionHealth=deriveEffectiveProjectionHealth({freshness:projectionHealth,
      checksumMatches,runtimeHealthy:sourceLedRuntime.status==='pass',
      releaseCompatible:releaseIdentity?.producerCommitSha===consumerCommitSha
        &&directProducerCommit===consumerCommitSha,
      manifestCompatible:typeof expectedManifest==='string'&&/^[0-9a-f]{64}$/u.test(expectedManifest)
        &&releaseIdentity?.runtimeManifestSha256===expectedManifest
        &&sourceLedRuntime.producer.manifestSha256===expectedManifest,
      migrationCompatible:releaseIdentity?.migrationLevel===(sourceCorrectness?.schema==='legacy-radar-v3.20.0'
        ?'kol-first-runtime-recovery-v3.20':sourceCorrectness?.schema==='legacy-radar-v3.19.0'
          ?'release-reconciliation-v3.19':sourceCorrectness?.schema==='legacy-radar-v3.18.0'
          ?'candidate-ledger-retention-v3.18':'provider-acquisition-v3.16.21'),
      acquisitionAuthoritative:sourceAcquisitionHealth?.acquisitionAuthority==='authoritative'
        &&/^[0-9a-f]{64}$/u.test(String(sourceAcquisitionHealth?.acquisitionEvidenceRoot??''))});

    // Credential status per platform
    const { data: creds } = await supabase
      .from('source_credentials_registry')
      .select('platform,status,updated_at,error_message,metadata')
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
          metadata: c.metadata && typeof c.metadata === 'object' ? c.metadata as Record<string, unknown> : null,
        }));
    }

    const { data: ledgerRuns, error: ledgerError } = await supabase
      .from('source_run_ledger')
      .select('connector,attempted_at,next_expected_at,terminal_reason,auth_status')
      .order('attempted_at', { ascending: false })
      .limit(500);
    if (ledgerError) throw new Error('source_run_ledger_health_read_failed');
    sourceHealthRuns = (ledgerRuns ?? []).map((raw) => {
      const row = raw as Row;
      return {
        connector: String(row.connector || ''),
        attemptedAt: String(row.attempted_at || ''),
        nextExpectedAt: row.next_expected_at ? String(row.next_expected_at) : null,
        terminalReason: String(row.terminal_reason || 'failed') as SourceHealthRun['terminalReason'],
        authStatus: String(row.auth_status || 'not_applicable') as SourceHealthRun['authStatus'],
      };
    }).filter((row) => Boolean(row.connector && row.attemptedAt));

    // Last successful cron run per connector
    const { data: runs } = await supabase
      .from('connector_runs')
      .select('connector_name,platform,status,records_written,error_summary,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(200);

    if (runs) {
      const validConnectors = new Set<string>([...SOURCE_CONNECTOR_KEYS, 'podcast']);
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
        ...SOURCE_CONNECTOR_KEYS,
        'podcast',
      ]),
    );

    connectorStatus = connectorNames.map((name) => {
      const credential = connectors.find((item) => item.platform === name);
      const run = lastCronRuns.find((item) => item.connector === name);
      const policy = name === 'podcast'
        ? { disposition: 'manual_only' as const, licenseBasis: 'creator_authorized_rss_only', terminalReason: 'authorized_feed_required' }
        : sourceExecutionPolicy(name);
      const rawExpiresAt = credential?.metadata?.expires_at;
      const credentialExpiresAt = typeof rawExpiresAt === 'string' ? rawExpiresAt : null;
      const credentialExpiryWarning = name === 'threads'
        && credentialExpiresAt !== null
        && Date.parse(credentialExpiresAt) - Date.now() < 14 * 24 * 60 * 60 * 1000;
      return {
        connector: name,
        credentialStatus: credential?.status || 'unknown',
        lastCheckedAt: credential?.lastCheckedAt || null,
        lastRunStatus: run?.lastStatus || 'idle',
        lastRunAt: run?.lastRunAt || null,
        lastSuccessAt: run?.lastSuccessAt || null,
        lastRecordsWritten: run?.lastRecordsWritten || 0,
        lastErrorSummary: run?.lastErrorSummary || credential?.errorMessage || null,
        disposition: policy.disposition,
        licenseBasis: policy.licenseBasis,
        terminalReason: policy.terminalReason,
        credentialExpiresAt,
        credentialExpiryWarning,
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
    // A missing database is a real health failure, but never expose credentials or raw errors.
    databaseHealthy = false;
  }

  const activeConnectorNames = connectorStatus
    .filter((item) => item.disposition === 'active')
    .map((item) => item.connector);
  const ledgerFailures = evaluateActiveSourceHealth(activeConnectorNames, sourceHealthRuns);
  const expiryFailures = connectorStatus
    .filter((item) => item.disposition === 'active' && item.credentialExpiryWarning)
    .map((item) => ({
      connector: item.connector,
      reason: 'credential_expiring' as const,
      latestTerminalReason: null,
      failedRunCount: 0,
    }));
  const activeSourceFailures = [...ledgerFailures, ...expiryFailures];
  // Demo mode intentionally serves local fixtures without a database. Keep the
  // database diagnostic visible, but reserve fail-closed readiness for live data.
  const databaseRequirementMet = dataMode === 'demo' || databaseHealthy;
  const ok = databaseRequirementMet && activeSourceFailures.length === 0;

  return NextResponse.json({
    ok,
    dataMode,
    fallbackUsed,
    env,
    connectors,
    lastCronRuns,
    connectorStatus,
    activeSourceFailures,
    databaseHealthy,
    marketRegimeUpdatedAt,
    themeHeatUpdatedAt,
    dataCollectLastSuccessAt,
    researchPipelineLastSuccessAt,
    sourceLedRuntime,
    projectionHealth,
    checkedAt: new Date().toISOString(),
  }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'private, no-store' } });
}
