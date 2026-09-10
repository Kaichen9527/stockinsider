// Export only the two reviewed StockInsider provider credentials, directly from
// TLS-protected Vault into an authenticated encrypted archive. No plaintext disk,
// argv, receipt or journal output. This does not enable either connector.
import { readFile, writeFile, mkdir, rmdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';

const [directory, envFile, caFile, keyDirectory, pgModule] = process.argv.slice(2);
const project = 'mgqpxfbdhmiygdytgswi';
const names = ['threads_access_token', 'stockinsider_finmind_api_token'];
let client, key, plaintext, rows, locked = false, phase = 'preflight';
try {
  if (process.argv.length !== 7 || ![directory, envFile, caFile, keyDirectory, pgModule].every(path.isAbsolute)) throw Error();
  if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw Error();
  await inspectLocalBackupDirectory(directory);
  await mkdir(path.join(directory, '.database-export-lock'), { mode: 0o700 }); locked = true;
  const e = parseEnv(await readFile(envFile, 'utf8'));
  if (e.SUPABASE_PROJECT_REF !== project || e.SUPABASE_DB_HOST !== 'aws-1-ap-southeast-1.pooler.supabase.com'
    || e.SUPABASE_DB_USER !== `postgres.${project}`) throw Error();
  const { Client } = createRequire(import.meta.url)(pgModule);
  client = new Client({ host: e.SUPABASE_DB_HOST, port: 5432, user: e.SUPABASE_DB_USER,
    database: 'postgres', password: e.SUPABASE_DB_PASSWORD, connectionTimeoutMillis: 15000,
    statement_timeout: 15000, ssl: { rejectUnauthorized: true, ca: await readFile(caFile, 'utf8') } });
  phase = 'connection'; await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  phase = 'vault';
  rows = (await client.query('SELECT id,name,decrypted_secret,created_at,updated_at FROM vault.decrypted_secrets WHERE name=ANY($1::text[]) ORDER BY name,id', [names])).rows;
  phase = 'credential_validation';
  if (rows.length !== names.length || new Set(rows.map(row => row.name)).size !== names.length
    || rows.some(row => typeof row.decrypted_secret !== 'string' || row.decrypted_secret.length < 16 || row.decrypted_secret.length > 16384)) throw Error();
  phase = 'roles';
  const roles = (await client.query(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname`)).rows;
  const memberships = (await client.query(`SELECT r.rolname AS role_name,m.rolname AS member_name,a.admin_option
    FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
    ORDER BY 1,2`)).rows;
  phase = 'registry';
  const registry = (await client.query('SELECT * FROM public.source_credentials_registry')).rows;
  const manifest = { schema: 'stockinsider-provider-recovery-v1', project, createdAt: new Date().toISOString(),
    credentialCount: rows.length, keyReference: 'private-local-file:aes256-v1',
    productionRecoveryVerified: false, independentKeyEscrowVerified: false };
  const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  plaintext = Buffer.from(JSON.stringify({ manifest, credentials: rows, registry, roles, memberships }));
  for (const row of rows) row.decrypted_secret = null;
  phase = 'encryption'; key = await loadLocalBackupKey(keyDirectory);
  const id = `provider-recovery-${randomUUID()}`;
  const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: [plaintext], key,
    contextSha256, maxPlaintextBytes: 1024 * 1024, timeoutMs: 60000 });
  await client.query('ROLLBACK');
  await writeFile(path.join(directory, `${id}.manifest.json`), JSON.stringify({ manifest, contextSha256, result }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: 'provider_recovery_encrypted', credentialCount: manifest.credentialCount,
    encryptedEnvelopeVerified: true, productionRecoveryVerified: false }));
} catch {
  console.error(JSON.stringify({ error: 'provider_recovery_export_failed', phase, productionRecoveryVerified: false })); process.exitCode = 1;
} finally {
  if (rows) for (const row of rows) row.decrypted_secret = null;
  plaintext?.fill(0); key?.fill(0); await client?.end().catch(() => {});
  if (locked) await rmdir(path.join(directory, '.database-export-lock'));
}
