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
assert.equal([...tap.matchAll(/^TAP version 13$/gmu)].length, 1);
assert.doesNotMatch(tap, /^\s*(?:not ok\b|Bail out!)/mu);
const plans = [...tap.matchAll(/^1\.\.(\d+)$/gmu)];
assert.equal(plans.length, 1);
assert.equal(plans[0][1], '155');
const resultLines = [...tap.matchAll(/^(?:not )?ok\b.*$/gmu)].map(m => m[0]);
assert.equal(resultLines.length, 155);
for (const [index, line] of resultLines.entries()) {
  const result = /^ok (\d+) - (.+)$/u.exec(line);
  assert.ok(result);
  assert.equal(result[1], String(index + 1));
  assert.doesNotMatch(result[2], /\s+#\s*(?:SKIP|TODO)\b/iu);
}
for (const [name, expected] of Object.entries({ tests: 155, pass: 155, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
  const rows = [...tap.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gmu'))];
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0][1]), expected);
}
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