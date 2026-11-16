import {createHash} from 'node:crypto';
import {parse,type DefaultTreeAdapterTypes as Tree} from 'parse5';

const PAGE='https://mopsov.twse.com.tw/mops/web/t163sb10';
const ENDPOINT='https://mopsov.twse.com.tw/mops/web/ajax_t163sb10';
const MAX_BYTES=256*1024;
const SIMPLE_LIST='簡式財務預測公告查詢';
const ORIGINAL_TITLE='簡式財務預測原編公告說明事項申報';
const QUARTERS=['第一季','第二季','第三季','第四季'] as const;
const QUARTER_CODES=['一','二','三','四'] as const;
const QUARTER_NUMBERS=[1,2,3,4] as const;
type Quarter=1|2|3|4;
const MARKET={sii:'TWSE',otc:'TPEX'} as const;
type Scope={symbol:string;year:number;quarter?:Quarter};
type PeriodValue={kind:'point';value:number}|{kind:'range';low:number;high:number};
type Release={market:typeof MARKET[keyof typeof MARKET];marketCode:keyof typeof MARKET;publishedDate:string;sequence:0;coverageMask:string;coveredQuarters:Quarter[]};
type CapturedHtml={body:string;sha256:string;bytes:number;acquiredAt:string};

function fail(reason:string):never{throw Error('vnext_mops_simple_forecast_'+reason);}
function required<T>(value:T|null|undefined,reason:string):T{if(value===null||value===undefined)fail(reason);return value;}
function scope(input:Scope){
 if(!/^\d{4}$/u.test(input.symbol)||!Number.isInteger(input.year)||input.year<2013||input.year>2200
  ||input.quarter!==undefined&&(!Number.isInteger(input.quarter)||input.quarter<1||input.quarter>4))fail('scope_invalid');
 return input;
}
function elements(node:Tree.Node,tag:string):Tree.Element[]{
 if(!('childNodes' in node))return [];
 return node.childNodes.flatMap(child=>'tagName' in child&&child.tagName===tag?[child,...elements(child,tag)]:elements(child,tag));
}
function attribute(node:Tree.Element,name:string){return node.attrs.find(attr=>attr.name===name)?.value;}
function content(node:Tree.Node):string{
 if('value' in node&&node.nodeName==='#text')return node.value;
 if('tagName' in node&&node.tagName==='br')return ' ';
 return 'childNodes' in node?node.childNodes.map(content).join(''):'';
}
const label=(node:Tree.Node)=>content(node).normalize('NFKC').trim().replace(/\s+/gu,' ');
function classed(node:Tree.Element,name:string){return (attribute(node,'class')||'').split(/\s+/u).includes(name);}
function cells(row:Tree.Element){return row.childNodes.filter((node):node is Tree.Element=>'tagName' in node&&(node.tagName==='td'||node.tagName==='th'));}
function rows(table:Tree.Element){
 // Nested table cells are irrelevant to this report's direct rows.
 const result:Tree.Element[]=[];
 for(const child of table.childNodes){
  if(!('tagName' in child))continue;
  if(child.tagName==='tr')result.push(child);
  if(['thead','tbody','tfoot'].includes(child.tagName))for(const row of child.childNodes)if('tagName' in row&&row.tagName==='tr')result.push(row);
 }
 return result.map(cells);
}
function unique<T>(values:T[],reason:string):T{if(values.length!==1)fail(reason);return values[0];}
function html(body:string){
 if(typeof body!=='string'||!body||Buffer.byteLength(body)>MAX_BYTES)fail('html_size_invalid');
 return parse(body,{scriptingEnabled:false});
}
function rocDate(raw:string,year:number){
 const match=/^(\d{3})\/(\d{2})\/(\d{2})$/u.exec(raw);
 const calendarYear=match?Number(match[1])+1911:0;
 if(!match||(calendarYear!==year&&calendarYear!==year-1))fail('published_date_invalid');
 const result=calendarYear+'-'+match[2]+'-'+match[3],date=new Date(result+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==result)fail('published_date_invalid');
 return result;
}
function namedInput(form:Tree.Element,name:string){
 return attribute(unique(elements(form,'input').filter(input=>attribute(input,'name')===name),'form_identity_invalid'),'value');
}

/** Reads the exposed filing listing. It never interprets a filter or an
 * executable script from the remote page as authority. */
