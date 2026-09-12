import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import test from 'node:test';

const scriptPath=new URL('../deployment/vps/restore-contabo-database.sh',import.meta.url);
const script=readFileSync(scriptPath,'utf8');
const verify=readFileSync(new URL('../deployment/vps/verify-contabo-database.sql',import.meta.url),'utf8');

test('production restore is stdin-only, staged, local-only and never replaces a database',()=>{
  assert.equal(statSync(scriptPath).mode&0o777,0o755);
  assert.match(script,/pg_restore --dbname="\$stage_database" --use-list="\$toc_path"/u);
  assert.match(script,/wal_level=minimal -c max_wal_senders=0 -c archive_mode=off/u);
  assert.match(script,/already exists; refusing replacement/u);
  assert.match(script,/createdb --template=template0 --encoding=UTF8 --locale=C "\$stage_database"/u);
  assert.ok(script.includes('^/run/stockinsider-restore/[0-9a-f]{40}[.]toc$'),
    'the reviewed TOC must live in a dedicated runtime directory outside private artifacts');
  assert.match(script,/"\$toc_group" != postgres \|\| "\$toc_mode" != 640/u,
    'the postgres restore process must have read-only access to the reviewed TOC');
  assert.match(script,/ALTER DATABASE \$stage_database RENAME TO \$final_database/u);
  assert.match(script,/pg_ctlcluster 17 "\$cluster_name" start\nstarted=true\n/u,
    'a failed post-restart verification must stop the unverified cluster');
  assert.match(script,/postgrestActivated.*false.*webSwitched.*false/u);
  assert.doesNotMatch(script,/\n(?:sudo\s+-u\s+postgres\s+)?pg_dump|DROP DATABASE|rm -rf|systemctl (?:start|restart) stockinsider/u);
});

test('restored application contract verifies private runtime and excludes Vault',()=>{
  for(const relation of ['source_run_ledger','candidate_source_mentions','candidate_research_runs',
    'candidate_research_run_items','official_price_history','candidate_detail_snapshots','radar_public_snapshots']){
    assert.match(verify,new RegExp(`'${relation}'`,'u'));
  }
  assert.ok(verify.includes("current_setting('listen_addresses')<>''"));
  assert.match(verify,/to_regnamespace\('vault'\) IS NOT NULL/u);
  assert.match(verify,/extname='supabase_vault'/u);
  assert.match(verify,/identityFenceEnabled/u);
});
