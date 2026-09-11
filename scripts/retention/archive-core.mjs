import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const ARCHIVE_MAGIC = Buffer.from('SIRA0001', 'ascii');
export const MAX_ARCHIVE_PLAINTEXT_BYTES = 64 * 1024 * 1024;

export const ARCHIVE_RELATIONS = Object.freeze(new Map([
  ['public.candidate_research_runs', 'id'],
  ['public.candidate_research_run_items', 'id'],
  ['public.connector_runs', 'id'],
  ['public.source_audits', 'id'],
  ['public.source_run_ledger', 'id'],
  ['public.worker_job_runs', 'id'],
  ['public.worker_logs', 'id'],
  ['public.runtime_artifacts', 'id'],
]));

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function validateArchiveRows(rows) {
  invariant(Array.isArray(rows) && rows.length > 0, 'retention_archive_rows_empty');
  const seen = new Set();
  const sorted = rows.map((row) => {
    invariant(row && typeof row === 'object', 'retention_archive_row_invalid');
    invariant(ARCHIVE_RELATIONS.has(row.relation), 'retention_archive_relation_not_allowlisted');
    invariant(/^[0-9a-f-]{36}$/iu.test(String(row.key || '')), 'retention_archive_row_key_invalid');
    invariant(/^[0-9a-f]{64}$/u.test(String(row.rowHash || '')), 'retention_archive_row_hash_invalid');
    invariant(typeof row.payload === 'string' && row.payload.length > 1, 'retention_archive_row_payload_missing');
    invariant(sha256(row.payload) === row.rowHash, 'retention_archive_row_payload_hash_mismatch');
    const identity = `${row.relation}\0${row.key}`;
    invariant(!seen.has(identity), 'retention_archive_row_duplicate');
    seen.add(identity);
    return Object.freeze({ relation: row.relation, key: String(row.key), rowHash: row.rowHash, payload: row.payload });
  }).sort((left, right) => left.relation.localeCompare(right.relation) || left.key.localeCompare(right.key));
  return Object.freeze(sorted);
}

export function closureHash(rows) {
  return sha256(validateArchiveRows(rows).map(({ relation, key, rowHash }) => `${relation}|${key}|${rowHash}\n`).join(''));
}

export function relationCounts(rows) {
  const result = {};
  for (const row of validateArchiveRows(rows)) result[row.relation] = (result[row.relation] || 0) + 1;
  return Object.freeze(result);
}

export function loadArchiveKey(keyFile) {
  invariant(path.isAbsolute(keyFile), 'retention_archive_key_path_must_be_absolute');
  const stat = fs.lstatSync(keyFile);
  invariant(stat.isFile() && !stat.isSymbolicLink(), 'retention_archive_key_not_regular');
  invariant((stat.mode & 0o077) === 0, 'retention_archive_key_permissions_too_open');
  const key = fs.readFileSync(keyFile);
  invariant(key.length === 32, 'retention_archive_key_must_be_32_bytes');
  return key;
}

export function encryptedArchiveBytes(document, key) {
  const plain = Buffer.from(canonicalJson(document), 'utf8');
  invariant(plain.length <= MAX_ARCHIVE_PLAINTEXT_BYTES, 'retention_archive_plaintext_too_large');
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(ARCHIVE_MAGIC);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([ARCHIVE_MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptArchiveBytes(bytes, key) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > ARCHIVE_MAGIC.length + 28, 'retention_archive_envelope_truncated');
  invariant(bytes.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC), 'retention_archive_magic_invalid');
  const nonceOffset = ARCHIVE_MAGIC.length;
  const tagOffset = nonceOffset + 12;
  const payloadOffset = tagOffset + 16;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(nonceOffset, tagOffset));
  decipher.setAAD(ARCHIVE_MAGIC);
  decipher.setAuthTag(bytes.subarray(tagOffset, payloadOffset));
  const compressed = Buffer.concat([decipher.update(bytes.subarray(payloadOffset)), decipher.final()]);
  const plain = zlib.gunzipSync(compressed, { maxOutputLength: MAX_ARCHIVE_PLAINTEXT_BYTES });
  return JSON.parse(plain.toString('utf8'));
}

export function assertProjectBackupPath(projectRoot, candidate) {
  const realProjectRoot = fs.realpathSync(projectRoot);
  const backupDirectory = path.join(realProjectRoot, 'backup');
  if (fs.existsSync(backupDirectory)) {
    const backupStat = fs.lstatSync(backupDirectory);
    invariant(backupStat.isDirectory() && !backupStat.isSymbolicLink(), 'retention_archive_backup_root_not_regular');
    invariant((backupStat.mode & 0o077) === 0, 'retention_archive_backup_root_permissions_too_open');
  } else {
    fs.mkdirSync(backupDirectory, { mode: 0o700 });
  }
  const expectedRoot = path.join(backupDirectory, 'retention');
  if (fs.existsSync(expectedRoot)) {
    const retentionStat = fs.lstatSync(expectedRoot);
    invariant(retentionStat.isDirectory() && !retentionStat.isSymbolicLink(), 'retention_archive_backup_root_not_regular');
    invariant((retentionStat.mode & 0o077) === 0, 'retention_archive_backup_root_permissions_too_open');
  } else {
    fs.mkdirSync(expectedRoot, { mode: 0o700 });
  }
  const actualParent = fs.realpathSync(path.dirname(candidate));
  invariant(actualParent === fs.realpathSync(expectedRoot), 'retention_archive_path_outside_project_backup');
  invariant(path.extname(candidate) === '.sira', 'retention_archive_extension_invalid');
  return expectedRoot;
}

export function writeArchiveAtomically(projectRoot, archivePath, bytes) {
  const backupRoot = assertProjectBackupPath(projectRoot, archivePath);
  invariant(!fs.existsSync(archivePath), 'retention_archive_refuses_overwrite');
  const temporary = path.join(backupRoot, `.${path.basename(archivePath)}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, archivePath);
    const directoryDescriptor = fs.openSync(backupRoot, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function verifyArchiveDocument(document) {
  invariant(document?.format === 'stockinsider-retention-archive-v1', 'retention_archive_format_invalid');
  invariant(/^[0-9a-f-]{36}$/iu.test(String(document.manifestId || '')), 'retention_archive_manifest_id_invalid');
  invariant(/^[0-9a-f]{64}$/u.test(String(document.schemaHash || '')), 'retention_archive_schema_hash_invalid');
  const rows = validateArchiveRows(document.rows);
  invariant(document.rowCount === rows.length, 'retention_archive_row_count_mismatch');
  invariant(document.closureHash === closureHash(rows), 'retention_archive_closure_hash_mismatch');
  invariant(canonicalJson(document.relationCounts) === canonicalJson(relationCounts(rows)), 'retention_archive_relation_counts_mismatch');
  return Object.freeze({ rowCount: rows.length, closureHash: document.closureHash, schemaHash: document.schemaHash, rows });
}
