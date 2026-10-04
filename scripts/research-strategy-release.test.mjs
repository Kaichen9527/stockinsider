import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('release identity covers imported execution sources and rejects altered dependencies', () => {
  const check = execFileSync(process.execPath, [path.join(root, 'scripts/sync-research-strategy-release.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(JSON.parse(check).codeHash.length, 64);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-release-test-'));
  try {
    // A detached fixture avoids mutating the live worktree during concurrent tests.
    fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'web'), { recursive: true });
    fs.cpSync(path.join(root, 'web/src'), path.join(directory, 'web/src'), { recursive: true });
    fs.cpSync(path.join(root, 'migrations'), path.join(directory, 'migrations'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/sync-research-strategy-release.mjs'), path.join(directory, 'scripts/sync-research-strategy-release.mjs'));
    for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'web', name), path.join(directory, 'web', name));
    fs.symlinkSync(path.join(root, 'web/node_modules'), path.join(directory, 'web/node_modules'), 'dir');
    const run = () => spawnSync(process.execPath, [path.join(directory, 'scripts/sync-research-strategy-release.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const filename = path.join(directory, 'web/src/lib/research-paper-books.ts');
    fs.appendFileSync(filename, '\n// Changed execution semantics fixture.\n');
    const changed = run(); assert.notEqual(changed.status, 0); assert.match(changed.stderr, /research_strategy_release_stale/u);
    fs.copyFileSync(path.join(root, 'web/src/lib/research-paper-books.ts'), filename);
    const sql = path.join(directory, 'migrations/20260929_research_agent_state_v1.sql');
    fs.appendFileSync(sql, '\n-- Changed database policy fixture.\n');
    assert.notEqual(run().status, 0);
    fs.copyFileSync(path.join(root, 'migrations/20260929_research_agent_state_v1.sql'), sql);
    fs.appendFileSync(path.join(directory, 'web/package-lock.json'), '\n');
    assert.notEqual(run().status, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
