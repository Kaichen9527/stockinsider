/** Institutional denominators are separate from technical turnover. No
 * approved same-scope producer exists in this checkpoint: this registry has
 * deliberately NO constructor/setter/exported factory. A public DTO is not a
 * proof. A future producer needs its own resource/rights/header design review. */
import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { launchNativeContentDigest } from '../tw-entry-plan-authority.ts';
import { evidenceKnownAt } from './evidence-clock.ts';

export type InstitutionalFlowCoverage = 'tpex_11856_combined_sessions_v1' | 'unverified_institutional_scope';
export type InstitutionalVolumeSource = Readonly<{ type: 'institutional_same_scope_denominator'; datasetId: number;
  sourceUrl: string; sourceVersion: string; coverage: string; comparableFlowCoverage: InstitutionalFlowCoverage;
  resourceMappingRevision: string; availableAt: string }>;
declare const institutionalProof: unique symbol;
export type InstitutionalVolumeProof = Readonly<{ [institutionalProof]: true }>;
type Request = Pick<TwEntryAuthorityRequest,'symbol'|'exchange'|'signalSession'|'cutoff'> & { stockId?: string };
type DenominatorState = { requestDigest: string; selected: TwLaunchPatternReadEvidence; selectedDigest: string;
  revisionId: string; source: InstitutionalVolumeSource; independentCapitalRevision: string;
  rows: readonly Readonly<{ session: string; shares: number; availableAt: string }>[] };
const proofs = new WeakMap<object, DenominatorState>();
export function sumInstitutionalShares(values: readonly number[]): number | null {
  if (!values.length || !values.every(Number.isSafeInteger)) return null;
  const total=values.reduce((sum,value)=>sum+BigInt(value),BigInt(0)), bound=BigInt(Number.MAX_SAFE_INTEGER);
  return total < -bound || total > bound ? null : Number(total);
}
export function resolveInstitutionalVolumeProof(value: unknown, request: Request, selected: TwLaunchPatternReadEvidence,
  flowCoverage: InstitutionalFlowCoverage) {
  try {
    const state = value && typeof value === 'object' ? proofs.get(value) : null;
    if (!state || state.selected !== selected || state.requestDigest !== launchNativeContentDigest(request)
      || state.selectedDigest !== launchNativeContentDigest(selected) || !state.independentCapitalRevision
      || !state.source.resourceMappingRevision || state.source.comparableFlowCoverage !== flowCoverage
      || flowCoverage === 'unverified_institutional_scope' || !evidenceKnownAt(state.source.availableAt, request.cutoff)
      || state.rows.length !== 20) return null;
    const sessions = selected.calendar?.sessions.slice(-20);
    if (!sessions || sessions.length !== 20 || state.rows.some((row,index)=>row.session!==sessions[index].session || !Number.isSafeInteger(row.shares) || row.shares<0
      || !evidenceKnownAt(sessions[index].closeAt,row.availableAt) || !evidenceKnownAt(row.availableAt,request.cutoff))
      || sumInstitutionalShares(state.rows.map(row=>row.shares)) === null) return null;
    return Object.freeze({ revisionId: state.revisionId, source: state.source, rows: state.rows });
  } catch { return null; }
}
/** Numeric demonstration ONLY. Never registers a denominator or grants actual
 * source/score authority, even when supplied fixture coverage labels agree. */
export function institutionalRatioFixture(netShares: readonly number[], volumeShares: readonly number[], input: {
  flowCoverage: 'synthetic_same_scope'; denominatorCoverage: 'synthetic_same_scope' | 'synthetic_different_scope';
}) {
  const net = sumInstitutionalShares(netShares);
  const volume = input.flowCoverage === input.denominatorCoverage && volumeShares.length === netShares.length
    && volumeShares.every(value=>Number.isSafeInteger(value)&&value>=0) ? sumInstitutionalShares(volumeShares) : null;
  const comparable = net !== null && volume !== null && Number.isSafeInteger(net) && Number.isSafeInteger(volume) && volume>0
    && netShares.every((row,index)=>Math.abs(row)<=volumeShares[index]);
  return { scope: 'offline_same_scope_fixture_only' as const, netShares: net !== null && Number.isSafeInteger(net) ? net : null,
    volumeShares: volume !== null && Number.isSafeInteger(volume) ? volume : null, netVolumeRatio: comparable ? net!/volume! : null,
    sourceAuthority: false as const, scoreAuthority: false as const, publicationAuthority: false as const };
}
