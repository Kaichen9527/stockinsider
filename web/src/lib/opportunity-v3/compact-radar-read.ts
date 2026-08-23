import { getSupabaseServerClient } from '@/lib/supabase-server';
import { RadarProjectionValidationError, selectCompactRadarProjectionRows, validateCompactRadarProjectionRow,
  type CompactRadarProjection } from './compact-radar-validation';
import { assessProjectionFreshness } from './projection-freshness';
import { withProjectionHealth } from './projection-readonly';
import { sha256Canonical } from './canonical.ts';
import { assessReleaseCompatibility } from './release-compatibility';
import { assessTrackedRuntimeHealth, runtimeObservationMatchesProducer,
  type RuntimeHealthObservation } from './runtime-health';
import { deriveEffectiveProjectionHealth } from './effective-health';

function requiredMigrationLevel(schema: unknown): string {
  return schema === 'legacy-radar-v3.19.0'
    ? 'release-reconciliation-v3.19' : schema === 'legacy-radar-v3.18.0'
      ? 'candidate-ledger-retention-v3.18' : 'provider-acquisition-v3.16.21';
}

export { compactRadarEtag, validateCompactRadarProjectionRow, type CompactRadarProjection } from './compact-radar-validation';

export class RadarProjectionUnavailableError extends Error {
  readonly code: 'radar_projection_unavailable' | 'projection_conflict';
  constructor(code: 'radar_projection_unavailable' | 'projection_conflict' = 'radar_projection_unavailable') {
    super(code);
    this.code = code;
  }
}

export function legacyCorrectnessProjectionEnabled(
  value = process.env.LEGACY_RADAR_CORRECTNESS_PROJECTION,
): boolean {
  if (value === undefined || value === '' || value === 'disabled') return false;
  if (value === 'enabled') return true;
  throw new RadarProjectionUnavailableError();
}

function unavailableProjection(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
  reason: 'projection_missing' | 'projection_store_unavailable' | 'projection_conflict' | 'projection_schema_invalid',
): CompactRadarProjection {
  const unavailableAsOf = '1970-01-01T00:00:00Z';
  return {
    asOf: unavailableAsOf,
    loadStatus: 'unavailable',
    loadWarnings: [reason],
    marketRegime: 'unavailable',
    focusSummary: '最近一次研究投影目前無法使用；系統不提供買進型動作。',
    hotThemes: [], opportunities: [], scenarioUpsideCandidates: [], hotTracking: [], recentFormal7d: [],
    fallbackOpportunities90d: [], earlyWatchlist: [], earlySignals: [], partiallyVerified: [], validatedIdeas: [],
    discoveredStocks: [], sourceSignals: [], reports: [], connectorStatus: [],
    agentStatus: { status: 'degraded', lastSuccessfulRunAt: null },
    riskDisclosure: '資料投影暫時無法使用，本頁不構成投資建議。',
    sourceLedCorrectness: { schema: 'legacy-radar-v3.13.0', window, asOf: unavailableAsOf },
    projectionHealth: {
      status: 'unavailable', reason: 'evaluation_timestamp_missing', missedExpectedRuns: 3,
      integrityStatus: reason === 'projection_conflict' ? 'conflict' : 'missing',
      freshnessStatus: 'unavailable', researchVisibility: 'none', actionAuthority: 'disabled',
      contentAsOf: null, evaluatedAt: null, publishedAt: null, nextExpectedAt: null,
      calendarAuthority: 'tw_trading_sessions_v3', actionsEnabled: false,
      acquisitionAuthority: 'disabled', actionBlockers: [reason === 'projection_conflict'
        ? 'checksum_conflict' : 'projection_missing'],
    },
  };
}

