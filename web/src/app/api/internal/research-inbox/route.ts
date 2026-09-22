import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { buildResearchInboxRow, validateResearchInboxItem } from '@/lib/research-inbox';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as { items?: unknown[] } | null;
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return NextResponse.json({ ok: false, error: 'items_must_contain_1_to_100_records' }, { status: 400 });
  }
  if (!body.items.every(validateResearchInboxItem)) {
    return NextResponse.json({ ok: false, error: 'research_inbox_item_invalid' }, { status: 400 });
  }
  const rows = body.items.map(buildResearchInboxRow);
  const db = getSupabaseServerClient();
  const { data, error } = await db.from('source_raw_documents').upsert(rows, {
    onConflict: 'platform,document_url',
    ignoreDuplicates: true,
  }).select('id,document_url');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    accepted: data?.length || 0,
    received: rows.length,
    revisions: (data || []).map((row) => ({ id: row.id, documentUrl: row.document_url })),
    authSource: auth.authSource,
  });
}

