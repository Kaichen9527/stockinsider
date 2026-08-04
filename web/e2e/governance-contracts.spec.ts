import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET || '';
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY && INTERNAL_TOKEN);
const admin = hasEnv
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function tpeDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function nowIso() {
  return new Date().toISOString();
}

async function postInternal(request: APIRequestContext, path: string, data: Record<string, unknown> = {}) {
  return request.post(path, {
    headers: {
      authorization: `Bearer ${INTERNAL_TOKEN}`,
      'content-type': 'application/json',
    },
    data,
  });
}

async function cleanupForSymbols(symbols: string[], sourceKeys: string[]) {
  if (!admin || symbols.length === 0) return;
  const stockRes = await admin.from('stocks').select('id,symbol').in('symbol', symbols);
  const stockRows = stockRes.data || [];
  const stockIds = stockRows.map((row) => String(row.id || '')).filter(Boolean);

  if (stockIds.length > 0) {
    const storyRes = await admin.from('story_candidates').select('id').in('stock_id', stockIds);
    const storyIds = (storyRes.data || []).map((row) => String(row.id || '')).filter(Boolean);
    const recRes = await admin.from('recommendations').select('id').in('stock_id', stockIds);
    const recommendationIds = (recRes.data || []).map((row) => String(row.id || '')).filter(Boolean);

    if (recommendationIds.length > 0) {
      await admin.from('strategy_actions').delete().in('recommendation_id', recommendationIds);
      await admin.from('recommendations').delete().in('id', recommendationIds);
    }
    if (storyIds.length > 0) {
      await admin.from('research_memos').delete().in('story_candidate_id', storyIds);
      await admin.from('valuation_cases').delete().in('story_candidate_id', storyIds);
      await admin.from('story_evidence_items').delete().in('story_candidate_id', storyIds);
      const taskRes = await admin.from('agent_review_queue').select('id,agent_task_id').contains('evidence', { story_candidate_id: storyIds[0] }).limit(50);
      if (taskRes.data && taskRes.data.length > 0) {
        await admin.from('agent_review_queue').delete().in('id', taskRes.data.map((row) => String(row.id)));
      }
      await admin.from('story_candidates').delete().in('id', storyIds);
    }

    await admin.from('company_events').delete().in('stock_id', stockIds);
    await admin.from('conference_transcripts').delete().in('stock_id', stockIds);
    await admin.from('revenue_signals').delete().in('stock_id', stockIds);
    await admin.from('fundamental_snapshots').delete().in('stock_id', stockIds);
    await admin.from('institutional_signals').delete().in('stock_id', stockIds);
    await admin.from('social_signals').delete().in('stock_id', stockIds);
    await admin.from('broker_report_documents').delete().in('stock_id', stockIds);
    await admin.from('stock_signals').delete().in('stock_id', stockIds).eq('source', 'governance-test');
    await admin.from('stocks').delete().in('id', stockIds);
  }

  if (sourceKeys.length > 0) {
    await admin.from('source_review_queue').delete().in('source_key', sourceKeys);
    await admin.from('source_health_checks').delete().in('source_key', sourceKeys);
    await admin.from('source_registry').delete().in('source_key', sourceKeys);
  }

  await admin.from('market_snapshots').delete().eq('source', 'governance-test');
}

