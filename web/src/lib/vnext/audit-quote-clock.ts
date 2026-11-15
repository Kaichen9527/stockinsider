/** Temporal validation only: these fields do not grant quote/price authority. */
import {isHistoryDate} from '../candidate-price-history.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {taipeiDate} from './policy.ts';
export const AUDIT_QUOTE_CLOCK_VERSION='vnext-audit-quote-clock-v1' as const;
export function quoteClock(input:{observedAt?:string|null;availableAt?:string|null},cutoff:string){
 const observed=evidenceInstant(input.observedAt),available=evidenceInstant(input.availableAt),end=evidenceInstant(cutoff);
 if(observed===null||available===null||end===null||observed>available||available>end)return null;
 const canonical=(at:bigint)=>{
  const fraction=((at%BigInt(1000000))+BigInt(1000000))%BigInt(1000000);
  return new Date(Number((at-fraction)/BigInt(1000))).toISOString().replace(/\.000Z$/u,`.${String(fraction).padStart(6,'0')}Z`);
 };
 return {observedAt:canonical(observed),availableAt:canonical(available)};
}
/** A valuation date is civil metadata, never a midnight observation instant. */
export function civilDateKnownAt(value:unknown,cutoff:string){
 return isHistoryDate(value)&&evidenceInstant(cutoff)!==null&&value<=taipeiDate(cutoff);
}
