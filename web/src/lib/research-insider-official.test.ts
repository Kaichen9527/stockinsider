import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { OFFICIAL_INSIDER_DATASETS, parseOfficialInsiderRow, insiderPage, fetchOfficialInsiderRows } from './research-insider-official.ts';
const tw=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/insider-schema-relay.json','utf8'));
const otc=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/tpex-insider-schema-relay.json','utf8'));
const holding=OFFICIAL_INSIDER_DATASETS[0], transfer=OFFICIAL_INSIDER_DATASETS[2];
for(const symbol of ['2383','2409']) test(`actual TWSE selected ${symbol}`,()=>{
 const rows=tw.holding.selectedRows.filter((r: {rawFields:Record<string,string>})=>r.rawFields['公司代號']===symbol);
 for(const r of rows){const p=parseOfficialInsiderRow(r.rawFields,holding)!;assert.equal(p.reportPeriod,'2026-08');assert.equal(p.outputDate,'2026-09-18');assert.equal(p.publishedAt,null);assert.equal(p.currentShares,Number(r.rawFields['目前持股']));assert.equal(p.confirmedShares,null);}
 assert.equal(rows.length,tw.holding.selectedCounts[symbol]);
});
test('actual TPEx26 selected and correct endpoint',()=>{assert.equal(OFFICIAL_INSIDER_DATASETS[3].url,otc.sources[0].url);for(const r of otc.selectedHoldings5347){assert.equal(parseOfficialInsiderRow(r.values,OFFICIAL_INSIDER_DATASETS[3])!.symbol,'5347');}assert.equal(otc.selectedHoldings5347.length,26);});
test('actual transfer blank is null own/trust separated',()=>{const p=parseOfficialInsiderRow(tw.transfer.exampleRow.rawFields,transfer)!;assert.equal(p.declaredShares,null);assert.equal(p.currentShares,40781855);assert.equal(p.trustShares,0);assert.equal(p.publishedAt,null);assert.equal(p.confirmedShares,null);});
test('populated true transfer key, not obsolete key',()=>{const row={...tw.transfer.exampleRow.rawFields,'預定轉讓方式及股數-轉讓股數':'1,500','預定轉讓方式及股數-擬轉讓股數':'999','目前持有股數-保留運用決定權信託股數':'500'};const p=parseOfficialInsiderRow(row,transfer)!;assert.equal(p.declaredShares,1500);assert.equal(p.trustShares,500);});
test('TPEx placeholder is not event',()=>{assert.equal(parseOfficialInsiderRow({...Object.fromEntries(otc.sources[1].firstRecordKeys.map((key:string)=>[key,''])),...otc.transferPlaceholder,Date:'1151007'},OFFICIAL_INSIDER_DATASETS[4]),null);});
test('TPEx populated transfer uses distinct identity schema',()=>{const row={...tw.transfer.exampleRow.rawFields,SecuritiesCompanyCode:'5347',CompanyName:'世界',Date:'1151007',申請人身分:'董事',公司代號:undefined};const p=parseOfficialInsiderRow(row,OFFICIAL_INSIDER_DATASETS[4])!;assert.equal(p.symbol,'5347');assert.equal(p.outputDate,'2026-10-07');});
test('unknown holding schema rejected',()=>{assert.throws(()=>parseOfficialInsiderRow({公司代號:'2409',公司名稱:'友達',姓名:'A',職稱:'董事'},holding),/schema/);});
test('invalid dates and unsafe numbers rejected',()=>{for(const value of ['1151331','1150230'])assert.throws(()=>parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,出表日期:value},holding));assert.throws(()=>parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,目前持股:'-1'},holding));});
test('bounded pages resume past old500 prefix without loss',()=>{const rows=Array.from({length:8001},(_,i)=>({...tw.holding.selectedRows[0].rawFields,姓名:`person${i}`}));let cursor=null;let count=0;let tail=false;for(let i=0;i<17;i++){const page=insiderPage(rows,'a'.repeat(64),cursor);count+=page.rows.length;tail ||=page.rows.some(r=>r.姓名==='person7884');cursor=page.nextCursor;}assert.equal(count,8001);assert.equal(tail,true);assert.equal(cursor!.offset,8001);assert.equal(insiderPage(rows,'a'.repeat(64),cursor).rows.length,0);});
test('symbol scope does not truncate60 and never mutates market cursor',()=>{const rows=Array.from({length:67},()=>tw.holding.selectedRows[0].rawFields);const p=insiderPage(rows,'b'.repeat(64),null,'2383');assert.equal(p.rows.length,67);assert.equal(p.nextCursor,null);});
test('snapshot reset explicit and malformed cursor rejected',()=>{const p=insiderPage([tw.holding.selectedRows[0].rawFields],'b'.repeat(64),{hash:'a'.repeat(64),offset:500});assert.equal(p.snapshotReset,true);assert.equal(p.nextCursor!.offset,1);assert.throws(()=>insiderPage([], 'b'.repeat(64),{hash:'b'.repeat(64),offset:-1}));});
test('bounded fetch checks redirects/status/schema/size and preserves bytes hash',async()=>{const good=await fetchOfficialInsiderRows(holding,async()=>new Response(JSON.stringify([tw.holding.selectedRows[0].rawFields])));assert.equal(good.rows.length,1);assert.match(good.hash,/^[a-f0-9]{64}$/);await assert.rejects(fetchOfficialInsiderRows(holding,async()=>new Response('x',{status:403})),/403/);await assert.rejects(fetchOfficialInsiderRows(holding,async()=>new Response('[]',{headers:{'content-length':'13000000'}})),/size/);await assert.rejects(fetchOfficialInsiderRows(holding,async()=>new Response('{}')),/array/);});

