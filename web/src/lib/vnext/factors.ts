import { DEEP_WEIGHTS, INITIAL_WEIGHTS, scoreFactors, type Factor, type Factors } from './policy.ts';
import { eligibleClue, independentClues, volumeComparison, type Clue } from './screening.ts';
type Observation = { value: number | null; source: string; observedAt: string };
export type ScreeningInputs = { cutoff: string; clues: Clue[]; sourceHealthy: boolean; recent7: number | null; prior21: number | null;
  priceReturn20: Observation; volumeRatio20: Observation; institutionalFlowRatio: Observation;
  revenueGrowth: Observation; catalystVerified: Observation; corporateActionAdjusted: boolean };
const bounded = (value: number) => Math.max(0, Math.min(1, value));
function factor(raw: unknown, value: number | null, provenance: string[], reason: string): Factor { return { raw, value, provenance, reason }; }
function observation(input: Observation, cutoff: string, derive: (value: number) => number, reason: string): Factor {
  const valid = input.value !== null && Number.isFinite(input.value) && input.source && Number.isFinite(Date.parse(input.observedAt)) && Date.parse(input.observedAt) <= Date.parse(cutoff);
  return factor(input, valid ? bounded(derive(input.value!)) : null, valid ? [input.source] : [], valid ? reason : 'missing_point_in_time_observation');
}
export function initialFactors(input: ScreeningInputs) {
  const clues = input.clues.filter((clue) => eligibleClue(clue, input.cutoff));
  const latest = clues.map((c) => c.eventAt).sort().at(-1);
  const roots = new Set(clues.map((c) => c.root)); const authors = new Set(clues.map((c) => c.authorRoot));
  const independent = independentClues(clues).length;
  const comparison = volumeComparison(input.recent7, input.prior21, input.sourceHealthy);
  const sources = [...new Set(clues.map((c) => c.source))];
  const sourceFactor = factor({ roots: [...roots].sort(), authors: [...authors].sort() }, independent ? bounded(independent / 3) : null, sources, 'independent_roots_capped_at_three');
  const volumeFactor = factor({ recent7: input.recent7, prior21: input.prior21, sourceHealthy: input.sourceHealthy, ...comparison },
    comparison.ratio === null ? comparison.state === 'new' ? 1 : comparison.state === 'zero' ? 0 : null : bounded(comparison.ratio / 2), sources, comparison.state);
  const price = observation(input.priceReturn20, input.cutoff, (v) => (v + 0.1) / 0.3, 'adjusted_20_session_return');
  const volume = observation(input.volumeRatio20, input.cutoff, (v) => v / 2, '20_session_volume_ratio');
  const priceVolume = input.corporateActionAdjusted && price.value !== null && volume.value !== null
    ? factor({ price, volume }, (price.value + volume.value) / 2, [...price.provenance, ...volume.provenance], 'equal_price_volume_components')
    : factor({ price, volume, adjusted: input.corporateActionAdjusted }, null, [], 'comparable_adjusted_price_volume_missing');
  const operations = observation(input.revenueGrowth, input.cutoff, (v) => (v + 0.1) / 0.4, 'public_revenue_growth');
  const catalyst = observation(input.catalystVerified, input.cutoff, (v) => v, 'verified_catalyst_checklist');
  const factors: Factors = {
    recency: factor({ eventAt: latest || null, cutoff: input.cutoff }, latest ? bounded(1 - (Date.parse(input.cutoff) - Date.parse(latest)) / (30 * 86400000)) : null, sources, 'original_event_linear_30_day_decay'),
    sourceVolume: { ...factor({ sourceFactor, volumeFactor }, null, sources, 'equal_independent_sources_and_comparable_volume'), components: { independent: sourceFactor, volume: volumeFactor } },
    priceVolume, chips: observation(input.institutionalFlowRatio, input.cutoff, (v) => (v + 0.05) / 0.1, 'net_institutional_flow_to_turnover'),
    operationsCatalyst: operations.value !== null && catalyst.value !== null ? factor({ operations, catalyst }, (operations.value + catalyst.value) / 2, [...operations.provenance, ...catalyst.provenance], 'public_operations_and_verified_catalyst') : factor({ operations, catalyst }, null, [], 'operations_catalyst_missing'),
  };
  return scoreFactors(factors, INITIAL_WEIGHTS);
}
type Checklist = { checks: Array<{ key: string; met: boolean | null; provenance: string[]; observedAt: string }> };
export type DeepInputs = { cutoff: string; valuation: { current: number | null; bear: number | null; base: number | null; bull: number | null; method: string; quoteAt: string; valuationAt: string; provenance: string[] };
  profitabilityChecklist: Checklist; technicalChipsChecklist: Checklist; catalystChecklist: Checklist; marketLiquidityChecklist: Checklist };
