import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];
const appUrl = String(process.env.APP_URL || '').replace(/\/$/u, '');
const apiKey = String(process.env.INTERNAL_API_KEY || '');
if (!inputPath || !/^https?:\/\//u.test(appUrl) || !apiKey) throw new Error('input, APP_URL and INTERNAL_API_KEY are required');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
if (!Array.isArray(input.batches) || input.batches.length < 1) throw new Error('invalid_backfill_bundle');
let accepted = 0;
for (const batch of input.batches) {
  const response = await fetch(`${appUrl}/api/internal/official-market-index-backfill`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error(`backfill_batch_failed:${response.status}:${JSON.stringify(result)}`);
  accepted += Number(result.result?.accepted || 0);
}
process.stdout.write(`${JSON.stringify({ batches: input.batches.length, accepted })}\n`);
