import {cachedAdmissionBody,currentReceiptBody} from './cached-admission.ts';
import { NextResponse } from 'next/server';
import { vnextEnabled } from './policy.ts';
import { cacheContent, command, executeResearch, publishMarket, publishResearch, readResearchPreparation, resumeResearchPreparation, submitAuthor, submitReview, swap } from './store.ts';
import { vnextIdentity } from './auth.ts';
import { boundedRequestBody } from './request.ts';
type Row = Record<string, unknown>;
/** Called before legacy parsing, reads, queue mutations, financial IO or models. */
export async function vnextRoute(request: Request, entrypoint: string) {
  if (!vnextEnabled()) return null;
  const identity = vnextIdentity(request);
  if (!identity) return NextResponse.json({ ok: false, error: 'vnext_configured_role_bearer_required' }, { status: 401 });
  try {
    const body = await boundedRequestBody(request) as Row;
    if (Array.isArray(body.symbols) && body.symbols.length === 0) {
      return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result: { jobs: [], reason: 'empty_scope', expensiveCalls: 0 } });
    }
    const action = entrypoint === 'vnext-research' ? String(body.action || 'enqueue')
      : entrypoint === 'candidate-dossier-outbox' && body.jobId ? 'claim'
      : entrypoint === 'candidate-dossier-submission' && body.artifact ? 'author'
      : entrypoint === 'candidate-dossier-bundle' && body.jobId ? 'bundle' : 'enqueue';
    if(action==='preparation-read' || action==='resume-preparation'){
      if(identity.role!=='author')throw new Error('vnext_author_required');
      const result=action==='preparation-read'?await readResearchPreparation(identity,body):await resumeResearchPreparation(identity,body);
      return NextResponse.json({ok:true,policyVersion:'stockinsider-vnext-20-v1',result});
    }
    if (action === 'automatic' || action === 'recover') {
      if (identity.role !== 'author') throw new Error('vnext_author_required');
      if (Object.keys(body).some((key) => !['action', 'jobId'].includes(key)) || typeof body.jobId !== 'string') throw new Error('vnext_worker_job_id_only');
      const worker = await import('./automatic-worker.ts');
      const result = action === 'automatic' ? await worker.runAutomaticResearch(body.jobId) : await worker.recoverAutomaticResearch(body.jobId);
      return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result });
    }
    if(action==='source-withdraw' || action==='source-withdraw-read'){
      if(identity.role!=='operator')throw new Error('vnext_operator_required');
      const {action:_action,...payload}=body;void _action;
      const withdrawal=await import('./source-withdrawal.ts');
      const result=action==='source-withdraw'?await withdrawal.commitSourceWithdrawal(identity,payload):await withdrawal.readSourceWithdrawal(identity,payload);
      return NextResponse.json({ok:true,policyVersion:'stockinsider-vnext-20-v1',result});
    }
    if (['source-extract','operator-claim','market-interpret','market-recover'].includes(action)) {
      if(identity.role!=='operator') throw new Error('vnext_operator_required');
      const allowed=action==='operator-claim'?['action','claim']:action==='market-recover'?['action','invocationId']:['action'];
      if(Object.keys(body).some((key)=>!allowed.includes(key)))throw new Error('vnext_analysis_closed_body');
      let result:Row;
      if(action==='source-extract')result=await(await import('./source-worker.ts')).runPermittedSourceWorker(identity);
      else if(action==='operator-claim')result=await(await import('./source-worker.ts')).recordOperatorClaim(identity,body);
      else {if(action==='market-recover' && (typeof body.invocationId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(body.invocationId)))throw new Error('vnext_market_invocation_id_required');result=await(await import('./market-ai-worker.ts')).runMarketInterpretation(identity,action==='market-recover'?String(body.invocationId):undefined);}
      return NextResponse.json({ok:true,policyVersion:'stockinsider-vnext-20-v1',result});
    }
    if(['screen','weekly-audit','dispatch','cycle'].includes(action)){
      if(identity.role!=='operator')throw new Error('vnext_operator_required');
      if(Object.keys(body).some((key)=>key!=='action'))throw new Error('vnext_cycle_closed_body');
      const result=action==='dispatch'?await(await import('./research-dispatcher.ts')).dispatchResearchQueue(identity)
        :action==='cycle'?await(await import('./research-cycle.ts')).runPostcloseResearchCycle(identity)
        :await(await import('./weekly-worker.ts')).runWeeklyThesisAudit(identity,{screen:action==='screen'});
      return NextResponse.json({ok:true,policyVersion:'stockinsider-vnext-20-v1',result});
    }
    const role= ['enqueue','screen','swap','market','content','retry','expire'].includes(action)?'operator':['author','bundle','claim','fail','execute'].includes(action)?'author':['review','publish','review-claim','review-sources'].includes(action)?'reviewer':null;
    if(role && identity.role!==role)throw new Error(`vnext_${role}_required`);
    if(!role)throw new Error('vnext_action_unsupported');
    if(action==='enqueue')cachedAdmissionBody(body);
    if(action==='content' && currentReceiptBody(body).length===0)return NextResponse.json({ok:true,policyVersion:'stockinsider-vnext-20-v1',result:{receipts:[],reason:'empty_scope',expensiveCalls:0}});
    const automaticScreen = action === 'screen';
    if (automaticScreen && identity.role !== 'operator') throw new Error('vnext_operator_required');
    const executeAction = async () => automaticScreen ? await (await import('./discovery.ts')).scanCachedCandidates(identity)
      : action === 'enqueue' ? await(await import('./cached-admission.ts')).enqueueCachedScope(identity,body)
      : action === 'author' ? await submitAuthor(identity, body)
      : action === 'review' ? await submitReview(identity, body)
      : action === 'publish' ? await publishResearch(identity, body)
      : action === 'bundle' ? await command(identity, 'author-context', { jobId: body.jobId, executionId: body.executionId })
      : action === 'execute' ? await executeResearch(identity, body)
      : action === 'swap' ? await swap(identity, body)
      : action === 'market' ? await publishMarket(identity, body)
      : action === 'content' ? await cacheContent(identity, body)
      : ['claim', 'fail', 'retry', 'review-claim', 'review-sources', 'review', 'publish', 'expire'].includes(action) ? await command(identity, action, body)
      : (() => { throw new Error('vnext_action_unsupported'); })();
    const result = action==='execute' ? await executeAction() : await(await import('./analysis-runtime.ts')).analysisWriter(async()=>{if(identity.role==='operator' && ['swap','retry','expire'].includes(action))await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);return executeAction();});
    return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'vnext_authority_unavailable' }, { status: 409 });
  }
}
