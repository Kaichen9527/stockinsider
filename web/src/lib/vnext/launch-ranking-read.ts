import { types } from 'node:util';
import { vnextEnabled, taipeiDate } from './policy.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { candidatePriceDisplayFrom } from '../candidate-price-history.ts';
import {parseLaunchPublicCitation,type LaunchPublicCitation} from './launch-public-citation.ts';

export const LAUNCH_RANKING_POLICY = 'stockinsider-launch-radar-v1';
export const LAUNCH_RANKING_RULES = 'launch-radar-comparisons-v5';
export const LAUNCH_RANKING_ARITHMETIC = 'binary64-v1';
export const LAUNCH_RANKING_SCHEMA = 'vnext-launch-ranking-snapshot-v2';
export const launchRankingEnabled = () => vnextEnabled() && process.env.STOCKINSIDER_LAUNCH_RANKING_ENABLED === 'true';
const revisionKeys = ['research','score','qualification','price','calendar','actions','technicalVolume','institutionalVolume','flow','market'] as const;
export type LaunchRankingRevisions = Record<typeof revisionKeys[number],string>;
export const LAUNCH_COMPONENT_WEIGHTS = {trendRelativeStrength:25,consolidation:25,breakoutHold:20,chips:20,market:10} as const;
type Group = keyof typeof LAUNCH_COMPONENT_WEIGHTS;
export type LaunchRankingMember = {rank:number;symbol:string;revisionId:string;inputHash:string;scoreRevision:string;launchQualificationRevision:string;
  totalScore:number;availableWeight:100;technicalScore:number;relativeStrength63:number;components:Record<Group,number>;entryEligible:boolean;reasons:string[];
  revisions:LaunchRankingRevisions;financial:null;valuation:null};
export type LaunchRankingMarket = {session:string;risk:'risk_on'|'selective'|'risk_off'|'breakdown'|'unknown';confidence:'complete'|'limited'|'insufficient';
  sourceAt:string;expiresAt:string;reasons:string[];conditions:string[];gaps:string[]};
export type LaunchRankingSnapshot = {schemaVersion:typeof LAUNCH_RANKING_SCHEMA;policyVersion:typeof LAUNCH_RANKING_POLICY;rulesVersion:typeof LAUNCH_RANKING_RULES;arithmeticVersion:typeof LAUNCH_RANKING_ARITHMETIC;
  rankingRunId:string;previousRankingRunId:string|null;cutoff:string;inputCutoff:string;session:string;publishedAt:string;marketRevision:string;market:LaunchRankingMarket;
  members:LaunchRankingMember[];candidates:Array<{symbol:string;state:'researching'|'waiting'|'eligible'|'exited';reasons:string[]}>;
  changes:Array<{symbol:string;kind:'entered'|'maintained'|'exited';reason:string}>};
const checkKeys=['rights','review','venue','liquidity','price','actions','source','completeWeight'] as const;
export type LaunchRankingCurrent = {symbol:string;revisionId:string;inputHash:string;scoreRevision:string;launchQualificationRevision:string;
  revisions:LaunchRankingRevisions;checkedAt:string|null;expiresAt:string|null;status:'current'|'waiting'|'invalid'|'unknown';entryEligible:boolean;
  checks:Record<typeof checkKeys[number],boolean|null>;reasons:string[]};
type Operand = number|string|boolean|null;
export type LaunchRankingRule = {id:string;group:Group;weight:number;matches:boolean;points:number;operands:Record<string,Operand>;
  cutoff:string;throughSession:string;revisions:LaunchRankingRevisions};
type LaunchChartCandle = {time:string;open:number;high:number;low:number;close:number;volume:number|null};
export type LaunchRankingChart = {
  schemaVersion:'launch-frozen-chart-v1';priceBasis:'adjusted_to_signal_session';seriesRevision:string;priceRevision:string;calendarRevision:string;actionsRevision:string;
  cutoff:string;throughSession:string;displayFrom:string;warmupSessions:239;candles:LaunchChartCandle[];
};

type LaunchPriceHighComparison = { fromDate: string; previousHigh: number; isNewHigh: boolean };
export type LaunchPriceHighs = {
  schemaVersion: 'launch-frozen-price-highs-v1';
  seriesRevision: string;
  throughSession: string;
  currentHigh: number;
  prior25Sessions: LaunchPriceHighComparison | null;
  trailing52Weeks: LaunchPriceHighComparison | null;
  knownPeriod: LaunchPriceHighComparison | null;
  isAllTimeHigh: null;
};
export type LaunchReportedEps = {basis:'basic'|'diluted';periodStart:string;periodEnd:string;amount:number;filedAt:string;knownAt:string;sourceUrl:string};
export type LaunchIssuerEpsEstimate={periodStart:string;periodEnd:string;amount:number;publishedAt:string;knownAt:string;sourceUrl:string};
export type LaunchIssuerFiscalForecast = {
  horizon: 'annual' | 'four_quarters'; periodStart: string; periodEnd: string; shareBasis: 'basic' | 'diluted';
  shares: string; amount: number; sourceUrl: string; publishedAt: string; knownAt: string;
};
export type LaunchForwardPeReference = {
  schemaVersion: 'launch-forward-pe-reference-v1';
  cutoff: string; session: string; close: number; priceRevision: string;
  periods: Array<Pick<LaunchIssuerFiscalForecast, 'horizon' | 'periodStart' | 'periodEnd'> & { multiple: number | null }>;
};

