import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBoundedOfficialCurlOutput } from './bounded-official-curl-fetch.ts';

test('bounded curl output separates an exact terminal HTTP status from JSON', () => {
  assert.deepEqual(
    parseBoundedOfficialCurlOutput('[{"證券代號":"2330"}]\n__STOCKINSIDER_STATUS__:200'),
    { body: '[{"證券代號":"2330"}]', status: 200 },
  );
});

test('bounded curl output rejects a missing or malformed status marker', () => {
  assert.throws(() => parseBoundedOfficialCurlOutput('[]'), /official_curl_status_missing/u);
  assert.throws(
    () => parseBoundedOfficialCurlOutput('[]\n__STOCKINSIDER_STATUS__:ok'),
    /official_curl_status_invalid/u,
  );
});

test('bounded curl transport contract keeps official range chunks under the response ceiling', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('./bounded-official-curl-fetch.ts', import.meta.url),
    'utf8',
  ));
  assert.match(source, /const RANGE_CHUNK_BYTES = 200_000/u);
  assert.match(source, /'--range', `\$\{offset\}-\$\{end\}`/u);
  assert.match(source, /offset \+ parsed\.body\.byteLength > MAX_BODY_BYTES/u);
  assert.match(source, /responseStatus === 206 \? 200 : responseStatus/u);
});