async function seedStory(params: {
  symbol: string;
  name: string;
  includeCompanyEvidence?: boolean;
  includePublicEvidence?: boolean;
  bullishSocial?: boolean;
  bearishSocial?: boolean;
  includeBrokerValuation?: boolean;
}) {
  if (!admin) throw new Error('admin client unavailable');
  const asOfDate = tpeDate();
  const timestamp = new Date(Date.now() + 60_000).toISOString();
  const stockRes = await admin
    .from('stocks')
    .upsert(
      {
        symbol: params.symbol,
        market: 'TW',
        name: params.name,
        sector: 'Governance Test',
        updated_at: nowIso(),
      },
      { onConflict: 'symbol,market' },
    )
    .select('id,symbol')
    .single();
  if (stockRes.error || !stockRes.data) throw new Error(stockRes.error?.message || 'failed seeding stock');
  const stockId = String(stockRes.data.id);

  await admin.from('market_snapshots').insert({
    market: 'TW',
    as_of: timestamp,
    source: 'governance-test',
    source_key: `market.governance.${params.symbol.toLowerCase()}`,
    sector_flows: { ai: 0.72 },
    index_state: { trend_score: 0.71 },
    freshness_status: 'fresh',
    source_timestamp: timestamp,
  });

  await admin.from('stock_signals').insert({
    stock_id: stockId,
    as_of: timestamp,
    source: 'governance-test',
    source_key: `stock.governance.${params.symbol.toLowerCase()}`,
    price: 102,
    volume: 1200000,
    ma_short: 99,
    ma_mid: 98,
    ma_long: 95,
    rsi: 58,
    macd: 1.4,
    macd_signal: 0.9,
    chip_metrics: { foreign_net_buy: 1200 },
    technical_meta: {},
    freshness_status: 'fresh',
    source_timestamp: timestamp,
  });

  const storyRes = await admin
    .from('story_candidates')
    .upsert(
      {
        stock_id: stockId,
        story_type: 'conference_guidance',
        title: `${params.name} governance story`,
        summary: `${params.name} 測試用 story，驗證治理 contract。`,
        catalyst_summary: '治理測試催化',
        thesis_state: 'signal_candidate',
        confidence: 0.5,
        novelty_score: 0.5,
        evidence_score: 0.1,
        timing_score: 0,
        source_mix: [],
        related_themes: ['governance-test'],
        discovered_at: timestamp,
        as_of_date: asOfDate,
        updated_at: timestamp,
      },
      { onConflict: 'stock_id,story_type,as_of_date' },
    )
    .select('id')
    .single();
  if (storyRes.error || !storyRes.data) throw new Error(storyRes.error?.message || 'failed seeding story');

  if (params.includeCompanyEvidence) {
    await admin.from('company_events').insert({
      stock_id: stockId,
      event_type: 'conference',
      headline: `${params.name} 法說更新`,
      summary: '公司正式提供正向展望。',
      source_url: 'https://mops.twse.com.tw/',
      event_timestamp: timestamp,
      extracted_signals: { outlook: 'positive' },
    });
    await admin.from('revenue_signals').upsert({
      stock_id: stockId,
      as_of_date: asOfDate,
      monthly_revenue: 1000000000,
      yoy_growth: 21,
      mom_growth: 4,
      source_url: 'https://mops.twse.com.tw/',
    });
    await admin.from('fundamental_snapshots').upsert({
      stock_id: stockId,
      as_of_date: asOfDate,
      eps_ttm: 8.4,
      gross_margin: 42,
      operating_margin: 19,
      pe_ratio: 14,
      pb_ratio: 2.1,
      revenue_run_rate: 12000000000,
      source_url: 'https://mops.twse.com.tw/',
    });
  }

  if (params.includePublicEvidence) {
    await admin.from('institutional_signals').insert({
      stock_id: stockId,
      source: 'governance-public-research',
      source_key: `institutional.governance.${params.symbol.toLowerCase()}`,
      report_title: `${params.name} 公開研究`,
      expectation_score: 0.81,
      thesis_summary: '公開研究支持原始 thesis。',
      source_timestamp: timestamp,
      ingested_at: timestamp,
      freshness_status: 'fresh',
    });
  }

  if (params.includeBrokerValuation) {
    await admin.from('broker_report_documents').upsert(
      {
        stock_id: stockId,
        broker_name: 'Governance Broker',
        report_date: asOfDate,
        file_name: `${params.symbol}-governance.pdf`,
        file_path: `governance-test/${params.symbol}-${asOfDate}.pdf`,
        source_mode: 'public_summary',
        rating: 'Buy',
        target_price: 135,
        thesis_title: `${params.name} broker valuation`,
        extracted_summary: '券商目標價高於現價，可作為正式 valuation source。',
        raw_text: 'governance valuation seed',
        metadata: { test: true },
        updated_at: nowIso(),
      },
      { onConflict: 'file_path' },
    );
  }

  if (params.bullishSocial) {
    await admin.from('social_signals').insert({
      stock_id: stockId,
      source_type: 'Threads',
      source_name: 'Governance Test Threads',
      source_key: `social.governance.${params.symbol.toLowerCase()}.bull`,
      sentiment_label: 'bullish',
      confidence: 0.88,
      mention_count: 18,
      summary: '社群出現看多討論。',
      source_timestamp: timestamp,
      ingested_at: timestamp,
      freshness_status: 'fresh',
      source_url: 'https://threads.net/',
    });
  }

  if (params.bearishSocial) {
    await admin.from('social_signals').insert({
      stock_id: stockId,
      source_type: 'Threads',
      source_name: 'Governance Test Bearish Threads',
      source_key: `social.governance.${params.symbol.toLowerCase()}.bear`,
      sentiment_label: 'bearish',
      confidence: 0.93,
      mention_count: 12,
      summary: '社群出現高信度反證。',
      source_timestamp: new Date(Date.now() + 120_000).toISOString(),
      ingested_at: timestamp,
      freshness_status: 'fresh',
      source_url: 'https://threads.net/',
    });
  }

  return {
    stockId,
    storyId: String(storyRes.data.id),
    asOfDate,
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(!hasEnv, 'Governance contract tests require Supabase service env and internal auth.');
});

