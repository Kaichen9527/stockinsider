import type {VnextIdentity} from './auth.ts';
import {analysisWriter} from './analysis-runtime.ts';
/** Explicit isolated-scheduler entry. No schedule is enabled by this module. */
export async function runPostcloseResearchCycle(identity:VnextIdentity){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {command}=await import('./store.ts');const context=await analysisWriter(async()=>{await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);return command(identity,'screen-context',{});});
 if(context.completed!==true || context.postclose!==true)return {status:'deferred',reason:'completed_postclose_session_required',scheduleEnabled:false};
 const sources=await(await import('./source-window-worker.ts')).runSourceWindowWorker(identity);
 const market=await(await import('./market-ai-worker.ts')).runMarketInterpretation(identity);
 const audit=await(await import('./weekly-worker.ts')).runWeeklyThesisAudit(identity,{screen:true});
 const dispatch=await(await import('./research-dispatcher.ts')).dispatchResearchQueue(identity);
 // Publication changes the original thesis/revision. Recompute only shared
 // cache checklists; this epilogue cannot admit another update or call a model.
 const afterPublication=await(await import('./weekly-worker.ts')).runWeeklyThesisAudit(identity);
 return {sources,market,audit,dispatch,afterPublication,scheduleEnabled:false};
}
