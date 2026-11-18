import {types} from 'node:util';
import {sha256Canonical} from '../opportunity-v3/canonical.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {launchPoolIndustryLabels} from './launch-industry-labels.ts';
export {launchPoolIndustryLabels} from './launch-industry-labels.ts';
import {candidateEpochFixturePage,type CandidateEpochEvent} from './candidate-epoch-journal.ts';

/** Synthetic projection only. No producer, public-metadata grant, DB or writer. */
export const LAUNCH_CANDIDATE_FIXTURE='launch-source-candidate-projection-fixture-v1';
const statuses=['recorded_active_epoch','recorded_exited_epoch','admission_history_unknown','snapshot_waiting','snapshot_eligible','absent_from_successor','not_in_saved_pool'] as const;
type Status=typeof statuses[number];
type Row=Record<string,unknown>;
export type LaunchCandidateQuery={view?:'sources';catalogId:string|null;limit:number;cursor:string|null;filters:{date:string|null;source:string|null;industry:string|null;status:Status|null}};
type Industry={revisionId:string;code:string;label:string;knownAt:string};
type Visible={position:number;state:Status;rowId:string;symbol:string;eventAt:string;source:string;industrySnapshot:Industry|null;admission:{kind:'ever_observed_admitted'|'admission_history_unknown';recordedEpochId:string|null}};
function fail():never{throw Error('launch_candidate_projection_invalid');}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const text=(v:unknown,max=80):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
const clock=(v:unknown):v is string=>typeof v==='string'&&v.length<=64&&evidenceInstant(v)!==null;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const exact=(v:unknown,keys:string):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|');
/** Refuse hooks/proxies before reading caller fields, including fixture inputs. */
function data(value:unknown){
 let nodes=0,characters=0;const seen=new Set<object>();
 function walk(v:unknown,depth:number):void{
  if(++nodes>12000||depth>20)fail();
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='string'){characters+=v.length;if(characters>256*1024)fail();return;}
  if(typeof v==='number'){if(!Number.isFinite(v))fail();return;}
  if(typeof v!=='object'||types.isProxy(v)||seen.has(v))fail();
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(proto!==(array?Array.prototype:Object.prototype)&&!(proto===null&&!array)||Object.getOwnPropertySymbols(v).length)fail();
  if(array&&v.length>200)fail();
  const descriptors=Object.getOwnPropertyDescriptors(v);
  if(array&&Object.keys(descriptors).length!==v.length+1)fail();
  seen.add(v);
  for(const [key,d] of Object.entries(descriptors)){
   if(array&&key==='length')continue;
   if(key.length>80||array&&(!/^(?:0|[1-9]\d*)$/u.test(key)||Number(key)>=v.length))fail();
   if(!d.enumerable||!Object.hasOwn(d,'value'))fail();walk(d.value,depth+1);
  }
  seen.delete(v);
 }
 walk(value,0);if(Buffer.byteLength(JSON.stringify(value))>512*1024)fail();
}
function parsedQuery(v:unknown):LaunchCandidateQuery{
 data(v);
 if(!(exact(v,'catalogId limit cursor filters')||exact(v,'catalogId limit cursor filters view')&&v.view==='sources')||v.catalogId!==null&&!uuid(v.catalogId)||!Number.isInteger(v.limit)||Number(v.limit)<1||Number(v.limit)>20
  ||v.cursor!==null&&(!text(v.cursor,1000)||!/^[A-Za-z0-9_-]+$/u.test(v.cursor))||!exact(v.filters,'date source industry status'))fail();
 const f=v.filters;
 if(f.date!==null&&!date(f.date)||f.source!==null&&(!text(f.source,40)||!/^[a-z][a-z0-9_-]*$/u.test(f.source))||f.industry!==null&&!text(f.industry,60)
  ||f.status!==null&&!statuses.includes(f.status as Status))fail();
 return v as LaunchCandidateQuery;
}
export function launchCandidateQuery(params:URLSearchParams):LaunchCandidateQuery{
 if(params.size>8||params.toString().length>4096)fail();
 const allowed=['view','catalogId','limit','cursor','date','source','industry','status'];
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))fail();
 const rawLimit=params.get('limit');if(rawLimit!==null&&!/^(?:[1-9]|1[0-9]|20)$/u.test(rawLimit))fail();
 const filter=(key:string)=>params.get(key)||null;
 const view=params.get('view');if(view!==null&&view!=='sources')fail();
 return parsedQuery({...(view ? {view} : {}),catalogId:params.get('catalogId'),limit:rawLimit===null?10:Number(rawLimit),cursor:params.get('cursor'),
  filters:{date:filter('date'),source:filter('source'),industry:filter('industry'),status:filter('status')}});
}
/** Reuses the existing disabled journal fixture validator. An actual admission
 * observation is different from complete history; absence always stays unknown. */