test('four-digit invalid identity excluded, not a transfer',()=>{assert.equal(parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,公司代號:'abc'},holding),null);});
test('zero holdings remain zero, no prior snapshot trade inferred',()=>{const p=parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,目前持股:'0'},holding)!;assert.equal(p.currentShares,0);assert.equal(p.confirmedShares,null);});
test('empty or wrong primitive quantity is not fabricated zero',()=>{assert.equal(parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,目前持股:''},holding)!.currentShares,null);assert.throws(()=>parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,目前持股:50},holding));});
test('ungranted URLs rejected before transport',async()=>{let called=false;await assert.rejects(fetchOfficialInsiderRows({...holding,url:'https://localhost/'} as unknown as typeof holding,async()=>{called=true;return new Response('[]');}),/endpoint/);assert.equal(called,false);});
test('redirected response cannot qualify',async()=>{const r=new Response('[]');Object.defineProperty(r,'redirected',{value:true});await assert.rejects(fetchOfficialInsiderRows(holding,async()=>r),/http/);});
test('actual streamed oversized body rejected without trusting headers',async()=>{const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(12*1024*1024+1));c.close();}});await assert.rejects(fetchOfficialInsiderRows(holding,async()=>new Response(stream)),/size/);});
test('row and cursor upper bounds refuse silent truncation',()=>{assert.throws(()=>insiderPage(Array(50001).fill({}),'a'.repeat(64),null),/cursor/);assert.throws(()=>insiderPage([], 'a'.repeat(64),{hash:'a'.repeat(64),offset:1}),/range/);});

for(const key of ['職稱','姓名','公司名稱','公司代號','出表日期','資料年月','目前持股']) test(`required holding key/type ${key} fails closed`,()=>{
 const row={...tw.holding.selectedRows[0].rawFields};delete row[key];row.position='董事';
 assert.throws(()=>parseOfficialInsiderRow(row,holding),/schema/);
 assert.throws(()=>parseOfficialInsiderRow({...tw.holding.selectedRows[0].rawFields,[key]:null},holding),/schema/);
});

for(const dataset of OFFICIAL_INSIDER_DATASETS) test(`endpoint required string schema ${dataset.market}/${dataset.kind}`,()=>{
 const base=dataset.kind==='holding'?tw.holding.selectedRows[0].rawFields:dataset.market==='TPEX'
  ? {...tw.transfer.exampleRow.rawFields,SecuritiesCompanyCode:'5347',CompanyName:'世界',Date:'1151007',申請人身分:'董事'}:tw.transfer.exampleRow.rawFields;
 const keys=dataset.kind==='holding'?['公司代號','公司名稱','職稱','姓名','出表日期','資料年月','目前持股']
  : [dataset.market==='TPEX'?'SecuritiesCompanyCode':'公司代號',dataset.market==='TPEX'?'CompanyName':'公司名稱',dataset.market==='TPEX'?'申請人身分':'申報人身分','姓名',dataset.market==='TPEX'?'Date':'出表日期','預定轉讓方式及股數-轉讓股數','目前持有股數-自有持股','目前持有股數-保留運用決定權信託股數','預定轉讓方式及股數-轉讓方式','有效轉讓期間'];
 for(const key of keys){const row={...base};delete row[key];assert.throws(()=>parseOfficialInsiderRow(row,dataset),/schema/);assert.throws(()=>parseOfficialInsiderRow({...base,[key]:42},dataset),/schema/);}
});