export function parseMopsSimpleForecastIndex(body:string,input:Scope):Release|null{
 const {symbol,year}=scope(input);
 const form=unique(elements(html(body),'form').filter(form=>attribute(form,'name')==='fm'),'form_missing');
 if(attribute(form,'action')!=='/mops/web/ajax_t163sb10'||namedInput(form,'co_id')!==symbol)fail('listing_symbol_mismatch');
 const marketCode=namedInput(form,'TYPEK');
 if(marketCode!=='sii'&&marketCode!=='otc')fail('listed_market_unavailable');
 const tables=elements(form,'table');
 const section=unique(tables.filter(t=>rows(t).some(row=>row.length===1&&label(row[0])===SIMPLE_LIST)),'simple_listing_missing');
 const next=tables[tables.indexOf(section)+1];
 if(!next)return null;
 const [header,...entries]=rows(next);
 const names=header?.map(label)||[];
 if(names.join('|')!=='第X次|預測類別|編製基礎|季別|公告日期|')fail('listing_columns_changed');
 const requestedMask=forecastMask(input);
 const scoped=entries.flatMap(row=>{
  if(row.length!==6)fail('listing_row_shape_changed');
  const disclosure=label(row[3]);
  const selected=QUARTER_CODES.flatMap((token,i)=>disclosure.split('、').includes(token)?[(i+1) as Quarter]:[]);
  if(!selected.length||selected.map(quarter=>QUARTER_CODES[quarter-1]).join('、')!==disclosure)fail('listing_period_unavailable');
  const mask=coverageMask(selected);
  return mask===requestedMask?[{row,mask,selected}]:[];
 });
 if(!scoped.length)return null;
 if(scoped.length!==1)fail('multiple_or_revised_filings_need_reconciliation');
 const {row,mask,selected}=scoped[0];
 if(label(row[0])!=='0'||label(row[1])!=='原編')fail('multiple_or_revised_filings_need_reconciliation');
 if(label(row[2])!=='合併')fail('filing_variant_unsupported');
 const button=unique(elements(row[5],'input').filter(input=>attribute(input,'type')==='button'),'filing_locator_missing');
 const expected='document.fm.step.value="3";document.fm.sstep.value="1";document.fm.SEQ_NO.value="0";document.fm.year.value="'+(year-1911)+'";document.fm.DURS.value="'+mask+'";openWindow(this.form ,"");';
 if(attribute(button,'onclick')!==expected)fail('filing_locator_mismatch');
 return {market:MARKET[marketCode],marketCode,publishedDate:rocDate(label(row[4]),year),sequence:0,coverageMask:mask,coveredQuarters:selected};
}
function coverageMask(quarters:readonly Quarter[]){
 return QUARTER_NUMBERS.map(quarter=>quarters.includes(quarter)?'1':'0').join('');
}
function forecastMask(input:Scope){
 return input.quarter===undefined?'1111':coverageMask([input.quarter]);
}
function decimal(text:string){
 if(!/^[+-]?\d{1,7}(?:\.\d{1,6})?$/u.test(text))fail('eps_number_invalid');
 const value=Number(text);
 return Object.is(value,-0)?0:value;
}
function parseEps(text:string):PeriodValue{
 const parts=text.split('~').map(value=>value.trim());
 if(parts.length===1)return {kind:'point',value:decimal(parts[0])};
 if(parts.length!==2)fail('eps_range_invalid');
 const [low,high]=parts.map(decimal);
 if(low>high)fail('eps_range_inverted');
 return {kind:'range',low,high};
}

/** This is an issuer's directly disclosed EPS rather than a derived number.
 * This form supplies no typed share basis or forecast denominator. */