export function launchCandidateFixturePage(value:unknown,query:LaunchCandidateQuery,current:unknown,readAt:string){
 data(value);data(current);const q=parsedQuery(query);
 if(!clock(readAt)||!exact(value,'schemaVersion scope catalogId cutoff coverage clues membership')||value.schemaVersion!==LAUNCH_CANDIDATE_FIXTURE||value.scope!=='synthetic_only'
  ||!uuid(value.catalogId)||!clock(value.cutoff)||evidenceInstant(value.cutoff)!>evidenceInstant(readAt)!
  ||!exact(value.coverage,'sourceComplete membershipComplete sourceFrom membershipFrom preActivationHistory')||value.coverage.sourceComplete!==false||value.coverage.membershipComplete!==false
  ||value.coverage.sourceFrom!==null||value.coverage.membershipFrom!==null||value.coverage.preActivationHistory!=='unavailable'||!Array.isArray(value.clues)||value.clues.length>200)fail();
 if(!exact(value.membership,'schemaVersion policyVersion cutoff events coverage activation')||value.membership.cutoff!==value.cutoff)fail();
 candidateEpochFixturePage(value.membership,{symbol:null,limit:20,cursor:null},readAt);
 const events=value.membership.events as CandidateEpochEvent[];
 const ids=new Set<string>();const rows:Omit<Visible,'position'>[]=[];const publicClues:Row[]=[];
 for(const clue of value.clues){
  if(!exact(clue,'id symbol eventAt availableAt source industrySnapshot publication')||!uuid(clue.id)||ids.has(clue.id)||typeof clue.symbol!=='string'||!/^\d{4}$/u.test(clue.symbol)
   ||!clock(clue.eventAt)||!clock(clue.availableAt)||evidenceInstant(clue.eventAt)!>evidenceInstant(clue.availableAt)!||evidenceInstant(clue.availableAt)!>evidenceInstant(value.cutoff)!
   ||!text(clue.source,40)||!/^[a-z][a-z0-9_-]*$/u.test(clue.source))fail();
  ids.add(clue.id);let industry:Industry|null=null;
  if(clue.industrySnapshot!==null){const i=clue.industrySnapshot;
   if(!exact(i,'revisionId code label knownAt')||!uuid(i.revisionId)||!text(i.code,60)||!text(i.label,80)||!clock(i.knownAt)||evidenceInstant(i.knownAt)!>evidenceInstant(value.cutoff)!)fail();
   industry={revisionId:i.revisionId,code:i.code,label:i.label,knownAt:i.knownAt};
  }
  // This record declares fixture intent, NEVER a permission accepted by runtime.
  // Null represents private/unknown scope, excluded before public materialization.
  if(clue.publication===null)continue;
  if(!exact(clue.publication,'kind bindingId')||clue.publication.kind!=='synthetic_public_metadata_fixture'||!uuid(clue.publication.bindingId))fail();
  publicClues.push(clue);
  const observed=events.filter(e=>e.symbol===clue.symbol).sort((a,b)=>BigInt(a.sequence)<BigInt(b.sequence)?-1:1);
  const admitted=observed.filter(e=>e.kind==='admitted').at(-1),tail=observed.at(-1);
  const state:Status=admitted?(tail?.state==='exited'?'recorded_exited_epoch':'recorded_active_epoch'):'admission_history_unknown';
  rows.push({rowId:clue.id,symbol:clue.symbol,eventAt:clue.eventAt,source:clue.source,industrySnapshot:industry,state,
   admission:{kind:admitted?'ever_observed_admitted':'admission_history_unknown',recordedEpochId:admitted?.epochId??null}});
 }
 rows.sort((a,b)=>evidenceInstant(a.eventAt)!>evidenceInstant(b.eventAt)!?-1:evidenceInstant(a.eventAt)!<evidenceInstant(b.eventAt)!?1:a.symbol.localeCompare(b.symbol)||a.rowId.localeCompare(b.rowId));
 const positioned:Visible[]=rows.map((row,index)=>({...row,position:index+1}));
 const visibleSymbols=new Set(rows.map(row=>row.symbol));
 const lineage=events.filter(event=>visibleSymbols.has(event.symbol)).sort((a,b)=>a.symbol.localeCompare(b.symbol)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:1));
 const catalogHash=sha256Canonical({catalogId:value.catalogId,cutoff:value.cutoff,rows:positioned,coverage:value.coverage,
  provenance:{clues:publicClues.sort((a,b)=>String(a.id).localeCompare(String(b.id))),membershipEvents:lineage}});
 if(q.catalogId!==null&&q.catalogId!==value.catalogId)fail();
 if(!exact(current,'catalogId checkedAt withdrawnClueIds')||current.catalogId!==value.catalogId||!clock(current.checkedAt)||evidenceInstant(current.checkedAt)!<evidenceInstant(value.cutoff)!
  ||evidenceInstant(current.checkedAt)!>evidenceInstant(readAt)!||!Array.isArray(current.withdrawnClueIds)||current.withdrawnClueIds.length>200
  ||current.withdrawnClueIds.some(id=>!uuid(id)||!positioned.some(row=>row.rowId===id))||new Set(current.withdrawnClueIds).size!==current.withdrawnClueIds.length)fail();
 const withdrawn=new Set(current.withdrawnClueIds),filtersHash=sha256Canonical({filters:q.filters,limit:q.limit});let after=0;
 if(q.cursor!==null){let cursor:unknown;
  try{const bytes=Buffer.from(q.cursor,'base64url');if(bytes.toString('base64url')!==q.cursor)fail();cursor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail();}
  if(!exact(cursor,'version catalogId catalogHash cutoff filtersHash after')||cursor.version!==1||cursor.catalogId!==value.catalogId||cursor.catalogHash!==catalogHash||cursor.cutoff!==value.cutoff
   ||cursor.filtersHash!==filtersHash||!Number.isInteger(cursor.after)||Number(cursor.after)<1||Number(cursor.after)>positioned.length)fail();after=Number(cursor.after);
 }
 const base={schemaVersion:'launch-source-candidate-fixture-page-v1' as const,scope:'synthetic_projection_only' as const,catalogId:value.catalogId,catalogHash,cutoff:value.cutoff,
  coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},sourceAuthority:false,entryAuthority:false,publicationAuthority:false,
  gaps:['public_source_clue_producer_not_connected','production_mutation_hooks_not_connected','pre_activation_history_unavailable','full_candidate_history_not_proven','journal_other_cause_paths_not_supported']};
 if(withdrawn.size&&Object.values(q.filters).some(v=>v!==null))return {...base,availability:'filtered_projection_unavailable' as const,rows:[],nextCursor:null};
 const f=q.filters,filtered=positioned.filter(row=>(!f.date||new Date(Date.parse(row.eventAt)+8*3600000).toISOString().slice(0,10)===f.date)&&(!f.source||row.source===f.source)
  &&(!f.industry||row.industrySnapshot?.code===f.industry)&&(!f.status||row.state===f.status));
 if(after&&!filtered.some(row=>row.position===after))fail();
 const remaining=filtered.filter(row=>row.position>after),page=remaining.slice(0,q.limit),tail=page.at(-1);
 const nextCursor=tail&&remaining.length>page.length?Buffer.from(JSON.stringify({version:1,catalogId:value.catalogId,catalogHash,cutoff:value.cutoff,filtersHash,after:tail.position})).toString('base64url'):null;
 return {...base,availability:'ready' as const,rows:page.map(row=>withdrawn.has(row.rowId)?{position:row.position,state:'redacted' as const}:row),nextCursor};
}
function poolProducerUnavailable(activation:'disabled_not_connected'|'snapshot_unavailable'='snapshot_unavailable'){
 return {schemaVersion:'launch-source-candidate-read-v1' as const,availability:'producer_unavailable' as const,activation,
  rows:[],nextCursor:null,coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},
  sourceAuthority:false,entryAuthority:false,publicationAuthority:false,gaps:['public_metadata_publication_binding_producer_missing','production_mutation_hooks_not_connected','full_candidate_history_not_proven']};
}