const valuationMethods = ['forward_pe','normalized_pe','forward_pb','ev_ebitda','dcf'] as const;
export type LaunchReviewedValuation = {
  method: typeof valuationMethods[number];
  period: string;
  valuationDate: string;
  quoteDate: string;
  unit: 'TWD_per_share';
  bear: number;
  base: number;
  bull: number;
};
export type LaunchRankingDetail = {arithmeticVersion:typeof LAUNCH_RANKING_ARITHMETIC;rankingRunId:string;symbol:string;revisionId:string;scoreRevision:string;launchQualificationRevision:string;inputHash:string;
  summary:string|null;scoreEvidence:LaunchRankingRule[];citations:LaunchPublicCitation[];chart:LaunchRankingChart|null;priceHighs:LaunchPriceHighs|null;reportedEps?:LaunchReportedEps[];issuerEpsEstimates?:LaunchIssuerEpsEstimate[];issuerFiscalForecasts?:LaunchIssuerFiscalForecast[];forwardPeReference?:LaunchForwardPeReference|null;reviewedValuation?:LaunchReviewedValuation|null};
export type LaunchRankingRead = {availability:'ready'|'not_published'|'producer_unavailable'|'not_found'|'schema_unavailable'|'unavailable';reason:string|null;
  readAt:string;snapshot:LaunchRankingSnapshot|null;current:LaunchRankingCurrent[];detail:LaunchRankingDetail|null};
type Row=Record<string,unknown>;
function invalid():never {throw Error('launch_ranking_contract_invalid');}
const row=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:string):value is Row=>row(value)&&Reflect.ownKeys(value).length===keys.split(' ').length&&keys.split(' ').every(key=>Object.hasOwn(value,key));
const text=(value:unknown,max=240):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const symbol=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}$/u.test(value);
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const stamp=(value:unknown):value is string=>typeof value==='string'&&evidenceInstant(value)!==null;
function strings(value:unknown,maximum=30):string[] {if(!Array.isArray(value)||value.length>maximum||!value.every(item=>text(item)))invalid();return [...value];}
/** Reject hooks before serialization. RPC data is a bounded public DTO, never
 * a source/parser registration mechanism or an authority supplied by a caller. */
