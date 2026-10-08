import { createHash } from 'node:crypto';

export const OFFICIAL_INSIDER_DATASETS = [
  {url:'https://openapi.twse.com.tw/v1/opendata/t187ap11_L',kind:'holding',market:'TWSE',label:'上市公司董監事持股餘額'},
  {url:'https://openapi.twse.com.tw/v1/opendata/t187ap11_P',kind:'holding',market:'PUBLIC',label:'公發公司董監事持股餘額（非上櫃）'},
  {url:'https://openapi.twse.com.tw/v1/opendata/t187ap12_L',kind:'transfer',market:'TWSE',label:'上市內部人持股轉讓申報'},
  {url:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O',kind:'holding',market:'TPEX',label:'上櫃公司董監事持股餘額'},
  {url:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap12_O',kind:'transfer',market:'TPEX',label:'上櫃內部人持股轉讓申報'},
] as const;
export type OfficialInsiderDataset = typeof OFFICIAL_INSIDER_DATASETS[number];
export type InsiderCursor = {hash:string;offset:number};
type Row = Record<string,unknown>;
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function shares(value:unknown):number|null {
  if(value===undefined || value===null)return null;
  if(typeof value!=='string')throw new Error('insider_schema_invalid_shares');
  if(text(value)==='')return null;
  const raw=text(value).replaceAll(',','');
  if(!/^\d+$/u.test(raw) || !Number.isSafeInteger(Number(raw)))throw new Error('insider_schema_invalid_shares');
  return Number(raw);
}
function rocDate(value:unknown):string|null {
  const raw=text(value);if(!raw)return null;
  if(!/^\d{7}$/u.test(raw))throw new Error('insider_schema_invalid_date');
  const year=Number(raw.slice(0,3))+1911,month=Number(raw.slice(3,5)),day=Number(raw.slice(5,7));
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)throw new Error('insider_schema_invalid_date');
  return `${year}-${raw.slice(3,5)}-${raw.slice(5,7)}`;
}
export function parseOfficialInsiderRow(row:Row,dataset:OfficialInsiderDataset) {
  if(!row || typeof row!=='object' || Array.isArray(row))throw new Error('insider_schema_invalid_row');
  const tpexTransfer=dataset.market==='TPEX'&&dataset.kind==='transfer';
  const symbolKey=tpexTransfer?'SecuritiesCompanyCode':'公司代號';
  const nameKey=tpexTransfer?'CompanyName':'公司名稱';
  const roleKey=dataset.kind==='holding'?'職稱':tpexTransfer?'申請人身分':'申報人身分';
  const dateKey=tpexTransfer?'Date':'出表日期';
  const required=[symbolKey,nameKey,roleKey,'姓名',dateKey,...(dataset.kind==='holding'
    ? ['資料年月','目前持股']
    : ['預定轉讓方式及股數-轉讓股數','目前持有股數-自有持股','目前持有股數-保留運用決定權信託股數','預定轉讓方式及股數-轉讓方式','有效轉讓期間'])];
  for(const key of required)if(!Object.hasOwn(row,key)||typeof row[key]!=='string')throw new Error(`insider_schema_missing_or_invalid_key:${key}`);
  // Validate the endpoint's schema and values even for excluded identities and known empty placeholders.
  const outputDate=rocDate(row[dateKey]);
  const currentShares=shares(row[dataset.kind==='holding'?'目前持股':'目前持有股數-自有持股']);
  const trustShares=dataset.kind==='transfer'?shares(row['目前持有股數-保留運用決定權信託股數']):null;
  const declaredShares=dataset.kind==='transfer'?shares(row['預定轉讓方式及股數-轉讓股數']):null;
  const symbol=text(row[symbolKey]);
  const person=text(row['姓名']);
  const companyName=text(row[nameKey]);
  const role=text(row[roleKey]);
  const sourcePeriod=text(row['資料年月']);
  let reportPeriod='unknown_period';
  if(dataset.kind==='holding') {
    if(!/^\d{5}$/u.test(sourcePeriod) || Number(sourcePeriod.slice(3))<1 || Number(sourcePeriod.slice(3))>12 || !('目前持股' in row))throw new Error('insider_schema_invalid_holding_period');
    reportPeriod=`${Number(sourcePeriod.slice(0,3))+1911}-${sourcePeriod.slice(3)}`;
  } else {
    if(!('預定轉讓方式及股數-轉讓股數' in row) || !('目前持有股數-自有持股' in row))throw new Error('insider_schema_invalid_transfer');
    reportPeriod=text(row['有效轉讓期間']) || outputDate || 'unknown_period';
  }
  if(!symbol && !person && !companyName && !role && dataset.kind==='transfer' && outputDate && currentShares===null && trustShares===null && declaredShares===null)return null;
  if(!/^[1-9]\d{3}$/u.test(symbol) || !person || !role || !companyName)return null;
  return {symbol,person,role,companyName,reportPeriod,sourcePeriod:sourcePeriod||null,outputDate,
    publishedAt:null,publicationPrecision:outputDate?'date':'unknown',
    currentShares, trustShares, declaredShares,
    transferMethod:dataset.kind==='transfer'?text(row['預定轉讓方式及股數-轉讓方式'])||null:null,
    confirmedShares:null,
  };
}
/** Schema validation covers the whole bounded response before page or symbol selection. */
export function validateOfficialInsiderResponseRows(rows:Row[],dataset:OfficialInsiderDataset):void {
  if(!Array.isArray(rows)||rows.length>50000)throw new Error('insider_schema_row_limit_or_shape');
  for(const row of rows)parseOfficialInsiderRow(row,dataset);
}
export function insiderPage(rows:Row[],hash:string,cursor:InsiderCursor|null,symbol?:string) {
  if(!/^[a-f0-9]{64}$/u.test(hash) || rows.length>50000 || (cursor && (!/^[a-f0-9]{64}$/u.test(cursor.hash)||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)))throw new Error('insider_cursor_invalid');
  if(symbol && !/^[1-9]\d{3}$/u.test(symbol))throw new Error('insider_scope_invalid');
  const snapshotReset=Boolean(cursor && cursor.hash!==hash);
  const offset=cursor && !snapshotReset?cursor.offset:0;
  if(offset>rows.length && !symbol)throw new Error('insider_cursor_out_of_range');
  const selected=symbol?rows.filter(row=>text(row['公司代號'] ?? row.SecuritiesCompanyCode)===symbol):rows.slice(offset,offset+500);
  const nextOffset=symbol?null:offset+selected.length;
  return {rows:selected,totalRows:rows.length,processedRows:selected.length,remainingRows:symbol?0:rows.length-nextOffset!,
    snapshotReset,nextCursor:symbol?null:{hash,offset:nextOffset!},coverage:symbol?'symbol_response_scope':nextOffset===rows.length?'response_complete':'response_partial'};
}
/** Only these fixed official endpoints receive this larger response bound; no arbitrary URLs or redirects. */
export async function fetchOfficialInsiderRows(dataset:OfficialInsiderDataset,transport:typeof fetch=fetch) {
  if(!OFFICIAL_INSIDER_DATASETS.some(d=>d.url===dataset.url && d.kind===dataset.kind && d.market===dataset.market))throw new Error('insider_endpoint_not_allowed');
  const limit=12*1024*1024;
  const attemptedAt=new Date().toISOString();
  const response=await transport(dataset.url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/json','user-agent':'StockInsider/insider-disclosure-v1'}});
  if(!response.ok || response.redirected)throw new Error(`insider_http_${response.status}`);
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('insider_response_size_limit');}
  if(!response.body)throw new Error('insider_response_missing_body');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit)throw new Error('insider_response_size_limit');chunks.push(value);}}
  finally {await reader.cancel();reader.releaseLock();}
  const observedAt=new Date().toISOString();
  const raw=Buffer.concat(chunks);const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!Array.isArray(rows))throw new Error('insider_schema_not_array');
  if(rows.length>50000 || rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('insider_schema_row_limit_or_shape');
  validateOfficialInsiderResponseRows(rows as Row[],dataset);
  return {raw,rows:rows as Row[],bytes,attemptedAt,observedAt,hash:createHash('sha256').update(raw).digest('hex')};
}
