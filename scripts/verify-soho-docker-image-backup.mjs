/** Authenticate a SOHO docker-save backup and stream it directly into the local
 * Docker Desktop engine. No decrypted tar is persisted. Exact loaded refs are
 * removed from the local engine after identity verification; production is read-only.
 */
import { constants } from 'node:fs';
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';
import { verifyBackupChunks, BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';
import { canonical, loadSohoImagePolicy, SOHO_VPS_HOST } from './soho-image-policy.mjs';

const execFile = promisify(execFileCallback);
const DOCKER = '/usr/local/bin/docker';
const ZSTD = '/opt/homebrew/bin/zstd';

export function verifyLoadedSohoImages(expected, inspected) {
  if (!Array.isArray(expected) || !Array.isArray(inspected) || inspected.length !== expected.length) {
    throw new Error('loaded_soho_image_count_mismatch');
  }
  for (const image of expected) {
    const actual = inspected.find(item => item.RepoTags?.includes(image.ref));
    const actualConfigJsonSha256 = createHash('sha256').update(canonical(actual?.Config ?? {})).digest('hex');
    const remoteDigestPreserved = actual?.Id === image.imageId
      || actual?.Descriptor?.digest === image.imageId
      || actual?.RepoDigests?.some(value => value.endsWith(`@${image.imageId}`));
    if (!actual || !/^sha256:[0-9a-f]{64}$/u.test(actual.Id || '')
      || (!remoteDigestPreserved && actualConfigJsonSha256 !== image.configJsonSha256)
      || actual.Architecture !== image.architecture || actual.Os !== image.os
      || canonical(actual.RootFS?.Layers ?? []) !== canonical(image.rootFsLayers)) {
      throw new Error(`loaded_soho_image_identity_mismatch:${JSON.stringify({
        ref: image.ref, expectedRemoteDigest: image.imageId, actualConfigDigest: actual?.Id ?? null,
        actualDescriptorDigest: actual?.Descriptor?.digest ?? null,
        actualRepoDigests: actual?.RepoDigests ?? [], expectedArchitecture: image.architecture,
        expectedConfigJsonSha256: image.configJsonSha256, actualConfigJsonSha256,
        actualArchitecture: actual?.Architecture ?? null, expectedOs: image.os,
        actualOs: actual?.Os ?? null, expectedLayerCount: image.rootFsLayers.length,
        actualLayerCount: actual?.RootFS?.Layers?.length ?? null,
        layersEqual: canonical(actual?.RootFS?.Layers ?? []) === canonical(image.rootFsLayers),
      })}`);
    }
  }
  return true;
}

async function dockerInspect(identities) {
  const result = await execFile(DOCKER, ['image', 'inspect', ...identities],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(result.stdout);
}

async function assertLocalImagesAbsent(images) {
  for (const identity of [...images.map(image => image.ref), ...images.map(image => image.imageId)]) {
    try {
      await dockerInspect([identity]);
      throw new Error('local_image_identity_already_present');
    } catch (error) {
      if (error.message === 'local_image_identity_already_present') throw error;
    }
  }
}

async function loadStream(stream) {
  const decompressor = spawn(ZSTD, ['-d', '-c'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const child = spawn(DOCKER, ['image', 'load'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let outputBytes = 0;
  const count = chunk => {
    outputBytes += chunk.length;
    if (outputBytes > 1024 * 1024) {
      decompressor.kill('SIGTERM'); child.kill('SIGTERM');
    }
  };
  child.stdout.on('data', count); child.stderr.on('data', count);
  decompressor.stderr.on('data', count);
  const dockerTerminal = new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const decompressorTerminal = new Promise(resolve => {
    decompressor.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    decompressor.once('close', (code, signal) => resolve({ code, signal }));
  });
  let pipelineError;
  try {
    await Promise.all([pipeline(stream, decompressor.stdin), pipeline(decompressor.stdout, child.stdin)]);
  } catch (error) {
    pipelineError = error; decompressor.kill('SIGTERM'); child.kill('SIGTERM');
  }
  const [decompressorResult, dockerResult] = await Promise.all([decompressorTerminal, dockerTerminal]);
  if (pipelineError || decompressorResult.code !== 0 || decompressorResult.signal
    || dockerResult.code !== 0 || dockerResult.signal || outputBytes > 1024 * 1024) {
    throw new Error('isolated_docker_load_failed');
  }
}

export async function verifySohoDockerImageBackup({ manifestPath, keyDirectory }) {
  if (![manifestPath, keyDirectory].every(value => path.isAbsolute(value || ''))
    || path.dirname(manifestPath) !== CONFIRMED_BACKUP_DIRECTORY) throw new Error('soho_verify_paths_invalid');
  const { policy, policySha256, candidateRefs } = await loadSohoImagePolicy();
  let receiptFile, artifactFile, key;
  let localLoadStarted = false;
  try {
    receiptFile = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const receiptMetadata = await receiptFile.stat();
    if (!receiptMetadata.isFile() || receiptMetadata.uid !== process.getuid()
      || (receiptMetadata.mode & 0o777) !== 0o600) throw new Error('soho_export_receipt_invalid');
    const receipt = JSON.parse(await receiptFile.readFile('utf8'));
    const manifest = receipt.manifest;
    if (manifest?.schema !== 'stockinsider-soho-image-export-v4' || manifest.host !== SOHO_VPS_HOST
      || manifest.archiveEncoding !== 'zstd'
      || manifest.policySha256 !== policySha256 || manifest.plaintextStoredOnMac !== false
      || manifest.productionMutationPerformed !== false || manifest.broadPrunePerformed !== false
      || canonical(manifest.candidateRefs) !== canonical(candidateRefs)
      || canonical(manifest.externallyAbsentBeforeVerifiedArchive)
        !== canonical(policy.externallyAbsentBeforeVerifiedArchive)
      || manifest.externallyAbsentDetectedAt !== policy.externallyAbsentDetectedAt
      || manifest.externallyAbsentDisposition !== 'externally_absent_before_verified_archive'
      || canonical(manifest.images.map(image => [image.ref, image.imageId]).sort())
        !== canonical(Object.entries(policy.obsoleteCandidates).sort())) throw new Error('soho_export_manifest_invalid');
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    if (receipt.contextSha256 !== contextSha256 || receipt.identitiesStable !== true
      || canonical(receipt.postImages) !== canonical(manifest.images)
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,180}\.sib$/u.test(receipt.result?.filename || '')) {
      throw new Error('soho_export_receipt_mismatch');
    }
    artifactFile = await open(path.join(path.dirname(manifestPath), receipt.result.filename),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    const artifactMetadata = await artifactFile.stat();
    if (!artifactMetadata.isFile() || artifactMetadata.uid !== process.getuid()
      || (artifactMetadata.mode & 0o777) !== 0o600) throw new Error('soho_backup_artifact_invalid');
    key = await loadLocalBackupKey(keyDirectory);
    const envelope = await verifyBackupChunks(artifactFile.createReadStream({ start: 0, autoClose: false }),
      { key, contextSha256, maxPlaintextBytes: receipt.result.plaintextBytes });
    if (envelope.plaintextSha256 !== receipt.result.plaintextSha256
      || envelope.plaintextBytes !== receipt.result.plaintextBytes) throw new Error('soho_backup_envelope_mismatch');
    await execFile(DOCKER, ['version', '--format', '{{.Server.Version}}'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
    await assertLocalImagesAbsent(manifest.images);
    const header = Buffer.alloc(layout.headerBytes), tag = Buffer.alloc(layout.tagBytes);
    await artifactFile.read(header, 0, header.length, 0);
    await artifactFile.read(tag, 0, tag.length, artifactMetadata.size - tag.length);
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    localLoadStarted = true;
    await loadStream(artifactFile.createReadStream({ autoClose: false, start: layout.headerBytes,
      end: artifactMetadata.size - layout.tagBytes - 1 }).pipe(decipher));
    const loadedImages = await dockerInspect(candidateRefs);
    verifyLoadedSohoImages(manifest.images, loadedImages);
    await execFile(DOCKER, ['image', 'rm', ...candidateRefs],
      { encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 });
    localLoadStarted = false;
    await assertLocalImagesAbsent(manifest.images);
    const verification = { schema: 'stockinsider-soho-image-restore-v1',
      createdAt: new Date().toISOString(), sourceContextSha256: contextSha256,
      sourcePlaintextSha256: envelope.plaintextSha256, host: SOHO_VPS_HOST,
      policySha256, candidateRefs, images: manifest.images.map(({ ref, imageId, configJsonSha256 }) => {
        const loaded = loadedImages.find(item => item.RepoTags?.includes(ref));
        return { ref, remoteImageDigest: imageId, loadedConfigDigest: loaded.Id,
          loadedDescriptorDigest: loaded.Descriptor?.digest ?? null, configJsonSha256 };
      }), archiveAuthenticated: true, isolatedDockerLoadVerified: true,
      exactTagsAndConfigDigestsVerified: true, plaintextPersistedOnMac: false,
      localLoadedRefsRemoved: true, productionMutationPerformed: false, broadPrunePerformed: false };
    const filename = `soho-docker-image-restore-${randomUUID()}.json`;
    await writeFile(path.join(path.dirname(manifestPath), filename), JSON.stringify(verification, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    return { receipt: filename, ...verification };
  } finally {
    if (localLoadStarted) {
      // Only refs proven absent before this invocation are eligible for local cleanup.
      const { candidateRefs } = await loadSohoImagePolicy();
      await execFile(DOCKER, ['image', 'rm', ...candidateRefs],
        { encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 }).catch(() => {});
    }
    key?.fill(0); await artifactFile?.close(); await receiptFile?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifestPath, keyDirectory, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('usage');
    console.log(JSON.stringify(await verifySohoDockerImageBackup({ manifestPath, keyDirectory })));
  } catch (error) {
    console.error(JSON.stringify({ error: 'soho_image_restore_verification_failed', reason: error.message,
      isolatedDockerLoadVerified: false, plaintextPersistedOnMac: false,
      productionMutationPerformed: false })); process.exitCode = 1;
  }
}
