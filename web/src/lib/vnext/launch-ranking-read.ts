import { types } from 'node:util';
import { vnextEnabled, taipeiDate } from './policy.ts';
import { evidenceInstant } from './evidence-clock.ts';
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
export type LaunchRankingDetail = {arithmeticVersion:typeof LAUNCH_RANKING_ARITHMETIC;rankingRunId:string;symbol:string;revisionId:string;scoreRevision:string;launchQualificationRevision:string;inputHash:string;
  summary:string|null;scoreEvidence:LaunchRankingRule[];citations:LaunchPublicCitation[];chart:null};
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
      ||d.launchQualificationRevision!==selected.launchQualificationRevision||d.inputHash!==selected.inputHash||d.summary!==null&&!text(d.summary,2000)||d.chart!==null||!Array.isArray(d.citations)||d.citations.length>30)invalid();
    const citations=d.citations.map(item=>{const citation=parseLaunchPublicCitation(item);if(!citation)invalid();return citation;});
    detail={arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,rankingRunId:snapshot.rankingRunId,symbol:selected.symbol,revisionId:selected.revisionId,scoreRevision:selected.scoreRevision,launchQualificationRevision:selected.launchQualificationRevision,
      inputHash:selected.inputHash,summary:d.summary as string|null,scoreEvidence:rules(d.scoreEvidence,snapshot,selected),citations,chart:null};
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
export async function readLaunchRankingSnapshot(query:{rankingRunId?:string;symbol?:string}={}):Promise<LaunchRankingRead> {
  if(!launchRankingEnabled())throw Error('launch_ranking_disabled');
  const {getSupabaseServerClient}=await import('../supabase-server.ts');return readLaunchRankingTransport(getSupabaseServerClient(),query);
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