const poolStates = ['snapshot_waiting', 'snapshot_eligible', 'absent_from_successor'] as const;
type PoolState = typeof poolStates[number];
type PoolRow = { position: number; symbol: string; state: PoolState; observedAt: string; lastSeenAt: string;
  industrySnapshot: Industry | null };
type PoolRef = { id: string; cutoff: string };
type PoolSnapshot = PoolRef & {
  rows: Array<{ symbol: string; state: 'waiting' | 'eligible'; industrySnapshot: Industry | null }>;
};
const poolGaps = ['public_source_clue_producer_not_connected',
  'full_candidate_history_not_proven', 'between_snapshot_transitions_not_available'];

function poolRef(value: unknown): PoolRef {
  if (!exact(value, 'id cutoff') || !uuid(value.id) || !clock(value.cutoff)) return fail();
  return { id: value.id, cutoff: value.cutoff as string };
}
function poolIndustry(value: unknown, cutoff: string): Industry | null {
  if (value === null) return null;
  if (!exact(value, 'revisionId code knownAt') || !uuid(value.revisionId)
    || typeof value.code !== 'string' || !Object.hasOwn(launchPoolIndustryLabels, value.code)
    || !clock(value.knownAt) || evidenceInstant(value.knownAt)! > evidenceInstant(cutoff)!) return fail();
  return { revisionId: value.revisionId, code: value.code, knownAt: value.knownAt as string,
    label: launchPoolIndustryLabels[value.code] };
}
function poolSnapshot(value: unknown, includesIndustry: boolean): PoolSnapshot {
  if (!exact(value, 'id cutoff rows') || !Array.isArray(value.rows) || value.rows.length > 20) return fail();
  const header = poolRef({ id: value.id, cutoff: value.cutoff });
  const seen = new Set<string>();
  const rows: PoolSnapshot['rows'] = [];
  for (const item of value.rows) {
    if (!exact(item, includesIndustry ? 'symbol state industrySnapshot' : 'symbol state') || typeof item.symbol !== 'string' || !/^\d{4}$/u.test(item.symbol)
      || (item.state !== 'waiting' && item.state !== 'eligible') || seen.has(item.symbol)) return fail();
    seen.add(item.symbol);
    rows.push({ symbol: item.symbol, state: item.state,
      industrySnapshot: includesIndustry ? poolIndustry(item.industrySnapshot, header.cutoff) : null });
  }
  return { ...header, rows };
}
function poolCursor(value: string, catalogId: string, catalogHash: string, filtersHash: string, cutoff: string) {
  let cursor: unknown;
  try {
    const encoded = Buffer.from(value, 'base64url');
    if (encoded.toString('base64url') !== value) return fail();
    cursor = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded));
  } catch { return fail(); }
  if (!exact(cursor, 'version catalogId catalogHash cutoff filtersHash after') || cursor.version !== 1
    || cursor.catalogId !== catalogId || cursor.catalogHash !== catalogHash
    || cursor.cutoff !== cutoff || cursor.filtersHash !== filtersHash
    || !Number.isInteger(cursor.after) || Number(cursor.after) < 1) return fail();
  return Number(cursor.after);
}

