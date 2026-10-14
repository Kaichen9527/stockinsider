set -euo pipefail
test "$(node --version)" = v22.14.0
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
mkdir -m 0700 "$RUNNER_TEMP/standalone-export"
npm run test:source-led-opportunity-v3:product-correctness 2>&1 | tee "$RUNNER_TEMP/standalone-export/builder-canonical.log"
git diff --exit-code
node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const dir = process.env.RUNNER_TEMP + '/standalone-export';
const log = fs.readFileSync(dir + '/builder-canonical.log', 'utf8');
assert.ok(Buffer.byteLength(log, 'utf8') <= 4 * 1024 * 1024);
const start = log.indexOf('TAP version 13\n');
assert.ok(start >= 0);
const tap = log.slice(start);
for (const [name, expected] of Object.entries({ tests: 155, pass: 155, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
  const rows = [...tap.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gmu'))];
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0][1]), expected);
}
assert.match(tap, /^1\.\.155$/mu);
const pcr = [...tap.matchAll(/^ok \d+ - acceptance (PCR-\d{3})$/gmu)].map(m => m[1]);
assert.deepEqual(pcr, Array.from({ length: 31 }, (_, i) => 'PCR-' + String(i + 1).padStart(3, '0')));
const git = ref => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
assert.equal(git('HEAD'), process.env.GITHUB_SHA);
assert.match(process.env.GITHUB_WORKFLOW_SHA ?? '', /^[a-f0-9]{40}$/u);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(dir + '/builder-canonical.tap', tap, { flag: 'wx' });
fs.writeFileSync(dir + '/builder-correctness.json', JSON.stringify({
  executionSubject: git('HEAD'), executionTree: git('HEAD^{tree}'), executionWebTree: git('HEAD:web'),
  builderWorkflowSha: process.env.GITHUB_WORKFLOW_SHA, workflowRef: process.env.GITHUB_WORKFLOW_REF,
  triggerCommit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
  command: 'npm run test:source-led-opportunity-v3:product-correctness',
  canonicalTests: 155, pass: 155, fail: 0, cancelled: 0, skipped: 0, todo: 0,
  namedPCR: pcr, canonicalSectionSha256: hash(tap),
  rootLockSha256: hash(fs.readFileSync('package-lock.json')),
  webLockSha256: hash(fs.readFileSync('web/package-lock.json')),
  artifactApplicationSubject: process.env.REVIEWED_SOURCE,
  artifactApplicationTestsAttributedToBuilder: false,
}, null, 2) + '\n', { flag: 'wx' });
NODE

