// Read-only source facts, not authority. Run after the final candidate commit;
// write the proposal outside the candidate tree to avoid a self-hash cycle.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, digest } from './host-recovery-packet.mjs';
const change = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const modelPaths = [`${change}/model-runner-host-pins-v3.json`, 'scripts/loop-model-runner-v3.js', 'scripts/model-runner-v3'];

export function recoverySourceFacts(repositoryRoot, predecessor, candidate) {
  for (const commit of [predecessor, candidate]) assert.match(commit, /^[a-f0-9]{40}$/u);
  const git = (...args) => execFileSync('/usr/bin/git', ['--no-replace-objects', '-C', repositoryRoot, ...args],
    { env: { PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1' }, maxBuffer: 32 * 1024 * 1024 });
  const text = (...args) => git(...args).toString('utf8').trim();
  const blob = (commit, name) => {
    const entry = text('ls-tree', commit, '--', name);
    assert.match(entry, /^100644 blob [a-f0-9]{40}\t/u, 'ordinary immutable source blob');
    assert.equal(entry.split('\t')[1], name);
    return git('cat-file', 'blob', `${commit}:${name}`);
  };
  const tuple = commit => {
    assert.equal(text('cat-file', '-t', commit), 'commit');
    return { commit, tree: text('rev-parse', `${commit}^{tree}`),
      listingSha256: digest(text('ls-tree', '-r', '--full-tree', commit, '--', ...modelPaths)) };
  };
  const catalogBytes = blob(candidate, `${change}/active-artifact-catalog-v3.json`);
  const catalog = JSON.parse(catalogBytes);
  const row = (name, relative) => {
    const bytes = blob(candidate, relative);
    return [name, text('rev-parse', `${candidate}:${relative}`), bytes.length, digest(bytes)];
  };
  const graph = ['opportunity-active-graph-v2', digest(catalogBytes),
    catalog.activeFiles.map(name => row(name, `${change}/${name}`)),
    (catalog.incorporatedFiles ?? []).map(name => row(name, name)),
    (catalog.historicalAuditFiles ?? []).map(name => row(name, name))];
  const fixtureBytes = blob(candidate, `${change}/model-runner-host-pins-v3.json`);
  const fixture = JSON.parse(fixtureBytes);
  const native = fixture.executables.find(({ name }) => name === 'codex');
  assert.ok(native);
  return { schema: 'stockinsider-host-recovery-source-facts-v1',
    status: 'unsigned_unapproved_candidate_facts', repository: 'Kaichen9527/stockinsider',
    predecessor: tuple(predecessor), candidate: tuple(candidate),
    activeGraphSha256: digest(canonical(graph)), hostFixtureSha256: digest(fixtureBytes),
    nativeIdentitySha256: digest(canonical({ native, bundle: fixture.codexBundle })),
    nativeIdentity: { native, bundle: fixture.codexBundle },
    recoveryVerifierSha256: digest(blob(candidate, 'scripts/opportunity-v3/host-recovery-packet.mjs')),
    permissionPolicySha256: digest(blob(candidate, 'scripts/model-runner-v3/codexAdapter.js')),
    missingAuthority: ['independently_installed_control_plane', 'external_trust_roots',
      'three_signed_independent_review_sources', 'owner_signed_exact_packet',
      'durable_predecessor_reservation', 'protected_base_worker_recovery', 'fresh_full_protected_checks'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [repositoryRoot, predecessor, candidate, output, ...extra] = process.argv.slice(2);
  assert.ok(repositoryRoot && predecessor && candidate && output && extra.length === 0,
    'usage: host-recovery-proposal.mjs repository-root predecessor-sha candidate-sha output');
  const relative = path.relative(path.resolve(repositoryRoot), path.resolve(output));
  assert.ok(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'proposal must be outside candidate tree');
  writeFileSync(output, `${canonical(recoverySourceFacts(repositoryRoot, predecessor, candidate))}\n`, { flag: 'wx', mode: 0o600 });
}
