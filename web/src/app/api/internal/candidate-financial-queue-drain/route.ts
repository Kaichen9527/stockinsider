import {handleFinancialDataPreparation} from '@/lib/vnext/financial-preparation';
export const runtime='nodejs';
/** Dedicated private preparation in BOTH modes, before any generic research
 * dispatch. Missing reviewed DB bridge blocks before acquisition/persistence. */
export async function POST(request:Request){
 return Reflect.apply(handleFinancialDataPreparation,undefined,[request,'acquire']);
}
