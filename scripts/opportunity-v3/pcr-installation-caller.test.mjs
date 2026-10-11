import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runRuntimeInstallation } from '../runtime/runtime-installation-gate.mjs';

const require = createRequire(import.meta.url);
const { canonicalJson, sha256 } = require('../runtime/codec.js');
const { TRACKED_RUNTIME_PATHS } = require('../runtime/tracked-runtime-bundle.js');
const { REVIEW_PATH, PCR_PATH, ATTESTATION_PATH } = require('../runtime/reviewed-runtime-release.js');
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

test('PCR-001 actual installation caller resolves real Git lineage before preparing owned files', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-pcr001-test-only-'));
  const fixture = path.join(temporary, 'repository');
  const stage = path.join(temporary, 'stage');
  mkdirSync(fixture);
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: fixture, encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: temporary, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  const save = (filename, bytes) => {
    const target = path.join(fixture, filename);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes, { mode: 0o644 });
  };
  const commit = (message) => {
    git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-m', message);
    return git('rev-parse', 'HEAD').trim();
  };
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Isolated PCR test fixture');
    git('config', 'user.email', 'pcr-fixture@example.invalid');
    save('README.md', 'Synthetic installer fixture; never production review authority.\n');
    const baseSha = commit('test-only base');
    const paths = [...TRACKED_RUNTIME_PATHS, 'config/runtime/auth-source-dag.json'];
    for (const filename of paths) {
      mkdirSync(path.dirname(path.join(fixture, filename)), { recursive: true });
      copyFileSync(path.join(repositoryRoot, filename), path.join(fixture, filename));
    }
    const sourceCommit = commit('test-only tracked source');
    const treeSha = git('rev-parse', `${sourceCommit}^{tree}`).trim();
    // These three artifacts exercise the existing resolver's protocol in this
    // disposable repository only. They are not a real release/PCR attestation.
    const review = 'TEST-ONLY synthetic review fixture; no real release approval.\n';
    const attestation = { schema: 'stockinsider-exact-review-attestation-v1', baseSha,
      headSha: sourceCommit, treeSha, range: `${baseSha}..${sourceCommit}`, verdict: 'PASS',
      p0: 0, p1: 0, evidenceSha256: sha256(Buffer.from(review)), reviewedAt: '2026-10-11T08:00:00Z' };
    const attestationBytes = `${canonicalJson(attestation)}\n`;
    save(REVIEW_PATH, review);
    save(PCR_PATH, `${canonicalJson({ fixtureOnly: true })}\n`);
    save(ATTESTATION_PATH, attestationBytes);
    const attestationCommit = commit('test-only three-artifact direct child');
    const members = TRACKED_RUNTIME_PATHS.map((filename) => {
      const bytes = readFileSync(path.join(fixture, filename));
      return [filename, bytes.length, sha256(bytes)];
    });
    const manifest = { schema: 'stockinsider-runtime-installation-v1.1', commitSha: sourceCommit,
      reviewedTreeSha: treeSha, reviewAttestationSha256: sha256(Buffer.from(attestationBytes)),
      worker: { repositoryPath: 'scripts/runtime/auth-source-worker-cli.js',
        sha256: sha256(Buffer.from(canonicalJson({ schema: 'stockinsider-tracked-runtime-bundle-v1', members }))) },
      config: { repositoryPath: 'config/runtime/auth-source-dag.json',
        sha256: sha256(readFileSync(path.join(fixture, 'config/runtime/auth-source-dag.json'))) },
      installedAt: '2026-10-11T08:00:00Z', schedulerRollback: {
        releasePath: 'scheduler-rollback-package.json', sha256: 'a'.repeat(64),
        capturedAt: '2026-10-11T08:00:00Z', priorOwnerCount: 3 }, rollback: null };
    const calls = [];
    const filesystem = {
      stage: async (validated) => {
        calls.push('stage');
        assert.equal(validated.commitSha, sourceCommit);
        mkdirSync(stage);
        writeFileSync(path.join(stage, 'manifest.json'), canonicalJson(validated));
      },
      verifyStaged: async (validated) => {
        calls.push('verify');
        assert.equal(readFileSync(path.join(stage, 'manifest.json'), 'utf8'), canonicalJson(validated));
      },
    };
    // No scheduler, activation grant or database is supplied. The actual caller
    // and installer must take their normal prepare-only path.
    const input = { repositoryRoot: fixture, sourceCommit, attestationCommit, manifest, filesystem };
    const result = await runRuntimeInstallation(input);
    assert.deepEqual(result, { disposition: 'prepared', manifestSha256: sha256(canonicalJson(manifest)) });
    assert.deepEqual(calls, ['stage', 'verify']);
    calls.length = 0;
    assert.throws(() => runRuntimeInstallation({ ...input, reviewedRelease: {} }), /caller_reviewed_release_forbidden/u);
    await assert.rejects(runRuntimeInstallation({ ...input,
      manifest: { ...manifest, worker: { ...manifest.worker, sha256: '0'.repeat(64) } } }),
    { code: 'staged_hash_mismatch' });
    assert.throws(() => runRuntimeInstallation({ ...input, sourceCommit: baseSha }),
      { code: 'attestation_commit_not_direct_child' });
    // A sibling with an otherwise identical attestation plus a fourth file must
    // be rejected by actual Git diff inspection before filesystem callbacks.
    git('checkout', '--detach', sourceCommit);
    save(REVIEW_PATH, review); save(PCR_PATH, `${canonicalJson({ fixtureOnly: true })}\n`);
    save(ATTESTATION_PATH, attestationBytes); save('unexpected.txt', 'extra diff\n');
    const extraDiff = commit('test-only invalid fourth artifact');
    assert.throws(() => runRuntimeInstallation({ ...input, attestationCommit: extraDiff }),
      { code: 'attestation_commit_has_extra_diff' });
    assert.deepEqual(calls, [], 'invalid lineage, hash or caller identity cannot stage files');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
