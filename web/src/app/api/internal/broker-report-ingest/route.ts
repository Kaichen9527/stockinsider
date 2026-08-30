import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  return NextResponse.json({
    ok: false,
    error: 'anue_broker_ingestion_retired',
    terminalReason: 'retired',
    replacementPolicy: 'authorized_api_user_owned_pdf_or_public_company_ir_only',
  }, { status: 410 });
}

export async function GET(req: Request) {
  return POST(req);
}
