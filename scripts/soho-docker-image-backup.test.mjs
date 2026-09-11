import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonical, loadSohoImagePolicy, validateSohoImagePolicy, SOHO_VPS_HOST } from './soho-image-policy.mjs';
import { verifyLoadedSohoImages } from './verify-soho-docker-image-backup.mjs';

test('SOHO retention manifest is exact, disjoint and protects every retained identity', async () => {
  const { policy, candidateRefs, protectedRefs, policySha256 } = await loadSohoImagePolicy();
  assert.equal(policy.host, SOHO_VPS_HOST);
  assert.equal(candidateRefs.length, 8);
  assert.equal(protectedRefs.length, 41);
  assert.equal(Object.keys(policy.externallyAbsentBeforeVerifiedArchive).length, 3);
  assert.equal(Object.keys(policy.externallyRemovedProtectedAliases).length, 3);
  assert.match(policySha256, /^[0-9a-f]{64}$/u);
  assert.equal(new Set([...candidateRefs, ...protectedRefs,
    ...Object.keys(policy.externallyAbsentBeforeVerifiedArchive),
    ...Object.keys(policy.externallyRemovedProtectedAliases)]).size, 55);
  assert.throws(() => validateSohoImagePolicy({ ...policy,
    obsoleteCandidates: { ...policy.obsoleteCandidates,
      [candidateRefs[0]]: Object.values(policy.current)[0] } }), /soho_candidate_image_is_protected/u);
});

test('isolated docker load verification binds refs, config digests, platform and layers', () => {
  const expected = [{ ref: 'soho-rollback/soho-web:20260910T231911Z',
    imageId: `sha256:${'a'.repeat(64)}`, configDigest: `sha256:${'a'.repeat(64)}`,
    configJsonSha256: '', architecture: 'amd64', os: 'linux',
    rootFsLayers: [`sha256:${'b'.repeat(64)}`] }];
  const inspected = [{ Id: `sha256:${'c'.repeat(64)}`, RepoTags: [expected[0].ref],
    RepoDigests: [`soho-rollback/soho-web@${expected[0].imageId}`],
    Architecture: 'amd64', Os: 'linux', RootFS: { Layers: expected[0].rootFsLayers } }];
  expected[0].configJsonSha256 = 'unused-because-repo-digest-is-preserved';
  assert.equal(verifyLoadedSohoImages(expected, inspected), true);
  const config = { Env: ['NODE_ENV=production'], Labels: { service: 'api' } };
  expected[0].configJsonSha256 = createHash('sha256').update(canonical(config)).digest('hex');
  assert.equal(verifyLoadedSohoImages(expected,
    [{ ...inspected[0], RepoDigests: [], Config: config }]), true);
  assert.throws(() => verifyLoadedSohoImages(expected,
    [{ ...inspected[0], RepoTags: ['soho-rollback/soho-web:other'] }]),
  /loaded_soho_image_identity_mismatch/u);
  assert.throws(() => verifyLoadedSohoImages(expected,
    [{ ...inspected[0], RootFS: { Layers: [`sha256:${'c'.repeat(64)}`] } }]),
  /loaded_soho_image_identity_mismatch/u);
});

test('remote exporter is read-only and exact while verifier cannot reach production Docker', async () => {
  const remote = await readFile(new URL('./remote-soho-docker-save.py', import.meta.url), 'utf8');
  const exporter = await readFile(new URL('./export-soho-docker-image-backup.mjs', import.meta.url), 'utf8');
  const verifier = await readFile(new URL('./verify-soho-docker-image-backup.mjs', import.meta.url), 'utf8');
  assert.match(remote, /exact_candidate_set_required/u);
  assert.match(remote, /"image", "save"/u);
  assert.doesNotMatch(remote, /\b(?:rmi|rm|prune|tag)\b/u);
  assert.match(exporter, /SOHO_VPS_HOST/u);
  assert.match(exporter, /ServerAliveInterval=15/u);
  assert.match(exporter, /ServerAliveCountMax=3/u);
  assert.match(exporter, /plaintextStoredOnMac: false/u);
  assert.match(exporter, /productionMutationPerformed: false/u);
  assert.doesNotMatch(verifier, /root@|\/usr\/bin\/ssh/u);
  assert.match(verifier, /\['image', 'rm', \.\.\.candidateRefs\]/u);
  assert.doesNotMatch(verifier, /\['(?:system|image|builder)', 'prune'/u);
});
