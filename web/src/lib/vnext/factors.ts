import { DEEP_WEIGHTS, INITIAL_WEIGHTS, INITIAL_SCORE_VERSION, scoreFactors, type Factor, type Factors } from './policy.ts';
import { eligibleClue, independentClues, volumeComparison, type Clue } from './screening.ts';
type Observation = { value: number | null; source: string; observedAt: string };
export type ScreeningInputs = { cutoff: string; clues: Clue[]; sourceHealthy: boolean; recent7: number | null; prior21: number | null;
  priceReturn20: Observation; volumeRatio20: Observation; institutionalFlowRatio: Observation;
  trend20?:Observation;trend60?:Observation;relativeReturn20?:Observation;operationsMonths?:Array<{month:string;monthlyRevenue:number|null;yoyRatio:number|null;source:string;observedAt:string;availableAt:string;reportedYoyPercent:number|null}>;
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
  const missing={value:null,source:'',observedAt:''};
  const trend20=observation(input.trend20||missing,input.cutoff,(v)=>(v+0.1)/0.2,'adjusted_close_relative_to_ma20');
  const trend60=observation(input.trend60||missing,input.cutoff,(v)=>(v+0.1)/0.2,'adjusted_close_relative_to_ma60');
  const relative=observation(input.relativeReturn20||missing,input.cutoff,(v)=>(v+0.1)/0.2,'stock_return_minus_same_session_exchange_index');
  const trend=trend20.value!==null && trend60.value!==null?(trend20.value+trend60.value)/2:null;
  const priceVolume = input.corporateActionAdjusted && [price.value,volume.value,trend,relative.value].every((v)=>v!==null)
    ?factor({price,volume,trend20,trend60,relative},(price.value!+volume.value!+trend!+relative.value!)/4,[...price.provenance,...volume.provenance,...trend20.provenance,...trend60.provenance,...relative.provenance],'equal_return_volume_ma_trend_relative_strength_v2')
    :factor({price,volume,trend20,trend60,relative,adjusted:input.corporateActionAdjusted},null,[],'comparable_adjusted_ma_benchmark_price_volume_missing');
  const months=input.operationsMonths||[];
  const monthId=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)?Number(month.slice(0,4))*12+Number(month.slice(5))-1:NaN;
  const monthAge=months.length?monthId(input.cutoff.slice(0,7))-monthId(months[0].month):NaN;
  const monthValid=monthAge>=0 && monthAge<=2 && months.length===3 && months.every((row,i)=>Number.isFinite(monthId(row.month)) && Number.isFinite(row.monthlyRevenue) && row.monthlyRevenue!>=0 && Number.isFinite(row.yoyRatio) && row.source && Number.isFinite(Date.parse(row.observedAt)) && Date.parse(row.observedAt)<=Date.parse(input.cutoff) && Number.isFinite(Date.parse(row.availableAt)) && Date.parse(row.availableAt)<=Date.parse(input.cutoff) && (!i || monthId(months[i-1].month)-monthId(row.month)===1));
  const averageYoy=monthValid?months.reduce((sum,row)=>sum+row.yoyRatio!,0)/3:null;
  const acceleration=monthValid?months[0].yoyRatio!-months[2].yoyRatio!:null;
  const operations=factor({months,averageYoy,acceleration},monthValid?(bounded((averageYoy!+0.1)/0.4)+bounded((acceleration!+0.1)/0.2))/2: null,monthValid?months.map((row)=>row.source):[],'equal_three_month_mean_yoy_and_yoy_acceleration_v2');
  const catalyst = observation(input.catalystVerified, input.cutoff, (v) => v, 'verified_catalyst_checklist');
  const factors: Factors = {
    recency: factor({ eventAt: latest || null, cutoff: input.cutoff }, latest ? bounded(1 - (Date.parse(input.cutoff) - Date.parse(latest)) / (30 * 86400000)) : null, sources, 'original_event_linear_30_day_decay'),
    sourceVolume: { ...factor({ sourceFactor, volumeFactor }, null, sources, 'equal_independent_sources_and_comparable_volume'), components: { independent: sourceFactor, volume: volumeFactor } },
    priceVolume, chips: observation(input.institutionalFlowRatio, input.cutoff, (v) => (v + 0.05) / 0.1, 'net_institutional_flow_to_turnover'),
    operationsCatalyst:{...factor({operations,catalyst},null,[...operations.provenance,...catalyst.provenance],'equal_public_three_month_operations_and_verified_catalyst_v2'),components:{operations,catalyst}},
  };
  return {...scoreFactors(factors, INITIAL_WEIGHTS),derivationVersion:INITIAL_SCORE_VERSION};
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
