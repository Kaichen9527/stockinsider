#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ARCHIVE_RELATIONS, canonicalJson, closureHash, decryptArchiveBytes, encryptedArchiveBytes,
  loadArchiveKey, relationCounts, sha256, validateArchiveRows, verifyArchiveDocument,
  writeArchiveAtomically,
} from './retention/archive-core.mjs';

const { Client } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const result = { export: false, verify: false, rootKind: '', rootId: '', actor: 'stockinsider-retention-cli-v1' };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--export') result.export = true;
    else if (arg === '--verify') result.verify = true;
    else if (arg === '--root-kind') result.rootKind = String(argv[++index] || '');
    else if (arg === '--root-id') result.rootId = String(argv[++index] || '');
    else if (arg === '--actor') result.actor = String(argv[++index] || '');
    else throw new Error(`retention_archive_unknown_argument:${arg}`);
  }
  if (!/^[a-z_]+$/u.test(result.rootKind)) throw new Error('retention_archive_root_kind_required');
  if (!/^[0-9a-f-]{36}$/iu.test(result.rootId)) throw new Error('retention_archive_root_id_invalid');
  if (result.verify && !result.export) throw new Error('retention_archive_verify_requires_export');
  if (!result.actor.trim()) throw new Error('retention_archive_actor_required');
  return result;
}

function connectionConfig(urlValue, caFile) {
  if (!urlValue) throw new Error('retention_archive_database_url_missing');
  const parsed = new URL(urlValue);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('retention_archive_database_url_invalid');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  let ssl;
  if (!local) {
    if (!caFile) throw new Error('retention_archive_ca_file_required_for_remote_database');
    const stat = fs.lstatSync(caFile);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('retention_archive_ca_file_invalid');
    ssl = { rejectUnauthorized: true, ca: fs.readFileSync(caFile, 'utf8') };
  }
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(parameter);
  return { connectionString: parsed.toString(), ssl };
}

async function loadSchema(client, relations) {
  const names = relations.map((relation) => relation.slice('public.'.length));
  const { rows } = await client.query(
    `SELECT table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,is_generated
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[])
      ORDER BY table_name,ordinal_position`,
    [names],
  );
  const present = new Set(rows.map((row) => `public.${row.table_name}`));
  for (const relation of relations) if (!present.has(relation)) throw new Error(`retention_archive_schema_missing:${relation}`);
  return rows;
}

async function loadClosureRows(client, specs) {
  const rows = [];
  for (const spec of specs) {
    if (!ARCHIVE_RELATIONS.has(spec.relation)) throw new Error('retention_archive_relation_not_allowlisted');
    const table = spec.relation.slice('public.'.length);
    const primaryKey = ARCHIVE_RELATIONS.get(spec.relation);
    const result = await client.query(
      `SELECT to_jsonb(row_value)::text AS payload,
              encode(digest(convert_to(to_jsonb(row_value)::text,'UTF8'),'sha256'),'hex') AS row_hash
         FROM public.${table} row_value WHERE ${primaryKey}=$1::uuid`,
      [spec.key],
    );
    if (result.rowCount !== 1) throw new Error(`retention_archive_row_changed_or_missing:${spec.relation}:${spec.key}`);
    rows.push({ relation: spec.relation, key: spec.key, rowHash: result.rows[0].row_hash, payload: result.rows[0].payload });
  }
  return validateArchiveRows(rows);
}

async function databaseIdentity(client) {
  const result = await client.query(`SELECT current_database() AS database_name,
    coalesce(inet_server_addr()::text,'local-socket') AS server_address,
    coalesce(inet_server_port(),0) AS server_port`);
  return result.rows[0];
}