/** Only previously published pool observations enter the projection. A symbol
 * absent from the successor establishes an interval between observations. */
export function launchCandidatePoolPage(value: unknown, query: LaunchCandidateQuery, readAt = new Date().toISOString()) {
  const q = parsedQuery(query);
  data(value);
  if (!exact(value, 'schemaVersion current previous next')
    || (value.schemaVersion !== 'launch-candidate-pool-history-v1' && value.schemaVersion !== 'launch-candidate-pool-history-v2')) return fail();
  const includesIndustry = value.schemaVersion === 'launch-candidate-pool-history-v2';
  const current = poolSnapshot(value.current, includesIndustry);
  const previous = value.previous === null ? null : poolSnapshot(value.previous, includesIndustry);
  const next = value.next === null ? null : poolRef(value.next);
  if (!clock(readAt) || (q.catalogId !== null && q.catalogId !== current.id)
    || (q.cursor !== null && q.catalogId === null) || evidenceInstant(current.cutoff)! > evidenceInstant(readAt)!
    || (previous && (previous.id === current.id || evidenceInstant(previous.cutoff)! >= evidenceInstant(current.cutoff)!))
    || (next && (next.id === current.id || next.id === previous?.id || evidenceInstant(next.cutoff)! <= evidenceInstant(current.cutoff)!
      || evidenceInstant(next.cutoff)! > evidenceInstant(readAt)!))) return fail();

  const asRef = ({ id, cutoff }: PoolRef) => ({ id, cutoff });
  const before = previous ? asRef(previous) : null;
  const rows: Omit<PoolRow, 'position'>[] = current.rows.map(row => ({
    symbol: row.symbol, state: row.state === 'waiting' ? 'snapshot_waiting' : 'snapshot_eligible',
    observedAt: current.cutoff, lastSeenAt: current.cutoff, industrySnapshot: row.industrySnapshot,
  }));
  const inPool = new Set(rows.map(row => row.symbol));
  if (previous) for (const row of previous.rows) {
    if (!inPool.has(row.symbol)) rows.push({
      symbol: row.symbol, state: 'absent_from_successor', observedAt: current.cutoff, lastSeenAt: previous.cutoff,
      industrySnapshot: row.industrySnapshot,
    });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const entries = rows.map((row, index) => ({ ...row, position: index + 1 }));
  const catalogHash = sha256Canonical({ schema: value.schemaVersion, current: asRef(current), previous: before, rows: entries });
  const classified = entries.filter(row => row.industrySnapshot !== null).length;
  const industryCode = q.filters.industry
    ? Object.keys(launchPoolIndustryLabels).find(code => code === q.filters.industry || launchPoolIndustryLabels[code] === q.filters.industry)
    : null;
  const gaps = classified === entries.length && includesIndustry ? poolGaps : [...poolGaps, 'industry_metadata_incomplete'];
  const filtersHash = sha256Canonical({ filters: q.filters, limit: q.limit });
  const base = {
    schemaVersion: 'launch-source-candidate-read-v1' as const,
    scope: 'saved_adjacent_launch_pool_snapshots' as const, dateBasis: 'snapshot_observation' as const,
    catalogId: current.id, catalogHash, cutoff: current.cutoff, previousSnapshot: before, nextSnapshot: next,
    coverage: { sourceComplete: false, membershipComplete: false, sourceFrom: null, membershipFrom: null,
      preActivationHistory: 'unavailable', industryComplete: includesIndustry && classified === entries.length },
    sourceAuthority: false, entryAuthority: false, publicationAuthority: false, gaps,
  };
  if (q.filters.source || (q.filters.industry && (!includesIndustry || !industryCode || (entries.length > 0 && !classified)))
    || (q.filters.status && !poolStates.includes(q.filters.status as PoolState))) {
    return { ...base, availability: 'filtered_projection_unavailable' as const, rows: [], nextCursor: null };
  }

  const after = q.cursor ? poolCursor(q.cursor, current.id, catalogHash, filtersHash, current.cutoff) : null;
  const date = new Date(Date.parse(current.cutoff) + 8 * 3_600_000).toISOString().slice(0, 10);
  const filtered = entries.filter(row => (!q.filters.date || q.filters.date === date)
    && (!industryCode || row.industrySnapshot?.code === industryCode)
    && (!q.filters.status || q.filters.status === row.state));
  if (after !== null && !filtered.some(row => row.position === after)) return fail();
  const remaining = filtered.filter(row => after === null || row.position > after);
  const page = remaining.slice(0, q.limit);
  const nextCursor = remaining.length > q.limit
    ? Buffer.from(JSON.stringify({ version: 1, catalogId: current.id, catalogHash, cutoff: current.cutoff,
      filtersHash, after: page[page.length - 1].position })).toString('base64url')
    : null;
  return { ...base, availability: 'ready' as const, rows: page, nextCursor };
}

type PoolReader = { rpc: (name: 'vnext_launch_candidate_pool_history_v2', args: { p_catalog_id: string | null }) =>
  PromiseLike<{ data: unknown; error: unknown }> };

type PoolDayReader = { rpc: (name: 'vnext_launch_candidate_pool_day_v1', args: { p_day: string }) =>
  PromiseLike<{ data: unknown; error: unknown }> };

const clueStates = ['not_in_saved_pool', ...poolStates] as const;
type ClueState = typeof clueStates[number];
type ClueReader = { rpc: (name: 'vnext_launch_candidate_clue_history_v1', args: {
  p_catalog_id: string | null; p_after: string | null; p_limit: number; p_date: string | null;
  p_source: string | null; p_industry: string | null; p_status: ClueState | null;
}) => PromiseLike<{ data: unknown; error: unknown }> };

function clueStart(query: LaunchCandidateQuery, filtersHash: string) {
  if (query.cursor === null) return null;
  let cursor: unknown;
  try {
    const bytes = Buffer.from(query.cursor, 'base64url');
    if (bytes.toString('base64url') !== query.cursor) return fail();
    cursor = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return fail(); }
  if (!exact(cursor, 'version catalogId filtersHash after') || cursor.version !== 'source-clues-v1'
    || cursor.catalogId !== query.catalogId || cursor.filtersHash !== filtersHash || !uuid(cursor.after)) return fail();
  return cursor.after;
}

function clueSnapshotPage(value: unknown, q: LaunchCandidateQuery, filtersHash: string) {
  data(value);
  if (!exact(value, 'schemaVersion catalogId cutoff previousSnapshot nextSnapshot rows nextAfter sourceAuthority entryAuthority publicationAuthority')
    || value.schemaVersion !== 'launch-candidate-clue-history-v1' || value.sourceAuthority !== false
    || value.entryAuthority !== false || value.publicationAuthority !== false
    || !uuid(value.catalogId) || (q.catalogId !== null && q.catalogId !== value.catalogId) || !clock(value.cutoff)
    || evidenceInstant(value.cutoff)! > evidenceInstant(new Date().toISOString())!
    || (value.nextAfter !== null && !uuid(value.nextAfter)) || !Array.isArray(value.rows)
    || value.rows.length > q.limit || (value.nextAfter !== null && value.rows.length !== q.limit)) return fail();
  const cutoff = value.cutoff;
  const catalogId = value.catalogId;
  const previousSnapshot = value.previousSnapshot === null ? null : poolRef(value.previousSnapshot);
  const nextSnapshot = value.nextSnapshot === null ? null : poolRef(value.nextSnapshot);
  if ((previousSnapshot && (previousSnapshot.id === catalogId || evidenceInstant(previousSnapshot.cutoff)! >= evidenceInstant(cutoff)!))
    || (nextSnapshot && (nextSnapshot.id === catalogId || nextSnapshot.id === previousSnapshot?.id
      || evidenceInstant(nextSnapshot.cutoff)! <= evidenceInstant(cutoff)!
      || evidenceInstant(nextSnapshot.cutoff)! > evidenceInstant(new Date().toISOString())!))) return fail();

  const seen = new Set<string>();
  const rows = value.rows.map(row => {
    if (!exact(row, 'clueId symbol source eventAt state industrySnapshot') || !uuid(row.clueId)
      || seen.has(row.clueId) || typeof row.symbol !== 'string' || !/^[0-9]{4}$/u.test(row.symbol)
      || (row.source !== 'official' && row.source !== 'ptt') || !clock(row.eventAt)
      || evidenceInstant(row.eventAt)! > evidenceInstant(cutoff)!
      || !clueStates.includes(row.state as ClueState)) return fail();
    const industrySnapshot = poolIndustry(row.industrySnapshot, cutoff);
    const eventDate = new Date(Date.parse(row.eventAt) + 8 * 3600000).toISOString().slice(0, 10);
    if ((q.filters.date && q.filters.date !== eventDate) || (q.filters.source && q.filters.source !== row.source)
      || (q.filters.status && q.filters.status !== row.state)
      || (q.filters.industry && ![industrySnapshot?.code,industrySnapshot?.label].includes(q.filters.industry))) return fail();
    seen.add(row.clueId);
    return { clueId: row.clueId, symbol: row.symbol, source: row.source, eventAt: row.eventAt,
      state: row.state as ClueState, industrySnapshot };
  });
  if (value.nextAfter !== null && value.nextAfter !== rows.at(-1)?.clueId) return fail();
  return {
    schemaVersion: 'launch-source-candidate-read-v1' as const, scope: 'saved_cutoff_source_clues' as const,
    availability: 'ready' as const, catalogId, cutoff, previousSnapshot, nextSnapshot, rows,
    coverage: { sourceComplete: false, membershipComplete: false, preActivationHistory: 'unavailable' },
    sourceAuthority: false, entryAuthority: false, publicationAuthority: false,
    nextCursor: value.nextAfter === null ? null : Buffer.from(JSON.stringify({
      version: 'source-clues-v1', catalogId, filtersHash, after: value.nextAfter,
    })).toString('base64url'),
  };
}

async function readCandidateClues(query: LaunchCandidateQuery, client: ClueReader) {
  const filtersHash = sha256Canonical({ view: 'sources', filters: query.filters, limit: query.limit });
  const after = clueStart(query, filtersHash);
  const industry = query.filters.industry
    ? Object.keys(launchPoolIndustryLabels).find(code => code === query.filters.industry || launchPoolIndustryLabels[code] === query.filters.industry)
    : null;
  if ((query.filters.industry && !industry)
    || (query.filters.status && !clueStates.includes(query.filters.status as ClueState))) return fail();
  let result;
  try {
    result = await client.rpc('vnext_launch_candidate_clue_history_v1', {
      p_catalog_id: query.catalogId, p_after: after, p_limit: query.limit,
      p_date: query.filters.date, p_source: query.filters.source, p_industry: industry ?? null,
      p_status: query.filters.status as ClueState | null,
    });
  } catch { return poolProducerUnavailable(); }
  if (result.error || result.data === null) return poolProducerUnavailable();
  return clueSnapshotPage(result.data, query, filtersHash);
}

/** The service-role adapter reads saved observations. No source acquisitions,
 * writes, models or legacy ranking fallback are used by this path. */
export async function readLaunchCandidateCatalog(query: LaunchCandidateQuery, client?: PoolReader | PoolDayReader | ClueReader) {
  const q = parsedQuery(query);
  if (!client) {
    const { launchRankingEnabled } = await import('./launch-ranking-read.ts');
    if (!launchRankingEnabled()) return poolProducerUnavailable('disabled_not_connected');
    try {
      const { getSupabaseServerClient } = await import('../supabase-server.ts');
      client = getSupabaseServerClient();
    } catch { return poolProducerUnavailable(); }
  }
  if (q.cursor !== null && q.catalogId === null) return fail();
  if (q.view === 'sources') return readCandidateClues(q, client as ClueReader);
  const requestedDay = q.catalogId === null ? q.filters.date : null;
  let result;
  try {
    result = requestedDay
      ? await (client as PoolDayReader).rpc('vnext_launch_candidate_pool_day_v1', { p_day: requestedDay })
      : await (client as PoolReader).rpc('vnext_launch_candidate_pool_history_v2', { p_catalog_id: q.catalogId });
  } catch { return poolProducerUnavailable(); }
  if (result.error || result.data === null) return poolProducerUnavailable();
  const page = launchCandidatePoolPage(result.data, q);
  if (requestedDay && new Date(Date.parse(page.cutoff) + 8 * 3_600_000).toISOString().slice(0, 10) !== requestedDay) return fail();
  return page;
}
