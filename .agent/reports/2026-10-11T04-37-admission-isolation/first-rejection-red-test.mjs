import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('..', import.meta.url));
const { Client } = createRequire(import.meta.url)('pg');
const configured = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const bin = configured.status === 0 ? configured.stdout.trim() : '';
const available = bin && ['initdb', 'pg_ctl', 'psql'].every(name => fs.existsSync(path.join(bin, name)));

test('actual reservation RPC rejects stale RR/serializable snapshots before admission and preserves RC global lease/replay',
  { skip: !available && 'PostgreSQL unavailable; actual admission isolation unverified', timeout: 30000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-admission-'));
    const cluster = path.join(dir, 'pg'); const port = 55000 + process.pid % 1000;
    const run = (name, args) => execFileSync(path.join(bin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const sql = text => run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-d', 'postgres', '-c', text]);
    let started = false; const clients = [];
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']);
      run('pg_ctl', ['-D', cluster, '-l', path.join(dir, 'postgres.log'), '-o', `-h '' -k ${dir} -p ${port}`, '-w', 'start']); started = true;
      // Reuse only the existing partial prerequisite fixture. All four migration
      // files are applied whole; this does not claim production bootstrap coverage.
      const fixture = fs.readFileSync(path.join(root, 'scripts/research-source-budget-postgres.test.mjs'), 'utf8')
        .match(/sql\(`(CREATE ROLE anon NOLOGIN;[\s\S]*?)`\);/u)?.[1];
      assert.ok(fixture, 'existing partial prerequisite fixture must remain explicit'); sql(fixture);
      for (const migration of ['20260907_candidate_dossier_outbox_v5.sql', '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql'])
        run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-d', 'postgres', '-f', path.join(root, 'migrations', migration)]);
      const connect = async () => { const client = new Client({ host: dir, port, database: 'postgres' }); clients.push(client); await client.connect(); return client; };
      const a = await connect(); const b = await connect();
      const reserve = (client, role, owner, key) => client.query('SELECT reservation_id FROM reserve_research_model_v1($1,$2,$3)', [role, owner, key]);
      await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      assert.equal((await b.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n, 0);
      const first = await reserve(a, 'discovery', 'isolation-a', 'isolation-a'); assert.equal(first.rows.length, 1);
      await assert.rejects(reserve(b, 'technical', 'isolation-b', 'isolation-b'), { message: 'research_admission_read_committed_required' });
      await b.query('ROLLBACK');
      assert.equal((await a.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n, 1);
      assert.equal((await reserve(a, 'technical', 'isolation-c', 'isolation-c')).rows.length, 0);
      assert.deepEqual((await reserve(a, 'discovery', 'isolation-a', 'isolation-a')).rows, first.rows);
      for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
        await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);
        await assert.rejects(reserve(b, 'discovery', 'isolation-a', 'isolation-a'), { message: 'research_admission_read_committed_required' });
        await b.query('ROLLBACK');
        assert.equal((await a.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n, 1);
      }
      await a.query('SELECT finish_research_model_v1($1,$2,$3,$4)', [first.rows[0].reservation_id, 'isolation-a', 'failed', 'a'.repeat(64)]);
      assert.equal((await reserve(a, 'technical', 'isolation-c', 'isolation-c')).rows.length, 1);
    } finally {
      await Promise.allSettled(clients.map(client => client.end()));
      if (started) run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
