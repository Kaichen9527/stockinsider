/** Current active-slot projection for all-active thesis audits, not a job claim.
 * Server-selected membership only; no caller symbol/clock/root/receipt authority. */
import type {getSupabaseServerClient} from '../supabase-server.ts';
import type {VnextIdentity} from './auth.ts';
import {validateCurrentForecasts,type CurrentForecasts} from './forecast-current.ts';
type Row=Record<string,unknown>;
export type ActiveForecasts={schemaVersion:'vnext-active-forecasts-v1';asOf:string;members:{symbol:string;inputHash:string;forecast:CurrentForecasts}[]};
export async function readActiveForecasts(client:Pick<ReturnType<typeof getSupabaseServerClient>,'rpc'>,identity:VnextIdentity):Promise<ActiveForecasts>{
 if(identity.role!=='operator'||!identity.principal)throw Error('vnext_forecast_operator_required');
 const response=await client.rpc('vnext_forecast_active_read_v1',{p_principal:identity.principal});
 if(response.error)throw Error('vnext_forecast_active_source_unavailable');
 const r=response.data as Row|null;
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join('|')!=='asOf|members|schemaVersion'||r.schemaVersion!=='vnext-active-forecasts-v1'||typeof r.asOf!=='string'||!Number.isFinite(Date.parse(r.asOf))||Date.parse(r.asOf)>Date.now()||!Array.isArray(r.members)||r.members.length>20)throw Error('vnext_forecast_active_shape');
 let previous='';const members=r.members.map(value=>{
  const m=value as Row|null;if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join('|')!=='forecast|inputHash|symbol'||typeof m.symbol!=='string'||!/^\d{4}$/u.test(m.symbol)||m.symbol<=previous||typeof m.inputHash!=='string'||!/^[a-f0-9]{64}$/u.test(m.inputHash))throw Error('vnext_forecast_active_binding');
  const forecast=validateCurrentForecasts(m.forecast);if(forecast.symbol!==m.symbol||forecast.asOf!==r.asOf)throw Error('vnext_forecast_active_binding');previous=m.symbol;return {symbol:m.symbol,inputHash:m.inputHash,forecast};
 });return {schemaVersion:'vnext-active-forecasts-v1',asOf:r.asOf,members};
}