function envelope(value:unknown) {
  let count=0;
  const visit=(item:unknown,depth:number):void=>{
    if(++count>40000||depth>12)invalid();
    if(item===null||typeof item==='boolean'||number(item))return;
    if(typeof item==='string'){if(item.length>4096)invalid();return;}
    if(!item||typeof item!=='object'||types.isProxy(item))invalid();
    const array=Array.isArray(item);
    if(!(array?Object.getPrototypeOf(item)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(item))))invalid();
    for(const key of Reflect.ownKeys(item)){
      const d=Object.getOwnPropertyDescriptor(item,key)!;
      if(typeof key!=='string'||key.length>120||!Object.hasOwn(d,'value')||!d.enumerable&&!(array&&key==='length'))invalid();
      if(!(array&&key==='length'))visit(d.value,depth+1);
    }
  };
  visit(value,0);if(Buffer.byteLength(JSON.stringify(value))>2*1024*1024)invalid();
}
function revisions(value:unknown):LaunchRankingRevisions {
  if(!exact(value,revisionKeys.join(' '))||revisionKeys.some(key=>!text(value[key],240)))invalid();
  return Object.fromEntries(revisionKeys.map(key=>[key,value[key]])) as LaunchRankingRevisions;
}
const sameRevisions=(a:LaunchRankingRevisions,b:LaunchRankingRevisions)=>revisionKeys.every(key=>a[key]===b[key]);
const definitions:ReadonlyArray<readonly[string,Group,number,string]>= [
  ['trend_close_above_ma50','trendRelativeStrength',5,'close ma50'],['trend_ma50_above_ma200','trendRelativeStrength',5,'ma50 ma200'],
  ['trend_ma200_rising_5sessions','trendRelativeStrength',5,'ma200 priorMa200 priorEndpoint'],
  ['trend_excess_return20_positive','trendRelativeStrength',5,'stockReturn marketReturn excessReturn'],['trend_excess_return63_positive','trendRelativeStrength',5,'stockReturn marketReturn excessReturn'],
  ['consolidation_depth_within15pct','consolidation',10,'depth'],['consolidation_distance_within5pct','consolidation',5,'distance'],
  ['consolidation_prior_atr_ratio_within08','consolidation',5,'ratio throughSession'],['consolidation_volume_ratio_within08','consolidation',5,'ratio'],
  ['breakout_or_fixed_closing_hold','breakoutHold',20,'breakout closingHold originalSession originalLevel'],
  ['chips_foreign5_positive','chips',5,'netShares volumeShares netVolumeRatio'],['chips_foreign20_positive','chips',5,'netShares volumeShares netVolumeRatio'],
  ['chips_trust5_positive','chips',5,'netShares volumeShares netVolumeRatio'],['chips_trust20_positive','chips',5,'netShares volumeShares netVolumeRatio'],
  ['market_close_above_ma50','market',5,'close ma50'],['market_close_above_ma200','market',5,'close ma200']
];
function member(value:unknown,index:number,marketRevision:string):LaunchRankingMember {
  if(!exact(value,'rank symbol revisionId inputHash scoreRevision launchQualificationRevision totalScore availableWeight technicalScore relativeStrength63 components entryEligible reasons revisions financial valuation')
    ||value.rank!==index+1||!symbol(value.symbol)||!uuid(value.revisionId)||!hash(value.inputHash)||!uuid(value.scoreRevision)||!uuid(value.launchQualificationRevision)
    ||!number(value.totalScore)||value.totalScore<0||value.totalScore>100||value.availableWeight!==100||!number(value.technicalScore)||!number(value.relativeStrength63)
    ||typeof value.entryEligible!=='boolean'||value.financial!==null||value.valuation!==null||!exact(value.components,Object.keys(LAUNCH_COMPONENT_WEIGHTS).join(' ')))invalid();
  const components={} as Record<Group,number>;
  for(const key of Object.keys(LAUNCH_COMPONENT_WEIGHTS) as Group[]){const points=value.components[key];if(!number(points)||points<0||points>LAUNCH_COMPONENT_WEIGHTS[key]||points%5!==0||key==='breakoutHold'&&points!==0&&points!==20)invalid();components[key]=points;}
  if(Object.values(components).reduce((a,b)=>a+b,0)!==value.totalScore||components.trendRelativeStrength+components.consolidation+components.breakoutHold!==value.technicalScore)invalid();
  const refs=revisions(value.revisions);
  if(refs.research!==value.revisionId||refs.score!==value.scoreRevision||refs.qualification!==value.launchQualificationRevision||refs.market!==marketRevision)invalid();
  return {rank:index+1,symbol:value.symbol,revisionId:value.revisionId,inputHash:value.inputHash,scoreRevision:value.scoreRevision,launchQualificationRevision:value.launchQualificationRevision,
    totalScore:value.totalScore,availableWeight:100,technicalScore:value.technicalScore,relativeStrength63:value.relativeStrength63,components,entryEligible:value.entryEligible,reasons:strings(value.reasons),revisions:refs,financial:null,valuation:null};
}
function current(value:unknown):LaunchRankingCurrent {
  if(!exact(value,'symbol revisionId inputHash scoreRevision launchQualificationRevision revisions checkedAt expiresAt status entryEligible checks reasons')||!symbol(value.symbol)||!uuid(value.revisionId)
    ||!hash(value.inputHash)||!uuid(value.scoreRevision)||!uuid(value.launchQualificationRevision)||value.checkedAt!==null&&!stamp(value.checkedAt)||value.expiresAt!==null&&!stamp(value.expiresAt)
    ||!['current','waiting','invalid','unknown'].includes(String(value.status))||typeof value.entryEligible!=='boolean'||!exact(value.checks,checkKeys.join(' ')))invalid();
  const checks=value.checks;if(checkKeys.some(key=>checks[key]!==null&&typeof checks[key]!=='boolean'))invalid();
  return {symbol:value.symbol,revisionId:value.revisionId,inputHash:value.inputHash,scoreRevision:value.scoreRevision,launchQualificationRevision:value.launchQualificationRevision,revisions:revisions(value.revisions),
    checkedAt:value.checkedAt,expiresAt:value.expiresAt,status:value.status as LaunchRankingCurrent['status'],entryEligible:value.entryEligible,
    checks:Object.fromEntries(checkKeys.map(key=>[key,checks[key]])) as LaunchRankingCurrent['checks'],reasons:strings(value.reasons)};
}
function operandMatch(id:string,o:Record<string,Operand>):boolean|null {
  const greater=(a:Operand,b:Operand)=>number(a)&&number(b)?a>b:null;
  if(id.includes('excess_return'))return number(o.stockReturn)&&number(o.marketReturn)&&o.excessReturn===o.stockReturn-o.marketReturn?greater(o.excessReturn,0):null;
  if(id.startsWith('chips_'))return number(o.netShares)&&Number.isSafeInteger(o.netShares)&&number(o.volumeShares)&&Number.isSafeInteger(o.volumeShares)
    &&o.volumeShares>0&&Math.abs(o.netShares)<=o.volumeShares&&o.netVolumeRatio===o.netShares/o.volumeShares?o.netShares>0:null;
  if(id==='breakout_or_fixed_closing_hold'){
    if(o.closingHold===true&&(!date(o.originalSession)||!number(o.originalLevel)||o.originalLevel<=0))return null;
    return o.breakout===true||o.closingHold===true?true:o.breakout===false&&o.closingHold===false?false:null;
  }
  if(id==='consolidation_depth_within15pct')return number(o.depth)&&o.depth>=0?o.depth<=.15:null;
  if(id==='consolidation_distance_within5pct')return number(o.distance)&&o.distance>=0?o.distance<=.05:null;
  if(id==='consolidation_prior_atr_ratio_within08')return date(o.throughSession)&&number(o.ratio)&&o.ratio>=0?o.ratio<=.8:null;
  if(id==='consolidation_volume_ratio_within08')return number(o.ratio)&&o.ratio>=0?o.ratio<=.8:null;
  if(id==='trend_ma200_rising_5sessions')return date(o.priorEndpoint)&&number(o.ma200)&&o.ma200>0&&number(o.priorMa200)&&o.priorMa200>0?greater(o.ma200,o.priorMa200):null;
  if(id==='trend_ma50_above_ma200')return number(o.ma50)&&o.ma50>0&&number(o.ma200)&&o.ma200>0?greater(o.ma50,o.ma200):null;
  const average=id.endsWith('ma50')?o.ma50:o.ma200;
  return number(o.close)&&o.close>0&&number(average)&&average>0?greater(o.close,average):null;
}
function rules(value:unknown,snapshot:LaunchRankingSnapshot,selected:LaunchRankingMember):LaunchRankingRule[] {
  if(!Array.isArray(value)||value.length!==16)invalid();
  const result=value.map((item,index)=>{
    const [id,group,weight,keys]=definitions[index];
    if(!exact(item,'id group weight matches points operands cutoff throughSession revisions')||item.id!==id||item.group!==group||item.weight!==weight||typeof item.matches!=='boolean'
      ||item.points!==(item.matches?weight:0)||item.cutoff!==snapshot.cutoff||item.throughSession!==snapshot.session||!exact(item.operands,keys))invalid();
    const operands:Record<string,Operand>={};
    for(const key of keys.split(' ')){
      const operand=item.operands[key];
      if(['priorEndpoint','throughSession','originalSession'].includes(key)){if(operand!==null&&(!date(operand)||operand>=snapshot.session))invalid();}
      else if(['breakout','closingHold'].includes(key)){if(operand!==null&&typeof operand!=='boolean')invalid();}
      else if(operand!==null&&!number(operand))invalid();
      operands[key]=operand as Operand;
    }
    if(operandMatch(id,operands)!==item.matches)invalid();
    const refs=revisions(item.revisions);if(!sameRevisions(refs,selected.revisions))invalid();
    return {id,group,weight,matches:item.matches,points:item.points as number,operands,cutoff:snapshot.cutoff,throughSession:snapshot.session,revisions:refs};
  });
  for(const group of Object.keys(LAUNCH_COMPONENT_WEIGHTS) as Group[])if(result.filter(item=>item.group===group).reduce((sum,item)=>sum+item.points,0)!==selected.components[group])invalid();
  const rs=result[4].operands;
  if(!number(rs.stockReturn)||!number(rs.marketReturn)||rs.excessReturn!==rs.stockReturn-rs.marketReturn||rs.excessReturn!==selected.relativeStrength63)invalid();
  return result;
}
/** Pure allowlisted transport validation. SQL/source/formal review authority is
 * never created here, and frozen rankings never receive renewed UI proofs. */
