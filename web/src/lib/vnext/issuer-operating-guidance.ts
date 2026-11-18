import {createHash} from 'node:crypto';
import {calculateEarningsBridge,type EarningsBridgeInput} from './earnings-bridge.ts';

const MEDIATEK={
 symbol:'2454',
 period:'2026-Q4',
 eventDate:'2026-10-30',
 url:"https://www.mediatek.com/hubfs/MediaTek-Assets/Pdfs/Quarterly%20Earnings%20Release/2026/Quarterly%20Earnings%20Release-2026Q3/Transcript.pdf",
 sha256:'991c4a867a06803b8c02db4c89e058b937902a47634cc89e2869310782342a9c',
 page:4,
 pageCount:15,
} as const;
const MAX_TRANSCRIPT_BYTES=512*1024;

type Interval={low:number;high:number};
type Guidance={revenueTwd:Interval;grossMarginBps:Interval;expenseRatioBps:Interval};
const scopedText=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,' ').trim();
const hashBytes=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
function fail(reason:string):never{throw Error('vnext_issuer_operating_guidance_'+reason);}

function decimals(value:string,scale:number){
 const match=/^(\d{1,5})(?:\.(\d{1,3}))?$/u.exec(value);
 if(!match||(match[2]?.length||0)>scale)fail('decimal_precision_unsupported');
 return Number(match[1])*10**scale+Number((match[2]||'').padEnd(scale,'0'));
}
function only(text:string,expression:RegExp){
 const matches=[...text.matchAll(expression)];
 if(matches.length!==1)fail('paragraph_ambiguous_or_incomplete');
 return matches[0];
}
function percentInterval(center:string,delta:string):Interval{
 const base=decimals(center,2),variance=decimals(delta,2);
 return {low:base-variance,high:base+variance};
}

/** Extract only the forward operating guidance block from its allowlisted PDF page. */
export function parseQuarterOperatingGuidance(pageText:string){
 const page=scopedText(pageText);
 if(!page||page.length>24000)fail('page_text_unavailable');
 const revenue=only(page,/\bfourth quarter revenue\b[^.]{0,76}?\bNT\$\s*(\d+(?:\.\d+)?)\s+billion(?: dollars)?\s+to\s+NT\$\s*(\d+(?:\.\d+)?)\s+billion/giu);
 const margin=only(page,/\bgross margin is forecasted at\s+(\d+(?:\.\d+)?)\s*%,\s*plus or minus\s+(\d+(?:\.\d+)?)\s+percentage points/giu);
 const expense=only(page,/\boperating expense ratio is forecasted at\s+(\d+(?:\.\d+)?)\s*%,\s*plus or minus\s+(\d+(?:\.\d+)?)\s+percentage points/giu);
 const end=expense.index+expense[0].length;
 if(revenue.index>=margin.index||margin.index>=expense.index||end-revenue.index>560)fail('mixed_guidance_sections');
 const guidance:Guidance={revenueTwd:{low:decimals(revenue[1],9),high:decimals(revenue[2],9)},
  grossMarginBps:percentInterval(margin[1],margin[2]),expenseRatioBps:percentInterval(expense[1],expense[2])};
 return {guidance,locator:{normalization:'NFKC-space-v1',normalizedPageSha256:hashBytes(page),
  startCodePoint:[...page.slice(0,revenue.index)].length,endCodePoint:[...page.slice(0,end)].length}};
}

function interval(value:Interval,min:number,max:number){
 if(!Number.isSafeInteger(value.low)||!Number.isSafeInteger(value.high)||value.low<min||value.high>max||value.low>value.high)fail('range_invalid');
}
function midpoint(value:Interval){
 const sum=BigInt(value.low)+BigInt(value.high);
 if(sum%BigInt(2)!==BigInt(0))fail('midpoint_precision_unsupported');
 return Number(sum/BigInt(2));
}
function operatingScenario(revenueTwd:number,grossMarginBps:number,expenseRatioBps:number){
 const operatingMarginBps=grossMarginBps-expenseRatioBps;
 const product=BigInt(revenueTwd)*BigInt(operatingMarginBps);
 if(product%BigInt(10000)!==BigInt(0))fail('operating_income_precision_unsupported');
 return {revenueTwd,grossMarginBps,expenseRatioBps,operatingMarginBps,operatingIncomeTwd:Number(product/BigInt(10000))};
}
/** Point and independent-interval sensitivities. All arithmetic uses integer
 * TWD and basis points, with rounding outside the closure refused. */
