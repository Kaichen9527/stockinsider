// Private Storage bytes are not included in pg_dump. This is a separate preliminary
// export, not a claim of a globally frozen database/files cutover snapshot.
import { readFile, writeFile, mkdir, rmdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';

const [directory, envFile, caFile, keyDirectory, pgModule] = process.argv.slice(2);
let client, key, locked = false;
let completed = 0;
const MAX = 128 * 1024 ** 2;
try {
  if (process.argv.length !== 7 || ![directory, envFile, caFile, keyDirectory, pgModule].every(path.isAbsolute)) throw Error();
  if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw Error();
  await inspectLocalBackupDirectory(directory);
  await mkdir(path.join(directory, '.database-export-lock'), { mode: 0o700 });
  locked = true;
  const e = parseEnv(await readFile(envFile, 'utf8'));
  const project = 'mgqpxfbdhmiygdytgswi';
  if (e.SUPABASE_PROJECT_REF !== project || e.SUPABASE_DB_HOST !== 'aws-1-ap-southeast-1.pooler.supabase.com'
    || e.SUPABASE_DB_USER !== `postgres.${project}` || !e.SUPABASE_SERVICE_KEY) throw Error();
  const { Client } = createRequire(import.meta.url)(pgModule);
  client = new Client({ host: e.SUPABASE_DB_HOST, port: 5432, user: e.SUPABASE_DB_USER,
    database: 'postgres', password: e.SUPABASE_DB_PASSWORD, connectionTimeoutMillis: 15000,
    statement_timeout: 15000, ssl: { rejectUnauthorized: true, ca: await readFile(caFile, 'utf8') } });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const sql = 'SELECT id,bucket_id,name,updated_at,metadata FROM storage.objects ORDER BY id LIMIT 101';
  const initial = (await client.query(sql)).rows;
  await client.query('ROLLBACK');
  if (initial.length > 100) throw Error();
  let total = 0;
  for (const item of initial) {
    const size = Number(item.metadata?.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX) throw Error();
    total += size;
    if (item.name.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw Error();
  }
  if (total > 512 * 1024 ** 2) throw Error();
  key = await loadLocalBackupKey(keyDirectory);
  const receipts = [];
  for (const item of initial) {
    const manifest = { schema: 'stockinsider-storage-export-v1', project, createdAt: new Date().toISOString(),
      object: item, keyReference: 'private-local-file:aes256-v1', restoreVerified: false };
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    const url = `https://${project}.supabase.co/storage/v1/object/authenticated/${encodeURIComponent(item.bucket_id)}/${item.name.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { apikey: e.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_KEY}` } });
    if (!response.ok || !response.body) throw Error();
    async function* chunks() {
      let received = 0;
      for await (const chunk of response.body) { received += chunk.length; yield Buffer.from(chunk); }
      if (received !== Number(item.metadata.size)) throw Error('storage_length_mismatch');
    }
    const id = `storage-${randomUUID()}`;
    const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: chunks(), key,
      contextSha256, maxPlaintextBytes: Number(item.metadata.size), timeoutMs: 180000 });
    await writeFile(path.join(directory, `${id}.manifest.json`), JSON.stringify({ manifest, contextSha256, result }, null, 2),
      { flag: 'wx', mode: 0o600 });
    receipts.push({ filename: result.filename, contextSha256 });
    completed++;
    console.log(JSON.stringify({ phase: 'storage_object_verified', completed, expected: initial.length }));
  }
  await client.query('BEGIN READ ONLY');
  const final = (await client.query(sql)).rows;
  await client.query('ROLLBACK');
  if (JSON.stringify(initial) !== JSON.stringify(final)) throw Error('storage_inventory_changed');
  await writeFile(path.join(directory, `storage-inventory-${randomUUID()}.json`), JSON.stringify({
    createdAt: new Date().toISOString(), objects: completed, receipts, inventoryStable: true,
    combinedDatabaseSnapshotVerified: false, restoreVerified: false }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: 'storage_export_verified', objects: completed, totalBytes: total, restoreVerified: false }));
} catch (error) {
  console.error(JSON.stringify({ phase: 'storage_export_failed', completed,
    reason: error.code === 'EEXIST' ? 'backup_lock_busy' : 'export_or_validation_failed', restoreVerified: false }));
  process.exitCode = 1;
} finally {
  key?.fill(0); await client?.end().catch(() => {});
  if (locked) await rmdir(path.join(directory, '.database-export-lock'));
}