async function restoreIntoIndependentDatabase(document, sourceIdentity, verifyUrl, caFile) {
  if (!verifyUrl) throw new Error('retention_archive_verify_database_url_missing');
  const verifyHost = new URL(verifyUrl).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(verifyHost)) {
    throw new Error('retention_archive_verify_database_must_be_local');
  }
  const client = new Client(connectionConfig(verifyUrl, caFile));
  const schema = `retention_restore_${document.manifestId.replaceAll('-', '_')}`;
  await client.connect();
  try {
    const verifyIdentity = await databaseIdentity(client);
    if (canonicalJson(sourceIdentity) === canonicalJson(verifyIdentity)) {
      throw new Error('retention_archive_verify_database_must_be_independent');
    }
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.archive_rows(
      relation_name text NOT NULL,row_key text NOT NULL,row_hash text NOT NULL,payload jsonb NOT NULL,
      PRIMARY KEY(relation_name,row_key))`);
    for (const row of document.rows) {
      await client.query(`INSERT INTO ${schema}.archive_rows(relation_name,row_key,row_hash,payload)
        VALUES($1,$2,$3,$4::jsonb)`, [row.relation, row.key, row.rowHash, row.payload]);
    }
    const restored = await client.query(`SELECT relation_name AS relation,row_key AS key,row_hash AS "rowHash",payload::text AS payload
      FROM ${schema}.archive_rows ORDER BY relation_name,row_key`);
    const verified = validateArchiveRows(restored.rows);
    if (closureHash(verified) !== document.closureHash) throw new Error('retention_archive_independent_restore_hash_mismatch');
    await client.query('COMMIT');
    return { environmentId: `${new URL(verifyUrl).hostname}/${schema}`, rowCount: verified.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceUrl = process.env.STOCKINSIDER_ARCHIVE_DATABASE_URL;
  const source = new Client(connectionConfig(sourceUrl, process.env.STOCKINSIDER_ARCHIVE_CA_FILE));
  let archiveKey;
  await source.connect();
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const snapshotAt = new Date().toISOString();
    const eligibilityResult = await source.query(
      'SELECT public.retention_archive_eligibility_v1($1,$2::uuid,$3::timestamptz) AS result',
      [args.rootKind, args.rootId, snapshotAt],
    );
    const eligibility = eligibilityResult.rows[0]?.result;
    if (!eligibility?.eligible) {
      await source.query('ROLLBACK');
      console.log(JSON.stringify({ mode: 'preview', rootKind: args.rootKind, rootId: args.rootId, eligible: false, blockers: eligibility?.blockers || [] }, null, 2));
      process.exitCode = 2;
      return;
    }
    const rows = await loadClosureRows(source, eligibility.rows);
    const sourceIdentity = await databaseIdentity(source);
    const relations = [...new Set(rows.map((row) => row.relation))].sort();
    const schema = await loadSchema(source, relations);
    const schemaHash = sha256(canonicalJson(schema));
    const expectedClosureHash = closureHash(rows);
    const counts = relationCounts(rows);
    if (!args.export) {
      await source.query('ROLLBACK');
      console.log(JSON.stringify({ mode: 'preview', rootKind: args.rootKind, rootId: args.rootId, eligible: true,
        rowCount: rows.length, relationCounts: counts, schemaHash, closureHash: expectedClosureHash }, null, 2));
      return;
    }

    const keyFile = process.env.STOCKINSIDER_ARCHIVE_KEY_FILE;
    if (!keyFile) throw new Error('retention_archive_key_file_missing');
    archiveKey = loadArchiveKey(keyFile);
    const manifestRows = rows.map(({ relation, key: rowKey, rowHash }) => ({ relation, key: rowKey, rowHash }));
    const prepared = await source.query(
      `SELECT public.prepare_retention_archive_manifest_v1(
        $1,$2::uuid,$3::timestamptz,$4,$5,$6::jsonb,$7::jsonb,$8
      ) AS manifest_id`,
      [args.rootKind, args.rootId, snapshotAt, schemaHash, expectedClosureHash, JSON.stringify(counts), JSON.stringify(manifestRows), args.actor],
    );
    const manifestId = prepared.rows[0].manifest_id;
    const document = {
      format: 'stockinsider-retention-archive-v1', manifestId, createdAt: new Date().toISOString(),
      rootKind: args.rootKind, rootId: args.rootId, plannedSnapshotAt: snapshotAt,
      policyVersion: eligibility.policyVersion, schema, schemaHash, rowCount: rows.length,
      relationCounts: counts, closureHash: expectedClosureHash, rows,
    };
    const bytes = encryptedArchiveBytes(document, archiveKey);
    const filename = `${args.rootKind}-${args.rootId}-${manifestId}.sira`;
    const archivePath = path.join(projectRoot, 'backup', 'retention', filename);
    writeArchiveAtomically(projectRoot, archivePath, bytes);
    const archiveHash = sha256(bytes);
    const relativeLocator = path.relative(projectRoot, archivePath).split(path.sep).join('/');
    await source.query('SELECT public.record_retention_archive_export_v1($1,$2,$3,$4,$5::timestamptz)',
      [manifestId, relativeLocator, archiveHash, bytes.length, new Date().toISOString()]);

    const roundTrip = decryptArchiveBytes(fs.readFileSync(archivePath), archiveKey);
    const localVerification = verifyArchiveDocument(roundTrip);
    let independentRestore = null;
    if (args.verify) {
      independentRestore = await restoreIntoIndependentDatabase(roundTrip, sourceIdentity,
        process.env.STOCKINSIDER_ARCHIVE_VERIFY_DATABASE_URL,
        process.env.STOCKINSIDER_ARCHIVE_VERIFY_CA_FILE || process.env.STOCKINSIDER_ARCHIVE_CA_FILE);
      await source.query('SELECT public.record_retention_archive_restore_v1($1,$2,$3,$4,$5,$6::timestamptz)', [
        manifestId, independentRestore.environmentId, independentRestore.rowCount,
        localVerification.closureHash, localVerification.schemaHash, new Date().toISOString(),
      ]);
    }
    await source.query('COMMIT');
    console.log(JSON.stringify({ mode: args.verify ? 'export-and-independent-restore' : 'export', manifestId,
      rootKind: args.rootKind, rootId: args.rootId, archive: relativeLocator, archiveSha256: archiveHash,
      archiveBytes: bytes.length, rowCount: rows.length, relationCounts: counts,
      restoreVerified: Boolean(independentRestore), deletionPerformed: false }, null, 2));
  } catch (error) {
    await source.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    archiveKey?.fill(0);
    await source.end();
  }
}

main().catch((error) => {
  console.error(`Retention archive failed: ${error.message}`);
  process.exitCode = 1;
});