/** Public candles belong to the selected frozen run. Calendar/adjustment
 * authority and completeness must be established by the writer before projection. */
function frozenChart(value:unknown,snapshot:LaunchRankingSnapshot,selected:LaunchRankingMember):LaunchRankingChart|null {
  if(value===null)return null;
  const {cutoff,session}=snapshot;
  const {price,calendar,actions}=selected.revisions;
  const displayFrom=candidatePriceDisplayFrom(session);
  if(!exact(value,'schemaVersion priceBasis seriesRevision priceRevision calendarRevision actionsRevision cutoff throughSession displayFrom warmupSessions candles')
    ||value.schemaVersion!=='launch-frozen-chart-v1'||value.priceBasis!=='adjusted_to_signal_session'
    ||!hash(value.seriesRevision)||!hash(price)||!hash(calendar)||!hash(actions)||value.priceRevision!==price||value.calendarRevision!==calendar||value.actionsRevision!==actions
    ||value.cutoff!==cutoff||value.throughSession!==session||value.displayFrom!==displayFrom||value.warmupSessions!==239
    ||!Array.isArray(value.candles)||value.candles.length<=239||value.candles.length>1320)invalid();
  let prior='';
  let warmup=0;
  const candles=value.candles.map((item):LaunchChartCandle=>{
    if(!exact(item,'time open high low close volume'))invalid();
    const {time,open,high,low,close,volume}=item;
    if(!date(time)||time<=prior||time>session||!number(open)||!number(high)||!number(low)||!number(close)
      ||low<=0||low>Math.min(open,close)||high<Math.max(open,close)
      ||volume!==null&&(!number(volume)||!Number.isSafeInteger(volume)||volume<0||volume>Math.floor(Number.MAX_SAFE_INTEGER/31)))invalid();
    prior=time;
    if(time<displayFrom)warmup++;
    return {time,open,high,low,close,volume};
  });
  if(prior!==session||warmup!==239)invalid();
  return {schemaVersion:'launch-frozen-chart-v1',priceBasis:'adjusted_to_signal_session',seriesRevision:value.seriesRevision,priceRevision:price,calendarRevision:calendar,actionsRevision:actions,
    cutoff,throughSession:session,displayFrom,warmupSessions:239,candles};
}

/** The frozen chart RPC already pins every completed venue session, action,
 * and source observation in its display window. Warmup is for indicators. */
