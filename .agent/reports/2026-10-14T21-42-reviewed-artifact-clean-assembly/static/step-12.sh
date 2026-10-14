set -euo pipefail
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
const exportDir = path.join(process.env.RUNNER_TEMP, 'standalone-export');
const root = path.join(process.env.RUNNER_TEMP, 'reviewed-standalone', process.env.REVIEWED_SOURCE);
const { manifest } = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
assert.equal(manifest.sourceCommit, process.env.REVIEWED_SOURCE);
const entry = path.resolve(root, manifest.entrypoint);
assert.ok(entry.startsWith(root + path.sep));
const asset = manifest.files.find(f => /\/\.next\/static\/.+\.(?:js|css)$/u.test(f.path));
assert.ok(asset);
const assetUrl = '/_next/static/' + asset.path.split('/.next/static/')[1];
const child = spawn(process.execPath, [entry], { cwd: path.dirname(entry), env: {
  PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC',
  NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3114', NEXT_TELEMETRY_DISABLED: '1',
}, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(fs.createWriteStream(path.join(exportDir, 'packaged-boot.stdout')));
child.stderr.pipe(fs.createWriteStream(path.join(exportDir, 'packaged-boot.stderr')));
let closed = false, stopping = false, unexpectedExit = false;
const ended = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => { closed = true; unexpectedExit = !stopping; resolve({ code, signal }); });
});
// Observe asynchronous spawn failure while startup requests are pending.
void ended.catch(() => {});
const get = route => fetch('http://127.0.0.1:3114' + route, { signal: AbortSignal.timeout(3000), redirect: 'error' });
let proof;
try {
  const until = Date.now() + 30000;
  let auth;
  while (!auth) {
    assert.equal(closed, false, 'packaged process exited before probe');
    try { auth = await get('/api/internal/health-check'); }
    catch (error) { if (Date.now() >= until) throw error; await pause(100); }
  }
  assert.equal(auth.status, 500);
  assert.deepEqual(await auth.json(), { ok: false, error: 'INTERNAL_API_KEY/CRON_SECRET not configured' });
  assert.equal((await get('/trade-plan-fixture')).status, 404);
  const staticResponse = await get(assetUrl);
  assert.equal(staticResponse.status, 200);
  assert.ok(staticResponse.body);
  const digest = createHash('sha256'); let staticBytes = 0;
  for await (const chunk of staticResponse.body) {
    staticBytes += chunk.byteLength; assert.ok(staticBytes <= asset.bytes);
    digest.update(chunk);
  }
  assert.equal(staticBytes, asset.bytes);
  const staticHash = digest.digest('hex');
  assert.equal(staticHash, asset.sha256);
  assert.equal(closed, false);
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, null);
  proof = { sourceCommit: process.env.REVIEWED_SOURCE, nodeVersion: process.versions.node,
    productionEntrypoint: manifest.entrypoint, credentialEnvironment: 'absent',
    unconfiguredAuthStatus: 500, fixtureUnavailableStatus: 404,
    assetPath: asset.path, assetSha256: staticHash, databaseOrApiMutationPerformed: false,
    productionReadinessProven: false, privatePeerOrLiveDataProven: false };
} finally {
  stopping = true;
  if (!closed) child.kill('SIGTERM');
  if (!closed) await Promise.race([ended, pause(5000)]);
  if (!closed) child.kill('SIGKILL');
  const exit = await Promise.race([ended, pause(5000).then(() => { throw Error('packaged_process_cleanup_unconfirmed'); })]);
  assert.equal(unexpectedExit, false);
  if (proof) { proof.confirmedProcessExit = exit; fs.writeFileSync(path.join(exportDir, 'packaged-boot.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' }); }
}
NODE

