import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJson, closureHash, decryptArchiveBytes, encryptedArchiveBytes, loadArchiveKey,
  relationCounts, sha256, validateArchiveRows, verifyArchiveDocument, writeArchiveAtomically,
} from './archive-core.mjs';

function fixtureRows() {
  const payload = canonicalJson({ id: '11111111-1111-4111-8111-111111111111', status: 'success', value: 1 });
  return [{ relation: 'public.worker_job_runs', key: '11111111-1111-4111-8111-111111111111', rowHash: sha256(payload), payload }];
}

test('archive is authenticated, deterministic inside, and round-trips every row', () => {
  const key = Buffer.alloc(32, 7);
  const rows = fixtureRows();
  const document = {
    format: 'stockinsider-retention-archive-v1', manifestId: '22222222-2222-4222-8222-222222222222',
    schemaHash: 'a'.repeat(64), closureHash: closureHash(rows), rowCount: rows.length,
    relationCounts: relationCounts(rows), rows,
  };
  const first = encryptedArchiveBytes(document, key);
  const second = encryptedArchiveBytes(document, key);
  assert.notDeepEqual(first, second, 'fresh AES-GCM nonces must prevent deterministic ciphertext');
  const restored = decryptArchiveBytes(first, key);
  assert.equal(canonicalJson(restored), canonicalJson(document));
  assert.equal(verifyArchiveDocument(restored).closureHash, document.closureHash);
  const tampered = Buffer.from(first);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptArchiveBytes(tampered, key));
});

test('row validation rejects unknown relations, duplicates, and altered payloads', () => {
  const rows = fixtureRows();
  assert.throws(() => validateArchiveRows([{ ...rows[0], relation: 'public.stocks' }]), /not_allowlisted/u);
  assert.throws(() => validateArchiveRows([rows[0], rows[0]]), /duplicate/u);
  assert.throws(() => validateArchiveRows([{ ...rows[0], payload: '{"changed":true}' }]), /hash_mismatch/u);
});

test('key and output paths are private and fixed below project-root backup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-archive-test-'));
  try {
    const keyPath = path.join(directory, 'key');
    fs.writeFileSync(keyPath, Buffer.alloc(32, 1), { mode: 0o600 });
    assert.equal(loadArchiveKey(keyPath).length, 32);
    fs.chmodSync(keyPath, 0o644);
    assert.throws(() => loadArchiveKey(keyPath), /permissions_too_open/u);
    const outputDirectory = path.join(directory, 'backup', 'retention');
    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    const output = path.join(outputDirectory, 'fixture.sira');
    writeArchiveAtomically(directory, output, Buffer.from('archive'));
    assert.equal(fs.readFileSync(output, 'utf8'), 'archive');
    assert.equal(fs.statSync(output).mode & 0o077, 0);
    assert.throws(() => writeArchiveAtomically(directory, path.join(directory, 'fixture.sira'), Buffer.from('x')), /outside_project_backup/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