function frozenPriceHighs(chart: LaunchRankingChart | null): LaunchPriceHighs | null {
  if (!chart) return null;
  const current = chart.candles.at(-1)!;
  const prior = chart.candles.slice(0, -1).filter(candle => candle.time >= chart.displayFrom);
  const start = new Date(chart.throughSession + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - 52 * 7);
  const trailingStart = start.toISOString().slice(0, 10);
  const compare = (candles: LaunchChartCandle[], fromDate: string) => {
    if (candles.length === 0) return null;
    const previousHigh = Math.max(...candles.map(candle => candle.high));
    return { fromDate, previousHigh, isNewHigh: current.high > previousHigh };
  };
  const prior25 = prior.slice(-25);
  return {
    schemaVersion: 'launch-frozen-price-highs-v1',
    seriesRevision: chart.seriesRevision,
    throughSession: chart.throughSession,
    currentHigh: current.high,
    prior25Sessions: prior25.length === 25 ? compare(prior25, prior25[0].time) : null,
    trailing52Weeks: prior.length > 0 && prior[0].time <= trailingStart
      ? compare(prior.filter(candle => candle.time >= trailingStart), trailingStart)
      : null,
    knownPeriod: prior.length > 0 ? compare(prior, prior[0].time) : null,
    isAllTimeHigh: null,
  };
}
export function parseLaunchRankingRead(value:unknown,query:{rankingRunId?:string;symbol?:string}={},now=new Date().toISOString()):LaunchRankingRead {
  envelope(value);
  if(!stamp(now)||query.rankingRunId!==undefined&&!uuid(query.rankingRunId)||query.symbol!==undefined&&!symbol(query.symbol))invalid();
  if(!exact(value,'schemaVersion arithmeticVersion availability reason snapshot current detail')||value.schemaVersion!=='vnext-launch-ranking-read-v2'||value.arithmeticVersion!==LAUNCH_RANKING_ARITHMETIC
    ||!['ready','not_published','producer_unavailable','not_found'].includes(String(value.availability))||value.reason!==null&&!text(value.reason)
    ||!exact(value.current,'schemaVersion arithmeticVersion members')||value.current.schemaVersion!=='vnext-launch-current-validity-v2'||value.current.arithmeticVersion!==LAUNCH_RANKING_ARITHMETIC||!Array.isArray(value.current.members)||value.current.members.length>20)invalid();
  let snapshot:LaunchRankingSnapshot|null=null;
  if(value.snapshot!==null){
    const s=value.snapshot;
    if(!exact(s,'schemaVersion policyVersion rulesVersion arithmeticVersion rankingRunId previousRankingRunId cutoff inputCutoff session publishedAt marketRevision market members candidates changes')
      ||s.schemaVersion!==LAUNCH_RANKING_SCHEMA||s.policyVersion!==LAUNCH_RANKING_POLICY||s.rulesVersion!==LAUNCH_RANKING_RULES||s.arithmeticVersion!==LAUNCH_RANKING_ARITHMETIC||!uuid(s.rankingRunId)
      ||query.rankingRunId!==undefined&&s.rankingRunId!==query.rankingRunId||s.previousRankingRunId!==null&&!uuid(s.previousRankingRunId)||s.previousRankingRunId===s.rankingRunId
      ||!stamp(s.cutoff)||s.inputCutoff!==s.cutoff||evidenceInstant(s.cutoff)!>evidenceInstant(now)!||!date(s.session)||taipeiDate(s.cutoff)!==s.session
      ||!stamp(s.publishedAt)||evidenceInstant(s.publishedAt)!<evidenceInstant(s.cutoff)!||evidenceInstant(s.publishedAt)!>evidenceInstant(now)!||!hash(s.marketRevision)
      ||!Array.isArray(s.members)||s.members.length>10||!Array.isArray(s.candidates)||s.candidates.length>20||!Array.isArray(s.changes)||s.changes.length>40)invalid();
    if(evidenceInstant(s.cutoff)!==evidenceInstant(`${s.session}T21:30:00+08:00`))invalid();
    const m=s.market;
    if(!exact(m,'session risk confidence sourceAt expiresAt reasons conditions gaps')||m.session!==s.session||!['risk_on','selective','risk_off','breakdown','unknown'].includes(String(m.risk))
      ||!['complete','limited','insufficient'].includes(String(m.confidence))||!stamp(m.sourceAt)||!stamp(m.expiresAt)||evidenceInstant(m.sourceAt)!>evidenceInstant(s.cutoff)!
      ||evidenceInstant(m.expiresAt)!<=evidenceInstant(s.cutoff)!)invalid();
    const members=s.members.map((item,index)=>member(item,index,s.marketRevision as string));
    if(new Set(members.map(item=>item.symbol)).size!==members.length)invalid();
    for(let i=1;i<members.length;i++){const a=members[i-1],b=members[i];if(a.totalScore<b.totalScore||a.totalScore===b.totalScore&&(a.technicalScore<b.technicalScore
      ||a.technicalScore===b.technicalScore&&(a.relativeStrength63<b.relativeStrength63||a.relativeStrength63===b.relativeStrength63&&a.symbol>b.symbol)))invalid();}
    const candidates=s.candidates.map(item=>{if(!exact(item,'symbol state reasons')||!symbol(item.symbol)||!['researching','waiting','eligible','exited'].includes(String(item.state)))invalid();return {symbol:item.symbol,state:item.state as LaunchRankingSnapshot['candidates'][number]['state'],reasons:strings(item.reasons)};});
    if(new Set(candidates.map(item=>item.symbol)).size!==candidates.length||members.some(item=>!candidates.some(candidate=>candidate.symbol===item.symbol)))invalid();
    const changes=s.changes.map(item=>{if(!exact(item,'symbol kind reason')||!symbol(item.symbol)||!['entered','maintained','exited'].includes(String(item.kind))||!text(item.reason))invalid();return {symbol:item.symbol,kind:item.kind as LaunchRankingSnapshot['changes'][number]['kind'],reason:item.reason};});
    snapshot={schemaVersion:LAUNCH_RANKING_SCHEMA,policyVersion:LAUNCH_RANKING_POLICY,rulesVersion:LAUNCH_RANKING_RULES,arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,rankingRunId:s.rankingRunId,previousRankingRunId:s.previousRankingRunId as string|null,
      cutoff:s.cutoff,inputCutoff:s.cutoff,session:s.session,publishedAt:s.publishedAt,marketRevision:s.marketRevision,
      market:{session:s.session,risk:m.risk as LaunchRankingMarket['risk'],confidence:m.confidence as LaunchRankingMarket['confidence'],sourceAt:m.sourceAt,expiresAt:m.expiresAt,reasons:strings(m.reasons),conditions:strings(m.conditions),gaps:strings(m.gaps)},members,candidates,changes};
  }
  if(value.availability==='ready'&&!snapshot||['not_published','not_found'].includes(String(value.availability))&&snapshot!==null||value.availability==='not_found'&&query.rankingRunId===undefined&&query.symbol===undefined)invalid();
  const live=value.current.members.map(current);if(new Set(live.map(item=>item.symbol)).size!==live.length)invalid();
  let detail:LaunchRankingDetail|null=null;
  if(value.detail!==null){
    const d=value.detail,selected=snapshot?.members.find(item=>item.symbol===query.symbol);
    if(!query.symbol||!snapshot||!selected||!exact(d,'arithmeticVersion rankingRunId symbol revisionId scoreRevision launchQualificationRevision inputHash summary scoreEvidence citations chart')
      ||d.arithmeticVersion!==LAUNCH_RANKING_ARITHMETIC||d.rankingRunId!==snapshot.rankingRunId||d.symbol!==selected.symbol||d.revisionId!==selected.revisionId||d.scoreRevision!==selected.scoreRevision
      ||d.launchQualificationRevision!==selected.launchQualificationRevision||d.inputHash!==selected.inputHash||d.summary!==null&&!text(d.summary,2000)||!Array.isArray(d.citations)||d.citations.length>30)invalid();
    const citations=d.citations.map(item=>{const citation=parseLaunchPublicCitation(item);if(!citation)invalid();return citation;});
    const chart=frozenChart(d.chart,snapshot,selected);
    detail={arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,rankingRunId:snapshot.rankingRunId,symbol:selected.symbol,revisionId:selected.revisionId,scoreRevision:selected.scoreRevision,launchQualificationRevision:selected.launchQualificationRevision,
      inputHash:selected.inputHash,summary:d.summary as string|null,scoreEvidence:rules(d.scoreEvidence,snapshot,selected),citations,chart,priceHighs:frozenPriceHighs(chart)};
  }
  return {availability:value.availability as LaunchRankingRead['availability'],reason:value.reason as string|null,readAt:now,snapshot,current:live,detail};
}
export function launchRankingMemberCurrent(member:LaunchRankingMember,currentRows:readonly LaunchRankingCurrent[],now:string):boolean {
  const live=currentRows.find(item=>item.symbol===member.symbol),at=evidenceInstant(now),checked=evidenceInstant(live?.checkedAt),expires=evidenceInstant(live?.expiresAt);
  return !!live&&live.status==='current'&&live.entryEligible&&member.entryEligible&&live.revisionId===member.revisionId&&live.inputHash===member.inputHash
    &&live.scoreRevision===member.scoreRevision&&live.launchQualificationRevision===member.launchQualificationRevision&&sameRevisions(live.revisions,member.revisions)
    &&checkKeys.every(key=>live.checks[key]===true)&&at!==null&&checked!==null&&expires!==null&&checked<=at&&at<expires&&expires>checked&&expires-checked<=BigInt(120000000);
}
type Reader={rpc:(name:'vnext_launch_ranking_read_v1',args:{p_ranking_run_id:string|null;p_symbol:string|null})=>PromiseLike<{data:unknown;error:unknown}>};
export async function readLaunchRankingTransport(client:Reader,query:{rankingRunId?:string;symbol?:string}={},now?:string):Promise<LaunchRankingRead> {
  if(query.rankingRunId!==undefined&&!uuid(query.rankingRunId)||query.symbol!==undefined&&!symbol(query.symbol))invalid();
  const result=await client.rpc('vnext_launch_ranking_read_v1',{p_ranking_run_id:query.rankingRunId??null,p_symbol:query.symbol??null});
  const readAt=now??new Date().toISOString();if(!stamp(readAt))invalid();
  if(result.error){const code=row(result.error)?result.error.code:null;return {availability:['42883','42P01','PGRST202','PGRST205'].includes(String(code))?'schema_unavailable':'unavailable',
    reason:'launch_ranking_read_unavailable',readAt,snapshot:null,current:[],detail:null};}
  return parseLaunchRankingRead(result.data,query,readAt);
}
export function parseLaunchReportedEps(value:unknown,binding:{rankingRunId:string;cutoff:string;session:string;symbol:string;revisionId:string;inputHash:string}):LaunchReportedEps[] {
  if(value===null)return [];
  envelope(value);
  if(!exact(value,'schemaVersion rankingRunId symbol revisionId inputHash cutoff facts')||value.schemaVersion!=='vnext-launch-reported-eps-v1'
    ||value.rankingRunId!==binding.rankingRunId||value.symbol!==binding.symbol||value.revisionId!==binding.revisionId||value.inputHash!==binding.inputHash
    ||!stamp(value.cutoff)||evidenceInstant(value.cutoff)!==evidenceInstant(binding.cutoff)||!Array.isArray(value.facts)||value.facts.length>4)invalid();
  const seen=new Set<string>();
  const intervals=new Set<string>();
  return value.facts.map((fact,index,facts)=>{
    if(!exact(fact,'basis periodStart periodEnd amount filedAt knownAt sourceUrl')||fact.basis!=='basic'&&fact.basis!=='diluted'
      ||!date(fact.periodStart)||!date(fact.periodEnd)||fact.periodStart>fact.periodEnd||fact.periodEnd>binding.session
      ||!/(?:03-31|06-30|09-30|12-31)$/u.test(fact.periodEnd)||!number(fact.amount)
      ||!stamp(fact.filedAt)||!stamp(fact.knownAt)||evidenceInstant(fact.filedAt)!>evidenceInstant(fact.knownAt)!
      ||evidenceInstant(fact.knownAt)!>evidenceInstant(binding.cutoff)!)invalid();
    const key=fact.periodStart+':'+fact.basis;
    if(seen.has(key)||index>0&&(facts[0].periodEnd!==fact.periodEnd||facts[index-1].periodStart<fact.periodStart))invalid();
    seen.add(key);intervals.add(fact.periodStart);
    if(intervals.size>2||taipeiDate(fact.filedAt)<fact.periodEnd)invalid();
    const year=Number(fact.periodEnd.slice(0,4)),quarter=Math.ceil(Number(fact.periodEnd.slice(5,7))/3);
    const sourceUrl='https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id='+binding.symbol+'&year='+year+'&season='+quarter;
    if(fact.sourceUrl!==sourceUrl)invalid();
    return {basis:fact.basis,periodStart:fact.periodStart,periodEnd:fact.periodEnd,amount:fact.amount,filedAt:fact.filedAt,knownAt:fact.knownAt,sourceUrl};
  });
}
async function readReportedEps(client:{rpc:(name:'vnext_launch_reported_eps_v1',args:{p_ranking_run_id:string;p_symbol:string})=>PromiseLike<{data:unknown;error:unknown}>},binding:Parameters<typeof parseLaunchReportedEps>[1]) {
  try{
    const result=await client.rpc('vnext_launch_reported_eps_v1',{p_ranking_run_id:binding.rankingRunId,p_symbol:binding.symbol});
    return result.error?undefined:parseLaunchReportedEps(result.data,binding);
  }catch{return undefined;}
}
export function parseLaunchIssuerEpsEstimates(value:unknown,binding:Parameters<typeof parseLaunchReportedEps>[1]):LaunchIssuerEpsEstimate[] {
  if (value === null) return [];
  envelope(value);
  if (!exact(value,'schemaVersion rankingRunId symbol revisionId inputHash cutoff estimates')
    || value.schemaVersion !== 'vnext-launch-issuer-eps-estimates-v1'
    || value.rankingRunId !== binding.rankingRunId || value.symbol !== binding.symbol
    || value.revisionId !== binding.revisionId || value.inputHash !== binding.inputHash
    || !stamp(value.cutoff) || evidenceInstant(value.cutoff) !== evidenceInstant(binding.cutoff)
    || !Array.isArray(value.estimates) || value.estimates.length > 4) invalid();
  let previous = '';
  return value.estimates.map(item => {
    if (!exact(item,'periodStart periodEnd amount publishedAt knownAt sourceUrl')
      || !date(item.periodStart) || !date(item.periodEnd) || item.periodStart > item.periodEnd
      || !/(?:03-31|06-30|09-30|12-31)$/u.test(item.periodEnd) || item.periodEnd <= binding.session
      || !number(item.amount) || !stamp(item.publishedAt) || !stamp(item.knownAt)
      || evidenceInstant(item.publishedAt)! > evidenceInstant(item.knownAt)!
      || evidenceInstant(item.knownAt)! > evidenceInstant(binding.cutoff)!
      || typeof item.sourceUrl !== 'string' || !/^https:\/\/mops(?:ov)?\.twse\.com\.tw\/[A-Za-z0-9._/-]+$/u.test(item.sourceUrl)
      || /(?:paid|member|premium|subscription|login|authenticate)/iu.test(item.sourceUrl)) invalid();
    const {periodStart,periodEnd,amount,publishedAt,knownAt,sourceUrl} = item;
    const period = periodStart + '/' + periodEnd;
    if (period <= previous) invalid();
    previous = period;
    return {periodStart,periodEnd,amount,publishedAt,knownAt,sourceUrl};
  });
}
async function readIssuerEpsEstimates(
  client: {rpc:(name:'vnext_launch_issuer_eps_estimates_v1',args:{p_ranking_run_id:string;p_symbol:string})=>PromiseLike<{data:unknown;error:unknown}>},
  binding: Parameters<typeof parseLaunchIssuerEpsEstimates>[1],
) {
  try {
    const result = await client.rpc('vnext_launch_issuer_eps_estimates_v1',{
      p_ranking_run_id:binding.rankingRunId,p_symbol:binding.symbol,
    });
    return result.error ? undefined : parseLaunchIssuerEpsEstimates(result.data,binding);
  } catch { return undefined; }
}