// Indexed two-row sentinel: the newest row is authoritative unless an equal timestamp
// has a different checksum, which is a fail-closed projection conflict.
export async function loadCompactRadarProjection(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
): Promise<CompactRadarProjection | null> {
  try {
    if (!legacyCorrectnessProjectionEnabled()) return null;
    const client = getSupabaseServerClient();
    const storageWindow = window === 'hot' ? 'three_day' : window;
    const [{ data, error }, { data:runtimeRows, error:runtimeError }] = await Promise.all([
      client.from('legacy_radar_projections_v3_11')
        .select('payload_json,payload_sha256,as_of,created_at,projection_id')
        .eq('window', storageWindow).order('as_of', { ascending: false }).order('created_at', { ascending: false })
        .order('projection_id', { ascending: true }).limit(2),
      client.from('legacy_runtime_health_observations_v3_11')
        .select('observation_json,recorded_at').order('recorded_at',{ascending:false}).limit(1),
    ]);
    if (error || !Array.isArray(data)) return unavailableProjection(window, 'projection_store_unavailable');
    if (data.length === 0) return unavailableProjection(window, 'projection_missing');
    const selected = selectCompactRadarProjectionRows(window, data as Array<Record<string, unknown>>);
    const correctness = selected.sourceLedCorrectness;
    let health = assessProjectionFreshness({
      contentAsOf: correctness.contentAsOf ?? correctness.asOf,
      evaluatedAt: correctness.evaluatedAt ?? correctness.asOf,
      publishedAt: correctness.publishedAt ?? correctness.asOf,
      tradingSessions: correctness.freshnessSchedule ?? [],
    });
    const compatibility=assessReleaseCompatibility({schema:correctness.schema,
      releaseIdentity:selected.releaseIdentity,expectedConsumerSha:process.env.STOCKINSIDER_REVIEWED_RELEASE_SHA,
      expectedRuntimeManifestSha:process.env.STOCKINSIDER_RUNTIME_MANIFEST_SHA256});
    const producer=correctness.producerIdentity;
    const observation=(runtimeRows?.[0]?.observation_json??null) as Partial<RuntimeHealthObservation>|null;
    const observationMatches=runtimeError==null&&runtimeObservationMatchesProducer(observation??undefined,{
      commitSha:typeof producer?.commitSha==='string'?producer.commitSha:null,
      workerSha256:typeof producer?.workerSha256==='string'?producer.workerSha256:null,
      schedulerConfigSha256:typeof producer?.configSha256==='string'?producer.configSha256:null,
    });
    let runtimeHealthy=false;
    if(observationMatches&&observation)try{runtimeHealthy=assessTrackedRuntimeHealth(observation as RuntimeHealthObservation).status==='pass';}
    catch{runtimeHealthy=false;}
    const releaseIdentity=selected.releaseIdentity as Record<string,unknown>|undefined;
    const acquisition=selected.sourceAcquisitionHealth as Record<string,unknown>|undefined;
    health=deriveEffectiveProjectionHealth({freshness:health,runtimeHealthy,
      releaseCompatible:compatibility.compatible||compatibility.reason!=='consumer_mismatch',
      manifestCompatible:compatibility.compatible||compatibility.reason!=='runtime_mismatch',
      migrationCompatible:releaseIdentity?.migrationLevel===requiredMigrationLevel(correctness.schema),
      acquisitionAuthoritative:acquisition?.acquisitionAuthority==='authoritative'
        &&/^[0-9a-f]{64}$/u.test(String(acquisition?.acquisitionEvidenceRoot??''))});
    return withProjectionHealth(selected, health);
  } catch (error) {
    if (error instanceof RadarProjectionValidationError) return unavailableProjection(window,
      error.code === 'projection_conflict' ? 'projection_conflict' : 'projection_schema_invalid');
    return unavailableProjection(window, 'projection_store_unavailable');
  }
}

