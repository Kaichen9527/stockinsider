import { constants } from 'node:fs';
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';
import { verifyBackupChunks, BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';
import { extractAndVerifyReleaseTar } from './vps-release-tar.mjs';
import { VPS_HOST, validateReleaseExportInput } from './vps-release-identity.mjs';

export async function verifyVpsReleaseBackup({ manifestPath, keyDirectory,
  temporaryParent = '/private/tmp' }) {
  if (![manifestPath, keyDirectory, temporaryParent].every(value => path.isAbsolute(value || ''))) {
    throw new Error('absolute_paths_required');
  }
  if (path.dirname(manifestPath) !== CONFIRMED_BACKUP_DIRECTORY) {
    throw new Error('confirmed_project_backup_directory_required');
  }
  let manifestFile, key, file;
  try {
    manifestFile = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const receiptMetadata = await manifestFile.stat();
    if (!receiptMetadata.isFile() || receiptMetadata.uid !== process.getuid()
      || (receiptMetadata.mode & 0o777) !== 0o600) throw new Error('release_backup_receipt_file_invalid');
    const receipt = JSON.parse(await manifestFile.readFile('utf8'));
    validateReleaseExportInput({ host: receipt.manifest?.host, releasePath: receipt.manifest?.releasePath });
    if (receipt.manifest.host !== VPS_HOST || receipt.manifest.schema !== 'stockinsider-vps-release-export-v1'
      || receipt.manifest.plaintextStoredOnMac !== false || receipt.manifest.remoteDeletePerformed !== false) {
      throw new Error('release_backup_manifest_invalid');
    }
    const contextSha256 = createHash('sha256').update(JSON.stringify(receipt.manifest)).digest('hex');
    if (contextSha256 !== receipt.contextSha256 || receipt.postTreeSha256 !== receipt.manifest.tree.treeSha256
      || receipt.treeStable !== true || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,180}\.sib$/.test(receipt.result?.filename || '')) {
      throw new Error('release_backup_receipt_invalid');
    }
    key = await loadLocalBackupKey(keyDirectory);
    file = await open(path.join(path.dirname(manifestPath), receipt.result.filename),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.uid !== process.getuid() || (metadata.mode & 0o777) !== 0o600) {
      throw new Error('release_backup_artifact_invalid');
    }
    const maxPlaintextBytes = receipt.result.plaintextBytes;
    const envelope = await verifyBackupChunks(file.createReadStream({ start: 0, autoClose: false }),
      { key, contextSha256, maxPlaintextBytes });
    if (envelope.plaintextSha256 !== receipt.result.plaintextSha256
      || envelope.plaintextBytes !== receipt.result.plaintextBytes) throw new Error('release_backup_envelope_mismatch');
    const header = Buffer.alloc(layout.headerBytes), tag = Buffer.alloc(layout.tagBytes);
    await file.read(header, 0, header.length, 0); await file.read(tag, 0, tag.length, metadata.size - tag.length);
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    const encrypted = file.createReadStream({ autoClose: false, start: layout.headerBytes,
      end: metadata.size - layout.tagBytes - 1 });
    const restored = await extractAndVerifyReleaseTar({ chunks: encrypted.pipe(decipher),
      expectedTree: receipt.manifest.tree, temporaryParent });
    const verification = { schema: 'stockinsider-vps-release-restore-v1',
      createdAt: new Date().toISOString(), sourceContextSha256: contextSha256,
      sourcePlaintextSha256: envelope.plaintextSha256, host: VPS_HOST,
      releasePath: receipt.manifest.releasePath, ...restored,
      plaintextPersistedAfterVerification: false, temporaryRestoreRemoved: true,
      remoteDeletePerformed: false };
    const filename = `vps-release-restore-${randomUUID()}.json`;
    await writeFile(path.join(path.dirname(manifestPath), filename), JSON.stringify(verification, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    return { receipt: filename, ...verification };
  } finally { key?.fill(0); await file?.close(); await manifestFile?.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifestPath, keyDirectory, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('usage');
    console.log(JSON.stringify(await verifyVpsReleaseBackup({ manifestPath, keyDirectory })));
  } catch (error) {
    console.error(JSON.stringify({ error: 'vps_release_restore_verification_failed', reason: error.message,
      restoreVerified: false, remoteDeletePerformed: false })); process.exitCode = 1;
  }
}
