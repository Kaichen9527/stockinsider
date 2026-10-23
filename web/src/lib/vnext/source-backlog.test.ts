/** Actual extraction orchestration, synthetic durable-RPC responses only. */
import assert from 'node:assert/strict';import test from 'node:test';
import {extractContentBatch,extractPermittedContent,type PermittedContent} from './permitted-content.ts';
const at='2026-10-22T01:00:00Z';
const item=(i:number):PermittedContent=>({id:`synthetic-backlog-${i}`,source:'official',scope:'official_original',url:`https://mops.twse.com.tw/synthetic-backlog-${String(i).padStart(3,'0')}`,eventAt:'2026-10-21T01:00:00Z',publishedAt:'2026-10-21T02:00:00Z',eventBasis:'original_event',availableAt:'2026-10-21T03:00:00Z',symbols:['2330'],originalRoot:`synthetic-root-${i}`,authorRoot:'synthetic-one-publisher',body:`Synthetic original ${i}; no real source/license claim.`});
test('known complete prefix does not starve later work and same-day acquired clocks never re-extract',async()=>{
 const rows=Array.from({length:100},(_,i)=>item(i));const sorted=rows.map(v=>extractPermittedContent(v,at)).sort((a,b)=>a.original.eventAt.localeCompare(b.original.eventAt)||a.contentHash.localeCompare(b.contentHash));
 const known=new Set(sorted.slice(0,50).map(v=>v.contentHash)),completed:string[]=[],reserved:string[]=[];
 const result=await extractContentBatch(rows,at,async(action,body)=>{if(action==='source-reserve'){const h=(body.item as {contentHash:string}).contentHash;reserved.push(h);if(known.has(h))return {parse:false,replay:true};known.add(h);return {parse:true};}completed.push(String(body.contentHash));return {parsed:true};});
 assert.equal(result.selected,50);assert.equal(result.reservations,100);assert.equal(result.replayed,50);assert.equal(completed.length,50);assert.equal(new Set(reserved).size,100);assert.deepEqual(new Set(completed),new Set(sorted.slice(50).map(v=>v.contentHash)));
 const replay=await extractContentBatch(rows.map(v=>({...v,availableAt:'2026-10-21T04:00:00Z'})),at,async(action)=>{assert.equal(action,'source-reserve');return {parse:false,replay:true};});assert.equal(replay.selected,0);assert.equal(replay.replayed,100);
});
test('server budget/rights refusal stops that source; no retry/completion or quota enlargement',async()=>{
 for(const deferred of ['daily_content_budget','source_rights_not_current']){const calls:string[]=[];const result=await extractContentBatch(Array.from({length:100},(_,i)=>item(i)),at,async(action)=>{calls.push(action);return {parse:false,deferred};});assert.deepEqual(calls,['source-reserve']);assert.equal(result.selected,0);assert.equal(result.deferredOutsideRoundRobin,99);}
 let calls=0;await assert.rejects(()=>extractContentBatch(Array.from({length:401},(_,i)=>item(i)),at,async()=>{calls++;return {};}),/scan_bound/);assert.equal(calls,0);assert.equal((await extractContentBatch([],at,async()=>{throw Error('unexpected IO');})).selected,0);
});
test('reserved/failed history is never reparsed and uncertain completion never resends',async()=>{
 for(const state of ['reserved','failed']){const result=await extractContentBatch([item(1)],at,async(action)=>{assert.equal(action,'source-reserve');return {parse:false,replay:true,state};});assert.equal(result.selected,0);}
 const calls:string[]=[];const error=Error('synthetic unknown commit');await assert.rejects(()=>extractContentBatch([item(1),item(2)],at,async(action)=>{calls.push(action);if(action==='source-reserve')return {parse:true};throw error;}),e=>e===error);assert.deepEqual(calls,['source-reserve','source-complete']);
});
test('four-source round robin still accepts at most200 and50/source after skipping known history',async()=>{
 const sources=['official','ptt','telegram','investanchors'] as const;
 const make=(source:typeof sources[number],i:number):PermittedContent=>{const base=item(i);if(source==='official')return base;return {...base,source,scope:source==='ptt'?'metadata':'operator_claim',url:source==='ptt'?`https://www.ptt.cc/bbs/Stock/M.synthetic${i}.html`:`https://mops.twse.com.tw/synthetic-${source}-${i}`,body:undefined,...(source==='ptt'?{title:`Synthetic metadata ${i}`}:{statement:`Synthetic operator claim ${source}/${i}, not original channel text.`,operatorAuthored:true,rightsAttested:true})};};
 const rows=sources.flatMap(source=>Array.from({length:100},(_,i)=>make(source,i)));const originals=rows.filter(v=>v.source==='official').map(v=>extractPermittedContent(v,at)).sort((a,b)=>a.contentHash.localeCompare(b.contentHash));const known=new Set(originals.slice(0,50).map(v=>v.contentHash));const bySource=new Map<string,number>();let completed=0;
 const receipt=await extractContentBatch(rows,at,async(action,body)=>{if(action==='source-complete'){completed++;return {parsed:true};}const v=body.item as {source:string;contentHash:string};if(known.has(v.contentHash))return {parse:false,replay:true};const count=bySource.get(v.source)||0;if(count>=50||completed>=200)return {parse:false,deferred:'daily_content_budget'};bySource.set(v.source,count+1);return {parse:true};});
 assert.equal(receipt.selected,200);assert.equal(completed,200);assert.equal(receipt.reservations,250);assert.deepEqual([...bySource].sort(),sources.map(s=>[s,50]).sort());
});
