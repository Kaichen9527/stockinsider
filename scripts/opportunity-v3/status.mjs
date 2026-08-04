const baseUrl = process.env.OPPORTUNITY_V3_APP_URL;
const runId = process.env.OPPORTUNITY_V3_RUN_ID;
const bearer = process.env.INTERNAL_API_KEY;

function fail(blocker, nextAction) {
  process.stdout.write(JSON.stringify({
    protocol: 'source-led-opportunity-v3-status-v1',
    status: 'blocked',
    blocker,
    nextAction,
  }) + '\n');
  process.exitCode = 1;
}

if (!baseUrl || !runId || !bearer) {
  fail(
    'diagnostic_environment_incomplete',
    'set OPPORTUNITY_V3_APP_URL, OPPORTUNITY_V3_RUN_ID and INTERNAL_API_KEY',
  );
} else if (!/^https?:\/\/[^/]+$/u.test(baseUrl) || !/^[0-9a-f-]{36}$/u.test(runId)) {
  fail('diagnostic_input_invalid', 'use an origin-only URL and an RFC-4122 run UUID');
} else {
  const response = await fetch(
    `${baseUrl}/api/internal/opportunity-run/status/${runId}`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${bearer}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    },
  ).catch(() => null);
  if (!response) {
    fail('diagnostic_transport_failed', 'verify the target origin and network reachability');
  } else {
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const safeBody = body && typeof body === 'object' && !Array.isArray(body)
      ? Object.fromEntries(Object.entries(body).filter(([key]) =>
        ['runId', 'status', 'failureCode', 'canonicalRunId', 'error'].includes(key)))
      : null;
    process.stdout.write(JSON.stringify({
      protocol: 'source-led-opportunity-v3-status-v1',
      status: response.ok ? 'pass' : 'blocked',
      httpStatus: response.status,
      runId,
      result: safeBody,
      nextAction: response.ok
        ? 'inspect status/failureCode; never mutate rows directly'
        : 'verify deployment state, bearer ownership and run identity',
    }) + '\n');
    process.exitCode = response.ok ? 0 : 1;
  }
}
