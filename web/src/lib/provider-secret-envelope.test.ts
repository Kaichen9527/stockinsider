import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptProviderSecret,decryptProviderSecret,type ProviderSecretIdentity} from './provider-secret-envelope.ts';
const identity:ProviderSecretIdentity={provider:'threads',credentialId:'11111111-1111-4111-8111-111111111111',generation:1,keyVersion:'v1'};
const plaintext=Buffer.from('test-provider-token-1234567890');
test('roundtrip is identity-bound and uses a fresh nonce for every encryption',()=>{
  const key=randomBytes(32), a=encryptProviderSecret(identity,plaintext,key), b=encryptProviderSecret(identity,plaintext,key);
  assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
  assert.equal(JSON.stringify(a).includes(plaintext.toString()),false);
  const recovered=decryptProviderSecret(a,identity,key);
  assert.deepEqual(recovered,plaintext);recovered.fill(0);key.fill(0);
});
test('wrong provider, owner, generation, key version and key cannot decrypt',()=>{
  const key=randomBytes(32), envelope=encryptProviderSecret(identity,plaintext,key);
  for(const expected of [{...identity,provider:'finmind' as const},{...identity,generation:2},
    {...identity,keyVersion:'v2'},{...identity,credentialId:'22222222-2222-4222-8222-222222222222'}]) {
    assert.throws(()=>decryptProviderSecret(envelope,expected,key),/^Error: provider_secret_invalid$/);
  }
  assert.throws(()=>decryptProviderSecret(envelope,identity,randomBytes(32)),/provider_secret_invalid/);
});
test('all ciphertext, tag, nonce and digest mutations fail without plaintext-bearing errors',()=>{
  const key=randomBytes(32), envelope=encryptProviderSecret(identity,plaintext,key);
  for(const field of ['iv','tag','ciphertext'] as const) {
    const original=Buffer.from(envelope[field],'base64');
    for(let i=0;i<original.length;i++){
      const changed=Buffer.from(original);changed[i]^=1;
      assert.throws(()=>decryptProviderSecret({...envelope,[field]:changed.toString('base64')},identity,key),/^Error: provider_secret_invalid$/);
    }
  }
  assert.throws(()=>decryptProviderSecret({...envelope,tokenSha256:'a'.repeat(64)},identity,key),/provider_secret_invalid/);
  assert.throws(()=>encryptProviderSecret(identity,Buffer.alloc(17000),key),/provider_secret_invalid/);
});