export function calculateGuidedOperatingScenarios({revenueTwd,grossMarginBps,expenseRatioBps}:Guidance){
 interval(revenueTwd,1,Number.MAX_SAFE_INTEGER);
 interval(grossMarginBps,0,10000);
 interval(expenseRatioBps,0,10000);
 const lowRevenueForBear=grossMarginBps.low>=expenseRatioBps.high;
 const highRevenueForBull=grossMarginBps.high>=expenseRatioBps.low;
 return {
  method:'independent_endpoint_sensitivity_v1' as const,class:'calculated_operating_income_sensitivity' as const,
  bear:operatingScenario(lowRevenueForBear?revenueTwd.low:revenueTwd.high,grossMarginBps.low,expenseRatioBps.high),
  base:operatingScenario(midpoint(revenueTwd),midpoint(grossMarginBps),midpoint(expenseRatioBps)),
  bull:operatingScenario(highRevenueForBull?revenueTwd.high:revenueTwd.low,grossMarginBps.high,expenseRatioBps.low),
  eps:null,forwardPe:null,targetPriceTwd:null,
  gaps:['net_nonoperating_income_missing','tax_basis_missing','common_shareholder_attribution_missing','forecast_weighted_shares_missing','valuation_multiple_missing'],
 };
}

type Case = 'bear' | 'base' | 'bull';
export type GuidedEarningsAssumptions = Partial<Record<Case, {
  shareBasis: EarningsBridgeInput['shareBasis'];
  operands: Omit<EarningsBridgeInput['operands'], 'operatingIncome'>;
}>>;

async function captureTranscript(transport:typeof fetch){
 const response=await transport(MEDIATEK.url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok||response.url!==MEDIATEK.url||!/^application\/pdf(?:;|$)/iu.test(response.headers.get('content-type')||'')||!response.body)fail('transcript_unavailable');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];
 let bytes=0;
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done)break;
   bytes+=chunk.value.length;
   if(bytes>MAX_TRANSCRIPT_BYTES){await reader.cancel();fail('transcript_too_large');}
   chunks.push(chunk.value);
  }
 }finally{reader.releaseLock();}
 const raw=Buffer.concat(chunks,bytes);
 const sha256=hashBytes(raw);
 if(raw.subarray(0,5).toString('ascii')!=='%PDF-'||sha256!==MEDIATEK.sha256)fail('transcript_revision_unverified');
 return {raw,sha256,bytes,knownAt:new Date().toISOString()};
}

export async function readMediaTekQ4OperatingGuidance(transport=fetch, assumptions: GuidedEarningsAssumptions = {}){
 const {raw,...receipt}=await captureTranscript(transport);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=getDocument({data:new Uint8Array(raw),isEvalSupported:false,useWasm:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true});
 try{
  const pdf=await loading.promise;
  if(pdf.numPages!==MEDIATEK.pageCount)fail('transcript_page_count_changed');
  const page=await pdf.getPage(MEDIATEK.page);
  const text=await page.getTextContent();
  const {guidance,locator}=parseQuarterOperatingGuidance(text.items.map(item=>'str' in item?item.str:'').join(' '));
  const operatingScenarios=calculateGuidedOperatingScenarios(guidance);
  const scope={symbol:MEDIATEK.symbol,periodStart:'2026-10-01',periodEnd:'2026-12-31'};
  const cases=['bear','base','bull'] as const;
  if(!assumptions || typeof assumptions!=='object' || Array.isArray(assumptions)
    || Object.keys(assumptions).some(key=>!cases.includes(key as Case)))fail('earnings_assumptions_invalid');
  const forCase=(key:Case)=>{
   const supplied=assumptions[key];
   if(supplied!==undefined && (!supplied || !['basic','diluted'].includes(supplied.shareBasis) ||
     !supplied.operands || Array.isArray(supplied.operands) || typeof supplied.operands!=='object' ||
     Object.hasOwn(supplied.operands,'operatingIncome')))fail('earnings_assumptions_invalid');
   return calculateEarningsBridge({...scope,periodKind:'fiscal_quarter',classification:'modeled_scenario',
    shareBasis:supplied?.shareBasis??'diluted',cutoff:receipt.knownAt,operands:{
     ...supplied?.operands, operatingIncome:{...scope,value:operatingScenarios[key].operatingIncomeTwd,unit:'TWD',
      basis:'issuer_guidance',knownAt:receipt.knownAt,sourceSha256:receipt.sha256,sourceRef:'mediatek-2026-q3-earnings-call:p4'},
    }});
  };
  const earningsBridge=Object.fromEntries(cases.map(key=>[key,forCase(key)]));
  return {schemaVersion:'vnext-issuer-operating-guidance-v1',symbol:MEDIATEK.symbol,period:MEDIATEK.period,eventDate:MEDIATEK.eventDate,
   source:{url:MEDIATEK.url,...receipt,locator:{page:MEDIATEK.page,...locator}},sourceClass:'company_disclosed_guidance',
   guidance,operatingScenarios,earningsBridge};
 }finally{await loading.destroy();}
}
