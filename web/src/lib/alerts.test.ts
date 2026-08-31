import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpsAlertBody } from './alerts.ts';

const payload = {
  level: 'critical' as const,
  title: 'StockInsider monitor: shadow_session_missing',
  message: 'No qualifying shadow observation was recorded.',
  context: { session: '2026-08-31' },
};

test('Slack Incoming Webhooks receive the required human-readable text field', () => {
  const body = buildOpsAlertBody('https://hooks.slack.com/services/example', payload);
  assert.equal(body.source, 'stockinsider');
  assert.equal(body.text, '[CRITICAL] StockInsider monitor: shadow_session_missing: No qualifying shadow observation was recorded.');
  assert.deepEqual(body.context, { session: '2026-08-31' });
});

test('generic receivers retain the structured StockInsider alert payload', () => {
  const body = buildOpsAlertBody('https://alerts.example.test/ingest', payload);
  assert.equal('text' in body, false);
  assert.equal(body.title, payload.title);
  assert.equal(body.message, payload.message);
  assert.deepEqual(body.context, payload.context);
});
