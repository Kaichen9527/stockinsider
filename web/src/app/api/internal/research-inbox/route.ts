import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { buildResearchInboxRow, validateResearchInboxItem } from '@/lib/research-inbox';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease';

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
  let leaseOwner: string | null;
  try {
    leaseOwner = await acquireProductionWriteLease(3_600);
  } catch {
    return NextResponse.json({ ok: false, error: 'production_writer_lease_unavailable' }, { status: 503 });
  }
  if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_writer_busy' }, { status: 409 });
  let status = 500;
  let result: Record<string, unknown> = { ok: false, error: 'research_inbox_write_failed' };
  try {
    const db = getSupabaseServerClient();
    const { data, error } = await db.from('source_raw_documents').upsert(rows, {
      onConflict: 'platform,document_url',
      ignoreDuplicates: true,
    }).select('id,document_url');
    if (error) result = { ok: false, error: error.message };
    else {
      status = 200;
      result = {
        ok: true,
        accepted: data?.length || 0,
        received: rows.length,
        revisions: (data || []).map((row) => ({ id: row.id, documentUrl: row.document_url })),
        authSource: auth.authSource,
      };
    }
  } catch {
    result = { ok: false, error: 'research_inbox_write_failed' };
  } finally {
    try {
      await releaseProductionWriteLease(leaseOwner);
    } catch {
      // A successful write is not a successful whole operation if ownership
      // cleanup is unconfirmed. Preserve an existing database failure instead.
      result = status === 200
        ? { ok: false, error: 'production_writer_release_failed', writeMayHaveSucceeded: true }
        : { ...result, cleanupError: 'production_writer_release_failed' };
      status = 500;
    }
  }
  return NextResponse.json(result, { status });
}
