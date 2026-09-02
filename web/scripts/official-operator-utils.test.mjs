import assert from 'node:assert/strict';
import test from 'node:test';
import { monthCoordinates, parseTpexTradingDates, parseTwseTradingDates, readResponseTextWithin } from './official-operator-utils.mjs';

test('parses official TWSE and TPEx monthly trading dates', () => {
  assert.deepEqual(parseTwseTradingDates({ fields: ['日期','收盤指數'], data: [['114/01/02','1'],['114/01/03','2']] }), ['2025-01-02','2025-01-03']);
  assert.deepEqual(parseTpexTradingDates({ tables: [{ fields: ['日期','櫃買指數'], data: [['114/01/02',250],['114/01/03',251]] }] }), ['2025-01-02','2025-01-03']);
  assert.deepEqual(monthCoordinates('2026-09-01', 20), { compact: '20250101', slash: '2025/01/01', key: '2025-01' });
});

test('bounds official response body time and size', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('ok')); controller.close(); } }));
  assert.equal(await readResponseTextWithin(response, { timeoutMs: 50, maxBytes: 10 }), 'ok');
  const stalled = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x')); } }));
  await assert.rejects(readResponseTextWithin(stalled, { timeoutMs: 10, maxBytes: 10 }), /official_response_body_timeout/u);
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } }));
  await assert.rejects(readResponseTextWithin(oversized, { timeoutMs: 50, maxBytes: 10 }), /official_response_body_too_large/u);
});