export function parseLaunchIssuerFiscalForecasts(
  value: unknown, binding: Parameters<typeof parseLaunchReportedEps>[1],
): LaunchIssuerFiscalForecast[] {
  if (value === null) return [];
  envelope(value);
  if (!exact(value, 'schemaVersion rankingRunId symbol revisionId inputHash cutoff forecasts')
    || value.schemaVersion !== 'vnext-launch-issuer-fiscal-forecasts-v1'
    || value.rankingRunId !== binding.rankingRunId || value.symbol !== binding.symbol
    || value.revisionId !== binding.revisionId || value.inputHash !== binding.inputHash
    || !stamp(value.cutoff) || evidenceInstant(value.cutoff) !== evidenceInstant(binding.cutoff)
    || !Array.isArray(value.forecasts) || value.forecasts.length > 4) invalid();
  let previous = '';
  return value.forecasts.map(item => {
    if (!exact(item, 'horizon periodStart periodEnd shareBasis shares amount sourceUrl publishedAt knownAt')
      || (item.horizon !== 'annual' && item.horizon !== 'four_quarters')
      || !date(item.periodStart) || !date(item.periodEnd) || item.periodStart >= item.periodEnd
      || item.periodEnd <= binding.session
      || (item.shareBasis !== 'basic' && item.shareBasis !== 'diluted')
      || typeof item.shares !== 'string' || !/^[1-9][0-9]{0,11}$/u.test(item.shares)
      || !number(item.amount) || !stamp(item.publishedAt) || !stamp(item.knownAt)
      || evidenceInstant(item.publishedAt)! > evidenceInstant(item.knownAt)!
      || evidenceInstant(item.knownAt)! > evidenceInstant(binding.cutoff)!
      || typeof item.sourceUrl !== 'string'
      || !/^https:\/\/mops(?:ov)?\.twse\.com\.tw\/[A-Za-z0-9._/-]+$/u.test(item.sourceUrl)
      || /(?:paid|member|premium|subscription|login|authenticate)/iu.test(item.sourceUrl)) invalid();
    const anniversary = new Date(item.periodStart + 'T00:00:00Z');
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    anniversary.setUTCDate(0);
    if (!item.periodStart.endsWith('-01') || anniversary.toISOString().slice(0,10) !== item.periodEnd) invalid();
    const key = [item.horizon, item.periodStart, item.periodEnd].join('/');
    if (key <= previous) invalid();
    previous = key;
    const { horizon, periodStart, periodEnd, shareBasis, shares, amount, sourceUrl, publishedAt, knownAt } = item;
    return { horizon, periodStart, periodEnd, shareBasis, shares, amount, sourceUrl, publishedAt, knownAt };
  });
}
async function readIssuerFiscalForecasts(
  client: {rpc:(name:'vnext_launch_issuer_fiscal_forecasts_v1',args:{p_ranking_run_id:string;p_symbol:string})=>PromiseLike<{data:unknown;error:unknown}>},
  binding: Parameters<typeof parseLaunchIssuerFiscalForecasts>[1],
) {
  try {
    const result = await client.rpc('vnext_launch_issuer_fiscal_forecasts_v1', {
      p_ranking_run_id: binding.rankingRunId, p_symbol: binding.symbol,
    });
    return result.error ? undefined : parseLaunchIssuerFiscalForecasts(result.data, binding);
  } catch { return undefined; }
}

