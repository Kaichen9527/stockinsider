import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = path.join(root, 'migrations/20260907_shadow_replay_payload_v5.sql');
const pg = Object.fromEntries(['initdb', 'pg_ctl', 'psql'].map((name) => [name, spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'pg-tool', name], { encoding: 'utf8' }).stdout.trim()]));
let cluster;

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function sql(statement) {
  return run(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres'], { input: statement });
}

function rejected(statement) {
  const result = spawnSync(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres'], { cwd: root, encoding: 'utf8', input: statement });
  assert.notEqual(result.status, 0, 'write unexpectedly succeeded');
}

before(() => {
  for (const [name, binary] of Object.entries(pg)) assert.ok(binary && fs.existsSync(binary), `${name} is required`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-replay-v5-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  fs.mkdirSync(socket);
  cluster = { directory, socket, port: 57000 + (process.pid % 2000), user: os.userInfo().username };
  run(pg.initdb, ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', cluster.user]);
  cluster.data = data;
  run(pg.pg_ctl, ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${socket} -p ${cluster.port} -c listen_addresses=''`, '-w', 'start']);
  sql(`CREATE EXTENSION pgcrypto; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE candidate_shadow_manifests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());`);
  run(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres', '-f', migration]);
  run(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres', '-f', migration]);
});

after(() => {
  if (cluster) spawnSync(pg.pg_ctl, ['-D', cluster.data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  if (cluster) fs.rmSync(cluster.directory, { recursive: true, force: true });
});

test('replay payload migration is additive, immutable, and permits one verification timestamp', () => {
  sql(`INSERT INTO candidate_shadow_manifests DEFAULT VALUES;
    INSERT INTO candidate_shadow_replay_payloads(
      manifest_id,final_publication_id,session_date,ruleset_version,model_version,publication_phase,session_kind,
      manifest_hash,final_publication_hash,payload,payload_hash
    ) SELECT id,gen_random_uuid(),'2026-09-07','rules','model','final','official_trading',
      repeat('a',64),repeat('b',64),'{}'::jsonb,repeat('c',64) FROM candidate_shadow_manifests LIMIT 1;
    UPDATE candidate_shadow_replay_payloads SET verified_at='2026-09-07T14:00:00Z';`);
  rejected(`UPDATE candidate_shadow_replay_payloads SET payload='{"changed":true}'::jsonb;`);
  rejected(`UPDATE candidate_shadow_replay_payloads SET verified_at='2026-09-07T15:00:00Z';`);
  rejected(`INSERT INTO candidate_shadow_replay_payloads(
      manifest_id,final_publication_id,session_date,ruleset_version,model_version,publication_phase,session_kind,
      manifest_hash,final_publication_hash,payload,payload_hash
    ) SELECT id,gen_random_uuid(),'2026-09-08','rules','model','preliminary','weekend',
      repeat('a',64),repeat('b',64),'{}'::jsonb,repeat('c',64) FROM candidate_shadow_manifests LIMIT 1;`);
});