const CHECKLISTS = {
  profitability: ['margin_stable', 'cashflow_conversion', 'competitive_advantage', 'concentration_disclosed'],
  technicalChips: ['trend_valid', 'volume_confirmed', 'institutional_confirmed', 'adjustment_verified'],
  catalysts: ['dated', 'verified', 'mechanism_documented', 'falsifier_defined'],
  marketLiquidity: ['market_known', 'liquidity_verified', 'trading_valid', 'risk_bound'],
};
function checklist(input: Checklist, keys: string[], cutoff: string) {
  const checks = Array.isArray(input?.checks) ? input.checks : [];
  const selected = keys.map((key) => checks.filter((c) => c.key === key));
  const valid = selected.every((list) => list.length === 1 && typeof list[0].met === 'boolean' && list[0].provenance.length > 0
    && Number.isFinite(Date.parse(list[0].observedAt)) && Date.parse(list[0].observedAt) <= Date.parse(cutoff));
  return factor({ requiredKeys: keys, checks }, valid ? selected.filter((list) => list[0].met === true).length / keys.length : null,
    valid ? [...new Set(selected.flatMap((list) => list[0].provenance))] : [], valid ? 'fixed_evidence_checklist_fraction' : 'fixed_checklist_evidence_missing');
}
/** Fixed evidence checklists and dated upside/downside scenarios; no submitted factor scores. */
export function deepFactors(input: DeepInputs) {
  const v = input.valuation;
  const valid = v && [v.current, v.bear, v.base, v.bull].every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)
    && v.bear! <= v.base! && v.base! <= v.bull! && v.bear! < v.current! && v.provenance?.length > 0
    && ['forward_pe', 'forward_pb', 'normalized_pe', 'ev_ebitda', 'dcf'].includes(v.method)
    && [v.quoteAt, v.valuationAt].every((date) => Number.isFinite(Date.parse(date)) && Date.parse(date) <= Date.parse(input.cutoff));
  const upside = valid ? v.base! / v.current! - 1 : null; const downside = valid ? 1 - v.bear! / v.current! : null;
  const rewardRisk = upside !== null && downside !== null && downside > 0 ? upside / downside : null;
  const factors: Factors = {
    valuation: factor({ scenarios: v || null, upside, downside, rewardRisk }, valid && rewardRisk !== null ? (bounded(upside! / 0.5) + bounded(rewardRisk / 3)) / 2 : null,
      valid ? v.provenance : [], valid ? 'equal_dated_upside_and_reward_risk' : 'dated_comparable_scenarios_missing'),
    profitability: checklist(input.profitabilityChecklist, CHECKLISTS.profitability, input.cutoff),
    technicalChips: checklist(input.technicalChipsChecklist, CHECKLISTS.technicalChips, input.cutoff),
    catalysts: checklist(input.catalystChecklist, CHECKLISTS.catalysts, input.cutoff),
    marketLiquidity: checklist(input.marketLiquidityChecklist, CHECKLISTS.marketLiquidity, input.cutoff),
  };
  return scoreFactors(factors, DEEP_WEIGHTS);
}
