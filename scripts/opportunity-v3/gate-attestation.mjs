import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedCheckByTrack = Object.freeze({
  product_runtime: 'product-runtime-code-gate',
  model_runner: 'model-runner-code-gate',
  evaluation_governance: 'evaluation-governance',
});
const [flag, track] = process.argv.slice(2);

try {
  assert.equal(flag, '--track', 'gate attestation requires --track');
  assert.ok(track in expectedCheckByTrack, 'gate attestation track is closed');
  const filename = process.env.OPPORTUNITY_V3_EXTERNAL_GATE_ENVELOPE ?? '';
  assert.ok(path.isAbsolute(filename), 'external gate envelope must be an absolute protected-artifact path');
  const envelope = JSON.parse(readFileSync(filename, 'utf8'));
  assert.equal(envelope.schema, 'stockinsider-external-gate-envelope-v1', 'external envelope schema');
  assert.equal(envelope.issuer, 'stockinsider-v3-gate-root', 'external envelope issuer');
  assert.equal(envelope.result?.check, expectedCheckByTrack[track], 'external envelope track/check binding');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types', 'scripts/opportunity-v3/gate-evidence.mjs', 'validate', '--input', filename,
  ], { cwd: root, encoding: 'utf8', env: { PATH: '/usr/local/bin:/usr/bin:/bin', TZ: 'Asia/Taipei' } });
  assert.equal(result.status, 0, `external gate envelope failed compatibility validation: ${(result.stderr ?? '').trim()}`);
  process.stdout.write(`${JSON.stringify({ track, check: expectedCheckByTrack[track], status: 'compatible_external_attestation' })}\n`);
} catch (error) {
  process.stderr.write(`external gate attestation unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