test('published recommendation keeps story/evidence/valuation/report traceability', async ({ request }) => {
  const symbol = `ZG${randomUUID().slice(0, 6).toUpperCase()}`;
  await cleanupForSymbols([symbol], []);
  try {
    const seeded = await seedStory({
      symbol,
      name: 'Governance Positive',
      includeCompanyEvidence: true,
      includePublicEvidence: true,
      bullishSocial: true,
      includeBrokerValuation: true,
    });

    expect((await postInternal(request, '/api/internal/story-verify', { dryRun: false })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-refresh', { dryRun: false, symbols: [symbol] })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-rank', { dryRun: false })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/report-build', { dryRun: false })).ok()).toBeTruthy();

    const storyRes = await admin!.from('story_candidates').select('thesis_state').eq('id', seeded.storyId).single();
    expect(storyRes.error).toBeNull();
    expect(['validated_thesis', 'actionable_setup']).toContain(String(storyRes.data?.thesis_state));

    const recRes = await admin!
      .from('recommendations')
      .select('id,recommendation_state,published_at,is_blocked')
      .eq('stock_id', seeded.stockId)
      .eq('as_of', seeded.asOfDate)
      .single();
    expect(recRes.error).toBeNull();
    expect(['validated_thesis', 'actionable_setup']).toContain(String(recRes.data?.recommendation_state));
    expect(recRes.data?.published_at).toBeTruthy();
    expect(recRes.data?.is_blocked).toBeFalsy();

    const evidenceRes = await admin!.from('story_evidence_items').select('id', { count: 'exact', head: true }).eq('story_candidate_id', seeded.storyId);
    const valuationRes = await admin!.from('valuation_cases').select('id', { count: 'exact', head: true }).eq('story_candidate_id', seeded.storyId);
    expect((evidenceRes.count || 0) > 0).toBeTruthy();
    expect((valuationRes.count || 0) >= 3).toBeTruthy();

    const memoSlug = `deep-dive-${symbol.toLowerCase()}-${seeded.asOfDate}`;
    const memoRes = await admin!.from('research_memos').select('story_candidate_id,entry_exit_rules').eq('slug', memoSlug).single();
    expect(memoRes.error).toBeNull();
    expect(String(memoRes.data?.story_candidate_id || '')).toBe(seeded.storyId);
    expect(Array.isArray((memoRes.data?.entry_exit_rules as { traceability?: { storyCandidateIds?: string[] } })?.traceability?.storyCandidateIds)).toBeTruthy();
  } finally {
    await cleanupForSymbols([symbol], []);
  }
});

test('social-only evidence cannot promote into final recommendation', async ({ request }) => {
  const symbol = `ZS${randomUUID().slice(0, 6).toUpperCase()}`;
  await cleanupForSymbols([symbol], []);
  try {
    const seeded = await seedStory({
      symbol,
      name: 'Governance Social Only',
      bullishSocial: true,
    });

    expect((await postInternal(request, '/api/internal/story-verify', { dryRun: false })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-refresh', { dryRun: false, symbols: [symbol] })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-rank', { dryRun: false })).ok()).toBeTruthy();

    const storyRes = await admin!.from('story_candidates').select('thesis_state').eq('id', seeded.storyId).single();
    expect(storyRes.error).toBeNull();
    expect(['signal_candidate', 'partially_verified']).toContain(String(storyRes.data?.thesis_state));

    const recRes = await admin!
      .from('recommendations')
      .select('recommendation_state,published_at,is_blocked,block_reason')
      .eq('stock_id', seeded.stockId)
      .eq('as_of', seeded.asOfDate)
      .maybeSingle();
    if (recRes.data) {
      expect(['signal_candidate', 'partially_verified']).toContain(String(recRes.data.recommendation_state));
      expect(recRes.data.published_at).toBeFalsy();
      expect(recRes.data.is_blocked).toBeTruthy();
    }
  } finally {
    await cleanupForSymbols([symbol], []);
  }
});