/** Uses the validated close operand from the frozen score and the allowlisted
 * issuer forecasts. A current quote or standalone quarterly EPS cannot enter. */
export function launchForwardPeReference(
  detail: LaunchRankingDetail, forecasts: readonly LaunchIssuerFiscalForecast[],
): LaunchForwardPeReference | null {
  if (!forecasts.length) return null;
  const closeRule = detail.scoreEvidence.find(rule => rule.id === 'trend_close_above_ma50');
  const close = closeRule?.operands.close;
  if (!closeRule || typeof close !== 'number' || !Number.isFinite(close) || close <= 0
    || closeRule.revisions.score !== detail.scoreRevision) return null;

  const { throughSession: session, cutoff, revisions: { price: priceRevision } } = closeRule;
  const chart = detail.chart;
  if (chart && (chart.priceRevision !== priceRevision || chart.throughSession !== session || chart.cutoff !== cutoff
    || chart.candles.at(-1)?.time !== session || chart.candles.at(-1)?.close !== close)) return null;

  const periods = forecasts.map(({horizon, periodStart, periodEnd, amount}) => {
    const reference = amount > 0 && Number.isFinite(amount) ? close / amount : 0;
    return { horizon, periodStart, periodEnd, multiple: Number.isFinite(reference) && reference > 0 ? reference : null };
  });
  return { schemaVersion: 'launch-forward-pe-reference-v1', cutoff, session, close, priceRevision, periods };
}


