/** Streaming encryption primitives, not a completed database backup workflow.
 * Callers own key provisioning/escrow and must bind contextSha256 to the
 * consistent DB/document/migration manifest. Never pass secrets via CLI args.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('SI-BACKUP-1\n');
const IV_BYTES = 12;
const CONTEXT_BYTES = 32;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES + CONTEXT_BYTES;
export const BACKUP_ENVELOPE_LAYOUT = Object.freeze({ headerBytes: HEADER_BYTES,
  ivStart: MAGIC.length, ivEnd: MAGIC.length + IV_BYTES, tagBytes: TAG_BYTES });
export const BACKUP_ENVELOPE_OVERHEAD_BYTES = HEADER_BYTES + TAG_BYTES;
export const MAX_BACKUP_PLAINTEXT_BYTES = 25 * 1024 ** 3;

function validate({ key, contextSha256, maxPlaintextBytes }) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('backup_key_must_be_32_bytes');
  if (!/^[a-f0-9]{64}$/.test(contextSha256 || '')) throw new Error('backup_manifest_hash_required');
  if (!Number.isSafeInteger(maxPlaintextBytes) || maxPlaintextBytes <= 0
    || maxPlaintextBytes > MAX_BACKUP_PLAINTEXT_BYTES) throw new Error('backup_size_limit_invalid');
}

export async function* encryptBackupChunks(input, options) {
  validate(options);
  const { key, contextSha256, maxPlaintextBytes } = options;
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, iv, Buffer.from(contextSha256, 'hex')]);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(header);
  let bytes = 0;
  yield header;
  for await (const chunk of input) {
    if (!Buffer.isBuffer(chunk)) throw new Error('backup_binary_input_required');
    bytes += chunk.length;
    if (bytes > maxPlaintextBytes) throw new Error('backup_size_limit_exceeded');
    yield cipher.update(chunk);
  }
  if (bytes === 0) throw new Error('empty_backup_rejected');
  yield cipher.final();
  yield cipher.getAuthTag();
}

/** Authenticate a streamed artifact without writing/returning any plaintext.
 * A valid envelope is not proof of DB/document completeness or restore success.
 */
export async function verifyBackupChunks(input, options) {
  validate(options);
  const { key, contextSha256, maxPlaintextBytes } = options;
  let header = Buffer.alloc(0);
  let trailing = Buffer.alloc(0);
  let decipher;
  let bytes = 0;
  const hash = createHash('sha256');
  for await (const chunk of input) {
    if (!Buffer.isBuffer(chunk)) throw new Error('backup_binary_input_required');
    let pending = chunk;
    if (header.length < HEADER_BYTES) {
      const count = Math.min(HEADER_BYTES - header.length, pending.length);
      header = Buffer.concat([header, pending.subarray(0, count)]);
      pending = pending.subarray(count);
      if (header.length < HEADER_BYTES) continue;
      if (!header.subarray(0, MAGIC.length).equals(MAGIC)
        || header.subarray(MAGIC.length + IV_BYTES).toString('hex') !== contextSha256) {
        throw new Error('backup_envelope_context_invalid');
      }
      decipher = createDecipheriv('aes-256-gcm', key,
        header.subarray(MAGIC.length, MAGIC.length + IV_BYTES), { authTagLength: TAG_BYTES });
      decipher.setAAD(header);
    }
    const combined = Buffer.concat([trailing, pending]);
    const dataLength = Math.max(0, combined.length - TAG_BYTES);
    bytes += dataLength;
    if (bytes > maxPlaintextBytes) throw new Error('backup_size_limit_exceeded');
    if (dataLength > 0) {
      const plaintext = decipher.update(combined.subarray(0, dataLength));
      hash.update(plaintext);
      plaintext.fill(0);
    }
    trailing = Buffer.from(combined.subarray(dataLength));
  }
  if (!decipher || trailing.length !== TAG_BYTES || bytes === 0) throw new Error('backup_envelope_truncated');
  decipher.setAuthTag(trailing);
  try {
    const plaintext = decipher.final();
    hash.update(plaintext);
    plaintext.fill(0);
  } catch {
    throw new Error('backup_authentication_failed');
  }
  return { envelopeVerified: true, plaintextBytes: bytes, plaintextSha256: hash.digest('hex'),
    restoreVerified: false, contextSha256 };
}
