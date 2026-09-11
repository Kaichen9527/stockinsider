import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { sourceExecutionPolicy } from '@/lib/source-policy';

export async function GET(request:Request) {
  const auth=requireInternalAuth(request);
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  const db=getSupabaseServerClient();
  const [credential,mentions,documents,lastDocument,ledger]=await Promise.all([
    db.from('source_credentials_registry').select('status,metadata,last_validated_at').eq('platform','threads').maybeSingle(),
    db.from('candidate_source_mentions').select('id',{count:'exact',head:true}).eq('platform','threads'),
    db.from('source_raw_documents').select('id',{count:'exact',head:true}).eq('platform','threads'),
    db.from('source_raw_documents').select('collected_at').eq('platform','threads').order('collected_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('source_run_ledger').select('attempted_at,succeeded_at,fetched,matched,written,terminal_reason').eq('connector','threads').order('attempted_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if([credential,mentions,documents,lastDocument,ledger].some(r=>r.error))return NextResponse.json({ok:false,error:'threads_readiness_read_failed'},{status:503});
  const metadata=credential.data?.metadata||{};
  const expired=!metadata.expires_at || !Number.isFinite(Date.parse(metadata.expires_at)) || Date.parse(metadata.expires_at)<=Date.now();
  const receipt=metadata.non_self_public_search_canary;
  const observedAt=Date.parse(receipt?.observedAt || '');
  const canary=!expired && credential.data?.status==='valid' && /^[0-9a-f]{64}$/u.test(metadata.token_hash || '')
    && receipt?.tokenHash===metadata.token_hash && Number.isFinite(observedAt)
    && observedAt<=Date.now() && Date.now()-observedAt<=30*86400000
    && /^[0-9a-f]{64}$/u.test(receipt?.publicPostIdHash || '') && /^[0-9a-f]{64}$/u.test(receipt?.selfUsernameHash || '');
  return NextResponse.json({ok:true,readiness:{
    credential:{status:expired?'missing_or_expired':credential.data?.status||'missing',validatedAt:credential.data?.last_validated_at||null,expiresAt:metadata.expires_at||null},
    permissions:{status:canary?'public_search_verified':'unverified'},
    publicSearch:{status:canary?'verified':'canary_pending'},
    scheduler:{status:sourceExecutionPolicy('threads').disposition,reason:sourceExecutionPolicy('threads').terminalReason},
    ingestion:{candidateMentions:mentions.count,historicalDocuments:documents.count,lastDocumentAt:lastDocument.data?.collected_at||null,lastRun:ledger.data||null},
  }},{headers:{'Cache-Control':'private, no-store'}});
}
