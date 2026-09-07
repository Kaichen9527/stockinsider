import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicNetworkAddress } from './pinned-https-fetch.ts';

test('pinned HTTPS address policy rejects private, bracketed, and mapped loopback addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.1.1', '172.16.0.1',
    '::1', '[::1]', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '[::ffff:7f00:1]']) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress('8.8.8.8'), true);
  assert.equal(isPublicNetworkAddress('2606:4700:4700::1111'), true);
});
