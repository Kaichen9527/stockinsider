import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import test from 'node:test';

const scriptPath=new URL('../deployment/vps/prepare-contabo-postgres.sh',import.meta.url);
const script=readFileSync(scriptPath,'utf8');
const postgres=readFileSync(new URL('../deployment/vps/postgresql-stockinsider.conf',import.meta.url),'utf8');
const hba=readFileSync(new URL('../deployment/vps/pg_hba-stockinsider.conf',import.meta.url),'utf8');
const clusters=readFileSync(new URL('../deployment/vps/postgresql-common-createcluster.conf',import.meta.url),'utf8');

test('preparation is pinned, local-only, and never starts or replaces a cluster',()=>{
  assert.match(script,/ubuntu:24[.]04/u);
  assert.match(script,/postgresql-17 postgresql-client-17/u);
  assert.match(script,/postgrest_version=v16[.]3/u);
  assert.match(script,/postgrest_sha256=4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d/u);
  assert.match(script,/B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8/u);
  assert.match(script,/pg_createcluster 17 "\$cluster_name" --port 5432 --start-conf manual/u);
  assert.match(script,/install -d -o root -g postgres -m 0750 "\/etc\/postgresql\/17\/\$\{cluster_name\}\/conf[.]d"/u);
  assert.match(script,/unexpected PostgreSQL cluster exists/u);
  assert.match(script,/usermod --append --groups postgres stockinsider/u);
  assert.doesNotMatch(script,/pg_dropcluster|systemctl\s+(?:start|restart|enable)|pg_ctlcluster\s+17\s+stockinsider\s+start/u);
  assert.doesNotMatch(script,/PASSWORD|PGPASSWORD|database-uri|jwt-secret/u);
  assert.equal(statSync(scriptPath).mode&0o777,0o755);
});

test('dedicated PostgreSQL configuration accepts only peer-authenticated Unix sockets',()=>{
  assert.match(clusters,/create_main_cluster = false/u);
  assert.match(postgres,/listen_addresses = ''/u);
  assert.match(postgres,/unix_socket_directories = '\/run\/postgresql'/u);
  assert.match(postgres,/ssl = off/u);
  assert.match(hba,/local\s+stockinsider\s+stockinsider\s+peer/u);
  assert.match(hba,/host\s+all\s+all\s+0[.]0[.]0[.]0\/0\s+reject/u);
  assert.match(hba,/host\s+all\s+all\s+::\/0\s+reject/u);
  assert.doesNotMatch(hba,/trust|md5|scram-sha-256/u);
});
