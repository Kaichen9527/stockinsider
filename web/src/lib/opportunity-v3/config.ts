import { sha256Canonical } from './canonical.ts';
import type { DeploymentStateV3, SourceClassV3 } from './contracts.ts';

export const SOURCE_CLASSES_V3: ReadonlyArray<readonly [SourceClassV3, number, number]> = [
  ['official', 1, 3_024_000],
  ['public_research', 0.85, 604_800],
  ['curated_thesis', 0.7, 604_800],
  ['community', 0.45, 259_200],
];

export const SOURCE_ROWS_V3 = [
  ['bulltalk', 'community', true, 'none', 'none', 259_200, 1000],
  ['earnings_call', 'official', true, 'official_fact', 'fundamentals', 3_024_000, 1000],
  ['instagram', 'community', true, 'none', 'none', 259_200, 1000],
  ['investanchors', 'curated_thesis', true, 'thesis_only', 'none', 604_800, 1000],
  ['mops_material_event', 'official', true, 'official_fact', 'fundamentals', 3_024_000, 1000],
  ['podcast', 'curated_thesis', true, 'thesis_only', 'none', 604_800, 1000],
  ['ptt', 'community', true, 'none', 'none', 259_200, 1000],
  ['public_broker_research', 'public_research', true, 'verified_publication', 'none', 604_800, 1000],
  ['telegram', 'community', true, 'none', 'none', 259_200, 1000],
  ['threads', 'community', true, 'none', 'none', 259_200, 1000],
] as const;

export const SOURCE_FUNNEL_POLICY_HASH_V3 = sha256Canonical({
  version: 'source-funnel-v3.0',
  eligibilityVersion: 'source-eligibility-v3.0',
  selectionVersion: 'source-selection-v3.0',
  claimEvidenceStanceVersion: 'claim-evidence-stance-v3.0',
  classRows: SOURCE_CLASSES_V3,
  sourceRows: SOURCE_ROWS_V3,
});

export { COMPARISON_CONTRACT_KEY_V3 } from './identity.ts';
export const PUBLIC_RUN_PURPOSE_V3 = 'production_shadow_daily' as const;

export function deploymentStateV3(value = process.env.SOURCE_LED_OPPORTUNITY_V3): DeploymentStateV3 {
  return value === 'shadow' || value === 'drain' ? value : 'disabled';
}

export function sourcePolicy(sourceKey: string) {
  return SOURCE_ROWS_V3.find((row) => row[0] === sourceKey) ?? null;
}
