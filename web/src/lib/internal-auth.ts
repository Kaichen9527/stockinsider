import { timingSafeEqual } from 'node:crypto';

export type InternalAuthResult =
  | { ok: true; authSource: 'internal_api_key' | 'cron_secret' | 'research_review_key' | 'strategy_approval_key' | 'research_test_key' }
  | { ok: false; status: number; error: string };

function secureTokenEquals(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function requireInternalAuth(req: Request, options: { allowResearchReviewer?: boolean; allowStrategyApprover?: boolean; allowResearchTester?: boolean } = {}): InternalAuthResult {
  const expected = ([
    { source: 'internal_api_key' as const, value: process.env.INTERNAL_API_KEY },
    { source: 'cron_secret' as const, value: process.env.CRON_SECRET },
    ...(options.allowResearchReviewer && process.env.RESEARCH_REVIEW_KEY
      && process.env.RESEARCH_REVIEW_KEY !== process.env.INTERNAL_API_KEY
      && process.env.RESEARCH_REVIEW_KEY !== process.env.CRON_SECRET
      ? [{ source: 'research_review_key' as const, value: process.env.RESEARCH_REVIEW_KEY }] : []),
    ...(options.allowStrategyApprover && process.env.STRATEGY_APPROVAL_KEY
      && ![process.env.INTERNAL_API_KEY, process.env.CRON_SECRET, process.env.RESEARCH_REVIEW_KEY,
        process.env.RESEARCH_TEST_KEY].includes(process.env.STRATEGY_APPROVAL_KEY)
      ? [{ source: 'strategy_approval_key' as const, value: process.env.STRATEGY_APPROVAL_KEY }] : []),
    ...(options.allowResearchTester && process.env.RESEARCH_TEST_KEY
      && ![process.env.INTERNAL_API_KEY, process.env.CRON_SECRET, process.env.RESEARCH_REVIEW_KEY,
        process.env.STRATEGY_APPROVAL_KEY].includes(process.env.RESEARCH_TEST_KEY)
      ? [{ source: 'research_test_key' as const, value: process.env.RESEARCH_TEST_KEY }] : []),
  ]).filter((row): row is { source: 'internal_api_key' | 'cron_secret' | 'research_review_key' | 'strategy_approval_key' | 'research_test_key'; value: string } => Boolean(row.value));
  if (expected.length === 0) {
    return { ok: false, status: 500, error: 'INTERNAL_API_KEY/CRON_SECRET not configured' };
  }

  const header = req.headers.get('authorization') || req.headers.get('x-internal-key') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const match = token ? expected.find(({ value }) => secureTokenEquals(token, value)) : null;
  if (!match) {
    return { ok: false, status: 401, error: 'unauthorized internal request' };
  }

  return { ok: true, authSource: match.source };
}

export function requireExactInternalBearer(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  const authorization = request.headers.get('authorization');
  return Boolean(expected && authorization?.startsWith('Bearer ')
    && secureTokenEquals(authorization.slice(7), expected) && !request.headers.has('x-internal-key')
    && requireInternalAuth(request).ok);
}

/** A separate review principal is required before research can grant entry eligibility. */
export function requireIndependentResearchReviewer(request: Request): boolean {
  const header = request.headers.get('authorization');
  const auth = requireInternalAuth(request, { allowResearchReviewer: true });
  return Boolean(process.env.INTERNAL_API_KEY && auth.ok && auth.authSource === 'research_review_key'
    && header?.startsWith('Bearer ') && !request.headers.has('x-internal-key'));
}
