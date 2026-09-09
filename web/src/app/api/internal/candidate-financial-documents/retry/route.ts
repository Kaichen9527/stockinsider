import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';
import { fixedRunnerPrincipal } from '@/lib/opportunity-v3/internal';

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ok:false,error:'exact_internal_bearer_required'},{status:401});
  const writer=await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ok:false,error:writer.error},{status:409});
  const body=await request.json().catch(()=>null);
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if(!body || Array.isArray(body) || Object.keys(body).sort().join(',')!=='receiptId,requestId'
    || typeof body.receiptId!=='string' || typeof body.requestId!=='string'
    || !uuid.test(body.receiptId) || !uuid.test(body.requestId)) return NextResponse.json({ok:false,error:'invalid_retry_request'},{status:422});
  const principal=fixedRunnerPrincipal();
  if(!principal) return NextResponse.json({ok:false,error:'runner_principal_missing'},{status:503});
  const result=await writer.supabase.rpc('retry_candidate_financial_document_runtime',{
    p_receipt_id:body.receiptId,p_request_id:body.requestId,p_caller_principal:principal,
  });
  if(result.error) return NextResponse.json({ok:false,error:'receipt_retry_rejected'},{status:409});
  return NextResponse.json({ok:true,queued:result.data===true,idempotentReplay:result.data===false},{headers:{'Cache-Control':'no-store'}});
}
