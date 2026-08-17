import type { ProjectionHealth } from './projection-freshness';

export type EffectiveProjectionHealth = ProjectionHealth & {
  acquisitionAuthority: 'enabled' | 'disabled';
  actionBlockers: string[];
};

const blockerOrder = [
  'checksum_conflict', 'projection_missing', 'projection_stale', 'runtime_doctor_failed',
  'consumer_producer_incompatible', 'manifest_incompatible', 'migration_incompatible',
  'frozen_acquisition_authority_unavailable',
] as const;

export function deriveEffectiveProjectionHealth({ freshness, checksumMatches = true, runtimeHealthy,
  releaseCompatible, manifestCompatible, migrationCompatible, acquisitionAuthoritative }:{
  freshness: ProjectionHealth;
  checksumMatches?: boolean;
  runtimeHealthy: boolean;
  releaseCompatible: boolean;
  manifestCompatible: boolean;
  migrationCompatible: boolean;
  acquisitionAuthoritative: boolean;
}): EffectiveProjectionHealth {
  const present = new Set<string>();
  if (!checksumMatches) present.add('checksum_conflict');
  if (freshness.integrityStatus === 'missing') present.add('projection_missing');
  if (freshness.freshnessStatus !== 'fresh') present.add('projection_stale');
  if (!runtimeHealthy) present.add('runtime_doctor_failed');
  if (!releaseCompatible) present.add('consumer_producer_incompatible');
  if (!manifestCompatible) present.add('manifest_incompatible');
  if (!migrationCompatible) present.add('migration_incompatible');
  if (!acquisitionAuthoritative) present.add('frozen_acquisition_authority_unavailable');
  const actionBlockers = blockerOrder.filter((blocker)=>present.has(blocker));
  const integrityStatus = !checksumMatches ? 'conflict' as const : freshness.integrityStatus;
  const researchVisibility = integrityStatus === 'conflict' || freshness.researchVisibility === 'none'
    ? 'none' as const : actionBlockers.length === 0 ? freshness.researchVisibility : 'last_good_readonly' as const;
  const actionsEnabled = actionBlockers.length === 0 && freshness.actionsEnabled === true;
  return Object.freeze({
    ...freshness,
    status: integrityStatus === 'conflict' ? 'unavailable'
      : actionsEnabled ? freshness.status : freshness.status === 'unavailable' ? 'unavailable' : 'stale_readonly',
    integrityStatus,
    researchVisibility,
    acquisitionAuthority: acquisitionAuthoritative ? 'enabled' : 'disabled',
    actionAuthority: actionsEnabled ? 'enabled' : 'disabled',
    actionsEnabled,
    actionBlockers,
  });
}