test('contradictions enter review queue and internal agent guard rejects unmapped profiles', async ({ request }) => {
  const symbol = `ZC${randomUUID().slice(0, 6).toUpperCase()}`;
  const sourceKey = `source.governance.${randomUUID().slice(0, 8)}`;
  await cleanupForSymbols([symbol], [sourceKey]);
  try {
    const seeded = await seedStory({
      symbol,
      name: 'Governance Contradiction',
      includeCompanyEvidence: true,
      includePublicEvidence: true,
      bullishSocial: true,
      bearishSocial: true,
    });

    expect((await postInternal(request, '/api/internal/story-verify', { dryRun: false })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-refresh', { dryRun: false, symbols: [symbol] })).ok()).toBeTruthy();
    expect((await postInternal(request, '/api/internal/thesis-rank', { dryRun: false })).ok()).toBeTruthy();

    const storyRes = await admin!.from('story_candidates').select('thesis_state').eq('id', seeded.storyId).single();
    expect(storyRes.error).toBeNull();
    expect(String(storyRes.data?.thesis_state)).toBe('review');

    const reviewRes = await admin!
      .from('agent_review_queue')
      .select('reason,evidence')
      .contains('evidence', { story_candidate_id: seeded.storyId })
      .order('created_at', { ascending: false })
      .limit(5);
    expect(reviewRes.error).toBeNull();
    expect((reviewRes.data || []).some((row) => String(row.reason || '').includes('contradictory'))).toBeTruthy();

    await admin!.from('source_registry').upsert({
      source_key: sourceKey,
      source_type: 'social',
      status: 'review',
      risk_level: 'high',
      metadata: { trigger: 'governance-test' },
      updated_at: nowIso(),
    });
    await admin!.from('source_review_queue').insert({
      source_key: sourceKey,
      reason: 'synthetic_source_drift',
      evidence: { test: true },
      state: 'pending',
    });

    const governanceRes = await request.get('/api/internal/governance-check', {
      headers: { authorization: `Bearer ${INTERNAL_TOKEN}` },
    });
    expect(governanceRes.status()).toBe(200);
    const governanceJson = await governanceRes.json();
    expect(governanceJson.ok).toBe(true);
    expect(governanceJson.result.routeMappings.hotRadarCanonicalWindow).toBe('three_day');
    expect(Number(governanceJson.result.reviewQueues.pendingSourceReviews || 0) >= 1).toBeTruthy();

    const invalidGuard = await request.post('/api/internal/agent-guard-check', {
      headers: {
        authorization: `Bearer ${INTERNAL_TOKEN}`,
        'content-type': 'application/json',
      },
      data: {
        profileKey: 'agency-agents/testing-api-tester',
        agentRole: 'Evidence Verifier Agent',
      },
    });
    expect(invalidGuard.status()).toBe(403);

    const validGuard = await request.post('/api/internal/agent-guard-check', {
      headers: {
        authorization: `Bearer ${INTERNAL_TOKEN}`,
        'content-type': 'application/json',
      },
      data: {
        profileKey: 'agency-agents/testing-evidence-collector',
        agentRole: 'Evidence Verifier Agent',
      },
    });
    expect(validGuard.status()).toBe(200);
    const validJson = await validGuard.json();
    expect(validJson.ok).toBe(true);
    expect(validJson.result.publishRecommendationsDirectly).toBe(false);
  } finally {
    await cleanupForSymbols([symbol], [sourceKey]);
  }
});
