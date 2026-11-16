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

/** Called only inside the existing writer lease. The DB chooses its current
 * Taipei slot and compares both source heads before recording a session. */
export async function synchronizeScheduledLaunchCalendar(identity: VnextIdentity) {
 if(identity.role!=='operator'||!identity.principal)throw Error('vnext_operator_calendar_required');
 const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
 const writer=await requireActiveVpsWriter();
 if(!writer.ok)throw Error('launch_scheduled_calendar_writer_unavailable');
 const {data,error}=await writer.supabase.rpc('vnext_launch_sync_scheduled_calendar_v1',{
  p_principal:identity.principal,p_writer_release:writer.releaseId,
 });
 if(error||!data||!['deferred','ready','synced'].includes(data.status)) {
  throw Error('launch_scheduled_calendar_unavailable');
 }
 return data.status!=='deferred';
}
