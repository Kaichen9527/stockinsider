import type {VnextIdentity} from './auth.ts';
import {cachedAdmissionCommand} from './cached-admission.ts';
/** Only actual SQL-selected existing official calendar rows enter the ledger.
 * Caller dates, completed flags and source URLs never cross this seam. */
export async function synchronizeCachedCalendar(identity:VnextIdentity){
 if(identity.role!=='operator')throw new Error('vnext_operator_calendar_required');
 return cachedAdmissionCommand(identity,'sync-calendar',{});
}
/** For an already authenticated/admitted author execution. The service's
 * separately configured operator credential resolves through the same exact
 * role binding; no client principal or role is accepted. Caller owns one lease. */
export async function synchronizeExecutionCalendar(){
 const {vnextIdentity}=await import('./auth.ts');const key=process.env.INTERNAL_API_KEY;
 if(!key)throw new Error('vnext_operator_calendar_binding_missing');
 const identity=vnextIdentity(new Request('http://localhost/vnext-calendar-binding',{headers:{authorization:`Bearer ${key}`}}));
 if(identity?.role!=='operator')throw new Error('vnext_operator_calendar_binding_missing');
 return synchronizeCachedCalendar(identity);
}
