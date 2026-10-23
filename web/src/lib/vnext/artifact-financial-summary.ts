import type {Artifact,Evidence,Claim} from './research.ts';
const epsUnits=new Set(['TWD_per_share','TWD/share']); // explicit producer/test units; no implicit conversion
function civil(value:unknown){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
/** Summary values cannot smuggle unreviewed numbers around the per-claim validator.
 * This validates support and dates, never actual prose semantics or entry authority. */
export function artifactFinancialSummary(a:Partial<Artifact>,evidence:Evidence[]){
 const reasons:string[]=[];const claims=Array.isArray(a.claims)?a.claims:[];
 const available=evidence.map(e=>Date.parse(e.availableAt)).filter(Number.isFinite);const knownDay=available.length?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Math.max(...available))):null;
 if(!civil(a.quoteDate) || !civil(a.valuationDate) || !knownDay || a.quoteDate!>knownDay || a.valuationDate!>knownDay)reasons.push('summary_dates_not_original_asof');
 const cited=(c:Claim)=>evidence.filter(e=>c.evidenceIds.includes(e.id));
 if(typeof a.annualEps==='number' && !claims.some(c=>c.kind==='fact' && c.numeric?.key==='annual_eps' && c.numeric.value===a.annualEps && epsUnits.has(c.numeric.unit) && /^\d{4}$/u.test(c.numeric.period) && Number(c.numeric.period)<=Number(knownDay?.slice(0,4)) && cited(c).some(e=>e.kind==='fact' && e.sourceTier==='official' && e.key==='annual_eps' && e.unit===c.numeric!.unit && e.period===c.numeric!.period && e.value===a.annualEps)))reasons.push('annual_eps_summary_unbound');
 if(typeof a.nextFourQuarterEps==='number' && !claims.some(c=>{
  if(c.kind!=='assumption' || c.numeric?.key!=='next_four_quarter_eps' || c.numeric.value!==a.nextFourQuarterEps || !epsUnits.has(c.numeric.unit))return false;
  const range=/^(\d{4})-Q([1-4])\/(\d{4})-Q([1-4])$/u.exec(c.numeric.period);if(!range || !knownDay)return false;
  const start=Number(range[1])*4+Number(range[2])-1,end=Number(range[3])*4+Number(range[4])-1,current=Number(knownDay.slice(0,4))*4+Math.floor((Number(knownDay.slice(5,7))-1)/3);
  return end-start===3 && start>=current && cited(c).some(e=>e.kind==='assumption' && e.key==='next_four_quarter_eps' && e.unit===c.numeric!.unit && e.period===c.numeric!.period && e.value===a.nextFourQuarterEps);
 }))reasons.push('next_four_quarter_eps_summary_unbound');
 const quotes=evidence.filter(e=>e.key==='current_price');
 if(quotes.length){if(!quotes.some(e=>e.kind==='fact' && e.sourceTier==='official' && ['TWD','TWD_per_share','TWD/share'].includes(String(e.unit)) && typeof e.value==='number' && Number.isFinite(e.value) && e.value>0 && e.period===a.quoteDate && civil(e.period)))reasons.push('quote_date_not_actual_price_period');}
 else if(!a.gaps?.includes('quote_authority_missing'))reasons.push('quote_authority_gap_hidden');
 return reasons;
}
