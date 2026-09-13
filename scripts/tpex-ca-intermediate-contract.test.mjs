import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../deployment/vps/install-tpex-ca-intermediate.sh', import.meta.url), 'utf8');

test('TPEx CA repair keeps TLS verification enabled and pins the official intermediate', () => {
  assert.match(script, /--proto '=https'/u);
  assert.match(script, /expected_fingerprint=01:AF:23:24:D0:98:09:8F/u);
  assert.match(script, /openssl verify -CApath \/etc\/ssl\/certs/u);
  assert.match(script, /update-ca-certificates/u);
  assert.doesNotMatch(script, /(?:^|\s)(?:-k|--insecure)(?:\s|$)/mu);
});
