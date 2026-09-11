import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';
import { validatePendingOfficialFinancials } from '@/lib/official-financial-validation-worker';

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok:false,error:'unauthorized_internal_writer' }, { status:401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 10000) return NextResponse.json({ ok:false,error:'payload_too_large' }, { status:413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok:false,error:'invalid_json' }, { status:422 }); }
  const ids = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).join(',') === 'stockIds'
    ? (body as { stockIds:unknown }).stockIds : null;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 30 || ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id))) {
    return NextResponse.json({ ok:false,error:'invalid_stock_ids' }, { status:422 });
  }
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok:false,error:writer.error }, { status:409 });
  try {
    const result = await validatePendingOfficialFinancials(ids);
    return NextResponse.json({ ok:true,result,releaseId:writer.releaseId });
  } catch (error) {
    return NextResponse.json({ ok:false,error:error instanceof Error ? error.message : 'official_validation_failed' }, { status:500 });
  }
}