export function parseLaunchReviewedValuation(
  value: unknown, binding: Parameters<typeof parseLaunchReportedEps>[1],
): LaunchReviewedValuation | null {
  if (value === null) return null;
  envelope(value);
  if (!exact(value, 'schemaVersion rankingRunId symbol revisionId inputHash cutoff valuationDate quoteDate period method unit bear base bull')
    || value.schemaVersion !== 'vnext-launch-reviewed-valuation-v1'
    || value.rankingRunId !== binding.rankingRunId || value.symbol !== binding.symbol
    || value.revisionId !== binding.revisionId || value.inputHash !== binding.inputHash
    || !stamp(value.cutoff) || evidenceInstant(value.cutoff) !== evidenceInstant(binding.cutoff)
    || !date(value.valuationDate) || !date(value.quoteDate)
    || value.quoteDate > value.valuationDate || value.valuationDate > binding.session
    || typeof value.period !== 'string' || value.unit !== 'TWD_per_share'
    || !number(value.bear) || !number(value.base) || !number(value.bull)
    || value.bear <= 0 || value.bear > value.base || value.base > value.bull || value.bull > Number.MAX_SAFE_INTEGER) invalid();
  const method=valuationMethods.find(allowed=>allowed===value.method);
  const dates=value.period.split('/');
  const validPeriod=(period:string)=>/^[1-9][0-9]{3}(?:-Q[1-4])?$/u.test(period)||date(period);
  if (!method || dates.length > 2 || !dates.every(validPeriod)
    || dates.length === 2 && (dates[0].length !== dates[1].length || dates[0] >= dates[1])) invalid();
  const { period, valuationDate, quoteDate, unit, bear, base, bull }=value;
  return { method, period, valuationDate, quoteDate, unit, bear, base, bull };
}

async function readReviewedValuation(
  client: {rpc:(name:'vnext_launch_reviewed_valuation_v1',args:{p_ranking_run_id:string;p_symbol:string})=>PromiseLike<{data:unknown;error:unknown}>},
  binding: Parameters<typeof parseLaunchReviewedValuation>[1],
) {
  try {
    const result = await client.rpc('vnext_launch_reviewed_valuation_v1', {
      p_ranking_run_id:binding.rankingRunId,p_symbol:binding.symbol,
    });
    return result.error?undefined:parseLaunchReviewedValuation(result.data,binding);
  } catch { return undefined; }
}

export async function readLaunchRankingSnapshot(query:{rankingRunId?:string;symbol?:string}={}):Promise<LaunchRankingRead> {
  if(!launchRankingEnabled())throw Error('launch_ranking_disabled');
  const {getSupabaseServerClient}=await import('../supabase-server.ts');
  const client=getSupabaseServerClient();
  const result=await readLaunchRankingTransport(client,query);
  if(result.availability!=='ready'||!result.detail||!result.snapshot)return result;
  const binding={...result.detail,cutoff:result.snapshot.cutoff,session:result.snapshot.session};
  const [reportedEps, issuerEpsEstimates, issuerFiscalForecasts, reviewedValuation] = await Promise.all([
    readReportedEps(client, binding), readIssuerEpsEstimates(client, binding), readIssuerFiscalForecasts(client, binding),
    readReviewedValuation(client, binding),
  ]);
  const forwardPeReference = issuerFiscalForecasts ? launchForwardPeReference(result.detail, issuerFiscalForecasts) : undefined;
  return {...result,detail:{...result.detail,reportedEps,issuerEpsEstimates,issuerFiscalForecasts,forwardPeReference,reviewedValuation}};
}
/** A named launch link never becomes a legacy or latest lookup on failure. */
export function launchDetailQuery(query:Record<string,string|string[]|undefined>) {
  const keys=['launchRunId','launchResearchRevision','launchScoreRevision'];
  const present=keys.some(key=>query[key]!==undefined);
  if(['vnextRevision','rankingRunId','candidateRevision','decisionRevisionId'].some(key=>query[key]!==undefined))return {status:'invalid' as const};
  if(!present)return {status:'latest' as const};
  if(keys.some(key=>!uuid(query[key])))return {status:'invalid' as const};
  return {status:'bound' as const,rankingRunId:query.launchRunId as string,revisionId:query.launchResearchRevision as string,scoreRevision:query.launchScoreRevision as string};
}