export async function loadCompactRadarDecisionRevision(symbol: string, decisionRevisionId: string): Promise<CompactRadarProjection | null> {
  if (!/^\d{4}$/u.test(symbol) || !/^decision-v3[.](?:13|14):[0-9a-f]{64}$/u.test(decisionRevisionId)) return null;
  try {
    if (!legacyCorrectnessProjectionEnabled()) return null;
    const client=getSupabaseServerClient();
    const [{data,error},{data:runtimeRows,error:runtimeError}]=await Promise.all([
      client.from('legacy_decision_revisions_v3_13')
        .select('decision_payload_json,decision_payload_sha256,recorded_at')
        .eq('symbol',symbol).eq('decision_revision_id',decisionRevisionId)
        .order('recorded_at',{ascending:false}).limit(2),
      client.from('legacy_runtime_health_observations_v3_11')
        .select('observation_json,recorded_at').order('recorded_at',{ascending:false}).limit(1),
    ]);
    if(error||!Array.isArray(data)||data.length!==1)return null;
    const exact=data[0]?.decision_payload_json;
    if(!exact||typeof exact!=='object'||Array.isArray(exact)
      ||data[0]?.decision_payload_sha256!==sha256Canonical(exact))throw new RadarProjectionValidationError('projection_conflict');
    const {data:heartbeats,error:heartbeatError}=await client.from('legacy_decision_revision_evaluations_v3_13')
      .select('source_led_correctness,evaluated_at,recorded_at,evaluation_id')
      .eq('decision_revision_id',decisionRevisionId)
      .order('evaluated_at',{ascending:false}).order('recorded_at',{ascending:false})
      .order('evaluation_id',{ascending:true}).limit(2);
    if(heartbeatError||!Array.isArray(heartbeats)||heartbeats.length===0)return null;
    if(heartbeats.length===2&&heartbeats[0]?.evaluated_at===heartbeats[1]?.evaluated_at
      &&sha256Canonical(heartbeats[0]?.source_led_correctness)!==sha256Canonical(heartbeats[1]?.source_led_correctness)){
      throw new RadarProjectionValidationError('projection_conflict');
    }
    const correctness=heartbeats[0]?.source_led_correctness as CompactRadarProjection['sourceLedCorrectness']|undefined;
    if(!correctness||!['legacy-radar-v3.13.0','legacy-radar-v3.14.0','legacy-radar-v3.17.0','legacy-radar-v3.18.0','legacy-radar-v3.19.0'].includes(correctness.schema)
      ||correctness.window!=='home')return null;
    let health=assessProjectionFreshness({
      contentAsOf:correctness.contentAsOf??correctness.asOf,
      evaluatedAt:correctness.evaluatedAt??correctness.asOf,
      publishedAt:correctness.publishedAt??correctness.asOf,
      tradingSessions:correctness.freshnessSchedule??[],
    });
    const exactCompatibility=assessReleaseCompatibility({schema:correctness.schema,
      releaseIdentity:{producerCommitSha:correctness.producerIdentity?.commitSha,
        runtimeManifestSha256:correctness.producerIdentity?.runtimeManifestSha256,
        migrationLevel:requiredMigrationLevel(correctness.schema)},
      expectedConsumerSha:process.env.STOCKINSIDER_REVIEWED_RELEASE_SHA,
      expectedRuntimeManifestSha:process.env.STOCKINSIDER_RUNTIME_MANIFEST_SHA256});
    const producer=correctness.producerIdentity;
    const observation=(runtimeRows?.[0]?.observation_json??null) as Partial<RuntimeHealthObservation>|null;
    const observationMatches=runtimeError==null&&runtimeObservationMatchesProducer(observation??undefined,{
      commitSha:typeof producer?.commitSha==='string'?producer.commitSha:null,
      workerSha256:typeof producer?.workerSha256==='string'?producer.workerSha256:null,
      schedulerConfigSha256:typeof producer?.configSha256==='string'?producer.configSha256:null,
    });
    let runtimeHealthy=false;
    if(observationMatches&&observation)try{runtimeHealthy=assessTrackedRuntimeHealth(observation as RuntimeHealthObservation).status==='pass';}
    catch{runtimeHealthy=false;}
    const acquisition=correctness.acquisitionAuthority;
    health=deriveEffectiveProjectionHealth({freshness:health,runtimeHealthy,
      releaseCompatible:exactCompatibility.compatible||exactCompatibility.reason!=='consumer_mismatch',
      manifestCompatible:exactCompatibility.compatible||exactCompatibility.reason!=='runtime_mismatch',
      migrationCompatible:exactCompatibility.compatible||exactCompatibility.reason!=='migration_mismatch',
      acquisitionAuthoritative:acquisition?.status==='authoritative'
        &&/^[0-9a-f]{64}$/u.test(String(acquisition?.evidenceRoot??''))});
    const exactProjection={...unavailableProjection('home','projection_missing'),
      asOf:correctness.asOf,loadStatus:'ready' as const,loadWarnings:[],
      sourceLedCorrectness:correctness,sourceSignals:[exact as Record<string,unknown>]};
    return withProjectionHealth(exactProjection,health);
  } catch { return null; }
}