export function parseMopsSimpleForecastDetail(body:string,input:Scope,index:Release){
 const {year}=scope(input),tables=elements(html(body),'table');
 const mask=forecastMask(input);
 const throughQuarter=input.quarter??4;
 if(index.coverageMask!==mask||coverageMask(index.coveredQuarters)!==mask
  ||index.coveredQuarters.length!==(input.quarter===undefined?4:1))fail('detail_scope_mismatch');
 const declaredCoverage=QUARTERS.map((quarter,i)=>(mask[i]==='1'?'●':'○')+quarter).join('');
 const header=unique(tables.filter(t=>rows(t).some(row=>row.some(cell=>classed(cell,'reportName')&&label(cell)===ORIGINAL_TITLE))),'detail_original_heading_missing');
 const headerCells=rows(header).flat();
 const issuerName=label(unique(headerCells.filter(cell=>classed(cell,'compName')),'detail_issuer_missing'));
 const headerText=label(unique(headerCells.filter(cell=>classed(cell,'reportCont')),'detail_identity_missing'));
 if(!issuerName||issuerName.length>160||headerText!=='年度:'+(year-1911)+' 財測序號:0')fail('detail_identity_mismatch');
 const metadata=unique(tables.filter(t=>rows(t).some(row=>row[0]&&label(row[0])==='6.財務預測公告日期')),'detail_metadata_missing');
 const field=(name:string)=>label(required(unique(rows(metadata).filter(row=>row[0]&&label(row[0])===name),'detail_field_missing')[1],'detail_field_missing'));
 if(field('1.財務預測型態')!=='簡式'||field('2.財務預測所屬年度')!==String(year-1911)
  ||field('3.財務預測涵蓋期間')!==declaredCoverage
  ||rocDate(field('6.財務預測公告日期'),year)!==index.publishedDate)fail('detail_scope_mismatch');
 const data=unique(tables.filter(t=>rows(t).some(row=>row[0]&&label(row[0])==='每股稅後盈餘')),'eps_table_missing_or_ambiguous');
 const units=tables[tables.indexOf(data)-1];
 if(!units||!rows(units).some(row=>row.length===1&&label(row[0])==='單位:新台幣仟元'))fail('currency_unavailable');
 const records=rows(data);
 const headings=records[0]?.map(label)||[];
 if(headings.length!==throughQuarter+2||headings[0]!==''||headings.at(-1)!=='合計'
  ||QUARTERS.slice(0,throughQuarter).some((quarter,i)=>!headings[i+1].startsWith(quarter+'(註一) ')))fail('eps_columns_changed');
 const eps=unique(records.filter(row=>row[0]&&label(row[0])==='每股稅後盈餘'),'eps_row_ambiguous');
 if(eps.length!==throughQuarter+2||eps.slice(1).some(cell=>cell.tagName!=='td'||attribute(cell,'colspan')||attribute(cell,'rowspan')))fail('eps_row_shape_changed');
 const periods=eps.slice(1,-1).map((cell,i)=>({quarter:(i+1) as Quarter,eps:parseEps(label(cell))}));
 const total=parseEps(label(eps.at(-1)!));
 return {issuerName,year,unit:'TWD_per_share' as const,classification:'issuer_disclosed_forecast' as const,
  shareBasis:null,denominatorShares:null,quarters:periods.filter(row=>index.coveredQuarters.includes(row.quarter)),
  comparativeQuarters:periods.filter(row=>!index.coveredQuarters.includes(row.quarter)),
  annual:mask==='1111'?total:null,displayedCumulative:mask==='1111'?null:{throughQuarter,eps:total}};
}
async function capture(params:Record<string,string>,transport:typeof fetch):Promise<CapturedHtml>{
 const response=await transport(ENDPOINT,{method:'POST',redirect:'error',cache:'no-store',headers:{referer:PAGE,'content-type':'application/x-www-form-urlencoded','user-agent':'StockInsider MOPS forecast reader'},
  body:new URLSearchParams(params),signal:AbortSignal.timeout(12000)});
 if(!response.ok||response.url!==ENDPOINT||!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')||!response.body)fail('response_unavailable');
 const reader=response.body.getReader(),hash=createHash('sha256'),utf8=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,body='';
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done)break;
   bytes+=chunk.value.byteLength;
   if(bytes>MAX_BYTES){await reader.cancel();fail('response_too_large');}
   hash.update(chunk.value);
   body+=utf8.decode(chunk.value,{stream:true});
  }
 }finally{reader.releaseLock();}
 body+=utf8.decode();
 return {body,sha256:hash.digest('hex'),bytes,acquiredAt:new Date().toISOString()};
}

/** Read-only archive intake. The acquired clock belongs to this capture, so
 * the old announcement date cannot qualify it for a historical cutoff. */
export async function readMopsSimpleForecast(input:Scope,transport=fetch){
 const {symbol,year}=scope(input),cohort={firstin:'1',isnew:'false',co_id:symbol,year:String(year-1911)};
 const listing=await capture({...cohort,TYPEK:'all',step:'1',off:'1',keyword4:'',code1:'',TYPEK2:'',checkbtn:'',queryName:'co_id',t05st29_c_ifrs:'N',t05st30_c_ifrs:'N',inpuType:'co_id'},transport);
 const filing=parseMopsSimpleForecastIndex(listing.body,input);
 if(filing===null)return null;
 const detail=await capture({...cohort,TYPEK:filing.marketCode,step:'3',sstep:'1',SEQ_NO:'0',DURS:filing.coverageMask,FOR_TYP:'',PU_DATE:''},transport);
 const {body:listingBody,...listingReceipt}=listing,{body:detailBody,...detailReceipt}=detail;
 const observation=parseMopsSimpleForecastDetail(detailBody,input,filing);
 const captureDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(detail.acquiredAt));
 if(filing.publishedDate>captureDate)fail('announcement_after_capture');
 return {schemaVersion:'vnext-mops-simple-forecast-capture-v2' as const,symbol,market:filing.market,coveredQuarters:filing.coveredQuarters,publishedDate:filing.publishedDate,knownAt:detail.acquiredAt,
  sourcePage:PAGE,listingReceipt,detailReceipt,observation,original:{listing:listingBody,detail:detailBody}};
}
